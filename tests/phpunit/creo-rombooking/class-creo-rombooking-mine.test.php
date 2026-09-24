<?php

class Creo_Rombooking_Mine_Test extends WP_UnitTestCase {

	private $member;
	private $other;
	private $admin;
	private $rooms;
	private $monday;

	public function set_up() {
		parent::set_up();

		( new Creo_Rombooking_Seed() )->run();

		$this->member = self::factory()->user->create( array( 'display_name' => 'Test Medlem' ) );
		$this->other  = self::factory()->user->create();
		$this->admin  = self::factory()->user->create( array( 'role' => 'administrator' ) );
		update_user_meta( $this->member, 'creo_rombooking_phone', '+47 412 34 567' );
		update_user_meta( $this->other, 'creo_rombooking_phone', '+47 912 34 567' );

		$this->rooms  = array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id', 'name' );
		$today        = new DateTimeImmutable( creo_rombooking_today() );
		$this->monday = $today->modify( '-' . ( (int) $today->format( 'N' ) - 1 ) . ' days' )->modify( '+7 days' );
		wp_set_current_user( $this->member );
	}

	private function day( $weekday, $weeks = 0 ) {
		return $this->monday->modify( '+' . ( $weekday + 7 * $weeks ) . ' days' )->format( 'Y-m-d' );
	}

	private function book( array $values, $user_id = null ) {
		$user_id = $user_id ?? $this->member;
		wp_set_current_user( $user_id );
		$result = ( new Creo_Rombooking_Bookings() )->create(
			array_merge(
				array(
					'roomId'  => $this->rooms['Møterom 2'],
					'date'    => $this->day( 1 ),
					'start'   => 720,
					'end'     => 780,
					'purpose' => 'Test',
					'people'  => 4,
				),
				$values
			),
			$user_id
		);
		wp_set_current_user( $this->member );
		return $result['bookings'];
	}

	private function mine() {
		return new Creo_Rombooking_Mine( $this->member );
	}

	private function booking( $id ) {
		global $wpdb;
		$table = Creo_Rombooking_Schema::table( 'bookings' );
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE id = %d", $id ), ARRAY_A ); // phpcs:ignore
	}

	private function proposal_for( $booking_id ) {
		global $wpdb;
		$table = Creo_Rombooking_Schema::table( 'proposals' );
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM $table WHERE booking_id = %d", $booking_id ), ARRAY_A ); // phpcs:ignore
	}

	private function last_sms() {
		global $wpdb;
		$table = Creo_Rombooking_Schema::table( 'events' );
		return $wpdb->get_var( $wpdb->prepare( "SELECT sms_text FROM $table WHERE action = 'sms' AND sms_to = %d ORDER BY id DESC LIMIT 1", $this->member ) ); // phpcs:ignore
	}

	/**
	 * A request in Storsalen next Thursday, with a proposal of Møterom 2 at 18:00–19:00.
	 */
	private function proposal( $hours = 48 ) {
		$id = $this->book(
			array(
				'roomId' => $this->rooms['Storsalen'],
				'date'   => $this->day( 3 ),
				'start'  => 1080,
				'end'    => 1140,
			)
		)[0]['id'];

		wp_set_current_user( $this->admin );
		( new Creo_Rombooking_Admin() )->propose(
			$id,
			array(
				'roomId'   => $this->rooms['Møterom 2'],
				'date'     => $this->day( 3 ),
				'start'    => 1080,
				'end'      => 1140,
				'deadline' => 24,
				'message'  => 'Storsalen er opptatt.',
			)
		);
		wp_set_current_user( $this->member );

		if ( $hours !== 48 ) {
			global $wpdb;
			$wpdb->update( Creo_Rombooking_Schema::table( 'proposals' ), array( 'expires_at' => current_datetime()->modify( "$hours hours" )->format( 'Y-m-d H:i:s' ) ), array( 'booking_id' => $id ) ); // phpcs:ignore
		}

		return $id;
	}

