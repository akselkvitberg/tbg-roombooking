<?php

class Creo_Rombooking_Rooms_Test extends WP_UnitTestCase {

	private $admin;
	private $member;
	private $rooms;

	public function set_up() {
		parent::set_up();

		( new Creo_Rombooking_Seed() )->run();
		$this->admin  = self::factory()->user->create( array( 'role' => 'administrator' ) );
		$this->member = self::factory()->user->create();
		wp_set_current_user( $this->admin );
		$this->rooms = array_column( ( new Creo_Rombooking_Rooms() )->get_rooms(), null, 'name' );
	}

	private function input( array $values = array() ) {
		return array_merge(
			array(
				'name'         => 'Lesesal',
				'description'  => 'Stille rom.',
				'capacity'     => 10,
				'approval'     => 'auto',
				'active'       => true,
				'imageId'      => 0,
				'instructions' => 'Vis hensyn.',
				'openingHours' => array(
					array(
						'weekday' => 1,
						'start'   => 540,
						'end'     => 960,
					),
				),
			),
			$values
		);
	}

	private function next_monday() {
		return ( new DateTimeImmutable( creo_rombooking_today() ) )->modify( 'monday next week' )->format( 'Y-m-d' );
	}

	public function test_lists_rooms_with_hours_and_closures() {
		$gym = $this->rooms['Gymsal'];

		$this->assertSame( 80, $gym['capacity'] );
		$this->assertSame( 'manual', $gym['approval'] );
		$this->assertContains(
			array(
				'weekday' => 1,
				'start'   => 900,
				'end'     => 1320,
			),
			$gym['openingHours']
		);
		$this->assertNotEmpty( $gym['closures'] );
		$this->assertNull( $gym['closures'][0]['start'], 'Gymsal is closed for a whole day.' );
		$this->assertSame( 'Nøkkel hentes hos vaktmesteren. Slå av lydanlegget og lyset når dere går.', $this->rooms['Storsalen']['instructions'] );
	}

	public function test_create_a_room() {
		$result = ( new Creo_Rombooking_Rooms() )->save( null, $this->input() );

		$this->assertSame( 'Lesesal is saved.', $result['message'] );
		$this->assertSame( 'Lesesal', $result['room']['name'] );
		$this->assertCount( 1, $result['room']['openingHours'] );

		// It can be booked on Mondays 09:00–16:00, and is last in the list.
		$rooms = ( new Creo_Rombooking_Availability( 0 ) )->get_rooms();
		$this->assertSame( 'Lesesal', end( $rooms )['name'] );
		$check = ( new Creo_Rombooking_Availability( 0 ) )->check( $result['room']['id'], array( $this->next_monday() ), 540, 600 );
		$this->assertSame( 'free', $check[ $this->next_monday() ]['status'] );
		$check = ( new Creo_Rombooking_Availability( 0 ) )->check( $result['room']['id'], array( $this->next_monday() ), 960, 1020 );
		$this->assertSame( 'outside', $check[ $this->next_monday() ]['status'] );
	}

