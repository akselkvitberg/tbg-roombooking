<?php

/**
 * Calculates the status of every room through the day, from 08:00 to 22:00
 * in slots of 30 minutes, and merges equal neighbouring slots into periods.
 *
 * Statuses, from highest to lowest priority when they overlap:
 *
 * - `closed`:         outside opening hours, closed for the day, or blocked.
 * - `mine`:           an approved booking by the viewer.
 * - `busy`:           an approved booking by someone else.
 * - `mine-requested`: a request by the viewer, waiting for an administrator.
 * - `requested`:      a request by someone else.
 * - `free`:           available.
 *
 * Members never see who booked, or why. With `$with_details`, periods
 * include the name and purpose of the booking, for administrators.
 */
class Creo_Rombooking_Availability {

	/**
	 * First bookable minute of the day (08:00).
	 */
	const DAY_START = 480;

	/**
	 * Last bookable minute of the day (22:00).
	 */
	const DAY_END = 1320;

	/**
	 * Slot length in minutes.
	 */
	const SLOT = 30;

	/**
	 * Priority of each status when periods overlap.
	 */
	const PRIORITY = array(
		'free'           => 0,
		'requested'      => 1,
		'mine-requested' => 2,
		'busy'           => 3,
		'mine'           => 4,
		'closed'         => 5,
	);

	/**
	 * @var int
	 */
	protected $viewer_id;

	/**
	 * @var bool
	 */
	protected $with_details;

	/**
	 * @param int  $viewer_id    The user viewing the availability.
	 * @param bool $with_details Whether to include names and purposes of other people's bookings.
	 */
	public function __construct( $viewer_id, $with_details = false ) {
		$this->viewer_id    = (int) $viewer_id;
		$this->with_details = (bool) $with_details;
	}

	/**
	 * The number of slots in a day.
	 *
	 * @return int
	 */
	public static function slot_count() {
		return ( self::DAY_END - self::DAY_START ) / self::SLOT;
	}

	/**
	 * Whether a string is a valid date in the format `Y-m-d`.
	 *
	 * @param mixed $date The value to check.
	 * @return bool
	 */
	public static function is_date( $date ) {
		if ( ! is_string( $date ) ) {
			return false;
		}
		$parsed = DateTimeImmutable::createFromFormat( '!Y-m-d', $date );
		return $parsed && $parsed->format( 'Y-m-d' ) === $date;
	}

