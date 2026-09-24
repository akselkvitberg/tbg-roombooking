<?php

/**
 * A member's own bookings: the list under «My bookings», cancelling, and
 * answering proposals from an administrator.
 */
class Creo_Rombooking_Mine extends Creo_Rombooking_Service {

	/**
	 * The hook that expires proposals that were not answered in time.
	 */
	const EXPIRE_HOOK = 'creo_rombooking_expire_proposals';

	/**
	 * Declined and cancelled bookings are listed for this many days after the change.
	 */
	const CLOSED_DAYS = 30;

	/**
	 * @var int
	 */
	protected $user_id;

	/**
	 * @param int $user_id The member.
	 */
	public function __construct( $user_id ) {
		parent::__construct();
		$this->user_id = (int) $user_id;
	}

	/**
	 * The member's bookings from today on: proposals waiting for an answer,
	 * bookings and requests, and bookings recently declined or cancelled.
	 *
	 * @return array{proposals: array, upcoming: array, closed: array}
	 */
	public function get_bookings() {
		self::expire_proposals();

		$rows = $this->query_bookings(
			"b.user_id = %d AND b.date >= %s AND b.status IN ('approved', 'requested', 'proposed', 'rejected', 'cancelled')",
			array( $this->user_id, creo_rombooking_today() )
		);
		usort( $rows, fn( $a, $b ) => array( $a['date'], (int) $a['start_min'] ) <=> array( $b['date'], (int) $b['start_min'] ) );

		$events    = $this->last_events( array_column( $rows, 'id' ) );
		$proposals = $this->pending_proposals( array_column( wp_list_filter( $rows, array( 'status' => 'proposed' ) ), 'id' ) );
		$series    = $this->series_rules( array_filter( array_column( $rows, 'series_id' ) ) );
		$since     = current_datetime()->modify( '-' . self::CLOSED_DAYS . ' days' )->format( 'Y-m-d H:i:s' );
		$result    = array(
			'proposals' => array(),
			'upcoming'  => array(),
			'closed'    => array(),
		);

		foreach ( $rows as $row ) {
			$event = $events[ (int) $row['id'] ] ?? null;

			if ( $row['status'] === 'proposed' ) {
				$proposal = $proposals[ (int) $row['id'] ] ?? null;
				if ( $proposal ) {
					$result['proposals'][] = $this->proposal_data( $row, $proposal );
				}
				continue;
			}

			$item = $this->booking_data( $row, $series );

			if ( in_array( $row['status'], array( 'approved', 'requested' ), true ) ) {
				$result['upcoming'][] = $item;
			} elseif ( $event && $event['created_at'] >= $since ) {
				$item['reason']     = $event['reason'];
				$item['changedAt']  = $event['created_at'];
				$item['action']     = $event['action'];
				$item['byMe']       = (int) $event['actor_id'] === $this->user_id;
				$result['closed'][] = $item;
			}
		}

		return $result;
	}

