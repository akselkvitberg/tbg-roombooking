<?php

/**
 * Plugin Name: Creo Rombooking
 * Description: Room booking for members, with requests and conflict handling for administrators.
 * Version: 26.9.0
 * Requires PHP: 8.2
 * Requires at least: 6.4
 * Author: Creo Multiservice AS
 * Text Domain: creo-rombooking
 * Domain Path: /languages/
 *
 * @package Creo_Rombooking
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CREO_ROMBOOKING_FILE', __FILE__ );
define( 'CREO_ROMBOOKING_BASENAME', plugin_basename( CREO_ROMBOOKING_FILE ) );
define( 'CREO_ROMBOOKING_PATH', untrailingslashit( plugin_dir_path( __FILE__ ) ) );
define( 'CREO_ROMBOOKING_URI', untrailingslashit( plugin_dir_url( __FILE__ ) ) );

require __DIR__ . '/includes/helpers.php';
require __DIR__ . '/includes/updater.php';
require __DIR__ . '/includes/class-creo-rombooking-schema.php';
require __DIR__ . '/includes/class-creo-rombooking-seed.php';
require __DIR__ . '/includes/class-creo-rombooking-availability.php';
require __DIR__ . '/includes/class-creo-rombooking-recurrence.php';
require __DIR__ . '/includes/class-creo-rombooking-notifier.php';
require __DIR__ . '/includes/class-creo-rombooking-bookings.php';
require __DIR__ . '/includes/class-creo-rombooking-service.php';
require __DIR__ . '/includes/class-creo-rombooking-admin.php';
require __DIR__ . '/includes/class-creo-rombooking-mine.php';
require __DIR__ . '/includes/class-creo-rombooking-rest.php';
require __DIR__ . '/includes/class-creo-rombooking-block.php';
require __DIR__ . '/includes/class-creo-rombooking.php';

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	require __DIR__ . '/includes/class-creo-rombooking-cli.php';
	WP_CLI::add_command( 'creo-rombooking', 'Creo_Rombooking_CLI' );
}

register_activation_hook( __FILE__, array( 'Creo_Rombooking', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Creo_Rombooking', 'deactivate' ) );

Creo_Rombooking::get_instance();