	/**
	 * Returns the rooms, sorted.
	 *
	 * @param bool $include_inactive Whether to include inactive rooms.
	 * @return array<int, array<string, mixed>>
	 */
	public function get_rooms( $include_inactive = false ) {
		global $wpdb;

		$table = Creo_Rombooking_Schema::table( 'rooms' );
		$where = $include_inactive ? '' : 'WHERE active = 1';
		$rows  = $wpdb->get_results( "SELECT * FROM $table $where ORDER BY sort_order, name", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery

		return array_map(
			function ( $row ) {
				return array(
					'id'           => (int) $row['id'],
					'name'         => $row['name'],
					'description'  => $row['description'],
					'capacity'     => (int) $row['capacity'],
					'imageId'      => (int) $row['image_id'],
					'active'       => (bool) $row['active'],
					'approval'     => $row['approval'],
					'instructions' => $row['instructions'],
				);
			},
			$rows
		);
	}

	/**
	 * Returns the periods of each room for each day in a date range.
	 *
	 * @param string     $from     The first date (Y-m-d).
	 * @param string     $to       The last date (Y-m-d), inclusive.
	 * @param int[]|null $room_ids Only these rooms. Defaults to all active rooms.
	 * @return array<int, array{date: string, rooms: array<int, array{roomId: int, periods: array}>}>
	 */
	public function get_days( $from, $to, $room_ids = null ) {
		$rooms = array_column( $this->get_rooms(), null, 'id' );

		if ( $room_ids !== null ) {
			$rooms = array_intersect_key( $rooms, array_flip( array_map( 'intval', $room_ids ) ) );
		}

		$ids           = array_keys( $rooms );
		$opening_hours = $this->load_opening_hours( $ids );
		$closures      = $this->load_closures( $ids, $from, $to );
		$bookings      = $this->load_bookings( $ids, $from, $to );

		$days = array();
		$date = new DateTimeImmutable( $from );
		$last = new DateTimeImmutable( $to );

		while ( $date <= $last ) {
			$key     = $date->format( 'Y-m-d' );
			$weekday = (int) $date->format( 'w' );
			$day     = array(
				'date'  => $key,
				'rooms' => array(),
			);

			foreach ( $ids as $room_id ) {
				$day['rooms'][] = array(
					'roomId'  => $room_id,
					'periods' => $this->calculate(
						$opening_hours[ $room_id ][ $weekday ] ?? array(),
						$closures[ $room_id ][ $key ] ?? array(),
						$bookings[ $room_id ][ $key ] ?? array()
					),
				);
			}

			$days[] = $day;
			$date   = $date->modify( '+1 day' );
		}

		return $days;
	}

	/**
	 * Calculates the periods of one room on one day.
	 *
	 * @param array $opening_hours The day's opening hours: arrays of `start_min` and `end_min`.
	 * @param array $closures      The day's closures (rows from the closures table).
	 * @param array $bookings      The day's approved and requested bookings (rows from the bookings table, with `user_name`).
	 * @return array<int, array<string, mixed>>
	 */
	public function calculate( array $opening_hours, array $closures, array $bookings ) {
		$slots = array_fill(
			0,
			self::slot_count(),
			array(
				'status' => 'free',
				'key'    => 'free',
				'data'   => array(),
			)
		);

		// Closures go first, so that their reason is shown instead of «outside opening hours».
		foreach ( $closures as $closure ) {
			$whole_day = $closure['start_min'] === null;
			$this->apply(
				$slots,
				$whole_day ? self::DAY_START : (int) $closure['start_min'],
				$whole_day ? self::DAY_END : (int) $closure['end_min'],
				'closed',
				'closure-' . $closure['id'],
				array(
					'reason' => array(
						'type' => $closure['type'],
						'text' => $closure['reason'],
					),
				)
			);
		}

		foreach ( $slots as $index => $slot ) {
			if ( $slot['status'] === 'free' && ! $this->is_open( $opening_hours, $this->slot_start( $index ) ) ) {
				$slots[ $index ] = array(
					'status' => 'closed',
					'key'    => 'outside',
					'data'   => array(
						'reason' => array(
							'type' => 'outside',
							'text' => '',
						),
					),
				);
			}
		}

		foreach ( $bookings as $booking ) {
			$is_mine = (int) $booking['user_id'] === $this->viewer_id;

			if ( $booking['status'] === 'approved' ) {
				$status = $is_mine ? 'mine' : 'busy';
			} else {
				$status = $is_mine ? 'mine-requested' : 'requested';
			}

			$this->apply(
				$slots,
				(int) $booking['start_min'],
				(int) $booking['end_min'],
				$status,
				'booking-' . $booking['id'],
				$this->booking_data( $booking, $is_mine )
			);
		}

		return $this->merge( $slots );
	}

	/**
	 * Checks a time on several dates in one room, using the same rules as the
	 * matrix: `outside` when any part is closed, `conflict` when any part is
	 * booked or requested, otherwise `free`.
	 *
	 * @param int      $room_id The room.
	 * @param string[] $dates   The dates (Y-m-d).
	 * @param int      $start   Start minute.
	 * @param int      $end     End minute.
	 * @return array<string, array{status: string, conflictWith: int|null}> By date.
	 */
	public function check( $room_id, array $dates, $start, $end ) {
		if ( ! $dates ) {
			return array();
		}

		$room_id  = (int) $room_id;
		$from     = min( $dates );
		$to       = max( $dates );
		$hours    = $this->load_opening_hours( array( $room_id ) )[ $room_id ] ?? array();
		$closures = $this->load_closures( array( $room_id ), $from, $to )[ $room_id ] ?? array();
		$bookings = $this->load_bookings( array( $room_id ), $from, $to )[ $room_id ] ?? array();

		// Booking IDs are needed to link a request to the booking it conflicts with.
		$details = new self( 0, true );
		$result  = array();

		foreach ( $dates as $date ) {
			$weekday = (int) ( new DateTimeImmutable( $date ) )->format( 'w' );
			$periods = $details->calculate( $hours[ $weekday ] ?? array(), $closures[ $date ] ?? array(), $bookings[ $date ] ?? array() );
			$status  = 'free';
			$with    = null;

			foreach ( $periods as $period ) {
				if ( $period['end'] <= $start || $period['start'] >= $end || $period['status'] === 'free' ) {
					continue;
				}
				if ( $period['status'] === 'closed' ) {
					$status = 'outside';
					$with   = null;
					break;
				}
				$status = 'conflict';
				$with   = $with ?? ( $period['booking']['id'] ?? null );
			}

			$result[ $date ] = array(
				'status'       => $status,
				'conflictWith' => $with,
			);
		}

		return $result;
	}

	/**
	 * What the viewer may see about a booking.
	 *
	 * @param array $booking A row from the bookings table, with `user_name`.
	 * @param bool  $is_mine Whether the viewer made the booking.
	 * @return array
	 */
	protected function booking_data( array $booking, $is_mine ) {
		if ( $is_mine ) {
			return array(
				'booking' => array(
					'id'       => (int) $booking['id'],
					'purpose'  => $booking['purpose'],
					'seriesId' => $booking['series_id'] ? (int) $booking['series_id'] : null,
				),
			);
		}

		if ( $this->with_details ) {
			return array(
				'booking' => array(
					'id'       => (int) $booking['id'],
					'purpose'  => $booking['purpose'],
					'seriesId' => $booking['series_id'] ? (int) $booking['series_id'] : null,
					'userId'   => (int) $booking['user_id'],
					'userName' => $booking['user_name'] ?? '',
				),
			);
		}

		return array();
	}

	/**
	 * Sets the status of the slots within a period, where it has higher priority.
	 *
	 * @param array  $slots  The slots (by reference).
	 * @param int    $start  Start minute.
	 * @param int    $end    End minute.
	 * @param string $status The status.
	 * @param string $key    Identifies the source, so that neighbouring slots from different sources are not merged.
	 * @param array  $data   Extra data for the period.
	 */
	protected function apply( array &$slots, $start, $end, $status, $key, array $data ) {
		foreach ( $slots as $index => $slot ) {
			$slot_start = $this->slot_start( $index );
			$overlaps   = $slot_start < $end && $slot_start + self::SLOT > $start;

			if ( $overlaps && self::PRIORITY[ $status ] > self::PRIORITY[ $slot['status'] ] ) {
				$slots[ $index ] = array(
					'status' => $status,
					'key'    => $key,
					'data'   => $data,
				);
			}
		}
	}

	/**
	 * Merges neighbouring slots from the same source into periods.
	 *
	 * @param array $slots The slots.
	 * @return array<int, array<string, mixed>>
	 */
	protected function merge( array $slots ) {
		$periods = array();
		$current = null;

		foreach ( $slots as $index => $slot ) {
			$start = $this->slot_start( $index );

			if ( $current && $current['key'] === $slot['key'] ) {
				$current['end'] = $start + self::SLOT;
				continue;
			}

			if ( $current ) {
				$periods[] = $current;
			}

			$current = array(
				'key'    => $slot['key'],
				'start'  => $start,
				'end'    => $start + self::SLOT,
				'status' => $slot['status'],
				'data'   => $slot['data'],
			);
		}

		$periods[] = $current;

		return array_map(
			function ( $period ) {
				return array_merge(
					array(
						'start'  => $period['start'],
						'end'    => $period['end'],
						'status' => $period['status'],
					),
					$period['data']
				);
			},
			$periods
		);
	}

	/**
	 * Whether a slot is fully within the opening hours.
	 *
	 * @param array $opening_hours Intervals with `start_min` and `end_min`.
	 * @param int   $slot_start    The slot's start minute.
	 * @return bool
	 */
	protected function is_open( array $opening_hours, $slot_start ) {
		foreach ( $opening_hours as $interval ) {
			if ( (int) $interval['start_min'] <= $slot_start && $slot_start + self::SLOT <= (int) $interval['end_min'] ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param int $index The slot index.
	 * @return int The start minute of the slot.
	 */
	protected function slot_start( $index ) {
		return self::DAY_START + $index * self::SLOT;
	}

	/**
	 * @param int[] $room_ids The rooms.
	 * @return array<int, array<int, array>> Intervals by room and weekday.
	 */
	protected function load_opening_hours( array $room_ids ) {
		global $wpdb;

		if ( ! $room_ids ) {
			return array();
		}

		$table = Creo_Rombooking_Schema::table( 'opening_hours' );
		$ids   = implode( ',', array_map( 'intval', $room_ids ) );
		$rows  = $wpdb->get_results( "SELECT room_id, weekday, start_min, end_min FROM $table WHERE room_id IN ($ids)", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery

		$result = array();
		foreach ( $rows as $row ) {
			$result[ (int) $row['room_id'] ][ (int) $row['weekday'] ][] = $row;
		}
		return $result;
	}

	/**
	 * @param int[]  $room_ids The rooms.
	 * @param string $from     The first date.
	 * @param string $to       The last date.
	 * @return array<int, array<string, array>> Closures by room and date.
	 */
	protected function load_closures( array $room_ids, $from, $to ) {
		global $wpdb;

		if ( ! $room_ids ) {
			return array();
		}

		$table = Creo_Rombooking_Schema::table( 'closures' );
		$ids   = implode( ',', array_map( 'intval', $room_ids ) );
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare(
				"SELECT id, room_id, date, start_min, end_min, type, reason FROM $table WHERE room_id IN ($ids) AND date BETWEEN %s AND %s", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$from,
				$to
			),
			ARRAY_A
		);

		$result = array();
		foreach ( $rows as $row ) {
			$result[ (int) $row['room_id'] ][ $row['date'] ][] = $row;
		}
		return $result;
	}

	/**
	 * @param int[]  $room_ids The rooms.
	 * @param string $from     The first date.
	 * @param string $to       The last date.
	 * @return array<int, array<string, array>> Approved and requested bookings by room and date.
	 */
	protected function load_bookings( array $room_ids, $from, $to ) {
		global $wpdb;

		if ( ! $room_ids ) {
			return array();
		}

		$table = Creo_Rombooking_Schema::table( 'bookings' );
		$ids   = implode( ',', array_map( 'intval', $room_ids ) );
		// Table names and IDs are not user input; the IDs are cast to integers above.
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT b.id, b.series_id, b.room_id, b.user_id, b.date, b.start_min, b.end_min, b.purpose, b.status, u.display_name AS user_name
				FROM $table b
				LEFT JOIN {$wpdb->users} u ON u.ID = b.user_id
				WHERE b.room_id IN ($ids) AND b.date BETWEEN %s AND %s AND b.status IN ('approved', 'requested')
				ORDER BY b.start_min",
				$from,
				$to
			),
			ARRAY_A
		);
		// phpcs:enable

		$result = array();
		foreach ( $rows as $row ) {
			$result[ (int) $row['room_id'] ][ $row['date'] ][] = $row;
		}
		return $result;
	}
}
