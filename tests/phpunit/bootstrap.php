<?php

$creo_rombooking_tests_dir = getenv( 'WP_TESTS_DIR' );

// Check if we are running the tests in the wp-env container.
if ( __DIR__ === '/var/www/html/tbg-roombooking/tests/phpunit' ) {
	// Use another database to avoid mutating the database
	// in use by the tests website at http://localhost:8889.
	// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.runtime_configuration_putenv
	putenv( 'WORDPRESS_DB_NAME=tests-phpunit' );
}

require_once $creo_rombooking_tests_dir . '/includes/functions.php';

tests_add_filter(
	'muplugins_loaded',
	function () {
		add_filter( 'pre_option_template', fn() => 'creo' );
		add_filter( 'pre_option_stylesheet', fn() => 'creo' );
		add_filter(
			'option_active_plugins',
			function () {
				return array(
					'creo-rombooking/creo-rombooking.php',
				);
			}
		);
	}
);

require_once $creo_rombooking_tests_dir . '/includes/bootstrap.php';
