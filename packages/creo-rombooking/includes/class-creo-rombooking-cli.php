<?php

/**
 * Manages room booking data.
 */
class Creo_Rombooking_CLI {

	/**
	 * Adds example data from the prototype. Only in local and development environments.
	 *
	 * ## OPTIONS
	 *
	 * [--reset]
	 * : Delete all existing booking data first.
	 *
	 * ## EXAMPLES
	 *
	 *     wp creo-rombooking seed --reset
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Named arguments.
	 */
	public function seed( $args, $assoc_args ) {
		if ( ! creo_rombooking_is_dev() ) {
			WP_CLI::error( 'Example data can only be added when WP_ENVIRONMENT_TYPE is local or development.' );
		}

		global $wpdb;

		if ( ! empty( $assoc_args['reset'] ) ) {
			Creo_Rombooking_Seed::reset();
		} else {
			Creo_Rombooking_Schema::maybe_upgrade();
			$rooms = (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . Creo_Rombooking_Schema::table( 'rooms' ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery
			if ( $rooms > 0 ) {
				WP_CLI::error( 'There is already data. Use --reset to replace it.' );
			}
		}

		$counts = ( new Creo_Rombooking_Seed() )->run();

		WP_CLI::success(
			sprintf(
				'Added %d rooms, %d recurring series, %d single bookings and %d requests.',
				$counts['rooms'],
				$counts['series'],
				$counts['bookings'],
				$counts['requests']
			)
		);
	}

	/**
	 * Lists the text messages that would have been sent.
	 *
	 * ## OPTIONS
	 *
	 * [--limit=<number>]
	 * : How many messages to show.
	 * ---
	 * default: 20
	 * ---
	 *
	 * @subcommand sms-log
	 *
	 * @param array $args       Positional arguments.
	 * @param array $assoc_args Named arguments.
	 */
	public function sms_log( $args, $assoc_args ) {
		global $wpdb;

		$table = Creo_Rombooking_Schema::table( 'events' );
		$rows  = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare(
				"SELECT created_at, sms_to, sms_text FROM $table WHERE sms_text IS NOT NULL ORDER BY id DESC LIMIT %d", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				(int) $assoc_args['limit']
			),
			ARRAY_A
		);

		if ( ! $rows ) {
			WP_CLI::log( 'No text messages yet.' );
			return;
		}

		foreach ( $rows as &$row ) {
			$user          = get_userdata( (int) $row['sms_to'] );
			$phone         = creo_rombooking_get_phone( (int) $row['sms_to'] );
			$row['sms_to'] = ( $user ? $user->display_name : '?' ) . ' (' . ( $phone['number'] ?? '-' ) . ')';
		}

		WP_CLI\Utils\format_items( 'table', $rows, array( 'created_at', 'sms_to', 'sms_text' ) );
	}
}
