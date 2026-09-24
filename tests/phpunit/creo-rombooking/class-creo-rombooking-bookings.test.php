<?php

class Creo_Rombooking_Bookings_Test extends WP_UnitTestCase {

	private $member;
	private $rooms;
	private $monday;

	public function set_up() {
		parent::set_up();

		( new Creo_Rombooking_Seed() )->run();

		$this->member = self::factory()->user->create( array( 'display_name' => 'Test Medlem' ) );
		update_user_meta( $this->member, 'creo_rombooking_phone', '+47 412 34 567' );
		wp_set_current_user( $this->member );

		$this->rooms  = array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id', 'name' );
		$today        = new DateTimeImmutable( creo_rombooking_today() );
		$this->monday = $today->modify( '-' . ( (int) $today->format( 'N' ) - 1 ) . ' days' );
	}

	/**
	 * A date next week, where nothing has passed yet.
	 *
	 * @param int $weekday 0 = Monday.
	 * @param int $weeks   Weeks after next week.
	 * @return string
	 */
	private function next_week( $weekday, $weeks = 0 ) {
		return $this->monday->modify( '+' . ( 7 + 7 * $weeks + $weekday ) . ' days' )->format( 'Y-m-d' );
	}

	private function input( array $values ) {
		return array_merge(
			array(
				'roomId'  => $this->rooms['Møterom 2'],
				'date'    => $this->next_week( 1 ),
				'start'   => 720,
				'end'     => 780,
				'purpose' => 'Planlegging',
				'people'  => 6,
				'repeat'  => 'none',
			),
			$values
		);
	}

	private function booking( $id ) {
		global $wpdb;
		$table = Creo_Rombooking_Schema::table( 'bookings' );
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore
	}

	private function last_sms() {
		global $wpdb;
		$table = Creo_Rombooking_Schema::table( 'events' );
		return $wpdb->get_row( "SELECT * FROM $table WHERE action = 'sms' ORDER BY id DESC LIMIT 1", ARRAY_A ); // phpcs:ignore
	}

	public function test_a_free_time_in_an_auto_room_is_approved() {
		$result = ( new Creo_Rombooking_Bookings() )->create( $this->input( array() ), $this->member );

		$this->assertSame( 1, $result['approved'] );
		$this->assertSame( 0, $result['requested'] );
		$this->assertSame( 'The booking is confirmed. You will get a text message.', $result['message'] );

		$booking = $this->booking( $result['bookings'][0]['id'] );
		$this->assertSame( 'approved', $booking['status'] );
		$this->assertSame( 'Planlegging', $booking['purpose'] );
		$this->assertSame( '6', $booking['people'] );
		$this->assertNull( $booking['conflict_with'] );

		$sms = $this->last_sms();
		$this->assertSame( (string) $this->member, $sms['sms_to'] );
		$this->assertStringContainsString( 'Your booking is confirmed. Møterom 2', $sms['sms_text'] );
		$this->assertStringContainsString( '12:00–13:00', $sms['sms_text'] );
	}

	public function test_a_room_with_manual_approval_gets_a_request() {
		$result = ( new Creo_Rombooking_Bookings() )->create( $this->input( array( 'roomId' => $this->rooms['Storsalen'] ) ), $this->member );

		$this->assertSame( 0, $result['approved'] );
		$this->assertSame( 1, $result['requested'] );
		$this->assertSame( 'requested', $this->booking( $result['bookings'][0]['id'] )['status'] );
		$this->assertStringContainsString( 'We have received your request', $this->last_sms()['sms_text'] );
	}

	public function test_a_conflict_becomes_a_request_linked_to_the_existing_booking() {
		// Møterom 1 has a weekly work meeting 09:00–10:00 on weekdays.
		$result = ( new Creo_Rombooking_Bookings() )->create(
			$this->input(
				array(
					'roomId' => $this->rooms['Møterom 1'],
					'date'   => $this->next_week( 0 ),
					'start'  => 540,
					'end'    => 600,
				)
			),
			$this->member
		);

		$booking  = $this->booking( $result['bookings'][0]['id'] );
		$existing = $this->booking( $booking['conflict_with'] );

		$this->assertSame( 'requested', $booking['status'] );
		$this->assertSame( 'Ukentlig arbeidsmøte', $existing['purpose'] );
	}

