<?php

/**
 * The administrator's room setup: rooms, weekly opening hours, and dates
 * when a room is closed or blocked.
 *
 * Rooms are never deleted, because bookings refer to them. A room that is
 * no longer used is made inactive, and can no longer be booked.
 */
class Creo_Rombooking_Rooms {

	const NAME_MAX         = 100;
	const DESCRIPTION_MAX  = 300;
	const INSTRUCTIONS_MAX = 1000;
	const REASON_MAX       = 200;
	const CAPACITY_MAX     = 9999;

	/**
	 * All rooms, also inactive ones, with opening hours and closures from today on.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function get_rooms() {
		$rooms    = ( new Creo_Rombooking_Availability( 0 ) )->get_rooms( true );
		$hours    = $this->opening_hours( array_column( $rooms, 'id' ) );
		$closures = $this->closures( array_column( $rooms, 'id' ) );

		return array_map(
			fn( $room ) => $this->room_data( $room, $hours[ $room['id'] ] ?? array(), $closures[ $room['id'] ] ?? array() ),
			$rooms
		);
	}

	/**
	 * Creates or updates a room and replaces its opening hours.
	 *
	 * @param int|null $room_id The room, or null for a new room.
	 * @param array    $input   `name`, `description`, `capacity`, `approval`, `active`, `imageId`,
	 *                          `instructions` and `openingHours` (a list of `weekday`, `start`, `end`).
	 * @return array{message: string, room: array}|WP_Error
	 */
	public function save( $room_id, array $input ) {
		global $wpdb;

		if ( $room_id !== null && ! $this->exists( $room_id ) ) {
			return new WP_Error( 'creo_rombooking_not_found', __( 'The room was not found.', 'creo-rombooking' ), array( 'status' => 404 ) );
		}

		$validated = $this->validate( $input );
		if ( is_wp_error( $validated ) ) {
			return $validated;
		}
		list( $data, $hours ) = $validated;

		$table = Creo_Rombooking_Schema::table( 'rooms' );
		if ( $room_id === null ) {
			$data['sort_order'] = (int) $wpdb->get_var( "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM $table" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
			$wpdb->insert( $table, $data ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$room_id = (int) $wpdb->insert_id;
		} else {
			$wpdb->update( $table, $data, array( 'id' => $room_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}

		$hours_table = Creo_Rombooking_Schema::table( 'opening_hours' );
		$wpdb->delete( $hours_table, array( 'room_id' => $room_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		foreach ( $hours as $interval ) {
			$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
				$hours_table,
				array(
					'room_id'   => $room_id,
					'weekday'   => $interval['weekday'],
					'start_min' => $interval['start'],
					'end_min'   => $interval['end'],
				)
			);
		}

		$room = wp_list_filter( $this->get_rooms(), array( 'id' => $room_id ) );

		return array(
			/* translators: %s: room name */
			'message' => sprintf( __( '%s is saved.', 'creo-rombooking' ), $data['name'] ),
			'room'    => reset( $room ),
		);
	}

	/**
	 * Sets the order rooms are shown in.
	 *
	 * @param int[] $room_ids All rooms, in the new order.
	 * @return array{message: string}|WP_Error
	 */
	public function reorder( array $room_ids ) {
		global $wpdb;

		$room_ids = array_map( 'intval', $room_ids );
		$existing = array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms( true ), 'id' );
		sort( $existing );
		$sorted = $room_ids;
		sort( $sorted );

		if ( $sorted !== $existing ) {
			return new WP_Error( 'creo_rombooking_invalid', __( 'The order must include every room once.', 'creo-rombooking' ), array( 'status' => 400 ) );
		}

		foreach ( $room_ids as $index => $room_id ) {
			$wpdb->update( Creo_Rombooking_Schema::table( 'rooms' ), array( 'sort_order' => $index + 1 ), array( 'id' => $room_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}

		return array( 'message' => __( 'The order is saved.', 'creo-rombooking' ) );
	}

	/**
	 * Closes a room for a day, or blocks part of a day.
	 *
	 * @param int   $room_id The room.
	 * @param array $input   `date`, `wholeDay`, `start`, `end`, `type` (`closed` or `blocked`) and `reason`.
	 * @return array{message: string, closure: array, affected: int}|WP_Error
	 */
	public function add_closure( $room_id, array $input ) {
		global $wpdb;

		if ( ! $this->exists( $room_id ) ) {
			return new WP_Error( 'creo_rombooking_not_found', __( 'The room was not found.', 'creo-rombooking' ), array( 'status' => 404 ) );
		}

		$errors    = array();
		$date      = (string) ( $input['date'] ?? '' );
		$whole_day = ! empty( $input['wholeDay'] );
		$start     = $whole_day ? null : (int) ( $input['start'] ?? 0 );
		$end       = $whole_day ? null : (int) ( $input['end'] ?? 0 );
		$type      = in_array( $input['type'] ?? '', array( 'closed', 'blocked' ), true ) ? $input['type'] : null;
		$reason    = trim( sanitize_text_field( (string) ( $input['reason'] ?? '' ) ) );

		if ( ! Creo_Rombooking_Availability::is_date( $date ) || $date < creo_rombooking_today() ) {
			$errors['date'] = __( 'Choose a date from today on.', 'creo-rombooking' );
		}
		if ( ! $whole_day && ( ! $this->is_slot_time( $start ) || ! $this->is_slot_time( $end ) || $end <= $start ) ) {
			$errors['end'] = __( 'The end time must be after the start time.', 'creo-rombooking' );
		}
		if ( ! $type ) {
			$errors['type'] = __( 'Choose closed or blocked.', 'creo-rombooking' );
		}
		if ( mb_strlen( $reason ) > self::REASON_MAX ) {
			/* translators: %d: maximum number of characters */
			$errors['reason'] = sprintf( __( 'The reason can be at most %d characters.', 'creo-rombooking' ), self::REASON_MAX );
		}

		if ( $errors ) {
			return $this->validation_error( $errors );
		}

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			Creo_Rombooking_Schema::table( 'closures' ),
			array(
				'room_id'   => $room_id,
				'date'      => $date,
				'start_min' => $start,
				'end_min'   => $end,
				'type'      => $type,
				'reason'    => $reason,
			)
		);
		$closure_id = (int) $wpdb->insert_id;

		// Bookings in the period stay as they are; the administrator decides what to do with them.
		$bookings = Creo_Rombooking_Schema::table( 'bookings' );
		$affected = (int) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare(
				"SELECT COUNT(*) FROM $bookings WHERE room_id = %d AND date = %s AND status IN ('approved', 'requested') AND start_min < %d AND end_min > %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$room_id,
				$date,
				$whole_day ? Creo_Rombooking_Availability::DAY_END : $end,
				$whole_day ? 0 : $start
			)
		);

		$message = __( 'The closure is saved.', 'creo-rombooking' );
		if ( $affected > 0 ) {
			$message .= ' ' . sprintf(
				/* translators: %d: number of bookings */
				_n(
					'%d booking is in the period. It has not been changed; move or cancel it in the overview.',
					'%d bookings are in the period. They have not been changed; move or cancel them in the overview.',
					$affected,
					'creo-rombooking'
				),
				$affected
			);
		}

		return array(
			'message'  => $message,
			'closure'  => $this->closure_data(
				array(
					'id'        => $closure_id,
					'date'      => $date,
					'start_min' => $start,
					'end_min'   => $end,
					'type'      => $type,
					'reason'    => $reason,
				)
			),
			'affected' => $affected,
		);
	}

	/**
	 * @param int $room_id    The room.
	 * @param int $closure_id The closure.
	 * @return array{message: string}|WP_Error
	 */
	public function delete_closure( $room_id, $closure_id ) {
		global $wpdb;

		$deleted = $wpdb->delete( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			Creo_Rombooking_Schema::table( 'closures' ),
			array(
				'id'      => (int) $closure_id,
				'room_id' => (int) $room_id,
			)
		);

		if ( ! $deleted ) {
			return new WP_Error( 'creo_rombooking_not_found', __( 'The closure was not found.', 'creo-rombooking' ), array( 'status' => 404 ) );
		}

		return array( 'message' => __( 'The closure is removed.', 'creo-rombooking' ) );
	}

	/**
	 * @param array $input The form.
	 * @return array{0: array, 1: array}|WP_Error The room's columns and its opening hours.
	 */
	protected function validate( array $input ) {
		$errors       = array();
		$name         = trim( sanitize_text_field( (string) ( $input['name'] ?? '' ) ) );
		$description  = trim( sanitize_textarea_field( (string) ( $input['description'] ?? '' ) ) );
		$instructions = trim( sanitize_textarea_field( (string) ( $input['instructions'] ?? '' ) ) );
		$capacity     = (int) ( $input['capacity'] ?? 0 );
		$approval     = $input['approval'] ?? '';
		$image_id     = (int) ( $input['imageId'] ?? 0 );

		if ( $name === '' || mb_strlen( $name ) > self::NAME_MAX ) {
			/* translators: %d: maximum number of characters */
			$errors['name'] = sprintf( __( 'Write a name of at most %d characters.', 'creo-rombooking' ), self::NAME_MAX );
		}
		if ( mb_strlen( $description ) > self::DESCRIPTION_MAX ) {
			/* translators: %d: maximum number of characters */
			$errors['description'] = sprintf( __( 'The description can be at most %d characters.', 'creo-rombooking' ), self::DESCRIPTION_MAX );
		}
		if ( mb_strlen( $instructions ) > self::INSTRUCTIONS_MAX ) {
			/* translators: %d: maximum number of characters */
			$errors['instructions'] = sprintf( __( 'The instructions can be at most %d characters.', 'creo-rombooking' ), self::INSTRUCTIONS_MAX );
		}
		if ( $capacity < 1 || $capacity > self::CAPACITY_MAX ) {
			/* translators: %d: maximum number of places */
			$errors['capacity'] = sprintf( __( 'Write the number of places, from 1 to %d.', 'creo-rombooking' ), self::CAPACITY_MAX );
		}
		if ( ! in_array( $approval, array( 'auto', 'manual' ), true ) ) {
			$errors['approval'] = __( 'Choose how bookings are approved.', 'creo-rombooking' );
		}
		if ( $image_id && ! wp_attachment_is_image( $image_id ) ) {
			$errors['imageId'] = __( 'Choose an image.', 'creo-rombooking' );
		}

		$hours = array();
		foreach ( (array) ( $input['openingHours'] ?? array() ) as $interval ) {
			$weekday = (int) ( $interval['weekday'] ?? -1 );
			$start   = (int) ( $interval['start'] ?? 0 );
			$end     = (int) ( $interval['end'] ?? 0 );

			if ( $weekday < 0 || $weekday > 6 || ! $this->is_slot_time( $start ) || ! $this->is_slot_time( $end ) || $end <= $start ) {
				$errors[ "openingHours.$weekday" ] = __( 'The closing time must be after the opening time.', 'creo-rombooking' );
				continue;
			}
			foreach ( $hours as $other ) {
				if ( $other['weekday'] === $weekday && $other['start'] < $end && $start < $other['end'] ) {
					$errors[ "openingHours.$weekday" ] = __( 'The opening hours of a day overlap.', 'creo-rombooking' );
				}
			}
			$hours[] = array(
				'weekday' => $weekday,
				'start'   => $start,
				'end'     => $end,
			);
		}

		if ( $errors ) {
			return $this->validation_error( $errors );
		}

		return array(
			array(
				'name'         => $name,
				'description'  => $description,
				'capacity'     => $capacity,
				'approval'     => $approval,
				'active'       => empty( $input['active'] ) ? 0 : 1,
				'image_id'     => $image_id,
				'instructions' => $instructions,
			),
			$hours,
		);
	}

	/**
	 * @param array $room     A room from `Creo_Rombooking_Availability::get_rooms()`.
	 * @param array $hours    Its opening hours.
	 * @param array $closures Its closures from today on.
	 * @return array
	 */
	protected function room_data( array $room, array $hours, array $closures ) {
		return array(
			'id'           => $room['id'],
			'name'         => $room['name'],
			'description'  => $room['description'],
			'capacity'     => $room['capacity'],
			'approval'     => $room['approval'],
			'active'       => $room['active'],
			'imageId'      => $room['imageId'],
			'imageUrl'     => $room['imageId'] ? wp_get_attachment_image_url( $room['imageId'], 'medium' ) : null,
			'instructions' => $room['instructions'],
			'openingHours' => array_map(
				fn( $row ) => array(
					'weekday' => (int) $row['weekday'],
					'start'   => (int) $row['start_min'],
					'end'     => (int) $row['end_min'],
				),
				$hours
			),
			'closures'     => array_map( array( $this, 'closure_data' ), $closures ),
		);
	}

	/**
	 * @param array $row A closure.
	 * @return array
	 */
	protected function closure_data( array $row ) {
		return array(
			'id'     => (int) $row['id'],
			'date'   => $row['date'],
			'start'  => $row['start_min'] === null ? null : (int) $row['start_min'],
			'end'    => $row['end_min'] === null ? null : (int) $row['end_min'],
			'type'   => $row['type'],
			'reason' => $row['reason'],
		);
	}

	/**
	 * @param int[] $room_ids The rooms.
	 * @return array<int, array> Opening hours by room, by weekday and time.
	 */
	protected function opening_hours( array $room_ids ) {
		global $wpdb;

		if ( ! $room_ids ) {
			return array();
		}

		$table  = Creo_Rombooking_Schema::table( 'opening_hours' );
		$ids    = implode( ',', array_map( 'intval', $room_ids ) );
		$rows   = $wpdb->get_results( "SELECT * FROM $table WHERE room_id IN ($ids) ORDER BY weekday, start_min", ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.DirectDatabaseQuery
		$result = array();
		foreach ( $rows as $row ) {
			$result[ (int) $row['room_id'] ][] = $row;
		}
		return $result;
	}

	/**
	 * @param int[] $room_ids The rooms.
	 * @return array<int, array> Closures from today on by room, by date.
	 */
	protected function closures( array $room_ids ) {
		global $wpdb;

		if ( ! $room_ids ) {
			return array();
		}

		$table = Creo_Rombooking_Schema::table( 'closures' );
		$ids   = implode( ',', array_map( 'intval', $room_ids ) );
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare(
				"SELECT * FROM $table WHERE room_id IN ($ids) AND date >= %s ORDER BY date, start_min", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				creo_rombooking_today()
			),
			ARRAY_A
		);

		$result = array();
		foreach ( $rows as $row ) {
			$result[ (int) $row['room_id'] ][] = $row;
		}
		return $result;
	}

	/**
	 * @param int $room_id The room.
	 * @return bool Whether the room exists, active or not.
	 */
	protected function exists( $room_id ) {
		return in_array( (int) $room_id, array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms( true ), 'id' ), true );
	}

	/**
	 * @param int|null $minute Minutes after midnight.
	 * @return bool Whether it is a slot boundary within the day.
	 */
	protected function is_slot_time( $minute ) {
		return $minute !== null
			&& $minute >= Creo_Rombooking_Availability::DAY_START
			&& $minute <= Creo_Rombooking_Availability::DAY_END
			&& $minute % Creo_Rombooking_Availability::SLOT === 0;
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
}
