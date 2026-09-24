<?php

/**
 * Validates, previews and creates bookings made by members.
 *
 * A booking is approved right away when the room approves automatically and
 * the time is free. Otherwise it becomes a request for an administrator:
 * when the room needs manual approval, or when the time conflicts with
 * another booking. Dates when the room is closed are left out.
 */
class Creo_Rombooking_Bookings {

	/**
	 * The longest purpose, in characters.
	 */
	const PURPOSE_MAX = 200;

	/**
	 * How many days ahead members can book.
	 */
	const DAYS_AHEAD = 365;

	/**
	 * @var Creo_Rombooking_Availability
	 */
	protected $availability;

	public function __construct() {
		$this->availability = new Creo_Rombooking_Availability( 0 );
	}

	/**
	 * Validates and normalizes the booking form.
	 *
	 * @param array $input         The form: roomId, date, start, end, purpose, repeat, endMode, count, endDate, phone.
	 * @param int   $user_id       The member.
	 * @param bool  $require_phone Whether to require a phone number when the member has none; not for previews.
	 * @return array{data: array, errors: array<string, string>}
	 */
	public function validate( array $input, $user_id, $require_phone = true ) {
		$errors = array();
		$room   = $this->find_room( (int) ( $input['roomId'] ?? 0 ) );
		$date   = (string) ( $input['date'] ?? '' );
		$start  = (int) ( $input['start'] ?? 0 );
		$end    = (int) ( $input['end'] ?? 0 );
		$repeat = in_array( $input['repeat'] ?? 'none', Creo_Rombooking_Recurrence::RULES, true ) ? $input['repeat'] ?? 'none' : 'none';
		$today  = creo_rombooking_today();
		$latest = ( new DateTimeImmutable( $today ) )->modify( '+' . self::DAYS_AHEAD . ' days' )->format( 'Y-m-d' );

		if ( ! $room ) {
			$errors['roomId'] = __( 'Choose a room.', 'creo-rombooking' );
		}

		if ( ! Creo_Rombooking_Availability::is_date( $date ) ) {
			$errors['date'] = __( 'Choose a date.', 'creo-rombooking' );
		} elseif ( $date < $today ) {
			$errors['date'] = __( 'The date has passed. Choose a later date.', 'creo-rombooking' );
		} elseif ( $date > $latest ) {
			$errors['date'] = __( 'You can book at most one year ahead.', 'creo-rombooking' );
		}

		if ( ! $this->is_slot_time( $start ) || ! $this->is_slot_time( $end ) ) {
			$errors['start'] = __( 'Choose a start and end time.', 'creo-rombooking' );
		} elseif ( $end <= $start ) {
			$errors['end'] = __( 'The end time must be after the start time.', 'creo-rombooking' );
		} elseif ( $date === $today && $start < $this->now_minute() ) {
			$errors['start'] = __( 'The time has passed. Choose a later time.', 'creo-rombooking' );
		}

		$purpose = trim( sanitize_text_field( (string) ( $input['purpose'] ?? '' ) ) );
		if ( mb_strlen( $purpose ) > self::PURPOSE_MAX ) {
			/* translators: %d: maximum number of characters */
			$errors['purpose'] = sprintf( __( 'The purpose can be at most %d characters.', 'creo-rombooking' ), self::PURPOSE_MAX );
		}

		$count    = null;
		$end_date = null;
		if ( $repeat !== 'none' ) {
			if ( ( $input['endMode'] ?? 'count' ) === 'date' ) {
				$end_date = (string) ( $input['endDate'] ?? '' );
				if ( ! Creo_Rombooking_Availability::is_date( $end_date ) || ( ! isset( $errors['date'] ) && $end_date <= $date ) ) {
					$errors['endDate'] = __( 'The end date must be after the start date.', 'creo-rombooking' );
				} elseif ( $end_date > $latest ) {
					$errors['endDate'] = __( 'A series can go at most one year ahead.', 'creo-rombooking' );
				}
			} else {
				$count = (int) ( $input['count'] ?? 0 );
				if ( $count < 2 || $count > Creo_Rombooking_Recurrence::MAX_OCCURRENCES ) {
					/* translators: %d: maximum number of occurrences */
					$errors['count'] = sprintf( __( 'The number of times must be between 2 and %d.', 'creo-rombooking' ), Creo_Rombooking_Recurrence::MAX_OCCURRENCES );
				}
			}
		}

		$phone = null;
		if ( $require_phone && creo_rombooking_get_phone( $user_id )['number'] === null ) {
			$phone = self::normalize_phone( (string) ( $input['phone'] ?? '' ) );
			if ( $phone === null ) {
				$errors['phone'] = __( 'Enter a Norwegian mobile number with 8 digits.', 'creo-rombooking' );
			}
		}

		$data = array(
			'room'    => $room,
			'date'    => $date,
			'start'   => $start,
			'end'     => $end,
			'purpose' => $purpose,
			'repeat'  => $repeat,
			'count'   => $count,
			'endDate' => $end_date,
			'phone'   => $phone,
			'dates'   => array(),
		);

		if ( ! $errors ) {
			$data['dates'] = Creo_Rombooking_Recurrence::dates( $date, $repeat, $count, $end_date );
			if ( $count && end( $data['dates'] ) > $latest ) {
				$errors['count'] = __( 'A series can go at most one year ahead.', 'creo-rombooking' );
			}
		}

		return array(
			'data'   => $data,
			'errors' => $errors,
		);
	}

