<?php

class Creo_Rombooking_REST_Bookings_Test extends WP_UnitTestCase {

	private static $member;
	private static $guest;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		add_role( CREO_ROMBOOKING_MEMBER_ROLE, 'Member', array( 'read' => true ) );
		self::$member = $factory->user->create( array( 'role' => CREO_ROMBOOKING_MEMBER_ROLE ) );
		self::$guest  = $factory->user->create( array( 'role' => 'subscriber' ) );
		update_user_meta( self::$member, 'creo_rombooking_phone', '+47 412 34 567' );
	}

	public static function wpTearDownAfterClass() {
		remove_role( CREO_ROMBOOKING_MEMBER_ROLE );
	}

	public function set_up() {
		parent::set_up();
		( new Creo_Rombooking_Seed() )->run();
	}

	private function post( $route, array $body ) {
		$request = new WP_REST_Request( 'POST', "/creo-rombooking/v1$route" );
		$request->set_header( 'Content-Type', 'application/json' );
		$request->set_body( wp_json_encode( $body ) );
		return rest_get_server()->dispatch( $request );
	}

	private function body( array $values = array() ) {
		$rooms = array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id', 'name' );
		return array_merge(
			array(
				'roomId'  => $rooms['Møterom 1'],
				// Monday next week; Møterom 1 has a work meeting 09:00–10:00.
				'date'    => ( new DateTimeImmutable( creo_rombooking_today() ) )->modify( 'monday next week' )->format( 'Y-m-d' ),
				'start'   => 540,
				'end'     => 660,
				'purpose' => 'Test',
				'repeat'  => 'weekly',
				'endMode' => 'count',
				'count'   => 2,
			),
			$values
		);
	}

	public function test_only_members_can_book() {
		$this->assertSame( 401, $this->post( '/bookings/preview', $this->body() )->get_status() );
		$this->assertSame( 401, $this->post( '/bookings', $this->body() )->get_status() );

		wp_set_current_user( self::$guest );
		$this->assertSame( 403, $this->post( '/bookings/preview', $this->body() )->get_status() );
		$this->assertSame( 403, $this->post( '/bookings', $this->body() )->get_status() );
	}

	public function test_preview() {
		wp_set_current_user( self::$member );

		$response = $this->post( '/bookings/preview', $this->body() );
		$data     = $response->get_data();

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( 'auto', $data['approval'] );
		$this->assertSame( array( 'conflict', 'conflict' ), array_column( $data['occurrences'], 'status' ) );
		$this->assertArrayNotHasKey( 'conflictWith', $data['occurrences'][0], 'Members do not learn which booking they conflict with.' );
		$this->assertSame( array(), $data['errors'] );
	}

	public function test_preview_of_an_incomplete_form_lists_the_errors() {
		wp_set_current_user( self::$member );

		$response = $this->post( '/bookings/preview', $this->body( array( 'end' => 540 ) ) );

		$this->assertSame( 200, $response->get_status() );
		$this->assertArrayHasKey( 'end', $response->get_data()['errors'] );
		$this->assertSame( array(), $response->get_data()['occurrences'] );
	}

	public function test_create() {
		wp_set_current_user( self::$member );

		$response = $this->post( '/bookings', $this->body( array( 'start' => 600 ) ) );
		$data     = $response->get_data();

		$this->assertSame( 201, $response->get_status() );
		$this->assertSame( 2, $data['approved'] );
		$this->assertSame( '2 bookings are confirmed. You will get a text message.', $data['message'] );
	}

	public function test_create_with_errors() {
		wp_set_current_user( self::$member );

		$response = $this->post( '/bookings', $this->body( array( 'count' => 99 ) ) );

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( 'creo_rombooking_invalid', $response->get_data()['code'] );
		$this->assertArrayHasKey( 'count', $response->get_data()['data']['errors'] );
	}
}
