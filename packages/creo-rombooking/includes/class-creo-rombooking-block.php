<?php

/**
 * Renders the room booking app as a block and as the `[creo_rombooking]` shortcode.
 */
class Creo_Rombooking_Block {

	public function __construct() {
		add_action( 'init', array( $this, 'register' ) );
	}

	public function register() {
		register_block_type(
			CREO_ROMBOOKING_PATH . '/blocks/app',
			array(
				'render_callback' => array( $this, 'render_block' ),
			)
		);

		add_shortcode( 'creo_rombooking', array( $this, 'render_shortcode' ) );
	}

	/**
	 * @param array $attributes The block attributes.
	 * @return string
	 */
	public function render_block( $attributes ) {
		$align = $attributes['align'] ?? 'wide';
		return $this->render( in_array( $align, array( 'wide', 'full' ), true ) ? "align$align" : '' );
	}

	/**
	 * @return string
	 */
	public function render_shortcode() {
		return $this->render( 'alignwide' );
	}

	/**
	 * Renders the app root, or a notice when the user cannot book.
	 *
	 * @param string $align_class The alignment class.
	 * @return string
	 */
	public function render( $align_class ) {
		wp_enqueue_style( 'creoRombookingPublic' );

		$classes = trim( "creo-rombooking not-prose $align_class" );

		if ( ! is_user_logged_in() ) {
			return sprintf(
				'<div class="%s"><div class="creo-rombooking-notice"><p>%s</p><p><a class="creo-rombooking-button" href="%s">%s</a></p></div></div>',
				esc_attr( $classes ),
				esc_html__( 'You must be logged in to book rooms.', 'creo-rombooking' ),
				esc_url( wp_login_url( get_permalink() ) ),
				esc_html__( 'Log in', 'creo-rombooking' )
			);
		}

		if ( ! creo_rombooking_is_member() ) {
			return sprintf(
				'<div class="%s"><div class="creo-rombooking-notice"><p>%s</p></div></div>',
				esc_attr( $classes ),
				esc_html__( 'Room booking is only available to members. Contact the administrator if you think this is wrong.', 'creo-rombooking' )
			);
		}

		Creo_Rombooking::get_instance()->enqueue_app();

		return sprintf(
			'<div class="%s"><div id="creo-rombooking-root" class="creo-rombooking-root"><p class="creo-rombooking-loading">%s</p></div></div>',
			esc_attr( $classes ),
			esc_html__( 'Loading room booking…', 'creo-rombooking' )
		);
	}
}