	/**
	 * Checks each occurrence. Also returns errors when nothing can be booked
	 * because the room is closed.
	 *
	 * @param array $data Validated data from `validate()`.
	 * @return array{approval: string, occurrences: array, counts: array<string, int>, errors: array<string, string>}
	 */
	public function preview( array $data ) {
		$checks      = $this->availability->check( $data['room']['id'], $data['dates'], $data['start'], $data['end'] );
		$occurrences = array();
		$counts      = array(
			'free'     => 0,
			'conflict' => 0,
			'outside'  => 0,
		);

		foreach ( $checks as $date => $check ) {
			$occurrences[] = array(
				'date'         => $date,
				'status'       => $check['status'],
				'conflictWith' => $check['conflictWith'],
			);
			++$counts[ $check['status'] ];
		}

		$errors = array();
		if ( $occurrences && $counts['outside'] === count( $occurrences ) ) {
			$errors['start'] = count( $occurrences ) === 1
				? __( 'The room is closed at the chosen time. Choose another time or room.', 'creo-rombooking' )
				: __( 'All the dates are outside the opening hours. Change the time or the room.', 'creo-rombooking' );
		}

		return array(
			'approval'    => $data['room']['approval'],
			'occurrences' => $occurrences,
			'counts'      => $counts,
			'errors'      => $errors,
		);
	}

	/**
	 * Creates the booking, or the series of bookings.
	 *
	 * @param array $input   The form.
	 * @param int   $user_id The member.
	 * @return array|WP_Error The result, or the validation errors.
	 */
	public function create( array $input, $user_id ) {
		global $wpdb;

		$validated = $this->validate( $input, $user_id );
		if ( $validated['errors'] ) {
			return $this->validation_error( $validated['errors'] );
		}

		$data = $validated['data'];
		$lock = 'creo_rombooking_room_' . $data['room']['id'];

		// Serialize bookings per room, so that two members cannot get the same free time approved.
		if ( ! $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 10)', $lock ) ) ) { // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			return new WP_Error( 'creo_rombooking_busy', __( 'Many are booking right now. Try again.', 'creo-rombooking' ), array( 'status' => 503 ) );
		}

