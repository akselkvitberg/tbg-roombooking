<?php

class Creo_Rombooking_Block_Test extends WP_UnitTestCase {

	public function tear_down() {
		remove_role( CREO_ROMBOOKING_MEMBER_ROLE );
		wp_dequeue_script( 'creoRombookingPublic' );
		wp_scripts()->registered['creoRombookingPublic']->extra = array();
		parent::tear_down();
	}

	public function set_up() {
		parent::set_up();
		// Register a stand-in script when the assets are not built.
		if ( ! wp_script_is( 'creoRombookingPublic', 'registered' ) ) {
			wp_register_script( 'creoRombookingPublic', 'https://example.invalid/app.js', array(), '1', true );
		}
	}

	public function test_asks_logged_out_users_to_log_in() {
		$html = do_blocks( '<!-- wp:creo-rombooking/app /-->' );

		$this->assertStringContainsString( 'You must be logged in to book rooms.', $html );
		$this->assertStringContainsString( wp_login_url(), $html );
		$this->assertStringNotContainsString( 'creo-rombooking-root', $html );
	}

	public function test_tells_non_members_they_have_no_access() {
		add_role( CREO_ROMBOOKING_MEMBER_ROLE, 'Member', array( 'read' => true ) );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$html = do_blocks( '<!-- wp:creo-rombooking/app /-->' );

		$this->assertStringContainsString( 'only available to members', $html );
		$this->assertStringNotContainsString( 'creo-rombooking-root', $html );
	}

	public function test_renders_the_app_for_members() {
		wp_set_current_user( self::factory()->user->create( array( 'display_name' => 'Test Medlem' ) ) );

		$html = do_blocks( '<!-- wp:creo-rombooking/app {"align":"wide"} /-->' );

		$this->assertStringContainsString( 'id="creo-rombooking-root"', $html );
		$this->assertStringContainsString( 'class="creo-rombooking not-prose alignwide"', $html );
		$this->assertTrue( wp_script_is( 'creoRombookingPublic', 'enqueued' ) );

		$settings = $this->get_settings();
		$this->assertSame( 'Test Medlem', $settings['user']['name'] );
		$this->assertFalse( $settings['user']['isAdmin'] );
		$this->assertFalse( $settings['user']['hasPhone'] );
	}

	public function test_tells_the_app_when_the_user_is_an_admin() {
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		do_shortcode( '[creo_rombooking]' );

		$this->assertTrue( $this->get_settings()['user']['isAdmin'] );
	}

	/**
	 * @return array The settings passed to the app.
	 */
	private function get_settings() {
		$before = wp_scripts()->get_data( 'creoRombookingPublic', 'before' );
		$this->assertIsArray( $before );
		$this->assertMatchesRegularExpression( '/window\.creoRombookingSettings = (.*);$/', end( $before ) );
		preg_match( '/window\.creoRombookingSettings = (.*);$/', end( $before ), $matches );
		return json_decode( $matches[1], true );
	}
}
