<?php

/**
 * Bootstraps the plugin.
 */
class Creo_Rombooking {

	/**
	 * @var Creo_Rombooking|null
	 */
	private static $instance = null;

	/**
	 * @return Creo_Rombooking
	 */
	public static function get_instance() {
		if ( self::$instance === null ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_install' ) );
		add_action( 'init', array( $this, 'load_textdomain' ), 1 );
		add_action( 'init', array( $this, 'register_assets' ), 5 );

		if ( creo_rombooking_is_dev() ) {
			add_filter( 'creo_rombooking_token_phone', array( $this, 'dev_token_phone' ), 10, 2 );
		}

		new Creo_Rombooking_Block();
		new Creo_Rombooking_REST();
	}

	/**
	 * Installs or upgrades when the plugin was updated without being re-activated.
	 */
	public static function maybe_install() {
		if ( (int) get_option( Creo_Rombooking_Schema::OPTION, 0 ) !== Creo_Rombooking_Schema::VERSION ) {
			self::activate();
		}
	}

	/**
	 * Creates tables, roles and capabilities.
	 */
	public static function activate() {
		Creo_Rombooking_Schema::install();

		$administrator = get_role( 'administrator' );
		if ( $administrator ) {
			$administrator->add_cap( CREO_ROMBOOKING_MANAGE );
		}

		if ( ! get_role( 'creo_rombooking_admin' ) ) {
			add_role(
				'creo_rombooking_admin',
				'Room administrator',
				array(
					'read'                 => true,
					CREO_ROMBOOKING_MANAGE => true,
				)
			);
		}
	}

	public function load_textdomain() {
		load_plugin_textdomain( 'creo-rombooking', false, dirname( CREO_ROMBOOKING_BASENAME ) . '/languages' );
	}

	public function register_assets() {
		foreach ( array( 'creoRombookingEditor', 'creoRombookingPublic' ) as $name ) {
			$style_version = @filemtime( CREO_ROMBOOKING_PATH . "/build/$name.css" );

			wp_register_style( $name, CREO_ROMBOOKING_URI . "/build/$name.css", array(), $style_version );
			creo_rombooking_register_entry( $name );
		}
	}

	/**
	 * Enqueues the app and the settings it needs.
	 */
	public function enqueue_app() {
		if ( wp_script_is( 'creoRombookingPublic', 'enqueued' ) ) {
			return;
		}

		wp_enqueue_script( 'creoRombookingPublic' );
		wp_enqueue_style( 'creoRombookingPublic' );

		$user  = wp_get_current_user();
		$phone = creo_rombooking_get_phone( $user->ID );

		$settings = wp_json_encode(
			array(
				'restNamespace' => 'creo-rombooking/v1',
				'today'         => creo_rombooking_today(),
				'locale'        => str_replace( '_', '-', determine_locale() ),
				'timezone'      => wp_timezone_string(),
				'user'          => array(
					'id'          => $user->ID,
					'name'        => $user->display_name,
					'isAdmin'     => creo_rombooking_can_manage( $user->ID ),
					'hasPhone'    => $phone['number'] !== null,
					'phoneSource' => $phone['source'],
				),
			)
		);

		wp_add_inline_script( 'creoRombookingPublic', "window.creoRombookingSettings = $settings;", 'before' );
	}

	/**
	 * In local and development environments, the phone number «from the token»
	 * is read from user meta, so that both paths can be tested without `bcc-login`.
	 *
	 * @param string|null $number  The phone number.
	 * @param int         $user_id The user ID.
	 * @return string|null
	 */
	public function dev_token_phone( $number, $user_id ) {
		return $number ?? ( get_user_meta( $user_id, 'creo_rombooking_dev_token_phone', true ) ?: null );
	}
}