	public function test_lists_upcoming_bookings_and_proposals() {
		$single  = $this->book( array() )[0]['id'];
		$request = $this->proposal();

		$list = $this->mine()->get_bookings();

		$this->assertSame( array( $single ), array_column( $list['upcoming'], 'id' ) );
		$this->assertSame( 'approved', $list['upcoming'][0]['status'] );
		$this->assertTrue( $list['upcoming'][0]['cancellable'] );

		$this->assertCount( 1, $list['proposals'] );
		$this->assertSame( $request, $list['proposals'][0]['bookingId'] );
		$this->assertSame( 'Storsalen', $list['proposals'][0]['original']['room']['name'] );
		$this->assertSame( 'Møterom 2', $list['proposals'][0]['proposed']['room']['name'] );
		$this->assertSame( 'Storsalen er opptatt.', $list['proposals'][0]['message'] );
		$this->assertFalse( $list['proposals'][0]['wasApproved'] );
	}

	public function test_other_peoples_bookings_are_not_listed_or_cancellable() {
		$theirs = $this->book( array(), $this->other )[0]['id'];

		$this->assertSame( array(), $this->mine()->get_bookings()['upcoming'] );
		$this->assertSame( 404, $this->mine()->cancel( $theirs, array() )->get_error_data()['status'] );
		$this->assertSame( 'approved', $this->booking( $theirs )['status'] );
	}

	public function test_cancel_this() {
		$id     = $this->book( array() )[0]['id'];
		$result = $this->mine()->cancel( $id, array( 'scope' => 'this' ) );

		$this->assertSame( 'The booking is cancelled.', $result['message'] );
		$this->assertSame( 'cancelled', $this->booking( $id )['status'] );
		$this->assertStringStartsWith( 'Room booking: You have cancelled Møterom 2', $this->last_sms() );

		$closed = $this->mine()->get_bookings()['closed'];
		$this->assertSame( array( $id ), array_column( $closed, 'id' ) );
		$this->assertTrue( $closed[0]['byMe'] );
	}

	public function test_cancel_this_and_following_in_a_series() {
		$bookings = $this->book(
			array(
				'repeat'  => 'weekly',
				'endMode' => 'count',
				'count'   => 4,
			)
		);

		$result = $this->mine()->cancel( $bookings[1]['id'], array( 'scope' => 'following' ) );

		$this->assertSame( '3 bookings are cancelled.', $result['message'] );
		$this->assertSame( array( 'approved', 'cancelled', 'cancelled', 'cancelled' ), array_map( fn( $b ) => $this->booking( $b['id'] )['status'], $bookings ) );
		$this->assertStringContainsString( 'and 2 later dates in the series.', $this->last_sms() );
	}

	public function test_only_this_date_in_a_series() {
		$bookings = $this->book(
			array(
				'repeat'  => 'weekly',
				'endMode' => 'count',
				'count'   => 3,
			)
		);

		$this->mine()->cancel( $bookings[1]['id'], array( 'scope' => 'this' ) );

		$this->assertSame( array( 'approved', 'cancelled', 'approved' ), array_map( fn( $b ) => $this->booking( $b['id'] )['status'], $bookings ) );
	}

	public function test_bookings_that_have_started_cannot_be_cancelled() {
		global $wpdb;
		$id = $this->book( array() )[0]['id'];
		$wpdb->update( Creo_Rombooking_Schema::table( 'bookings' ), array( 'date' => creo_rombooking_today(), 'start_min' => 0 ), array( 'id' => $id ) ); // phpcs:ignore

		$this->assertSame( 409, $this->mine()->cancel( $id, array() )->get_error_data()['status'] );
	}

	public function test_accept_moves_the_booking_and_confirms_it() {
		$id       = $this->proposal();
		$proposal = $this->proposal_for( $id );

		$result = $this->mine()->accept( (int) $proposal['id'] );

		$this->assertSame( 'The proposal is accepted, and the booking is confirmed. You will get a text message.', $result['message'] );
		$booking = $this->booking( $id );
		$this->assertSame( 'approved', $booking['status'] );
		$this->assertSame( (string) $this->rooms['Møterom 2'], $booking['room_id'] );
		$this->assertSame( 'accepted', $this->proposal_for( $id )['status'] );
		$this->assertStringStartsWith( 'Room booking: Your booking is confirmed. Møterom 2', $this->last_sms() );

		$this->assertSame( 409, $this->mine()->accept( (int) $proposal['id'] )->get_error_data()['status'] );
	}

