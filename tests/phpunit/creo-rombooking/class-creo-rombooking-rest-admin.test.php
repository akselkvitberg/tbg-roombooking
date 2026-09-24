<?php

class Creo_Rombooking_REST_Admin_Test extends WP_UnitTestCase {

	private static $member;
	private static $admin;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		self::$member = $factory->user->create( array( 'display_name' => 'Test Medlem' ) );
		self::$admin  = $factory->user->create( array( 'role' => 'administrator' ) );
		update_user_meta( self::$member, 'creo_rombooking_phone', '+47 412 34 567' );
	}

	public function set_up() {
		parent::set_up();
		( new Creo_Rombooking_Seed() )->run();
	}

	private function request( $method, $route, array $body = array() ) {
		$request = new WP_REST_Request( $method, "/creo-rombooking/v1$route" );
		if ( $method === 'GET' ) {
			$request->set_query_params( $body );
		} else {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}
		return rest_get_server()->dispatch( $request );
	}

	/**
	 * A request in Storsalen, which needs approval, next Thursday.
	 */
	private function create_request() {
		wp_set_current_user( self::$member );
		$result = ( new Creo_Rombooking_Bookings() )->create(
			array(
				'roomId'  => array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id', 'name' )['Storsalen'],
				'date'    => ( new DateTimeImmutable( creo_rombooking_today() ) )->modify( 'thursday next week' )->format( 'Y-m-d' ),
				'start'   => 720,
				'end'     => 780,
				'people'  => 40,
				'purpose' => 'Test',
			),
			self::$member
		);
		return $result['bookings'][0]['id'];
	}

	public function test_only_administrators_can_handle_requests() {
		$id = $this->create_request();

		wp_set_current_user( 0 );
		$this->assertSame( 401, $this->request( 'GET', '/admin/requests' )->get_status() );
		$this->assertSame( 401, $this->request( 'POST', "/admin/requests/$id/approve" )->get_status() );

		wp_set_current_user( self::$member );
		foreach ( array( 'GET /admin/requests', 'GET /admin/sms-log', "POST /admin/requests/$id/approve", "POST /admin/requests/$id/reject", "POST /admin/bookings/$id/cancel", 'POST /admin/series/1/approve-free' ) as $route ) {
			list( $method, $path ) = explode( ' ', $route );
			$this->assertSame( 403, $this->request( $method, $path )->get_status(), $route );
		}
	}

	public function test_list_and_approve() {
		$id = $this->create_request();
		wp_set_current_user( self::$admin );

		$items = $this->request( 'GET', '/admin/requests' )->get_data();
		$this->assertContains( "booking-$id", array_column( $items, 'id' ) );

		$response = $this->request( 'POST', "/admin/requests/$id/approve" );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( 'The booking is approved. Test Medlem gets a text message.', $response->get_data()['message'] );

		$this->assertSame( 409, $this->request( 'POST', "/admin/requests/$id/approve" )->get_status() );
	}

	public function test_errors_by_field() {
		$id = $this->create_request();
		wp_set_current_user( self::$admin );

		$response = $this->request( 'POST', "/admin/requests/$id/reject", array( 'reason' => '' ) );

		$this->assertSame( 400, $response->get_status() );
		$this->assertArrayHasKey( 'reason', $response->get_data()['data']['errors'] );
		$this->assertSame( 404, $this->request( 'POST', '/admin/requests/999999/approve' )->get_status() );
	}

	public function test_check() {
		wp_set_current_user( self::$admin );
		$monday = ( new DateTimeImmutable( creo_rombooking_today() ) )->modify( 'monday next week' )->format( 'Y-m-d' );
		$rooms  = array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id', 'name' );

		$check = fn( $room, $start, $end ) => $this->request(
			'GET',
			'/admin/check',
			array(
				'roomId' => $rooms[ $room ],
				'date'   => $monday,
				'start'  => $start,
				'end'    => $end,
			)
		)->get_data()['status'];

		$this->assertSame( 'conflict', $check( 'Møterom 1', 540, 600 ) );
		$this->assertSame( 'free', $check( 'Møterom 1', 600, 660 ) );
		$this->assertSame( 'outside', $check( 'Kafé', 600, 660 ) );
	}

	public function test_sms_log() {
		$this->create_request();
		wp_set_current_user( self::$admin );

		$data = $this->request( 'GET', '/admin/sms-log', array( 'page' => 1 ) )->get_data();

		$this->assertSame( 1, $data['total'] );
		$this->assertSame( 1, $data['pages'] );
		$this->assertSame( 'Test Medlem', $data['items'][0]['to']['name'] );
	}
}
