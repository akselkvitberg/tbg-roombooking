<?php

class Creo_Rombooking_REST_Test extends WP_UnitTestCase {

	private static $member;
	private static $guest;
	private static $admin;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		add_role( CREO_ROMBOOKING_MEMBER_ROLE, 'Member', array( 'read' => true ) );
		self::$member = $factory->user->create( array( 'role' => CREO_ROMBOOKING_MEMBER_ROLE ) );
		self::$guest  = $factory->user->create( array( 'role' => 'subscriber' ) );
		self::$admin  = $factory->user->create( array( 'role' => 'administrator' ) );
	}

	public static function wpTearDownAfterClass() {
		remove_role( CREO_ROMBOOKING_MEMBER_ROLE );
	}

	public function set_up() {
		parent::set_up();
		// Seeded bookings belong to made-up owners; the test member owns none.
		( new Creo_Rombooking_Seed( '2026-09-23' ) )->run();
	}

	private function get( $route, array $params = array() ) {
		$request = new WP_REST_Request( 'GET', "/creo-rombooking/v1$route" );
		$request->set_query_params( $params );
		return rest_get_server()->dispatch( $request );
	}

	private function week() {
		return array(
			'from' => '2026-09-21',
			'to'   => '2026-09-27',
		);
	}

	public function test_logged_out_users_get_401() {
		$this->assertSame( 401, $this->get( '/rooms' )->get_status() );
		$this->assertSame( 401, $this->get( '/availability', $this->week() )->get_status() );
		$this->assertSame( 401, $this->get( '/admin/availability', $this->week() )->get_status() );
	}

	public function test_non_members_get_403() {
		wp_set_current_user( self::$guest );

		$this->assertSame( 403, $this->get( '/rooms' )->get_status() );
		$this->assertSame( 403, $this->get( '/availability', $this->week() )->get_status() );
	}

	public function test_members_cannot_use_admin_endpoints() {
		wp_set_current_user( self::$member );

		$this->assertSame( 403, $this->get( '/admin/availability', $this->week() )->get_status() );
	}

	public function test_rooms() {
		wp_set_current_user( self::$member );

		$response = $this->get( '/rooms' );
		$rooms    = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( array( 'Storsalen', 'Kafé', 'Møterom 1', 'Møterom 2', 'Barnerom', 'Gymsal' ), array_column( $rooms, 'name' ) );
		$this->assertSame( array( 'id', 'name', 'description', 'capacity', 'approval', 'imageUrl' ), array_keys( $rooms[0] ) );
		$this->assertSame( 'manual', $rooms[0]['approval'] );
		$this->assertSame( 250, $rooms[0]['capacity'] );
	}

	public function test_availability_for_a_week() {
		wp_set_current_user( self::$member );

		$response = $this->get( '/availability', $this->week() );
		$data     = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( '2026-09-21', $data['from'] );
		$this->assertCount( 7, $data['days'] );
		$this->assertCount( 6, $data['days'][0]['rooms'] );
		$this->assertSame(
			array(
				'start' => 480,
				'end'   => 1320,
				'slot'  => 30,
			),
			$data['day']
		);
		$this->assertArrayHasKey( 'date', $data['now'] );
		$this->assertArrayHasKey( 'minute', $data['now'] );
	}

	public function test_availability_for_selected_rooms() {
		wp_set_current_user( self::$member );

		$rooms = wp_list_pluck( $this->get( '/rooms' )->get_data(), 'id' );
		$data  = $this->get( '/availability', $this->week() + array( 'rooms' => "{$rooms[0]},{$rooms[2]}" ) )->get_data();

		$this->assertSame( array( $rooms[0], $rooms[2] ), array_column( $data['days'][0]['rooms'], 'roomId' ) );
	}

	public function test_members_never_see_names_or_purposes_of_others() {
		wp_set_current_user( self::$member );

		$json = wp_json_encode( $this->get( '/availability', $this->week() )->get_data() );

		foreach ( array( 'Tone Eksempel', 'Bursdagsfeiring', 'Per Demodal', 'Ukentlig arbeidsmøte', 'Mari Testrud', 'Styremøte', 'userName', 'userId' ) as $secret ) {
			$this->assertStringNotContainsString( $secret, $json );
		}
		$this->assertStringContainsString( '"busy"', $json );
		$this->assertStringContainsString( '"requested"', $json );
	}

	public function test_administrators_see_names_and_purposes() {
		wp_set_current_user( self::$admin );

		$json = wp_json_encode( $this->get( '/admin/availability', $this->week() )->get_data() );

		$this->assertStringContainsString( 'Tone Eksempel', $json );
		$this->assertStringContainsString( 'Bursdagsfeiring', $json );
	}

	public function test_the_member_availability_hides_details_for_administrators_too() {
		wp_set_current_user( self::$admin );

		$json = wp_json_encode( $this->get( '/availability', $this->week() )->get_data() );

		$this->assertStringNotContainsString( 'Tone Eksempel', $json );
	}

	/**
	 * @dataProvider invalid_ranges
	 */
	public function test_invalid_ranges_get_400( $from, $to ) {
		wp_set_current_user( self::$member );

		$this->assertSame(
			400,
			$this->get(
				'/availability',
				array(
					'from' => $from,
					'to'   => $to,
				)
			)->get_status()
		);
	}

	public function invalid_ranges() {
		return array(
			'invalid date'       => array( '2026-02-30', '2026-03-01' ),
			'wrong format'       => array( '23.09.2026', '2026-09-24' ),
			'to before from'     => array( '2026-09-24', '2026-09-23' ),
			'more than 14 days'  => array( '2026-09-01', '2026-09-15' ),
			'missing parameters' => array( null, null ),
		);
	}

	public function test_fourteen_days_is_allowed() {
		wp_set_current_user( self::$member );

		$response = $this->get(
			'/availability',
			array(
				'from' => '2026-09-01',
				'to'   => '2026-09-14',
			)
		);

		$this->assertSame( 200, $response->get_status() );
		$this->assertCount( 14, $response->get_data()['days'] );
	}
}