	public function test_accept_fails_when_the_time_was_taken() {
		$id       = $this->proposal();
		$proposal = $this->proposal_for( $id );
		$this->book(
			array(
				'date'  => $this->day( 3 ),
				'start' => 1080,
				'end'   => 1140,
			),
			$this->other
		);

		$result = $this->mine()->accept( (int) $proposal['id'] );

		$this->assertSame( 'creo_rombooking_conflict', $result->get_error_code() );
		$this->assertSame( 'proposed', $this->booking( $id )['status'] );
		$this->assertSame( 'pending', $this->proposal_for( $id )['status'] );
	}

	public function test_decline() {
		$id       = $this->proposal();
		$proposal = $this->proposal_for( $id );

		$this->assertSame( 'The proposal is declined.', $this->mine()->decline( (int) $proposal['id'] )['message'] );
		$this->assertSame( 'cancelled', $this->booking( $id )['status'] );
		$this->assertSame( 'declined', $this->proposal_for( $id )['status'] );
	}

	public function test_only_the_member_can_answer_a_proposal() {
		$proposal = $this->proposal_for( $this->proposal() );

		$this->assertSame( 404, ( new Creo_Rombooking_Mine( $this->other ) )->accept( (int) $proposal['id'] )->get_error_data()['status'] );
	}

	public function test_unanswered_proposals_expire() {
		$id       = $this->proposal( -1 );
		$proposal = $this->proposal_for( $id );

		$this->assertSame( 'creo_rombooking_expired', $this->mine()->accept( (int) $proposal['id'] )->get_error_code() );
		$this->assertSame( 'expired', $this->proposal_for( $id )['status'] );
		$this->assertSame( 'cancelled', $this->booking( $id )['status'] );
		$this->assertStringContainsString( 'was not answered in time and has expired.', $this->last_sms() );
		$this->assertSame( array(), $this->mine()->get_bookings()['proposals'] );
	}

	public function test_cancelled_with_a_proposal_by_the_administrator() {
		$request  = $this->book(
			array(
				'roomId' => $this->rooms['Møterom 1'],
				'date'   => $this->day( 0 ),
				'start'  => 540,
				'end'    => 600,
			),
			$this->other
		)[0]['id'];
		$existing = $this->book(
			array(
				'roomId' => $this->rooms['Barnerom'],
				'date'   => $this->day( 0 ),
				'start'  => 540,
				'end'    => 600,
			)
		)[0]['id'];

		// The administrator gives the member's time in Barnerom to someone else, and proposes Møterom 2.
		global $wpdb;
		$wpdb->update( Creo_Rombooking_Schema::table( 'bookings' ), array( 'room_id' => $this->rooms['Barnerom'] ), array( 'id' => $request ) ); // phpcs:ignore
		wp_set_current_user( $this->admin );
		( new Creo_Rombooking_Admin() )->approve_and_cancel_existing(
			$request,
			array(
				'reason'      => 'Barnerommet trengs til dåpssamling.',
				'alternative' => array(
					'roomId'   => $this->rooms['Møterom 2'],
					'deadline' => 48,
				),
			)
		);
		wp_set_current_user( $this->member );

		$proposal = $this->mine()->get_bookings()['proposals'][0];
		$this->assertSame( $existing, $proposal['bookingId'] );
		$this->assertTrue( $proposal['wasApproved'] );
		$this->assertSame( 'Barnerommet trengs til dåpssamling.', $proposal['message'] );
	}

	public function test_rest_routes() {
		$id = $this->book( array() )[0]['id'];

		$request = new WP_REST_Request( 'GET', '/creo-rombooking/v1/me/bookings' );
		$this->assertSame( array( $id ), array_column( rest_get_server()->dispatch( $request )->get_data()['upcoming'], 'id' ) );

		$request = new WP_REST_Request( 'POST', "/creo-rombooking/v1/me/bookings/$id/cancel" );
		$request->set_body_params( array( 'scope' => 'this' ) );
		$this->assertSame( 200, rest_get_server()->dispatch( $request )->get_status() );

		wp_set_current_user( 0 );
		$this->assertSame( 401, rest_get_server()->dispatch( new WP_REST_Request( 'GET', '/creo-rombooking/v1/me/bookings' ) )->get_status() );
	}

	public function test_expiry_is_scheduled() {
		Creo_Rombooking::schedule_events();
		$this->assertNotFalse( wp_next_scheduled( Creo_Rombooking_Mine::EXPIRE_HOOK ) );
	}
}
