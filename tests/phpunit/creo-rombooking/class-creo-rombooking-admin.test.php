<?php

class Creo_Rombooking_Admin_Test extends WP_UnitTestCase {

	private $member;
	private $admin;
	private $rooms;
	private $monday;

	public function set_up() {
		parent::set_up();

		( new Creo_Rombooking_Seed() )->run();

		$this->member = self::factory()->user->create( array( 'display_name' => 'Test Medlem' ) );
		$this->admin  = self::factory()->user->create( array( 'role' => 'administrator' ) );
		update_user_meta( $this->member, 'creo_rombooking_phone', '+47 412 34 567' );

		$this->rooms = array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id', 'name' );
		$today       = new DateTimeImmutable( creo_rombooking_today() );
		// Monday next week, where nothing has passed yet.
		$this->monday = $today->modify( '-' . ( (int) $today->format( 'N' ) - 1 ) . ' days' )->modify( '+7 days' );
	}

	private function day( $weekday ) {
		return $this->monday->modify( "+$weekday days" )->format( 'Y-m-d' );
	}

	/**
	 * Creates bookings as the member, then acts as the administrator.
	 */
	private function book( array $values ) {
		wp_set_current_user( $this->member );
		$result = ( new Creo_Rombooking_Bookings() )->create(
			array_merge(
				array(
					'purpose' => 'Test',
					'people'  => 6,
					'repeat'  => 'none',
				),
				$values
			),
			$this->member
		);
		wp_set_current_user( $this->admin );
		$this->assertIsArray( $result );
		return $result['bookings'];
	}

	/**
	 * A request in Møterom 1 next Monday, 09:00–10:30, which overlaps the weekly work meeting 09:00–10:00.
	 */
	private function conflict() {
		return $this->book(
			array(
				'roomId' => $this->rooms['Møterom 1'],
				'date'   => $this->day( 0 ),
				'start'  => 540,
				'end'    => 630,
			)
		)[0]['id'];
	}

	/**
	 * A request in Storsalen, which needs approval, next Thursday 12:00–13:00.
	 */
	private function approval() {
		return $this->book(
			array(
				'roomId' => $this->rooms['Storsalen'],
				'date'   => $this->day( 3 ),
				'start'  => 720,
				'end'    => 780,
				'people' => 100,
			)
		)[0]['id'];
	}

	/**
	 * Three Wednesdays in Gymsal, which needs approval, 18:00–19:00.
	 */
	private function series() {
		return $this->book(
			array(
				'roomId'  => $this->rooms['Gymsal'],
				'date'    => $this->day( 2 ),
				'start'   => 1080,
				'end'     => 1140,
				'repeat'  => 'weekly',
				'endMode' => 'count',
				'count'   => 3,
			)
		);
	}

	private function booking( $id ) {
		global $wpdb;
		$table = Creo_Rombooking_Schema::table( 'bookings' );
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore
	}

	private function sms_to( $user_id ) {
		global $wpdb;
		$table = Creo_Rombooking_Schema::table( 'events' );
		return $wpdb->get_col( $wpdb->prepare( "SELECT sms_text FROM $table WHERE action = 'sms' AND sms_to = %d ORDER BY id", $user_id ) ); // phpcs:ignore
	}

	private function last_sms_to( $user_id ) {
		$messages = $this->sms_to( $user_id );
		return end( $messages );
	}

	private function item( $id ) {
		foreach ( ( new Creo_Rombooking_Admin() )->get_requests() as $item ) {
			if ( $item['id'] === $id ) {
				return $item;
			}
		}
		return null;
	}

	public function test_the_inbox_lists_conflicts_then_series_then_approvals() {
		$approval = $this->approval();
		$this->series();
		$conflict = $this->conflict();

		$kinds = array_column( ( new Creo_Rombooking_Admin() )->get_requests(), 'kind' );
		$this->assertSame( $kinds, array_merge( array_filter( $kinds, fn( $k ) => $k === 'conflict' ), array_filter( $kinds, fn( $k ) => $k === 'series' ), array_filter( $kinds, fn( $k ) => $k === 'approval' ) ) );

		$this->assertSame( 'approval', $this->item( "booking-$approval" )['kind'] );
		$this->assertSame( 'conflict', $this->item( "booking-$conflict" )['kind'] );
	}