		try {
			$preview = $this->preview( $data );
			if ( $preview['errors'] ) {
				return $this->validation_error( $preview['errors'] );
			}

			if ( $data['phone'] ) {
				update_user_meta( $user_id, 'creo_rombooking_phone', $data['phone'] );
			}

			$series_id = $data['repeat'] !== 'none' ? $this->insert_series( $data, $user_id ) : null;
			$auto      = $data['room']['approval'] === 'auto';
			$created   = array();

			foreach ( $preview['occurrences'] as $occurrence ) {
				if ( $occurrence['status'] === 'outside' ) {
					continue;
				}

				$approved  = $auto && $occurrence['status'] === 'free';
				$created[] = array(
					'id'     => $this->insert_booking( $data, $user_id, $occurrence, $approved ? 'approved' : 'requested', $series_id ),
					'date'   => $occurrence['date'],
					'status' => $approved ? 'approved' : 'requested',
				);
			}
		} finally {
			$wpdb->query( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}

		$approved  = count( wp_list_filter( $created, array( 'status' => 'approved' ) ) );
		$requested = count( $created ) - $approved;
		$skipped   = $preview['counts']['outside'];

		Creo_Rombooking_Notifier::sms( $user_id, $this->sms_text( $data, $approved, $requested ), $created[0]['id'] );

		return array(
			'bookings'  => $created,
			'approved'  => $approved,
			'requested' => $requested,
			'skipped'   => $skipped,
			'message'   => $this->confirmation( $approved, $requested, $skipped ),
		);
	}

	/**
	 * The confirmation shown after booking.
	 *
	 * @param int $approved  Approved bookings.
	 * @param int $requested Requests to the administrator.
	 * @param int $skipped   Dates left out because the room is closed.
	 * @return string
	 */
	public function confirmation( $approved, $requested, $skipped ) {
		if ( $requested === 0 ) {
			$message = $approved === 1
				? __( 'The booking is confirmed. You will get a text message.', 'creo-rombooking' )
				/* translators: %d: number of bookings */
				: sprintf( __( '%d bookings are confirmed. You will get a text message.', 'creo-rombooking' ), $approved );
		} elseif ( $approved === 0 ) {
			$message = $requested === 1
				? __( 'The request has been sent to the administrator. You will get a text message when it has been handled.', 'creo-rombooking' )
				/* translators: %d: number of requests */
				: sprintf( __( '%d requests have been sent to the administrator. You will get a text message when they have been handled.', 'creo-rombooking' ), $requested );
		} else {
			$message = sprintf(
				/* translators: 1: e.g. «3 bookings are confirmed», 2: e.g. «1 has been sent to the administrator» */
				__( '%1$s, and %2$s. You will get a text message.', 'creo-rombooking' ),
				/* translators: %d: number of bookings */
				sprintf( _n( '%d booking is confirmed', '%d bookings are confirmed', $approved, 'creo-rombooking' ), $approved ),
				/* translators: %d: number of requests */
				sprintf( _n( '%d has been sent to the administrator', '%d have been sent to the administrator', $requested, 'creo-rombooking' ), $requested )
			);
		}

		if ( $skipped > 0 ) {
			$message .= ' ' . sprintf(
				/* translators: %d: number of dates */
				_n( '%d date was left out because the room is closed.', '%d dates were left out because the room is closed.', $skipped, 'creo-rombooking' ),
				$skipped
			);
		}

		return $message;
	}

	/**
	 * The text message to the member.
	 *
	 * @param array $data      Validated data.
	 * @param int   $approved  Approved bookings.
	 * @param int   $requested Requests to the administrator.
	 * @return string
	 */
	protected function sms_text( array $data, $approved, $requested ) {
		$when = sprintf(
			/* translators: 1: room, 2: date, 3: time range */
			__( '%1$s, %2$s at %3$s', 'creo-rombooking' ),
			$data['room']['name'],
			wp_date( 'l j. F', ( new DateTimeImmutable( $data['date'], wp_timezone() ) )->getTimestamp() ),
			self::format_minutes( $data['start'] ) . '–' . self::format_minutes( $data['end'] )
		);

		if ( $data['repeat'] !== 'none' ) {
			/* translators: 1: when the series starts, 2: number of dates */
			$when = sprintf( __( '%1$s (%2$d times)', 'creo-rombooking' ), $when, $approved + $requested );
		}

		if ( $requested === 0 ) {
			/* translators: %s: room, date and time */
			return sprintf( __( 'Room booking: Your booking is confirmed. %s.', 'creo-rombooking' ), $when );
		}
		if ( $approved === 0 ) {
			/* translators: %s: room, date and time */
			return sprintf( __( 'Room booking: We have received your request. %s. You will get a text message when the administrator has handled it.', 'creo-rombooking' ), $when );
		}
		/* translators: 1: room, date and time, 2: confirmed, 3: waiting for approval */
		return sprintf( __( 'Room booking: %1$s. %2$d confirmed, %3$d waiting for approval.', 'creo-rombooking' ), $when, $approved, $requested );
	}