	public function test_a_series_leaves_out_closed_dates() {
		// Gymsal is closed on Tuesday in two weeks (see the seed data), and free 20:00–21:00 on Tuesdays.
		$result = ( new Creo_Rombooking_Bookings() )->create(
			$this->input(
				array(
					'roomId'  => $this->rooms['Gymsal'],
					'date'    => $this->next_week( 1 ),
					'start'   => 1200,
					'end'     => 1260,
					'repeat'  => 'weekly',
					'endMode' => 'count',
					'count'   => 3,
				)
			),
			$this->member
		);

		$this->assertSame( 0, $result['approved'], 'Gymsal needs approval.' );
		$this->assertSame( 2, $result['requested'] );
		$this->assertSame( 1, $result['skipped'] );
		$this->assertSame( array( $this->next_week( 1 ), $this->next_week( 1, 2 ) ), array_column( $result['bookings'], 'date' ) );
		$this->assertStringEndsWith( '1 date was left out because the room is closed.', $result['message'] );

		$first = $this->booking( $result['bookings'][0]['id'] );
		$this->assertNotNull( $first['series_id'] );
		$this->assertSame( $first['series_id'], $this->booking( $result['bookings'][1]['id'] )['series_id'] );
		$this->assertStringContainsString( '(2 times)', $this->last_sms()['sms_text'] );
	}

	public function test_preview_marks_each_date() {
		// Someone else books Møterom 1 on Thursday the week after next, 12:30–13:30.
		( new Creo_Rombooking_Bookings() )->create(
			$this->input(
				array(
					'roomId' => $this->rooms['Møterom 1'],
					'date'   => $this->next_week( 3, 1 ),
					'start'  => 750,
					'end'    => 810,
				)
			),
			$this->member
		);

		$bookings  = new Creo_Rombooking_Bookings();
		$validated = $bookings->validate(
			$this->input(
				array(
					'roomId'  => $this->rooms['Møterom 1'],
					'date'    => $this->next_week( 3 ),
					'start'   => 720,
					'end'     => 780,
					'repeat'  => 'weekly',
					'endMode' => 'count',
					'count'   => 2,
				)
			),
			$this->member
		);
		$preview   = $bookings->preview( $validated['data'] );

		$this->assertSame( array(), $validated['errors'] );
		$this->assertSame( 'auto', $preview['approval'] );
		$this->assertSame( array( 'free', 'conflict' ), array_column( $preview['occurrences'], 'status' ) );
		$this->assertSame(
			array(
				'free'     => 1,
				'conflict' => 1,
				'outside'  => 0,
			),
			$preview['counts']
		);
	}

	public function test_a_closed_time_cannot_be_booked() {
		// Barnerom closes at 20:00.
		$result = ( new Creo_Rombooking_Bookings() )->create(
			$this->input(
				array(
					'roomId' => $this->rooms['Barnerom'],
					'start'  => 1200,
					'end'    => 1260,
				)
			),
			$this->member
		);

		$this->assertWPError( $result );
		$this->assertSame( 400, $result->get_error_data()['status'] );
		$this->assertArrayHasKey( 'start', $result->get_error_data()['errors'] );
	}

	/**
	 * @dataProvider invalid_inputs
	 */
	public function test_validation( array $values, $field ) {
		if ( isset( $values['date'] ) && is_int( $values['date'] ) ) {
			$values['date'] = $this->monday->modify( $values['date'] . ' days' )->format( 'Y-m-d' );
		}

		$result = ( new Creo_Rombooking_Bookings() )->validate( $this->input( $values ), $this->member );

		$this->assertArrayHasKey( $field, $result['errors'] );
	}

