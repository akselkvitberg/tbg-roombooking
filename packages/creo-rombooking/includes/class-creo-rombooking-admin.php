<?php

/**
 * The administrator's handling of requests: the inbox, suggestions of free
 * rooms, and the actions that approve, decline, propose, move and cancel.
 *
 * Every action sends a text message to the people it affects. Decisions on
 * single dates in a series are collected into one message, sent when no date
 * in the series is waiting any more.
 */
class Creo_Rombooking_Admin extends Creo_Rombooking_Service {

	/**
	 * The longest reason, in characters. The reason is sent as a text message.
	 */
	const REASON_MAX = 300;

	/**
	 * The longest message with a proposal, in characters.
	 */
	const MESSAGE_MAX = 160;

	/**
	 * How many hours a member has to answer a proposal.
	 */
	const DEADLINES = array( 24, 48, 72 );

	/**
	 * Messages in the SMS log per page.
	 */
	const SMS_PER_PAGE = 20;

	/**
	 * The requests waiting for an administrator: conflicts first, then series,
	 * then requests that only need approval. Oldest first within each group.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function get_requests() {
		$rows    = $this->pending_rows();
		$rooms   = array_column( $this->availability->get_rooms(), null, 'id' );
		$singles = array();
		$series  = array();

		foreach ( $rows as $row ) {
			if ( $row['series_id'] ) {
				$series[ (int) $row['series_id'] ] = true;
				continue;
			}
			$singles[] = $this->single_item( $row, $rooms );
		}

		$series_items = array();
		foreach ( array_keys( $series ) as $series_id ) {
			$item = $this->series_item( $series_id );
			if ( $item ) {
				$series_items[] = $item;
			}
		}

		return array_merge(
			array_values( wp_list_filter( $singles, array( 'kind' => 'conflict' ) ) ),
			$series_items,
			array_values( wp_list_filter( $singles, array( 'kind' => 'approval' ) ) )
		);
	}

	/**
	 * Approves a request that does not conflict with anything.
	 *
	 * @param int $booking_id The request.
	 * @return array{message: string}|WP_Error
	 */
	public function approve( $booking_id ) {
		$request = $this->find_request( $booking_id );
		if ( is_wp_error( $request ) ) {
			return $request;
		}

		$result = creo_rombooking_with_room_locks(
			array( $request['room_id'] ),
			function () use ( $request ) {
				$error = $this->approvable( $request );
				if ( $error ) {
					return $error;
				}
				$this->set_status( $request, 'approved' );
				return true;
			}
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( $request['series_id'] ) {
			return array(
				'message' => $this->after_series_decision(
					$request,
					/* translators: %s: date */
					sprintf( __( 'The booking on %s is approved.', 'creo-rombooking' ), Creo_Rombooking_Bookings::format_date( $request['date'] ) )
				),
			);
		}

		Creo_Rombooking_Notifier::sms(
			(int) $request['user_id'],
			/* translators: %s: room, date and time */
			sprintf( __( 'Room booking: Your request is approved. %s.', 'creo-rombooking' ), $this->describe( $request ) ),
			(int) $request['id']
		);

		return array(
			/* translators: %s: name of the member */
			'message' => sprintf( __( 'The booking is approved. %s gets a text message.', 'creo-rombooking' ), $request['user_name'] ),
		);
	}

	/**
	 * Declines a request. A reason is required, except for single dates in a
	 * series, where the member gets one message for the whole series.
	 *
	 * @param int   $booking_id The request.
	 * @param array $input      `reason`.
	 * @return array{message: string}|WP_Error
	 */
	public function reject( $booking_id, array $input ) {
		$request = $this->find_request( $booking_id );
		if ( is_wp_error( $request ) ) {
			return $request;
		}

		$reason = $this->reason( $input, ! $request['series_id'] );
		if ( is_wp_error( $reason ) ) {
			return $reason;
		}

		$this->set_status( $request, 'rejected', $reason );

		if ( $request['series_id'] ) {
			return array(
				'message' => $this->after_series_decision(
					$request,
					/* translators: %s: date */
					sprintf( __( 'The date %s is declined.', 'creo-rombooking' ), Creo_Rombooking_Bookings::format_date( $request['date'] ) )
				),
			);
		}

		Creo_Rombooking_Notifier::sms(
			(int) $request['user_id'],
			sprintf(
				/* translators: 1: room, date and time, 2: the reason */
				__( 'Room booking: Your request for %1$s is declined. Reason: %2$s', 'creo-rombooking' ),
				$this->describe( $request ),
				$reason
			),
			(int) $request['id']
		);

		return array(
			/* translators: %s: name of the member */
			'message' => sprintf( __( 'The request is declined. %s gets a text message with the reason.', 'creo-rombooking' ), $request['user_name'] ),
		);
	}

	/**
	 * Proposes another room or time instead of a request. The member answers
	 * the proposal under «My bookings» before the deadline.
	 *
	 * @param int   $booking_id The request.
	 * @param array $input      `roomId`, `date`, `start`, `end`, `deadline` (hours) and `message`.
	 * @return array{message: string}|WP_Error
	 */
	public function propose( $booking_id, array $input ) {
		$request = $this->find_request( $booking_id );
		if ( is_wp_error( $request ) ) {
			return $request;
		}

		$errors   = array();
		$room     = $this->find_room( (int) ( $input['roomId'] ?? 0 ) );
		$date     = (string) ( $input['date'] ?? '' );
		$start    = (int) ( $input['start'] ?? 0 );
		$end      = (int) ( $input['end'] ?? 0 );
		$deadline = $this->deadline( $input, $errors );
		$message  = trim( sanitize_textarea_field( (string) ( $input['message'] ?? '' ) ) );

		if ( ! $room ) {
			$errors['roomId'] = __( 'Choose a room.', 'creo-rombooking' );
		} elseif ( $room['capacity'] && (int) $request['people'] > $room['capacity'] ) {
			/* translators: 1: room name, 2: number of people */
			$errors['roomId'] = sprintf( __( '%1$s is too small for %2$d people.', 'creo-rombooking' ), $room['name'], $request['people'] );
		}

		if ( ! Creo_Rombooking_Availability::is_date( $date ) || $date < creo_rombooking_today() ) {
			$errors['date'] = __( 'Choose a date from today on.', 'creo-rombooking' );
		}

		if ( ! $this->is_slot_time( $start ) || ! $this->is_slot_time( $end ) || $end <= $start ) {
			$errors['end'] = __( 'The end time must be after the start time.', 'creo-rombooking' );
		}

		if ( mb_strlen( $message ) > self::MESSAGE_MAX ) {
			/* translators: %d: maximum number of characters */
			$errors['message'] = sprintf( __( 'The message can be at most %d characters.', 'creo-rombooking' ), self::MESSAGE_MAX );
		}

		if ( ! $errors && $room['id'] === (int) $request['room_id'] && $date === $request['date'] && $start === (int) $request['start_min'] && $end === (int) $request['end_min'] ) {
			$errors['roomId'] = __( 'Choose another room or time than the request.', 'creo-rombooking' );
		}

		if ( $errors ) {
			return $this->validation_error( $errors );
		}

		$result = creo_rombooking_with_room_locks(
			array( $room['id'] ),
			function () use ( $request, $room, $date, $start, $end, $deadline, $message ) {
				if ( ! $this->is_still_requested( $request ) ) {
					return $this->handled_error();
				}

				$status = $this->check( $room['id'], $date, $start, $end, array( (int) $request['id'] ) );
				if ( $status !== 'free' ) {
					return $this->validation_error( array( 'roomId' => $this->unavailable_message( $status ) ) );
				}

				$this->set_status( $request, 'proposed', $message );
				return $this->insert_proposal( $request, $room['id'], $date, $start, $end, $message, $deadline );
			}
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$proposed = Creo_Rombooking_Bookings::describe( $room['name'], $date, $start, $end );

		Creo_Rombooking_Notifier::sms(
			(int) $request['user_id'],
			sprintf(
				/* translators: 1: requested room, date and time, 2: proposed room, date and time, 3: optional message, 4: deadline */
				__( 'Room booking: We cannot give you %1$s. We propose %2$s instead.%3$s Answer by %4$s under «My bookings».', 'creo-rombooking' ),
				$this->describe( $request ),
				$proposed,
				$message ? ' ' . $message : '',
				$result
			),
			(int) $request['id']
		);

		return array(
			'message' => sprintf(
				/* translators: 1: proposed room, date and time, 2: name of the member, 3: deadline */
				__( 'The proposal has been sent: %1$s. %2$s gets a text message and must answer by %3$s.', 'creo-rombooking' ),
				$proposed,
				$request['user_name'],
				$result
			),
		);
	}

	/**
	 * Moves the booking a request conflicts with to another room at the same
	 * time, and approves the request.
	 *
	 * @param int   $booking_id The request.
	 * @param array $input      `roomId` and `reason`.
	 * @return array{message: string}|WP_Error
	 */
	public function move_existing( $booking_id, array $input ) {
		$request = $this->find_request( $booking_id );
		if ( is_wp_error( $request ) ) {
			return $request;
		}

		$conflicts = $this->conflicts( $request );
		if ( count( $conflicts ) !== 1 ) {
			return new WP_Error( 'creo_rombooking_conflict', __( 'Only a request that conflicts with exactly one booking can be solved by moving it.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}

		$existing = $conflicts[0];
		$errors   = array();
		$room     = $this->find_room( (int) ( $input['roomId'] ?? 0 ) );
		$reason   = $this->reason( $input, true );

		if ( is_wp_error( $reason ) ) {
			$errors += $reason->get_error_data()['errors'];
		}
		if ( ! $room || $room['id'] === (int) $request['room_id'] ) {
			$errors['roomId'] = __( 'Choose another room.', 'creo-rombooking' );
		} elseif ( $room['capacity'] && (int) $existing['people'] > $room['capacity'] ) {
			/* translators: 1: room name, 2: number of people */
			$errors['roomId'] = sprintf( __( '%1$s is too small for %2$d people.', 'creo-rombooking' ), $room['name'], $existing['people'] );
		}

		if ( $errors ) {
			return $this->validation_error( $errors );
		}

		$result = creo_rombooking_with_room_locks(
			array( $request['room_id'], $room['id'] ),
			function () use ( $request, $existing, $room, $reason ) {
				if ( ! $this->is_still_requested( $request ) ) {
					return $this->handled_error();
				}

				$status = $this->check( $room['id'], $existing['date'], (int) $existing['start_min'], (int) $existing['end_min'] );
				if ( $status !== 'free' ) {
					return $this->validation_error( array( 'roomId' => $this->unavailable_message( $status ) ) );
				}

				$this->update_booking( (int) $existing['id'], array( 'room_id' => $room['id'] ) );
				Creo_Rombooking_Notifier::log( (int) $existing['id'], 'moved', $reason );

				$error = $this->approvable( $request );
				if ( $error ) {
					return $error;
				}
				$this->set_status( $request, 'approved' );
				return true;
			}
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		Creo_Rombooking_Notifier::sms(
			(int) $existing['user_id'],
			sprintf(
				/* translators: 1: room, date and time, 2: new room, 3: the reason */
				__( 'Room booking: Your booking (%1$s) has been moved to %2$s. Reason: %3$s', 'creo-rombooking' ),
				$this->describe( $existing ),
				$room['name'],
				$reason
			),
			(int) $existing['id']
		);
		$this->sms_approved( $request );

		return array(
			'message' => sprintf(
				/* translators: 1: name of the owner of the moved booking, 2: new room */
				__( 'The booking of %1$s has been moved to %2$s, and the request is approved. Both get a text message.', 'creo-rombooking' ),
				$existing['user_name'],
				$room['name']
			),
		);
	}

	/**
	 * Cancels the bookings a request conflicts with, and approves the request.
	 *
	 * @param int   $booking_id The request.
	 * @param array $input      `reason`, and optionally `alternative` with `roomId` and `deadline`.
	 * @return array{message: string}|WP_Error
	 */
	public function approve_and_cancel_existing( $booking_id, array $input ) {
		$request = $this->find_request( $booking_id );
		if ( is_wp_error( $request ) ) {
			return $request;
		}

		$conflicts = $this->conflicts( $request );
		if ( ! $conflicts ) {
			return new WP_Error( 'creo_rombooking_conflict', __( 'The request no longer conflicts with a booking. Approve it instead.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}

		$errors = array();
		$reason = $this->reason( $input, true );
		if ( is_wp_error( $reason ) ) {
			$errors += $reason->get_error_data()['errors'];
		}

		$alternative = null;
		if ( ! empty( $input['alternative'] ) ) {
			if ( count( $conflicts ) > 1 ) {
				$errors['alternativeRoomId'] = __( 'A proposal can only be attached when one booking is cancelled.', 'creo-rombooking' );
			} else {
				$alternative = $this->alternative( $conflicts[0], (array) $input['alternative'], $errors, (int) $request['room_id'] );
			}
		}

		if ( $errors ) {
			return $this->validation_error( $errors );
		}

		$room_ids = array( (int) $request['room_id'] );
		if ( $alternative ) {
			$room_ids[] = $alternative['room']['id'];
		}

		$result = creo_rombooking_with_room_locks(
			$room_ids,
			function () use ( $request, $reason, $alternative ) {
				if ( ! $this->is_still_requested( $request ) ) {
					return $this->handled_error();
				}
				if ( $this->is_closed( $request ) ) {
					return $this->closed_error();
				}

				$conflicts = $this->conflicts( $request );
				if ( ! $conflicts ) {
					return new WP_Error( 'creo_rombooking_conflict', __( 'The request no longer conflicts with a booking. Approve it instead.', 'creo-rombooking' ), array( 'status' => 409 ) );
				}
				if ( $alternative ) {
					$error = $this->check_alternative( $conflicts[0], $alternative );
					if ( $error ) {
						return $error;
					}
				}

				$deadlines = array();
				foreach ( $conflicts as $existing ) {
					$deadlines[ $existing['id'] ] = $this->cancel( $existing, $reason, $alternative );
				}

				$this->set_status( $request, 'approved' );
				return array(
					'cancelled' => $conflicts,
					'deadlines' => $deadlines,
				);
			}
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		foreach ( $result['cancelled'] as $existing ) {
			$this->sms_cancelled( $existing, $reason, $alternative, $result['deadlines'][ $existing['id'] ] );
		}
		$this->sms_approved( $request );

		$message = sprintf(
			/* translators: %s: names of the owners of the cancelled bookings */
			__( 'The request is approved, and the booking of %s is cancelled. Both get a text message.', 'creo-rombooking' ),
			wp_sprintf( '%l', array_unique( array_column( $result['cancelled'], 'user_name' ) ) )
		);
		if ( $alternative ) {
			$message .= ' ' . sprintf(
				/* translators: 1: room, 2: deadline */
				__( 'A proposal of %1$s is attached, with a deadline of %2$s.', 'creo-rombooking' ),
				$alternative['room']['name'],
				reset( $result['deadlines'] )
			);
		}

		return array( 'message' => $message );
	}

	/**
	 * Cancels an approved booking, with a reason and optionally a proposal of
	 * another room at the same time.
	 *
	 * @param int   $booking_id The booking.
	 * @param array $input      `reason`, and optionally `alternative` with `roomId` and `deadline`.
	 * @return array{message: string}|WP_Error
	 */
	public function cancel_booking( $booking_id, array $input ) {
		$booking = $this->find_booking( $booking_id );
		if ( ! $booking ) {
			return $this->not_found();
		}
		if ( $booking['status'] !== 'approved' ) {
			return new WP_Error( 'creo_rombooking_handled', __( 'Only approved bookings can be cancelled.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}
		if ( $booking['date'] < creo_rombooking_today() ) {
			return new WP_Error( 'creo_rombooking_past', __( 'The booking has already taken place.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}

		$errors = array();
		$reason = $this->reason( $input, true );
		if ( is_wp_error( $reason ) ) {
			$errors += $reason->get_error_data()['errors'];
		}

		$alternative = ! empty( $input['alternative'] ) ? $this->alternative( $booking, (array) $input['alternative'], $errors ) : null;

		if ( $errors ) {
			return $this->validation_error( $errors );
		}

		$room_ids = array( (int) $booking['room_id'] );
		if ( $alternative ) {
			$room_ids[] = $alternative['room']['id'];
		}

		$deadline = creo_rombooking_with_room_locks(
			$room_ids,
			function () use ( $booking, $reason, $alternative ) {
				if ( $this->find_booking( (int) $booking['id'] )['status'] !== 'approved' ) {
					return $this->handled_error();
				}
				if ( $alternative ) {
					$error = $this->check_alternative( $booking, $alternative );
					if ( $error ) {
						return $error;
					}
				}
				return $this->cancel( $booking, $reason, $alternative );
			}
		);

		if ( is_wp_error( $deadline ) ) {
			return $deadline;
		}

		$this->sms_cancelled( $booking, $reason, $alternative, $deadline );

		/* translators: %s: name of the member */
		$message = sprintf( __( 'The booking is cancelled. %s gets a text message with the reason.', 'creo-rombooking' ), $booking['user_name'] );
		if ( $alternative ) {
			$message .= ' ' . sprintf(
				/* translators: 1: room, 2: deadline */
				__( 'A proposal of %1$s is attached, with a deadline of %2$s.', 'creo-rombooking' ),
				$alternative['room']['name'],
				$deadline
			);
		}

		return array( 'message' => $message );
	}

	/**
	 * Approves every waiting date in a series that is free.
	 *
	 * @param int $series_id The series.
	 * @return array{message: string}|WP_Error
	 */
	public function approve_free( $series_id ) {
		$series = $this->find_series( $series_id );
		if ( ! $series ) {
			return $this->not_found();
		}

		$result = creo_rombooking_with_room_locks(
			array( $series['room_id'] ),
			function () use ( $series_id ) {
				$approved = array();
				foreach ( $this->series_bookings( $series_id ) as $booking ) {
					if ( $booking['status'] === 'requested' && ! $this->approvable( $booking ) ) {
						$this->set_status( $booking, 'approved' );
						$approved[] = $booking;
					}
				}
				return $approved;
			}
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( ! $result ) {
			return new WP_Error( 'creo_rombooking_conflict', __( 'No waiting dates in the series are free.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}

		/* translators: %d: number of bookings */
		$message = sprintf( _n( '%d booking in the series is approved.', '%d bookings in the series are approved.', count( $result ), 'creo-rombooking' ), count( $result ) );

		return array( 'message' => $this->after_series_decision( $result[0], $message, true ) );
	}

	/**
	 * Declines every waiting date in a series.
	 *
	 * @param int   $series_id The series.
	 * @param array $input     `reason`.
	 * @return array{message: string}|WP_Error
	 */
	public function reject_rest( $series_id, array $input ) {
		$series = $this->find_series( $series_id );
		if ( ! $series ) {
			return $this->not_found();
		}

		$reason = $this->reason( $input, true );
		if ( is_wp_error( $reason ) ) {
			return $reason;
		}

		$pending = wp_list_filter( $this->series_bookings( $series_id ), array( 'status' => 'requested' ) );
		if ( ! $pending ) {
			return $this->handled_error();
		}

		foreach ( $pending as $booking ) {
			$this->set_status( $booking, 'rejected', $reason );
		}

		$this->sms_series( $series_id, $reason );

		return array(
			/* translators: %s: name of the member */
			'message' => sprintf( __( 'The rest of the series is declined. %s gets a text message with the reason.', 'creo-rombooking' ), $series['user_name'] ),
		);
	}

	/**
	 * The text messages that have been sent, newest first.
	 *
	 * @param int $page The page, from 1.
	 * @return array{items: array, total: int, pages: int}
	 */
	public function sms_log( $page = 1 ) {
		global $wpdb;

		$table  = Creo_Rombooking_Schema::table( 'events' );
		$page   = max( 1, (int) $page );
		$offset = ( $page - 1 ) * self::SMS_PER_PAGE;

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $table WHERE action = 'sms'" );
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT e.id, e.created_at, e.sms_to, e.sms_text, u.display_name
				FROM $table e
				LEFT JOIN {$wpdb->users} u ON u.ID = e.sms_to
				WHERE e.action = 'sms'
				ORDER BY e.id DESC
				LIMIT %d OFFSET %d",
				self::SMS_PER_PAGE,
				$offset
			),
			ARRAY_A
		);
		// phpcs:enable

		return array(
			'items' => array_map(
				fn( $row ) => array(
					'id'     => (int) $row['id'],
					'sentAt' => $row['created_at'],
					'to'     => array(
						'id'    => (int) $row['sms_to'],
						'name'  => $row['display_name'] ?? '',
						'phone' => creo_rombooking_get_phone( (int) $row['sms_to'] )['number'],
					),
					'text'   => $row['sms_text'],
				),
				$rows
			),
			'total' => $total,
			'pages' => max( 1, (int) ceil( $total / self::SMS_PER_PAGE ) ),
		);
	}

	/**
	 * A request that is not part of a series.
	 *
	 * @param array $row   The request.
	 * @param array $rooms The active rooms by ID.
	 * @return array
	 */
	protected function single_item( array $row, array $rooms ) {
		$conflicts = $this->conflicts( $row );

		return array_merge(
			$this->item_base( $row ),
			array(
				'id'          => 'booking-' . $row['id'],
				'kind'        => $conflicts ? 'conflict' : 'approval',
				'bookingId'   => (int) $row['id'],
				'date'        => $row['date'],
				'closed'      => $this->is_closed( $row ),
				'existing'    => array_map( array( $this, 'existing_data' ), $conflicts ),
				'suggestions' => $this->suggestions( $row, $rooms ),
				'moveOptions' => count( $conflicts ) === 1 ? $this->move_options( $row, $conflicts[0], $rooms ) : array(),
			)
		);
	}

	/**
	 * A series with at least one waiting date. Lists every date of the series,
	 * including those left out because the room was closed.
	 *
	 * @param int $series_id The series.
	 * @return array|null
	 */
	protected function series_item( $series_id ) {
		$series   = $this->find_series( $series_id );
		$bookings = $this->series_bookings( $series_id );
		if ( ! $series || ! $bookings ) {
			return null;
		}

		$by_date     = array_column( $bookings, null, 'date' );
		$dates       = Creo_Rombooking_Recurrence::dates(
			$series['start_date'],
			$series['rule'],
			$series['occurrences'] ? (int) $series['occurrences'] : null,
			$series['end_date']
		);
		$occurrences = array();

		foreach ( array_unique( array_merge( $dates, array_keys( $by_date ) ) ) as $date ) {
			$booking = $by_date[ $date ] ?? null;

			if ( ! $booking ) {
				$occurrences[] = array(
					'date'      => $date,
					'bookingId' => null,
					'status'    => 'outside',
					'pending'   => false,
				);
				continue;
			}

			$occurrence = array(
				'date'      => $date,
				'bookingId' => (int) $booking['id'],
				'status'    => $booking['status'],
				'pending'   => $booking['status'] === 'requested',
			);

			if ( $occurrence['pending'] ) {
				$conflicts            = $this->conflicts( $booking );
				$occurrence['status'] = $this->is_closed( $booking ) ? 'closed' : ( $conflicts ? 'conflict' : 'free' );
				if ( $conflicts ) {
					$occurrence['conflictWith'] = array(
						'name'    => $conflicts[0]['user_name'],
						'purpose' => $conflicts[0]['purpose'],
					);
				}
			}

			$occurrences[] = $occurrence;
		}

		usort( $occurrences, fn( $a, $b ) => strcmp( $a['date'], $b['date'] ) );

		$first = $bookings[0];

		return array_merge(
			$this->item_base( $first ),
			array(
				'id'          => 'series-' . $series_id,
				'kind'        => 'series',
				'seriesId'    => (int) $series_id,
				'date'        => $series['start_date'],
				'sentAt'      => $series['created_at'],
				'rule'        => $series['rule'],
				'occurrences' => $occurrences,
			)
		);
	}

	/**
	 * What every item has.
	 *
	 * @param array $row A booking.
	 * @return array
	 */
	protected function item_base( array $row ) {
		return array(
			'room'    => array(
				'id'       => (int) $row['room_id'],
				'name'     => $row['room_name'],
				'capacity' => (int) $row['capacity'],
				'approval' => $row['approval'],
			),
			'start'   => (int) $row['start_min'],
			'end'     => (int) $row['end_min'],
			'user'    => array(
				'id'   => (int) $row['user_id'],
				'name' => $row['user_name'] ?? '',
			),
			'purpose' => $row['purpose'],
			'people'  => (int) $row['people'],
			'sentAt'  => $row['created_at'],
		);
	}

	/**
	 * @param array $row An approved booking.
	 * @return array
	 */
	protected function existing_data( array $row ) {
		return array(
			'id'          => (int) $row['id'],
			'user'        => array(
				'id'   => (int) $row['user_id'],
				'name' => $row['user_name'] ?? '',
			),
			'purpose'     => $row['purpose'],
			'people'      => (int) $row['people'],
			'date'        => $row['date'],
			'start'       => (int) $row['start_min'],
			'end'         => (int) $row['end_min'],
			'bookedAt'    => $row['created_at'],
			'seriesStart' => $row['series_start'] ?? null,
		);
	}

	/**
	 * Other rooms for the same time: free ones with enough places, smallest
	 * first, and the names of those that are too small or not free.
	 *
	 * @param array $row   The request.
	 * @param array $rooms The active rooms by ID.
	 * @return array{free: array, tooSmall: string[], unavailable: string[]}
	 */
	protected function suggestions( array $row, array $rooms ) {
		$free        = array();
		$too_small   = array();
		$unavailable = array();

		foreach ( $rooms as $room ) {
			if ( $room['id'] === (int) $row['room_id'] ) {
				continue;
			}
			if ( $room['capacity'] < (int) $row['people'] ) {
				$too_small[] = $room['name'];
			} elseif ( $this->check( $room['id'], $row['date'], (int) $row['start_min'], (int) $row['end_min'] ) === 'free' ) {
				$free[] = array(
					'id'       => $room['id'],
					'name'     => $room['name'],
					'capacity' => $room['capacity'],
					'approval' => $room['approval'],
				);
			} else {
				$unavailable[] = $room['name'];
			}
		}

		usort( $free, fn( $a, $b ) => $a['capacity'] <=> $b['capacity'] );

		return array(
			'free'        => $free,
			'tooSmall'    => $too_small,
			'unavailable' => $unavailable,
		);
	}

	/**
	 * Rooms the conflicting booking can be moved to: free at its time, with
	 * enough places, smallest first.
	 *
	 * @param array $request  The request.
	 * @param array $existing The booking it conflicts with.
	 * @param array $rooms    The active rooms by ID.
	 * @return array<int, array{id: int, name: string, capacity: int, approval: string}>
	 */
	protected function move_options( array $request, array $existing, array $rooms ) {
		$options = array();

		foreach ( $rooms as $room ) {
			if (
				$room['id'] !== (int) $request['room_id']
				&& $room['capacity'] >= (int) $existing['people']
				&& $this->check( $room['id'], $existing['date'], (int) $existing['start_min'], (int) $existing['end_min'] ) === 'free'
			) {
				$options[] = array(
					'id'       => $room['id'],
					'name'     => $room['name'],
					'capacity' => $room['capacity'],
					'approval' => $room['approval'],
				);
			}
		}

		usort( $options, fn( $a, $b ) => $a['capacity'] <=> $b['capacity'] );
		return $options;
	}

	/**
	 * After a decision on a date in a series: sends one text message for the
	 * whole series when no date is waiting any more.
	 *
	 * @param array  $booking   A booking in the series.
	 * @param string $message   The confirmation.
	 * @param bool   $tell_when Whether to tell when the member gets a text message, while dates are still waiting.
	 * @return string The confirmation.
	 */
	protected function after_series_decision( array $booking, $message, $tell_when = false ) {
		$series_id = (int) $booking['series_id'];
		$pending   = wp_list_filter( $this->series_bookings( $series_id ), array( 'status' => 'requested' ) );

		if ( $pending ) {
			return $tell_when
				/* translators: 1: the confirmation, 2: name of the member */
				? sprintf( __( '%1$s %2$s gets a text message when the whole series has been handled.', 'creo-rombooking' ), $message, $booking['user_name'] )
				: $message;
		}

		$counts = $this->sms_series( $series_id );

		return sprintf(
			/* translators: 1: number approved, 2: number declined, 3: name of the member */
			__( 'The series has been handled: %1$d approved and %2$d declined. %3$s gets a text message.', 'creo-rombooking' ),
			$counts['approved'],
			$counts['rejected'],
			$booking['user_name']
		);
	}

	/**
	 * Sends the member one text message about the whole series.
	 *
	 * @param int    $series_id The series.
	 * @param string $reason    The reason for declining, if any.
	 * @return array{approved: int, rejected: int}
	 */
	protected function sms_series( $series_id, $reason = '' ) {
		$bookings = $this->series_bookings( $series_id );
		$counts   = array(
			'approved' => count( wp_list_filter( $bookings, array( 'status' => 'approved' ) ) ),
			'rejected' => count( wp_list_filter( $bookings, array( 'status' => 'rejected' ) ) ),
		);

		$text = sprintf(
			/* translators: 1: room, first date and time, 2: number approved, 3: number declined */
			__( 'Room booking: Your series (%1$s) has been handled: %2$d approved, %3$d declined.', 'creo-rombooking' ),
			$this->describe( $bookings[0] ),
			$counts['approved'],
			$counts['rejected']
		);
		if ( $reason ) {
			/* translators: %s: the reason */
			$text .= ' ' . sprintf( __( 'Reason: %s', 'creo-rombooking' ), $reason );
		}

		Creo_Rombooking_Notifier::sms( (int) $bookings[0]['user_id'], $text, (int) $bookings[0]['id'] );

		return $counts;
	}

	/**
	 * @param array $request The approved request.
	 */
	protected function sms_approved( array $request ) {
		Creo_Rombooking_Notifier::sms(
			(int) $request['user_id'],
			/* translators: %s: room, date and time */
			sprintf( __( 'Room booking: Your request is approved. %s.', 'creo-rombooking' ), $this->describe( $request ) ),
			(int) $request['id']
		);
	}

	/**
	 * @param array       $booking     The cancelled booking.
	 * @param string      $reason      The reason.
	 * @param array|null  $alternative The proposed room and deadline.
	 * @param string|null $deadline    The formatted deadline.
	 */
	protected function sms_cancelled( array $booking, $reason, $alternative, $deadline ) {
		$text = sprintf(
			/* translators: 1: room, date and time, 2: the reason */
			__( 'Room booking: Your booking (%1$s) is cancelled. Reason: %2$s', 'creo-rombooking' ),
			$this->describe( $booking ),
			$reason
		);

		if ( $alternative ) {
			$text .= ' ' . sprintf(
				/* translators: 1: room, 2: deadline */
				__( 'We propose %1$s at the same time instead. Answer by %2$s under «My bookings».', 'creo-rombooking' ),
				$alternative['room']['name'],
				$deadline
			);
		}

		Creo_Rombooking_Notifier::sms( (int) $booking['user_id'], $text, (int) $booking['id'] );
	}

	/**
	 * Cancels a booking, or marks it as waiting for an answer to a proposal.
	 *
	 * @param array      $booking     The booking.
	 * @param string     $reason      The reason.
	 * @param array|null $alternative The proposed room and deadline.
	 * @return string|null The formatted deadline of the proposal.
	 */
	protected function cancel( array $booking, $reason, $alternative ) {
		if ( ! $alternative ) {
			$this->set_status( $booking, 'cancelled', $reason );
			return null;
		}

		$this->set_status( $booking, 'proposed', $reason );
		return $this->insert_proposal(
			$booking,
			$alternative['room']['id'],
			$booking['date'],
			(int) $booking['start_min'],
			(int) $booking['end_min'],
			// The member sees the reason with the proposal.
			$reason,
			$alternative['deadline']
		);
	}

	/**
	 * Validates a proposal of another room at the same time as a booking.
	 *
	 * @param array $booking         The booking that is cancelled.
	 * @param array $input           `roomId` and `deadline`.
	 * @param array $errors          Errors by field (by reference).
	 * @param int   $request_room_id The room that is given to someone else, if any.
	 * @return array|null `room` and `deadline`.
	 */
	protected function alternative( array $booking, array $input, array &$errors, $request_room_id = 0 ) {
		$room     = $this->find_room( (int) ( $input['roomId'] ?? 0 ) );
		$deadline = $this->deadline( $input, $errors );

		if ( ! $room || $room['id'] === (int) $booking['room_id'] || $room['id'] === $request_room_id ) {
			$errors['alternativeRoomId'] = __( 'Choose another room.', 'creo-rombooking' );
			return null;
		}
		if ( $room['capacity'] && (int) $booking['people'] > $room['capacity'] ) {
			/* translators: 1: room name, 2: number of people */
			$errors['alternativeRoomId'] = sprintf( __( '%1$s is too small for %2$d people.', 'creo-rombooking' ), $room['name'], $booking['people'] );
			return null;
		}

		return array(
			'room'     => $room,
			'deadline' => $deadline,
		);
	}

	/**
	 * @param array $booking     The booking that is cancelled.
	 * @param array $alternative The proposed room.
	 * @return WP_Error|null An error when the room is not free at the time.
	 */
	protected function check_alternative( array $booking, array $alternative ) {
		$status = $this->check( $alternative['room']['id'], $booking['date'], (int) $booking['start_min'], (int) $booking['end_min'] );
		return $status === 'free' ? null : $this->validation_error( array( 'alternativeRoomId' => $this->unavailable_message( $status ) ) );
	}

	/**
	 * @param array  $booking  The booking the proposal replaces.
	 * @param int    $room_id  The proposed room.
	 * @param string $date     The proposed date.
	 * @param int    $start    Start minute.
	 * @param int    $end      End minute.
	 * @param string $message  A message to the member.
	 * @param int    $hours    Hours until the deadline.
	 * @return string The formatted deadline.
	 */
	protected function insert_proposal( array $booking, $room_id, $date, $start, $end, $message, $hours ) {
		global $wpdb;

		$expires = current_datetime()->modify( '+' . (int) $hours . ' hours' );

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Creo_Rombooking_Schema::table( 'proposals' ),
			array(
				'booking_id' => (int) $booking['id'],
				'room_id'    => (int) $room_id,
				'date'       => $date,
				'start_min'  => $start,
				'end_min'    => $end,
				'message'    => $message,
				'expires_at' => $expires->format( 'Y-m-d H:i:s' ),
				'status'     => 'pending',
				'created_at' => current_time( 'mysql' ),
			)
		);

		return sprintf(
			/* translators: 1: date, 2: time */
			__( '%1$s at %2$s', 'creo-rombooking' ),
			Creo_Rombooking_Bookings::format_date( $expires->format( 'Y-m-d' ) ),
			$expires->format( 'H:i' )
		);
	}

	/**
	 * @param array $request The request.
	 * @return WP_Error|null Why the request cannot be approved, if it cannot.
	 */
	protected function approvable( array $request ) {
		if ( ! $this->is_still_requested( $request ) ) {
			return $this->handled_error();
		}
		if ( $this->is_closed( $request ) ) {
			return $this->closed_error();
		}
		if ( $this->conflicts( $request ) ) {
			return new WP_Error( 'creo_rombooking_conflict', __( 'The time is booked. Solve the conflict first.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}
		return null;
	}

	/**
	 * @param array $request The request.
	 * @return bool Whether the request is still waiting.
	 */
	protected function is_still_requested( array $request ) {
		$current = $this->find_booking( (int) $request['id'] );
		return $current && $current['status'] === 'requested';
	}

	/**
	 * The approved bookings that overlap a booking.
	 *
	 * @param array $booking A booking.
	 * @return array<int, array> Rows with room and user details.
	 */
	protected function conflicts( array $booking ) {
		return $this->query_bookings(
			'b.room_id = %d AND b.date = %s AND b.status = %s AND b.start_min < %d AND b.end_min > %d AND b.id <> %d',
			array( (int) $booking['room_id'], $booking['date'], 'approved', (int) $booking['end_min'], (int) $booking['start_min'], (int) $booking['id'] )
		);
	}

	/**
	 * @return array<int, array> The waiting requests from today on, oldest first.
	 */
	protected function pending_rows() {
		return $this->query_bookings( 'b.status = %s AND b.date >= %s', array( 'requested', creo_rombooking_today() ) );
	}

	/**
	 * @param int $booking_id The request.
	 * @return array|WP_Error The request, or an error when it is not waiting.
	 */
	protected function find_request( $booking_id ) {
		$request = $this->find_booking( $booking_id );
		if ( ! $request ) {
			return $this->not_found();
		}
		if ( $request['status'] !== 'requested' ) {
			return $this->handled_error();
		}
		return $request;
	}

	/**
	 * @param array $input    The form.
	 * @param bool  $required Whether the reason is required.
	 * @return string|WP_Error The reason, or an error.
	 */
	protected function reason( array $input, $required ) {
		$reason = trim( sanitize_textarea_field( (string) ( $input['reason'] ?? '' ) ) );

		if ( $required && $reason === '' ) {
			return $this->validation_error( array( 'reason' => __( 'Write a reason. It is sent as a text message.', 'creo-rombooking' ) ) );
		}
		if ( mb_strlen( $reason ) > self::REASON_MAX ) {
			/* translators: %d: maximum number of characters */
			return $this->validation_error( array( 'reason' => sprintf( __( 'The reason can be at most %d characters.', 'creo-rombooking' ), self::REASON_MAX ) ) );
		}

		return $reason;
	}

	/**
	 * @param array $input  The form.
	 * @param array $errors Errors by field (by reference).
	 * @return int Hours until the deadline.
	 */
	protected function deadline( array $input, array &$errors ) {
		$hours = (int) ( $input['deadline'] ?? 48 );
		if ( ! in_array( $hours, self::DEADLINES, true ) ) {
			$errors['deadline'] = __( 'Choose a deadline.', 'creo-rombooking' );
		}
		return $hours;
	}

	/**
	 * @return WP_Error
	 */
	protected function handled_error() {
		return new WP_Error( 'creo_rombooking_handled', __( 'The request has already been handled.', 'creo-rombooking' ), array( 'status' => 409 ) );
	}

	/**
	 * @return WP_Error
	 */
	protected function closed_error() {
		return new WP_Error( 'creo_rombooking_closed', __( 'The room is closed at that time.', 'creo-rombooking' ), array( 'status' => 409 ) );
	}
}