	public function test_a_conflict_shows_the_existing_booking_and_free_rooms_with_enough_places() {
		$item = $this->item( 'booking-' . $this->conflict() );

		$this->assertSame( 'Test Medlem', $item['user']['name'] );
		$this->assertSame( 6, $item['people'] );
		$this->assertCount( 1, $item['existing'] );
		$this->assertSame( 'Ukentlig arbeidsmøte', $item['existing'][0]['purpose'] );
		$this->assertSame( 5, $item['existing'][0]['people'] );
		$this->assertNotNull( $item['existing'][0]['seriesStart'] );

		// Kafé is closed on Mondays, and Gymsal opens at 15:00 on weekdays.
		$this->assertSame( array( 'Møterom 2', 'Barnerom', 'Storsalen' ), array_column( $item['suggestions']['free'], 'name' ) );
		$this->assertSame( array( 'Kafé', 'Gymsal' ), $item['suggestions']['unavailable'] );
		$this->assertSame( array( 'Møterom 2', 'Barnerom', 'Storsalen' ), array_column( $item['moveOptions'], 'name' ) );
	}

	public function test_rooms_that_are_too_small_are_not_suggested() {
		$item = $this->item( 'booking-' . $this->approval() );

		$this->assertSame( array(), $item['suggestions']['free'] );
		$this->assertContains( 'Kafé', $item['suggestions']['tooSmall'] );
	}

	public function test_a_series_lists_every_date() {
		$bookings = $this->series();
		$item     = $this->item( 'series-' . $this->booking( $bookings[0]['id'] )['series_id'] );

		$this->assertSame( 'series', $item['kind'] );
		$this->assertSame( 'weekly', $item['rule'] );
		$this->assertSame( array( 'free', 'free', 'free' ), array_column( $item['occurrences'], 'status' ) );
		$this->assertSame( array( true, true, true ), array_column( $item['occurrences'], 'pending' ) );
	}

	public function test_approve() {
		$id     = $this->approval();
		$result = ( new Creo_Rombooking_Admin() )->approve( $id );

		$this->assertSame( 'The booking is approved. Test Medlem gets a text message.', $result['message'] );
		$this->assertSame( 'approved', $this->booking( $id )['status'] );
		$this->assertStringContainsString( 'Your request is approved. Storsalen', $this->last_sms_to( $this->member ) );
		$this->assertNull( $this->item( "booking-$id" ) );
	}

	public function test_a_conflict_cannot_be_approved_directly() {
		$result = ( new Creo_Rombooking_Admin() )->approve( $this->conflict() );

		$this->assertWPError( $result );
		$this->assertSame( 409, $result->get_error_data()['status'] );
	}

	public function test_a_request_cannot_be_handled_twice() {
		$id    = $this->approval();
		$admin = new Creo_Rombooking_Admin();
		$admin->approve( $id );

		$this->assertSame( 'creo_rombooking_handled', $admin->reject( $id, array( 'reason' => 'Nei' ) )->get_error_code() );
	}

	public function test_reject_needs_a_reason() {
		$id     = $this->approval();
		$admin  = new Creo_Rombooking_Admin();
		$result = $admin->reject( $id, array( 'reason' => '  ' ) );

		$this->assertArrayHasKey( 'reason', $result->get_error_data()['errors'] );
		$this->assertSame( 'requested', $this->booking( $id )['status'] );

		$admin->reject( $id, array( 'reason' => 'Salen skal males.' ) );

		$this->assertSame( 'rejected', $this->booking( $id )['status'] );
		$this->assertStringEndsWith( 'is declined. Reason: Salen skal males.', $this->last_sms_to( $this->member ) );
	}

	/**
	 * @dataProvider invalid_proposals
	 */
	public function test_invalid_proposals( array $values, $field ) {
		$id    = $this->conflict();
		$input = array_merge(
			array(
				'roomId'   => $this->rooms['Møterom 2'],
				'date'     => $this->day( 0 ),
				'start'    => 540,
				'end'      => 630,
				'deadline' => 48,
			),
			$values
		);
		if ( isset( $input['room'] ) ) {
			$input['roomId'] = $this->rooms[ $input['room'] ];
		}

		$result = ( new Creo_Rombooking_Admin() )->propose( $id, $input );

		$this->assertWPError( $result );
		$this->assertArrayHasKey( $field, $result->get_error_data()['errors'] );
	}