	public function invalid_inputs() {
		return array(
			'no room'              => array( array( 'roomId' => 0 ), 'roomId' ),
			'invalid date'         => array( array( 'date' => '2026-02-30' ), 'date' ),
			'past date'            => array( array( 'date' => -1 ), 'date' ),
			'more than a year'     => array( array( 'date' => 400 ), 'date' ),
			'end before start'     => array( array( 'end' => 720 ), 'end' ),
			'not on a half hour'   => array( array( 'start' => 725 ), 'start' ),
			'before 08:00'         => array( array( 'start' => 450 ), 'start' ),
			'after 22:00'          => array( array( 'end' => 1350 ), 'start' ),
			'too long purpose'     => array( array( 'purpose' => str_repeat( 'a', 201 ) ), 'purpose' ),
			'no people'            => array( array( 'people' => 0 ), 'people' ),
			'negative people'      => array( array( 'people' => -3 ), 'people' ),
			'more than capacity'   => array( array( 'people' => 9 ), 'people' ),
			'one time'             => array(
				array(
					'repeat' => 'weekly',
					'count'  => 1,
				),
				'count',
			),
			'too many times'       => array(
				array(
					'repeat' => 'weekly',
					'count'  => 27,
				),
				'count',
			),
			'end date before date' => array(
				array(
					'repeat'  => 'weekly',
					'endMode' => 'date',
					'endDate' => '2020-01-01',
				),
				'endDate',
			),
		);
	}

	public function test_the_capacity_error_names_the_room() {
		$result = ( new Creo_Rombooking_Bookings() )->validate( $this->input( array( 'people' => 9 ) ), $this->member );

		$this->assertSame( 'Møterom 2 has room for 8 people.', $result['errors']['people'] );
	}

	public function test_previews_do_not_require_the_number_of_people() {
		$bookings = new Creo_Rombooking_Bookings();

		$this->assertArrayNotHasKey( 'people', $bookings->validate( $this->input( array( 'people' => 0 ) ), $this->member, false )['errors'] );
		$this->assertArrayHasKey( 'people', $bookings->validate( $this->input( array( 'people' => 9 ) ), $this->member, false )['errors'] );
	}

	public function test_inactive_rooms_cannot_be_booked() {
		global $wpdb;
		$wpdb->update( Creo_Rombooking_Schema::table( 'rooms' ), array( 'active' => 0 ), array( 'id' => $this->rooms['Møterom 2'] ) );

		$result = ( new Creo_Rombooking_Bookings() )->validate( $this->input( array() ), $this->member );

		$this->assertArrayHasKey( 'roomId', $result['errors'] );
	}

	public function test_members_without_a_phone_number_must_enter_one() {
		delete_user_meta( $this->member, 'creo_rombooking_phone' );
		$bookings = new Creo_Rombooking_Bookings();

		$this->assertArrayHasKey( 'phone', $bookings->validate( $this->input( array() ), $this->member )['errors'] );
		$this->assertArrayHasKey( 'phone', $bookings->validate( $this->input( array( 'phone' => '1234' ) ), $this->member )['errors'] );

		$result = $bookings->create( $this->input( array( 'phone' => '412 34 567' ) ), $this->member );

		$this->assertSame( 1, $result['approved'] );
		$this->assertSame( '+47 412 34 567', get_user_meta( $this->member, 'creo_rombooking_phone', true ) );
	}

	/**
	 * @dataProvider phone_numbers
	 */
	public function test_normalize_phone( $input, $expected ) {
		$this->assertSame( $expected, Creo_Rombooking_Bookings::normalize_phone( $input ) );
	}

	public function phone_numbers() {
		return array(
			array( '41234567', '+47 412 34 567' ),
			array( '+47 412 34 567', '+47 412 34 567' ),
			array( '0047 91234567', '+47 912 34 567' ),
			array( '912-34-567', '+47 912 34 567' ),
			array( '22334455', null ),
			array( '4123456', null ),
			array( '+46 41234567', null ),
			array( '', null ),
		);
	}

	public function test_confirmation_messages() {
		$bookings = new Creo_Rombooking_Bookings();

		$this->assertSame( '3 bookings are confirmed. You will get a text message.', $bookings->confirmation( 3, 0, 0 ) );
		$this->assertSame( 'The request has been sent to the administrator. You will get a text message when it has been handled.', $bookings->confirmation( 0, 1, 0 ) );
		$this->assertSame( '2 requests have been sent to the administrator. You will get a text message when they have been handled.', $bookings->confirmation( 0, 2, 0 ) );
		$this->assertSame( '4 bookings are confirmed, and 1 has been sent to the administrator. You will get a text message. 2 dates were left out because the room is closed.', $bookings->confirmation( 4, 1, 2 ) );
	}
}
