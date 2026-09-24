<?php

/**
 * What the administrator's and the member's handling of bookings share:
 * reading bookings with their room and member, changing their status, and
 * checking whether a room is free.
 */
abstract class Creo_Rombooking_Service {

	/**
	 * @var Creo_Rombooking_Availability
	 */
	protected $availability;

	public function __construct() {
		$this->availability = new Creo_Rombooking_Availability( 0, true );
	}

	/**
	 * Checks a room and time for a proposal or a move.
	 *
	 * @param int   $room_id The room.
	 * @param string $date   The date (Y-m-d).
	 * @param int   $start   Start minute.
	 * @param int   $end     End minute.
	 * @param int[] $ignore  Bookings to leave out.
	 * @return string `free`, `conflict` or `outside`.
	 */
	public function check( $room_id, $date, $start, $end, array $ignore = array() ) {
		return $this->availability->check( $room_id, array( $date ), $start, $end, $ignore )[ $date ]['status'];
	}

	/**
	 * @param array  $booking The booking.
	 * @param string $status  The new status.
	 * @param string $reason  The reason, for the log.
	 */
	protected function set_status( array $booking, $status, $reason = '' ) {
		$this->update_booking( (int) $booking['id'], array( 'status' => $status ) );
		Creo_Rombooking_Notifier::log( (int) $booking['id'], $status, $reason );
	}

	/**
	 * @param int   $booking_id The booking.
	 * @param array $data       Columns to change.
	 */
	protected function update_booking( $booking_id, array $data ) {
		global $wpdb;
		$wpdb->update( Creo_Rombooking_Schema::table( 'bookings' ), $data, array( 'id' => $booking_id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/**
	 * @param array $booking A booking.
	 * @return bool Whether the room is closed during some of the booking.
	 */
	protected function is_closed( array $booking ) {
		return $this->check( (int) $booking['room_id'], $booking['date'], (int) $booking['start_min'], (int) $booking['end_min'], array( (int) $booking['id'] ) ) === 'outside';
	}

	/**
	 * @param int $series_id The series.
	 * @return array<int, array> The bookings in the series, by date.
	 */
	protected function series_bookings( $series_id ) {
		$rows = $this->query_bookings( 'b.series_id = %d', array( (int) $series_id ) );
		usort( $rows, fn( $a, $b ) => strcmp( $a['date'], $b['date'] ) );
		return $rows;
	}

	/**
	 * @param int $booking_id The booking.
	 * @return array|null The booking with room and user details.
	 */
	protected function find_booking( $booking_id ) {
		return $this->query_bookings( 'b.id = %d', array( (int) $booking_id ) )[0] ?? null;
	}

	/**
	 * @param int $series_id The series.
	 * @return array|null The series, with the member's name.
	 */
	protected function find_series( $series_id ) {
		global $wpdb;

		$table = Creo_Rombooking_Schema::table( 'series' );
		return $wpdb->get_row( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare(
				"SELECT s.*, u.display_name AS user_name FROM $table s LEFT JOIN {$wpdb->users} u ON u.ID = s.user_id WHERE s.id = %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				(int) $series_id
			),
			ARRAY_A
		);
	}

	/**
	 * Bookings with the room, the member's name and the start of their series.
	 *
	 * @param string $where  The condition, with placeholders.
	 * @param array  $values The values.
	 * @return array<int, array>
	 */
	protected function query_bookings( $where, array $values ) {
		global $wpdb;

		$bookings = Creo_Rombooking_Schema::table( 'bookings' );
		$rooms    = Creo_Rombooking_Schema::table( 'rooms' );
		$series   = Creo_Rombooking_Schema::table( 'series' );

		// Table names are not user input, and the condition only has placeholders.
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPrepare
		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT b.*, r.name AS room_name, r.capacity, r.approval, u.display_name AS user_name, s.start_date AS series_start
				FROM $bookings b
				JOIN $rooms r ON r.id = b.room_id
				LEFT JOIN {$wpdb->users} u ON u.ID = b.user_id
				LEFT JOIN $series s ON s.id = b.series_id
				WHERE $where
				ORDER BY b.created_at, b.id",
				$values
			),
			ARRAY_A
		);
		// phpcs:enable
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
	 * @param string $status `conflict` or `outside`.
	 * @return string Why a room cannot be used.
	 */
	protected function unavailable_message( $status ) {
		return $status === 'outside'
			? __( 'The room is closed at that time.', 'creo-rombooking' )
			: __( 'The room is not free at that time.', 'creo-rombooking' );
	}

	/**
	 * @param array $booking A booking with `room_name`.
	 * @return string The room, date and time.
	 */
	protected function describe( array $booking ) {
		return Creo_Rombooking_Bookings::describe( $booking['room_name'], $booking['date'], (int) $booking['start_min'], (int) $booking['end_min'] );
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
	 * @return WP_Error
	 */
	protected function not_found() {
		return new WP_Error( 'creo_rombooking_not_found', __( 'The booking was not found.', 'creo-rombooking' ), array( 'status' => 404 ) );
	}
}
