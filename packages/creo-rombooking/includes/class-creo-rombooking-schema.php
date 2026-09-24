<?php

/**
 * Creates and upgrades the plugin's database tables.
 *
 * Times are stored as minutes after midnight (e.g. 480 = 08:00) in the
 * site's timezone, dates as `Y-m-d`.
 */
class Creo_Rombooking_Schema {

	/**
	 * Bump this when the table definitions change.
	 */
	const VERSION = 2;

	const OPTION = 'creo_rombooking_db_version';

	/**
	 * Table names without prefix.
	 */
	const TABLES = array(
		'rooms',
		'opening_hours',
		'closures',
		'series',
		'bookings',
		'proposals',
		'events',
	);

	/**
	 * Returns the full name of a table.
	 *
	 * @param string $name The table name without prefix, e.g. `rooms`.
	 * @return string
	 */
	public static function table( $name ) {
		global $wpdb;
		return "{$wpdb->prefix}creo_rombooking_{$name}";
	}

	/**
	 * Creates or upgrades the tables when the schema version has changed.
	 */
	public static function maybe_upgrade() {
		if ( (int) get_option( self::OPTION, 0 ) !== self::VERSION ) {
			self::install();
		}
	}

	/**
	 * Creates or upgrades all tables.
	 */
	public static function install() {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset_collate = $wpdb->get_charset_collate();
		$rooms           = self::table( 'rooms' );
		$opening_hours   = self::table( 'opening_hours' );
		$closures        = self::table( 'closures' );
		$series          = self::table( 'series' );
		$bookings        = self::table( 'bookings' );
		$proposals       = self::table( 'proposals' );
		$events          = self::table( 'events' );

		// dbDelta requires two spaces after PRIMARY KEY and one field per line.
		dbDelta(
			"CREATE TABLE $rooms (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				name varchar(100) NOT NULL,
				description text NOT NULL,
				capacity smallint(5) unsigned NOT NULL DEFAULT 0,
				image_id bigint(20) unsigned NOT NULL DEFAULT 0,
				active tinyint(1) NOT NULL DEFAULT 1,
				approval varchar(10) NOT NULL DEFAULT 'auto',
				instructions text NOT NULL,
				sort_order smallint(5) NOT NULL DEFAULT 0,
				PRIMARY KEY  (id)
			) $charset_collate;
			CREATE TABLE $opening_hours (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				room_id bigint(20) unsigned NOT NULL,
				weekday tinyint(1) unsigned NOT NULL,
				start_min smallint(5) unsigned NOT NULL,
				end_min smallint(5) unsigned NOT NULL,
				PRIMARY KEY  (id),
				KEY room_weekday (room_id,weekday)
			) $charset_collate;
			CREATE TABLE $closures (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				room_id bigint(20) unsigned NOT NULL,
				date date NOT NULL,
				start_min smallint(5) unsigned DEFAULT NULL,
				end_min smallint(5) unsigned DEFAULT NULL,
				type varchar(10) NOT NULL DEFAULT 'closed',
				reason varchar(200) NOT NULL DEFAULT '',
				PRIMARY KEY  (id),
				KEY room_date (room_id,date)
			) $charset_collate;
			CREATE TABLE $series (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				user_id bigint(20) unsigned NOT NULL,
				room_id bigint(20) unsigned NOT NULL,
				rule varchar(10) NOT NULL,
				start_date date NOT NULL,
				end_date date DEFAULT NULL,
				occurrences smallint(5) unsigned DEFAULT NULL,
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY user_id (user_id)
			) $charset_collate;
			CREATE TABLE $bookings (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				series_id bigint(20) unsigned DEFAULT NULL,
				room_id bigint(20) unsigned NOT NULL,
				user_id bigint(20) unsigned NOT NULL,
				date date NOT NULL,
				start_min smallint(5) unsigned NOT NULL,
				end_min smallint(5) unsigned NOT NULL,
				purpose varchar(200) NOT NULL DEFAULT '',
				people smallint(5) unsigned NOT NULL DEFAULT 0,
				status varchar(10) NOT NULL DEFAULT 'requested',
				conflict_with bigint(20) unsigned DEFAULT NULL,
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY room_date (room_id,date),
				KEY user_id (user_id),
				KEY series_id (series_id),
				KEY status (status)
			) $charset_collate;
			CREATE TABLE $proposals (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				booking_id bigint(20) unsigned NOT NULL,
				room_id bigint(20) unsigned NOT NULL,
				date date NOT NULL,
				start_min smallint(5) unsigned NOT NULL,
				end_min smallint(5) unsigned NOT NULL,
				message varchar(500) NOT NULL DEFAULT '',
				expires_at datetime NOT NULL,
				status varchar(10) NOT NULL DEFAULT 'pending',
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY booking_id (booking_id),
				KEY status (status)
			) $charset_collate;
			CREATE TABLE $events (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				booking_id bigint(20) unsigned DEFAULT NULL,
				actor_id bigint(20) unsigned NOT NULL DEFAULT 0,
				action varchar(40) NOT NULL,
				reason varchar(500) NOT NULL DEFAULT '',
				sms_to bigint(20) unsigned DEFAULT NULL,
				sms_text varchar(500) DEFAULT NULL,
				created_at datetime NOT NULL,
				PRIMARY KEY  (id),
				KEY booking_id (booking_id)
			) $charset_collate;"
		);

		update_option( self::OPTION, self::VERSION );
	}

	/**
	 * Drops all tables. Used by tests and `wp creo-rombooking seed --reset`.
	 */
	public static function uninstall() {
		global $wpdb;

		foreach ( self::TABLES as $name ) {
			$wpdb->query( 'DROP TABLE IF EXISTS ' . self::table( $name ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, WordPress.DB.DirectDatabaseQuery
		}

		delete_option( self::OPTION );
	}
}
