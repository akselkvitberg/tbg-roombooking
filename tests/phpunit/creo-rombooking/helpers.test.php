<?php

class Creo_Rombooking_Helpers_Test extends WP_UnitTestCase {

	public function tear_down() {
		remove_role( CREO_ROMBOOKING_MEMBER_ROLE );
		remove_all_filters( 'creo_rombooking_token_phone' );
		remove_all_filters( 'creo_rombooking_is_member' );
		parent::tear_down();
	}

	public function test_logged_out_user_is_not_a_member() {
		$this->assertFalse( creo_rombooking_is_member( 0 ) );
	}

	public function test_without_member_role_every_user_is_a_member() {
		$user_id = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		$this->assertTrue( creo_rombooking_is_member( $user_id ) );
	}

	public function test_with_member_role_only_members_are_members() {
		add_role( CREO_ROMBOOKING_MEMBER_ROLE, 'Member', array( 'read' => true ) );

		$member = self::factory()->user->create( array( 'role' => CREO_ROMBOOKING_MEMBER_ROLE ) );
		$guest  = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		$admin  = self::factory()->user->create( array( 'role' => 'administrator' ) );

		$this->assertTrue( creo_rombooking_is_member( $member ) );
		$this->assertFalse( creo_rombooking_is_member( $guest ) );
		$this->assertTrue( creo_rombooking_is_member( $admin ), 'Administrators can always book.' );
	}

	public function test_membership_can_be_filtered() {
		$user_id = self::factory()->user->create();
		add_filter( 'creo_rombooking_is_member', '__return_false' );
		$this->assertFalse( creo_rombooking_is_member( $user_id ) );
	}

	public function test_can_manage() {
		$admin  = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$rooms  = self::factory()->user->create( array( 'role' => 'creo_rombooking_admin' ) );
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );

		$this->assertTrue( creo_rombooking_can_manage( $admin ) );
		$this->assertTrue( creo_rombooking_can_manage( $rooms ) );
		$this->assertFalse( creo_rombooking_can_manage( $editor ) );
		$this->assertFalse( creo_rombooking_can_manage( 0 ) );
	}

	public function test_phone_from_token_wins_over_profile() {
		$user_id = self::factory()->user->create();
		update_user_meta( $user_id, 'creo_rombooking_phone', '+47 00 00 00 02' );
		add_filter( 'creo_rombooking_token_phone', fn() => '+47 00 00 00 01' );

		$this->assertSame(
			array(
				'number' => '+47 00 00 00 01',
				'source' => 'token',
			),
			creo_rombooking_get_phone( $user_id )
		);
	}

	public function test_phone_falls_back_to_profile() {
		$user_id = self::factory()->user->create();
		update_user_meta( $user_id, 'creo_rombooking_phone', '+47 00 00 00 02' );

		$this->assertSame(
			array(
				'number' => '+47 00 00 00 02',
				'source' => 'profile',
			),
			creo_rombooking_get_phone( $user_id )
		);
	}

	public function test_phone_is_null_when_missing() {
		$user_id = self::factory()->user->create();

		$this->assertSame(
			array(
				'number' => null,
				'source' => null,
			),
			creo_rombooking_get_phone( $user_id )
		);
	}

	public function test_dev_token_phone_reads_user_meta() {
		$user_id = self::factory()->user->create();
		update_user_meta( $user_id, 'creo_rombooking_dev_token_phone', '+47 00 00 00 03' );

		$plugin = Creo_Rombooking::get_instance();
		$this->assertSame( '+47 00 00 00 03', $plugin->dev_token_phone( null, $user_id ) );
		$this->assertSame( '+47 00 00 00 09', $plugin->dev_token_phone( '+47 00 00 00 09', $user_id ), 'A real token number wins.' );
		$this->assertNull( $plugin->dev_token_phone( null, self::factory()->user->create() ) );
	}
}