	/**
	 * Normalizes a Norwegian mobile number to `+47 XXX XX XXX`.
	 *
	 * @param string $phone The number as typed.
	 * @return string|null Null when it is not a Norwegian mobile number.
	 */
	public static function normalize_phone( $phone ) {
		$digits = preg_replace( '/[\s\-().]/', '', $phone );
		$digits = preg_replace( '/^(\+47|0047)/', '', $digits );

		if ( ! preg_match( '/^[49]\d{7}$/', $digits ) ) {
			return null;
		}

		return sprintf( '+47 %s %s %s', substr( $digits, 0, 3 ), substr( $digits, 3, 2 ), substr( $digits, 5 ) );
	}

	/**
	 * @param int $minutes Minutes after midnight.
	 * @return string E.g. `08:30`.
	 */
	public static function format_minutes( $minutes ) {
		return sprintf( '%02d:%02d', intdiv( $minutes, 60 ), $minutes % 60 );
	}

	/**
	 * @param array<string, string> $errors Messages by field.
	 * @return WP_Error
	 */
	protected function validation_error( array $errors ) {
		return new WP_Error(
			'creo_rombooking_invalid',
			__( 'Correct the errors before you send.', 'creo-rombooking' ),
			array(
				'status' => 400,
				'errors' => $errors,
			)
		);
	}

	/**
	 * @param int $room_id The room.
	 * @return array|null The room, when it exists and is active.
	 */
	protected function find_room( $room_id ) {
		foreach ( $this->availability->get_rooms() as $room ) {
			if ( $room['id'] === $room_id ) {
				return $room;
			}
		}
		return null;
	}

	/**
	 * @param int $minute Minutes after midnight.
	 * @return bool Whether it is a slot boundary within the day.
	 */
	protected function is_slot_time( $minute ) {
		return $minute >= Creo_Rombooking_Availability::DAY_START
			&& $minute <= Creo_Rombooking_Availability::DAY_END
			&& $minute % Creo_Rombooking_Availability::SLOT === 0;
	}

	/**
	 * @return int The current minute of the day in the site's timezone.
	 */
	protected function now_minute() {
		$now = current_datetime();
		return (int) $now->format( 'G' ) * 60 + (int) $now->format( 'i' );
	}

	/**
	 * @param array $data    Validated data.
	 * @param int   $user_id The member.
	 * @return int The series ID.
	 */
	protected function insert_series( array $data, $user_id ) {
		global $wpdb;

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Creo_Rombooking_Schema::table( 'series' ),
			array(
				'user_id'     => $user_id,
				'room_id'     => $data['room']['id'],
				'rule'        => $data['repeat'],
				'start_date'  => $data['date'],
				'end_date'    => $data['endDate'],
				'occurrences' => $data['count'],
				'created_at'  => current_time( 'mysql' ),
			)
		);

		return (int) $wpdb->insert_id;
	}

	/**
	 * @param array    $data       Validated data.
	 * @param int      $user_id    The member.
	 * @param array    $occurrence The occurrence from the preview.
	 * @param string   $status     `approved` or `requested`.
	 * @param int|null $series_id  The series.
	 * @return int The booking ID.
	 */
	protected function insert_booking( array $data, $user_id, array $occurrence, $status, $series_id ) {
		global $wpdb;

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Creo_Rombooking_Schema::table( 'bookings' ),
			array(
				'series_id'     => $series_id,
				'room_id'       => $data['room']['id'],
				'user_id'       => $user_id,
				'date'          => $occurrence['date'],
				'start_min'     => $data['start'],
				'end_min'       => $data['end'],
				'purpose'       => $data['purpose'],
				'status'        => $status,
				'conflict_with' => $occurrence['conflictWith'],
				'created_at'    => current_time( 'mysql' ),
			)
		);

		$booking_id = (int) $wpdb->insert_id;
		Creo_Rombooking_Notifier::log( $booking_id, $status === 'approved' ? 'approved' : 'requested' );

		return $booking_id;
	}
}