	public function invalid_proposals() {
		return array(
			'the same room and time' => array( array( 'room' => 'Møterom 1' ), 'roomId' ),
			'a closed room'          => array( array( 'room' => 'Kafé' ), 'roomId' ),
			'a booked room'          => array(
				array(
					'room'  => 'Møterom 2',
					'start' => 1080,
					'end'   => 1140,
				),
				'roomId',
			),
			'end before start'       => array( array( 'end' => 540 ), 'end' ),
			'an unknown deadline'    => array( array( 'deadline' => 5 ), 'deadline' ),
			'a long message'         => array( array( 'message' => str_repeat( 'a', 161 ) ), 'message' ),
		);
	}

	public function test_propose() {
		global $wpdb;
		$id     = $this->conflict();
		$result = ( new Creo_Rombooking_Admin() )->propose(
			$id,
			array(
				'roomId'   => $this->rooms['Møterom 2'],
				'date'     => $this->day( 0 ),
				'start'    => 540,
				'end'      => 630,
				'deadline' => 24,
				'message'  => 'Møterom 2 har skjerm.',
			)
		);

		$this->assertStringStartsWith( 'The proposal has been sent: Møterom 2', $result['message'] );
		$this->assertSame( 'proposed', $this->booking( $id )['status'] );

		$proposal = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . Creo_Rombooking_Schema::table( 'proposals' ) . ' WHERE booking_id = %d', $id ), ARRAY_A ); // phpcs:ignore
		$this->assertSame( (string) $this->rooms['Møterom 2'], $proposal['room_id'] );
		$this->assertSame( 'pending', $proposal['status'] );
		$this->assertSame( current_datetime()->modify( '+24 hours' )->format( 'Y-m-d H' ), substr( $proposal['expires_at'], 0, 13 ) );

		$sms = $this->last_sms_to( $this->member );
		$this->assertStringContainsString( 'We propose Møterom 2', $sms );
		$this->assertStringContainsString( 'Møterom 2 har skjerm.', $sms );
	}

	public function test_move_existing() {
		$id       = $this->conflict();
		$existing = $this->item( "booking-$id" )['existing'][0];
		$admin    = new Creo_Rombooking_Admin();

		$this->assertArrayHasKey( 'reason', $admin->move_existing( $id, array( 'roomId' => $this->rooms['Møterom 2'] ) )->get_error_data()['errors'] );
		$this->assertArrayHasKey(
			'roomId',
			$admin->move_existing(
				$id,
				array(
					'roomId' => $this->rooms['Kafé'],
					'reason' => 'x',
				)
			)->get_error_data()['errors']
		);

		$result = $admin->move_existing(
			$id,
			array(
				'roomId' => $this->rooms['Møterom 2'],
				'reason' => 'Basarkomiteen trenger Møterom 1.',
			)
		);

		$this->assertSame( 'The booking of Per Demodal has been moved to Møterom 2, and the request is approved. Both get a text message.', $result['message'] );
		$this->assertSame( (string) $this->rooms['Møterom 2'], $this->booking( $existing['id'] )['room_id'] );
		$this->assertSame( 'approved', $this->booking( $existing['id'] )['status'] );
		$this->assertSame( 'approved', $this->booking( $id )['status'] );
		$this->assertStringContainsString( 'has been moved to Møterom 2. Reason: Basarkomiteen', $this->last_sms_to( $existing['user']['id'] ) );
		$this->assertStringContainsString( 'Your request is approved', $this->last_sms_to( $this->member ) );
	}

	public function test_approve_and_cancel_existing() {
		$id       = $this->conflict();
		$existing = $this->item( "booking-$id" )['existing'][0];

		$result = ( new Creo_Rombooking_Admin() )->approve_and_cancel_existing( $id, array( 'reason' => 'Viktig møte.' ) );

		$this->assertSame( 'The request is approved, and the booking of Per Demodal is cancelled. Both get a text message.', $result['message'] );
		$this->assertSame( 'cancelled', $this->booking( $existing['id'] )['status'] );
		$this->assertSame( 'approved', $this->booking( $id )['status'] );
		$this->assertStringEndsWith( 'is cancelled. Reason: Viktig møte.', $this->last_sms_to( $existing['user']['id'] ) );
	}

	public function test_approve_and_cancel_existing_with_another_room() {
		$id       = $this->conflict();
		$existing = $this->item( "booking-$id" )['existing'][0];
		$admin    = new Creo_Rombooking_Admin();

		$busy = $admin->approve_and_cancel_existing(
			$id,
			array(
				'reason'      => 'Viktig møte.',
				'alternative' => array(
					'roomId'   => $this->rooms['Kafé'],
					'deadline' => 48,
				),
			)
		);
		$this->assertArrayHasKey( 'alternativeRoomId', $busy->get_error_data()['errors'] );
		$this->assertSame( 'approved', $this->booking( $existing['id'] )['status'], 'Nothing changes when the proposal is invalid.' );

		$result = $admin->approve_and_cancel_existing(
			$id,
			array(
				'reason'      => 'Viktig møte.',
				'alternative' => array(
					'roomId'   => $this->rooms['Barnerom'],
					'deadline' => 72,
				),
			)
		);

		$this->assertStringContainsString( 'A proposal of Barnerom is attached', $result['message'] );
		$this->assertSame( 'proposed', $this->booking( $existing['id'] )['status'] );
		$this->assertStringContainsString( 'We propose Barnerom at the same time instead.', $this->last_sms_to( $existing['user']['id'] ) );
	}

	public function test_cancel_booking() {
		$id    = $this->approval();
		$admin = new Creo_Rombooking_Admin();

		$this->assertSame( 409, $admin->cancel_booking( $id, array( 'reason' => 'x' ) )->get_error_data()['status'], 'Requests are declined, not cancelled.' );

		$admin->approve( $id );
		$this->assertArrayHasKey( 'reason', $admin->cancel_booking( $id, array() )->get_error_data()['errors'] );

		$result = $admin->cancel_booking( $id, array( 'reason' => 'Vannlekkasje.' ) );

		$this->assertSame( 'The booking is cancelled. Test Medlem gets a text message with the reason.', $result['message'] );
		$this->assertSame( 'cancelled', $this->booking( $id )['status'] );
	}

	public function test_series_decisions_send_one_message_when_the_series_is_handled() {
		$bookings  = $this->series();
		$series_id = (int) $this->booking( $bookings[0]['id'] )['series_id'];
		$admin     = new Creo_Rombooking_Admin();
		$before    = count( $this->sms_to( $this->member ) );

		$first = $admin->approve( $bookings[0]['id'] );
		$this->assertStringStartsWith( 'The booking on ', $first['message'] );
		$this->assertCount( $before, $this->sms_to( $this->member ), 'No message while dates are waiting.' );

		$admin->reject( $bookings[1]['id'], array() );
		$this->assertSame( 'rejected', $this->booking( $bookings[1]['id'] )['status'] );

		$result = $admin->approve_free( $series_id );

		$this->assertSame( 'The series has been handled: 2 approved and 1 declined. Test Medlem gets a text message.', $result['message'] );
		$this->assertStringContainsString( 'has been handled: 2 approved, 1 declined.', $this->last_sms_to( $this->member ) );
		$this->assertCount( $before + 1, $this->sms_to( $this->member ) );
	}

	public function test_approve_free_tells_when_dates_are_still_waiting() {
		global $wpdb;
		$bookings = $this->series();
		$last     = $this->booking( $bookings[2]['id'] );

		// Someone else gets the last Wednesday approved first.
		$wpdb->insert( // phpcs:ignore
			Creo_Rombooking_Schema::table( 'bookings' ),
			array(
				'room_id'    => $last['room_id'],
				'user_id'    => $this->admin,
				'date'       => $last['date'],
				'start_min'  => 1080,
				'end_min'    => 1140,
				'status'     => 'approved',
				'created_at' => current_time( 'mysql' ),
			)
		);

		$result = ( new Creo_Rombooking_Admin() )->approve_free( (int) $last['series_id'] );

		$this->assertSame( '2 bookings in the series are approved. Test Medlem gets a text message when the whole series has been handled.', $result['message'] );
		$this->assertSame( 'requested', $this->booking( $bookings[2]['id'] )['status'] );
		$this->assertSame( 'conflict', array_slice( $this->item( 'series-' . $last['series_id'] )['occurrences'], -1 )[0]['status'] );
	}

	public function test_reject_rest() {
		$bookings  = $this->series();
		$series_id = (int) $this->booking( $bookings[0]['id'] )['series_id'];
		$admin     = new Creo_Rombooking_Admin();

		$this->assertArrayHasKey( 'reason', $admin->reject_rest( $series_id, array() )->get_error_data()['errors'] );

		$admin->approve( $bookings[0]['id'] );
		$result = $admin->reject_rest( $series_id, array( 'reason' => 'Gymsalen pusses opp.' ) );

		$this->assertSame( 'The rest of the series is declined. Test Medlem gets a text message with the reason.', $result['message'] );
		$this->assertSame( array( 'approved', 'rejected', 'rejected' ), array_map( fn( $b ) => $this->booking( $b['id'] )['status'], $bookings ) );
		$this->assertStringEndsWith( '1 approved, 2 declined. Reason: Gymsalen pusses opp.', $this->last_sms_to( $this->member ) );
		$this->assertNull( $this->item( "series-$series_id" ) );
	}

	public function test_move_booking() {
		$id    = $this->book(
			array(
				'roomId' => $this->rooms['Møterom 2'],
				'date'   => $this->day( 1 ),
				'start'  => 720,
				'end'    => 780,
			)
		)[0]['id'];
		$admin = new Creo_Rombooking_Admin();
		$input = array(
			'roomId' => $this->rooms['Barnerom'],
			'date'   => $this->day( 1 ),
			'start'  => 780,
			'end'    => 840,
			'reason' => 'Møterom 2 skal males.',
		);

		$this->assertArrayHasKey( 'reason', $admin->move_booking( $id, array_merge( $input, array( 'reason' => '' ) ) )->get_error_data()['errors'] );
		$this->assertArrayHasKey(
			'roomId',
			$admin->move_booking(
				$id,
				array_merge(
					$input,
					array(
						'roomId' => $this->rooms['Kafé'],
						'date'   => $this->day( 0 ),
					)
				)
			)->get_error_data()['errors'],
			'Kafé is closed on Mondays.'
		);

		$result = $admin->move_booking( $id, $input );

		$this->assertStringStartsWith( 'The booking is moved to Barnerom', $result['message'] );
		$booking = $this->booking( $id );
		$this->assertSame( (string) $this->rooms['Barnerom'], $booking['room_id'] );
		$this->assertSame( '780', $booking['start_min'] );
		$this->assertSame( 'approved', $booking['status'] );
		$this->assertStringContainsString( 'has been moved to Barnerom', $this->last_sms_to( $this->member ) );
		$this->assertStringEndsWith( 'Reason: Møterom 2 skal males.', $this->last_sms_to( $this->member ) );
	}

	public function test_a_booking_can_be_moved_to_overlap_its_own_time() {
		$id = $this->book(
			array(
				'roomId' => $this->rooms['Møterom 2'],
				'date'   => $this->day( 1 ),
				'start'  => 720,
				'end'    => 780,
			)
		)[0]['id'];

		$result = ( new Creo_Rombooking_Admin() )->move_booking(
			$id,
			array(
				'roomId' => $this->rooms['Møterom 2'],
				'date'   => $this->day( 1 ),
				'start'  => 750,
				'end'    => 810,
				'reason' => 'Senere start.',
			)
		);

		$this->assertIsArray( $result );
		$this->assertSame( '750', $this->booking( $id )['start_min'] );
	}

	public function test_a_booking_cannot_be_moved_onto_another() {
		$id = $this->book(
			array(
				'roomId' => $this->rooms['Møterom 2'],
				'date'   => $this->day( 0 ),
				'start'  => 720,
				'end'    => 780,
			)
		)[0]['id'];

		// The weekly work meeting in Møterom 1 is 09:00–10:00.
		$result = ( new Creo_Rombooking_Admin() )->move_booking(
			$id,
			array(
				'roomId' => $this->rooms['Møterom 1'],
				'date'   => $this->day( 0 ),
				'start'  => 540,
				'end'    => 600,
				'reason' => 'x',
			)
		);

		$this->assertSame( 'The room is not free at that time.', $result->get_error_data()['errors']['roomId'] );
	}

	public function test_sms_log() {
		$this->approval();

		$log = ( new Creo_Rombooking_Admin() )->sms_log();

		$this->assertSame( 1, $log['total'] );
		$this->assertSame( 'Test Medlem', $log['items'][0]['to']['name'] );
		$this->assertSame( '+47 412 34 567', $log['items'][0]['to']['phone'] );
		$this->assertStringStartsWith( 'Room booking: We have received your request.', $log['items'][0]['text'] );
	}
}