	/**
	 * Cancels a booking or a request, or it and the later dates of its series.
	 *
	 * @param int   $booking_id The booking.
	 * @param array $input      `scope`: `this` or `following`.
	 * @return array{message: string, cancelled: int}|WP_Error
	 */
	public function cancel( $booking_id, array $input ) {
		$booking = $this->own_booking( $booking_id );
		if ( is_wp_error( $booking ) ) {
			return $booking;
		}
		if ( ! $this->is_cancellable( $booking ) ) {
			return new WP_Error( 'creo_rombooking_not_cancellable', __( 'The booking has started or already been handled, so it cannot be cancelled.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}

		$targets = array( $booking );
		if ( ( $input['scope'] ?? 'this' ) === 'following' && $booking['series_id'] ) {
			$targets = array_filter(
				$this->series_bookings( (int) $booking['series_id'] ),
				fn( $row ) => $row['date'] >= $booking['date'] && $this->is_cancellable( $row )
			);
		}

		foreach ( $targets as $target ) {
			$this->set_status( $target, 'cancelled' );
		}

		$count = count( $targets );
		$text  = $count === 1
			/* translators: %s: room, date and time */
			? sprintf( __( 'Room booking: You have cancelled %s.', 'creo-rombooking' ), $this->describe( $booking ) )
			: sprintf(
				/* translators: 1: room, date and time, 2: number of later dates */
				_n( 'Room booking: You have cancelled %1$s and %2$d later date in the series.', 'Room booking: You have cancelled %1$s and %2$d later dates in the series.', $count - 1, 'creo-rombooking' ),
				$this->describe( $booking ),
				$count - 1
			);
		Creo_Rombooking_Notifier::sms( $this->user_id, $text, (int) $booking['id'] );

		return array(
			'message'   => $count === 1
				? __( 'The booking is cancelled.', 'creo-rombooking' )
				/* translators: %d: number of bookings */
				: sprintf( _n( '%d booking is cancelled.', '%d bookings are cancelled.', $count, 'creo-rombooking' ), $count ),
			'cancelled' => $count,
		);
	}

	/**
	 * Accepts a proposal: the booking moves to the proposed room and time
	 * and is confirmed, when the time is still free.
	 *
	 * @param int $proposal_id The proposal.
	 * @return array{message: string}|WP_Error
	 */
	public function accept( $proposal_id ) {
		$proposal = $this->own_proposal( $proposal_id );
		if ( is_wp_error( $proposal ) ) {
			return $proposal;
		}

		$result = creo_rombooking_with_room_locks(
			array( (int) $proposal['room_id'] ),
			function () use ( $proposal ) {
				$status = $this->check( (int) $proposal['room_id'], $proposal['date'], (int) $proposal['start_min'], (int) $proposal['end_min'], array( (int) $proposal['booking_id'] ) );
				if ( $status !== 'free' ) {
					return new WP_Error( 'creo_rombooking_conflict', __( 'The proposed time is no longer free. Decline the proposal and book another time.', 'creo-rombooking' ), array( 'status' => 409 ) );
				}

				$this->update_booking(
					(int) $proposal['booking_id'],
					array(
						'room_id'       => (int) $proposal['room_id'],
						'date'          => $proposal['date'],
						'start_min'     => (int) $proposal['start_min'],
						'end_min'       => (int) $proposal['end_min'],
						'status'        => 'approved',
						'conflict_with' => null,
					)
				);
				$this->set_proposal_status( $proposal, 'accepted' );
				Creo_Rombooking_Notifier::log( (int) $proposal['booking_id'], 'accepted' );
				return true;
			}
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		Creo_Rombooking_Notifier::sms(
			$this->user_id,
			/* translators: %s: room, date and time */
			sprintf( __( 'Room booking: Your booking is confirmed. %s.', 'creo-rombooking' ), $this->describe_proposal( $proposal ) ),
			(int) $proposal['booking_id']
		);

		return array( 'message' => __( 'The proposal is accepted, and the booking is confirmed. You will get a text message.', 'creo-rombooking' ) );
	}

	/**
	 * Declines a proposal. The booking or request is then cancelled.
	 *
	 * @param int $proposal_id The proposal.
	 * @return array{message: string}|WP_Error
	 */
	public function decline( $proposal_id ) {
		$proposal = $this->own_proposal( $proposal_id );
		if ( is_wp_error( $proposal ) ) {
			return $proposal;
		}

		$this->set_proposal_status( $proposal, 'declined' );
		$this->update_booking( (int) $proposal['booking_id'], array( 'status' => 'cancelled' ) );
		Creo_Rombooking_Notifier::log( (int) $proposal['booking_id'], 'declined' );

		return array( 'message' => __( 'The proposal is declined.', 'creo-rombooking' ) );
	}

	/**
	 * Expires proposals that were not answered in time. The booking or request
	 * is cancelled, and the member gets a text message. Runs every hour, and
	 * before the list of bookings is read.
	 */
	public static function expire_proposals() {
		global $wpdb;

		$proposals = Creo_Rombooking_Schema::table( 'proposals' );
		$bookings  = Creo_Rombooking_Schema::table( 'bookings' );
		$rooms     = Creo_Rombooking_Schema::table( 'rooms' );

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$expired = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT p.*, b.user_id, r.name AS room_name
				FROM $proposals p
				JOIN $bookings b ON b.id = p.booking_id
				JOIN $rooms r ON r.id = p.room_id
				WHERE p.status = 'pending' AND p.expires_at < %s",
				current_time( 'mysql' )
			),
			ARRAY_A
		);
		// phpcs:enable

		foreach ( $expired as $proposal ) {
			$wpdb->update( $proposals, array( 'status' => 'expired' ), array( 'id' => $proposal['id'] ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
				$bookings,
				array( 'status' => 'cancelled' ),
				array(
					'id'     => $proposal['booking_id'],
					'status' => 'proposed',
				)
			);
			Creo_Rombooking_Notifier::log( (int) $proposal['booking_id'], 'expired' );
			Creo_Rombooking_Notifier::sms(
				(int) $proposal['user_id'],
				sprintf(
					/* translators: %s: room, date and time */
					__( 'Room booking: The proposal of %s was not answered in time and has expired.', 'creo-rombooking' ),
					Creo_Rombooking_Bookings::describe( $proposal['room_name'], $proposal['date'], (int) $proposal['start_min'], (int) $proposal['end_min'] )
				),
				(int) $proposal['booking_id']
			);
		}
	}

	/**
	 * @param array $row    A booking.
	 * @param array $series Rules by series ID.
	 * @return array
	 */
	protected function booking_data( array $row, array $series ) {
		return array(
			'id'           => (int) $row['id'],
			'room'         => array(
				'id'   => (int) $row['room_id'],
				'name' => $row['room_name'],
			),
			'date'         => $row['date'],
			'start'        => (int) $row['start_min'],
			'end'          => (int) $row['end_min'],
			'purpose'      => $row['purpose'],
			'people'       => (int) $row['people'],
			'status'       => $row['status'],
			'seriesId'     => $row['series_id'] ? (int) $row['series_id'] : null,
			'rule'         => $row['series_id'] ? ( $series[ (int) $row['series_id'] ] ?? null ) : null,
			'cancellable'  => $this->is_cancellable( $row ),
			// How to get in and use the room, only for confirmed bookings.
			'instructions' => $row['status'] === 'approved' ? $row['room_instructions'] : '',
		);
	}

	/**
	 * @param array $row      The booking waiting for an answer.
	 * @param array $proposal The proposal, with the proposed room.
	 * @return array
	 */
	protected function proposal_data( array $row, array $proposal ) {
		return array(
			'id'          => (int) $proposal['id'],
			'bookingId'   => (int) $row['id'],
			'original'    => array(
				'room'    => array(
					'id'   => (int) $row['room_id'],
					'name' => $row['room_name'],
				),
				'date'    => $row['date'],
				'start'   => (int) $row['start_min'],
				'end'     => (int) $row['end_min'],
				'purpose' => $row['purpose'],
			),
			'proposed'    => array(
				'room'  => array(
					'id'       => (int) $proposal['room_id'],
					'name'     => $proposal['room_name'],
					'capacity' => (int) $proposal['capacity'],
				),
				'date'  => $proposal['date'],
				'start' => (int) $proposal['start_min'],
				'end'   => (int) $proposal['end_min'],
			),
			'message'     => $proposal['message'],
			'expiresAt'   => $proposal['expires_at'],
			// Whether the booking was confirmed before it was cancelled with this proposal.
			'wasApproved' => $this->was_approved( (int) $row['id'] ),
		);
	}

	/**
	 * @param array $booking A booking.
	 * @return bool Whether the member can still cancel it.
	 */
	protected function is_cancellable( array $booking ) {
		if ( ! in_array( $booking['status'], array( 'approved', 'requested' ), true ) ) {
			return false;
		}

		$today = creo_rombooking_today();
		if ( $booking['date'] !== $today ) {
			return $booking['date'] > $today;
		}

		$now = current_datetime();
		return (int) $booking['start_min'] > (int) $now->format( 'G' ) * 60 + (int) $now->format( 'i' );
	}

	/**
	 * @param int $booking_id The booking.
	 * @return array|WP_Error The member's booking.
	 */
	protected function own_booking( $booking_id ) {
		$booking = $this->find_booking( $booking_id );

		// Other people's bookings are «not found», so that their IDs reveal nothing.
		if ( ! $booking || (int) $booking['user_id'] !== $this->user_id ) {
			return $this->not_found();
		}
		return $booking;
	}

	/**
	 * @param int $proposal_id The proposal.
	 * @return array|WP_Error The member's pending proposal, with the proposed room.
	 */
	protected function own_proposal( $proposal_id ) {
		global $wpdb;

		self::expire_proposals();

		$proposals = Creo_Rombooking_Schema::table( 'proposals' );
		$bookings  = Creo_Rombooking_Schema::table( 'bookings' );
		$rooms     = Creo_Rombooking_Schema::table( 'rooms' );

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$proposal = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT p.*, r.name AS room_name, r.capacity
				FROM $proposals p
				JOIN $bookings b ON b.id = p.booking_id
				JOIN $rooms r ON r.id = p.room_id
				WHERE p.id = %d AND b.user_id = %d",
				(int) $proposal_id,
				$this->user_id
			),
			ARRAY_A
		);
		// phpcs:enable

		if ( ! $proposal ) {
			return new WP_Error( 'creo_rombooking_not_found', __( 'The proposal was not found.', 'creo-rombooking' ), array( 'status' => 404 ) );
		}
		if ( $proposal['status'] === 'expired' ) {
			return new WP_Error( 'creo_rombooking_expired', __( 'The deadline for answering has passed.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}
		if ( $proposal['status'] !== 'pending' ) {
			return new WP_Error( 'creo_rombooking_handled', __( 'The proposal has already been answered.', 'creo-rombooking' ), array( 'status' => 409 ) );
		}
		return $proposal;
	}

	/**
	 * @param int[] $booking_ids Bookings waiting for an answer.
	 * @return array<int, array> The pending proposal of each booking, with the proposed room.
	 */
	protected function pending_proposals( array $booking_ids ) {
		global $wpdb;

		if ( ! $booking_ids ) {
			return array();
		}

		$proposals = Creo_Rombooking_Schema::table( 'proposals' );
		$rooms     = Creo_Rombooking_Schema::table( 'rooms' );
		$ids       = implode( ',', array_map( 'intval', $booking_ids ) );
		$rows      = $wpdb->get_results( "SELECT p.*, r.name AS room_name, r.capacity FROM $proposals p JOIN $rooms r ON r.id = p.room_id WHERE p.status = 'pending' AND p.booking_id IN ($ids) ORDER BY p.id", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery

		return array_column( $rows, null, 'booking_id' );
	}

	/**
	 * @param int[] $booking_ids The bookings.
	 * @return array<int, array> The latest change of each booking, with its reason.
	 */
	protected function last_events( array $booking_ids ) {
		global $wpdb;

		if ( ! $booking_ids ) {
			return array();
		}

		$table = Creo_Rombooking_Schema::table( 'events' );
		$ids   = implode( ',', array_map( 'intval', $booking_ids ) );
		$rows  = $wpdb->get_results( "SELECT booking_id, action, actor_id, reason, created_at FROM $table WHERE booking_id IN ($ids) AND action <> 'sms' ORDER BY id", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery

		// Later rows overwrite earlier ones.
		return array_column( $rows, null, 'booking_id' );
	}

	/**
	 * @param int[] $series_ids The series.
	 * @return array<int, string> The rule of each series.
	 */
	protected function series_rules( array $series_ids ) {
		global $wpdb;

		if ( ! $series_ids ) {
			return array();
		}

		$table = Creo_Rombooking_Schema::table( 'series' );
		$ids   = implode( ',', array_map( 'intval', array_unique( $series_ids ) ) );
		$rows  = $wpdb->get_results( "SELECT id, rule FROM $table WHERE id IN ($ids)", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery

		return array_map( 'strval', array_column( $rows, 'rule', 'id' ) );
	}

	/**
	 * @param int $booking_id The booking.
	 * @return bool Whether the booking was ever approved.
	 */
	protected function was_approved( $booking_id ) {
		global $wpdb;

		$table = Creo_Rombooking_Schema::table( 'events' );
		return (bool) $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM $table WHERE booking_id = %d AND action = 'approved' LIMIT 1", $booking_id ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
	}

	/**
	 * @param array  $proposal The proposal.
	 * @param string $status   `accepted` or `declined`.
	 */
	protected function set_proposal_status( array $proposal, $status ) {
		global $wpdb;
		$wpdb->update( Creo_Rombooking_Schema::table( 'proposals' ), array( 'status' => $status ), array( 'id' => (int) $proposal['id'] ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/**
	 * @param array $proposal The proposal, with `room_name`.
	 * @return string The proposed room, date and time.
	 */
	protected function describe_proposal( array $proposal ) {
		return Creo_Rombooking_Bookings::describe( $proposal['room_name'], $proposal['date'], (int) $proposal['start_min'], (int) $proposal['end_min'] );
	}
}