	public function test_update_and_deactivate() {
		$id     = $this->rooms['Møterom 2']['id'];
		$result = ( new Creo_Rombooking_Rooms() )->save(
			$id,
			$this->input(
				array(
					'name'   => 'Møterom 2',
					'active' => false,
				)
			)
		);

		$this->assertFalse( $result['room']['active'] );
		$this->assertNotContains( $id, array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id' ), 'Inactive rooms cannot be booked.' );
	}

	/**
	 * @dataProvider invalid_rooms
	 */
	public function test_validation( array $values, $field ) {
		$result = ( new Creo_Rombooking_Rooms() )->save( null, $this->input( $values ) );

		$this->assertWPError( $result );
		$this->assertArrayHasKey( $field, $result->get_error_data()['errors'] );
	}

	public function invalid_rooms() {
		return array(
			'no name'           => array( array( 'name' => ' ' ), 'name' ),
			'no places'         => array( array( 'capacity' => 0 ), 'capacity' ),
			'unknown approval'  => array( array( 'approval' => 'maybe' ), 'approval' ),
			'long instructions' => array( array( 'instructions' => str_repeat( 'a', 1001 ) ), 'instructions' ),
			'closing before'    => array(
				array(
					'openingHours' => array(
						array(
							'weekday' => 2,
							'start'   => 900,
							'end'     => 600,
						),
					),
				),
				'openingHours.2',
			),
			'overlapping hours' => array(
				array(
					'openingHours' => array(
						array(
							'weekday' => 3,
							'start'   => 480,
							'end'     => 720,
						),
						array(
							'weekday' => 3,
							'start'   => 660,
							'end'     => 900,
						),
					),
				),
				'openingHours.3',
			),
			'not an image'      => array( array( 'imageId' => 999999 ), 'imageId' ),
		);
	}

	public function test_reorder() {
		$ids    = array_reverse( array_column( $this->rooms, 'id' ) );
		$result = ( new Creo_Rombooking_Rooms() )->reorder( $ids );

		$this->assertSame( 'The order is saved.', $result['message'] );
		$this->assertSame( $ids, array_column( ( new Creo_Rombooking_Rooms() )->get_rooms(), 'id' ) );
		$this->assertWPError( ( new Creo_Rombooking_Rooms() )->reorder( array_slice( $ids, 1 ) ) );
	}

	public function test_closures_tell_how_many_bookings_are_affected() {
		$rooms = new Creo_Rombooking_Rooms();
		$id    = $this->rooms['Møterom 1']['id'];

		// The weekly work meeting in Møterom 1 is 09:00–10:00.
		$result = $rooms->add_closure(
			$id,
			array(
				'date'     => $this->next_monday(),
				'wholeDay' => true,
				'type'     => 'closed',
				'reason'   => 'Maling',
			)
		);

		$this->assertSame( 1, $result['affected'] );
		$this->assertStringContainsString( '1 booking is in the period.', $result['message'] );
		$check = ( new Creo_Rombooking_Availability( 0 ) )->check( $id, array( $this->next_monday() ), 720, 780 );
		$this->assertSame( 'outside', $check[ $this->next_monday() ]['status'] );

		$partly = $rooms->add_closure(
			$id,
			array(
				'date'   => $this->next_monday(),
				'start'  => 720,
				'end'    => 780,
				'type'   => 'blocked',
				'reason' => '',
			)
		);
		$this->assertSame( 0, $partly['affected'] );

		$this->assertSame( 'The closure is removed.', $rooms->delete_closure( $id, $result['closure']['id'] )['message'] );
		$this->assertWPError( $rooms->delete_closure( $id, $result['closure']['id'] ) );
	}

	public function test_invalid_closures() {
		$result = ( new Creo_Rombooking_Rooms() )->add_closure(
			$this->rooms['Kafé']['id'],
			array(
				'date'  => '2020-01-01',
				'start' => 900,
				'end'   => 600,
				'type'  => 'x',
			)
		);

		$this->assertSame( array( 'date', 'end', 'type' ), array_keys( $result->get_error_data()['errors'] ) );
	}

	public function test_members_see_instructions_for_confirmed_bookings() {
		update_user_meta( $this->member, 'creo_rombooking_phone', '+47 412 34 567' );
		wp_set_current_user( $this->member );
		( new Creo_Rombooking_Bookings() )->create(
			array(
				'roomId' => ( new Creo_Rombooking_Availability( 0 ) )->get_rooms()[1]['id'],
				'date'   => ( new DateTimeImmutable( creo_rombooking_today() ) )->modify( 'tuesday next week' )->format( 'Y-m-d' ),
				'start'  => 720,
				'end'    => 780,
				'people' => 4,
			),
			$this->member
		);

		$upcoming = ( new Creo_Rombooking_Mine( $this->member ) )->get_bookings()['upcoming'];
		$this->assertSame( 'Tøm oppvaskmaskinen og tørk av benkene før dere går.', $upcoming[0]['instructions'] );
	}

	public function test_rest_routes() {
		$request = new WP_REST_Request( 'POST', '/creo-rombooking/v1/admin/rooms' );
		$request->set_body_params( $this->input() );
		$this->assertSame( 200, rest_get_server()->dispatch( $request )->get_status() );

		wp_set_current_user( $this->member );
		$this->assertSame( 403, rest_get_server()->dispatch( new WP_REST_Request( 'GET', '/creo-rombooking/v1/admin/rooms' ) )->get_status() );
	}
}
