<?php

class Creo_Rombooking_Availability_Test extends WP_UnitTestCase {

	const VIEWER = 10;
	const OTHER  = 20;

	/**
	 * Open 08:00–22:00.
	 */
	const OPEN_ALL_DAY = array(
		array(
			'start_min' => 480,
			'end_min'   => 1320,
		),
	);

	/**
	 * Converts periods to a compact string for readable assertions.
	 *
	 * @param array $periods The periods.
	 * @return string E.g. `08:00-09:00 free, 09:00-10:00 busy`.
	 */
	private function describe( array $periods ) {
		return implode(
			', ',
			array_map(
				fn( $p ) => sprintf( '%02d:%02d-%02d:%02d %s', intdiv( $p['start'], 60 ), $p['start'] % 60, intdiv( $p['end'], 60 ), $p['end'] % 60, $p['status'] ),
				$periods
			)
		);
	}

	private function booking( $id, $from, $to, $status = 'approved', $user_id = self::OTHER ) {
		return array(
			'id'        => $id,
			'series_id' => null,
			'user_id'   => $user_id,
			'start_min' => Creo_Rombooking_Seed::minutes( $from ),
			'end_min'   => Creo_Rombooking_Seed::minutes( $to ),
			'purpose'   => "Formål $id",
			'status'    => $status,
			'user_name' => "Person $user_id",
		);
	}

	public function test_slot_count() {
		$this->assertSame( 28, Creo_Rombooking_Availability::slot_count() );
	}

	public function test_is_date() {
		$this->assertTrue( Creo_Rombooking_Availability::is_date( '2026-09-23' ) );
		$this->assertFalse( Creo_Rombooking_Availability::is_date( '2026-02-30' ) );
		$this->assertFalse( Creo_Rombooking_Availability::is_date( '23.09.2026' ) );
		$this->assertFalse( Creo_Rombooking_Availability::is_date( '2026-9-23' ) );
		$this->assertFalse( Creo_Rombooking_Availability::is_date( null ) );
	}

	public function test_a_free_day_is_one_period() {
		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( self::OPEN_ALL_DAY, array(), array() );

		$this->assertSame( '08:00-22:00 free', $this->describe( $periods ) );
	}

	public function test_no_opening_hours_means_closed_all_day() {
		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( array(), array(), array() );

		$this->assertSame( '08:00-22:00 closed', $this->describe( $periods ) );
		$this->assertSame( 'outside', $periods[0]['reason']['type'] );
	}

	public function test_outside_opening_hours_is_closed() {
		$hours = array(
			array(
				'start_min' => 900,
				'end_min'   => 1200,
			),
		);

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( $hours, array(), array() );

		$this->assertSame( '08:00-15:00 closed, 15:00-20:00 free, 20:00-22:00 closed', $this->describe( $periods ) );
	}

	public function test_several_opening_intervals() {
		$hours = array(
			array(
				'start_min' => 480,
				'end_min'   => 720,
			),
			array(
				'start_min' => 1020,
				'end_min'   => 1320,
			),
		);

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( $hours, array(), array() );

		$this->assertSame( '08:00-12:00 free, 12:00-17:00 closed, 17:00-22:00 free', $this->describe( $periods ) );
	}

	public function test_closures() {
		$whole_day = array(
			'id'        => 1,
			'start_min' => null,
			'end_min'   => null,
			'type'      => 'closed',
			'reason'    => 'Vedlikehold',
		);
		$partial   = array(
			'id'        => 2,
			'start_min' => 480,
			'end_min'   => 720,
			'type'      => 'blocked',
			'reason'    => 'Rengjøring',
		);

		$availability = new Creo_Rombooking_Availability( self::VIEWER );

		$periods = $availability->calculate( self::OPEN_ALL_DAY, array( $whole_day ), array() );
		$this->assertSame( '08:00-22:00 closed', $this->describe( $periods ) );
		$this->assertSame(
			array(
				'type' => 'closed',
				'text' => 'Vedlikehold',
			),
			$periods[0]['reason']
		);

		$periods = $availability->calculate( self::OPEN_ALL_DAY, array( $partial ), array() );
		$this->assertSame( '08:00-12:00 closed, 12:00-22:00 free', $this->describe( $periods ) );
		$this->assertSame( 'blocked', $periods[0]['reason']['type'] );
	}

	public function test_booking_statuses() {
		$bookings = array(
			$this->booking( 1, '08:00', '09:00' ),
			$this->booking( 2, '09:00', '10:00', 'requested' ),
			$this->booking( 3, '10:00', '11:00', 'approved', self::VIEWER ),
			$this->booking( 4, '11:00', '12:00', 'requested', self::VIEWER ),
		);

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( self::OPEN_ALL_DAY, array(), $bookings );

		$this->assertSame(
			'08:00-09:00 busy, 09:00-10:00 requested, 10:00-11:00 mine, 11:00-12:00 mine-requested, 12:00-22:00 free',
			$this->describe( $periods )
		);
	}

	public function test_approved_bookings_win_over_requests_and_closed_wins_over_everything() {
		$bookings = array(
			$this->booking( 1, '09:00', '11:00', 'requested' ),
			$this->booking( 2, '10:00', '12:00' ),
		);
		$closure  = array(
			'id'        => 1,
			'start_min' => 660,
			'end_min'   => 690,
			'type'      => 'blocked',
			'reason'    => '',
		);

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( self::OPEN_ALL_DAY, array( $closure ), $bookings );

		$this->assertSame(
			'08:00-09:00 free, 09:00-10:00 requested, 10:00-11:00 busy, 11:00-11:30 closed, 11:30-12:00 busy, 12:00-22:00 free',
			$this->describe( $periods )
		);
	}

	public function test_bookings_that_do_not_fill_whole_slots_mark_the_slots_they_touch() {
		$bookings = array( $this->booking( 1, '09:15', '09:45' ) );

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( self::OPEN_ALL_DAY, array(), $bookings );

		$this->assertSame( '08:00-09:00 free, 09:00-10:00 busy, 10:00-22:00 free', $this->describe( $periods ) );
	}

	public function test_neighbouring_bookings_stay_separate_periods() {
		$bookings = array(
			$this->booking( 1, '09:00', '10:00' ),
			$this->booking( 2, '10:00', '11:00' ),
		);

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( self::OPEN_ALL_DAY, array(), $bookings );

		$this->assertSame( '08:00-09:00 free, 09:00-10:00 busy, 10:00-11:00 busy, 11:00-22:00 free', $this->describe( $periods ) );
	}

	public function test_members_do_not_see_who_booked_or_why() {
		$bookings = array(
			$this->booking( 1, '08:00', '09:00' ),
			$this->booking( 2, '09:00', '10:00', 'requested' ),
			$this->booking( 3, '10:00', '11:00', 'approved', self::VIEWER ),
		);

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER ) )->calculate( self::OPEN_ALL_DAY, array(), $bookings );

		$this->assertArrayNotHasKey( 'booking', $periods[0] );
		$this->assertArrayNotHasKey( 'booking', $periods[1] );
		$this->assertSame(
			array(
				'id'       => 3,
				'purpose'  => 'Formål 3',
				'seriesId' => null,
			),
			$periods[2]['booking'],
			'Members see their own bookings.'
		);
	}

	public function test_administrators_see_who_booked_and_why() {
		$bookings = array( $this->booking( 1, '08:00', '09:00' ) );

		$periods = ( new Creo_Rombooking_Availability( self::VIEWER, true ) )->calculate( self::OPEN_ALL_DAY, array(), $bookings );

		$this->assertSame(
			array(
				'id'       => 1,
				'purpose'  => 'Formål 1',
				'seriesId' => null,
				'userId'   => self::OTHER,
				'userName' => 'Person 20',
			),
			$periods[0]['booking']
		);
	}

	public function test_get_days_reads_the_database() {
		( new Creo_Rombooking_Seed( '2026-09-23' ) )->run();

		$days = ( new Creo_Rombooking_Availability( 0 ) )->get_days( '2026-09-26', '2026-09-27' );

		$this->assertCount( 2, $days );
		$this->assertSame( '2026-09-26', $days[0]['date'] );
		$this->assertCount( 6, $days[0]['rooms'] );

		$rooms    = array_column( ( new Creo_Rombooking_Availability( 0 ) )->get_rooms(), 'id', 'name' );
		$storsal  = array_values( array_filter( $days[0]['rooms'], fn( $r ) => $r['roomId'] === $rooms['Storsalen'] ) )[0];
		$gym_mon  = ( new Creo_Rombooking_Availability( 0 ) )->get_days( '2026-10-06', '2026-10-06', array( $rooms['Gymsal'] ) );
		$kafe_mon = ( new Creo_Rombooking_Availability( 0 ) )->get_days( '2026-09-28', '2026-09-28', array( $rooms['Kafé'] ) );

		// The Saturday birthday party is approved, and the conflicting request is hidden under it.
		$this->assertSame( '08:00-11:00 free, 11:00-15:00 busy, 15:00-22:00 free', $this->describe( $storsal['periods'] ) );
		$this->assertSame( '08:00-22:00 closed', $this->describe( $gym_mon[0]['rooms'][0]['periods'] ), 'Gymsal is closed for maintenance.' );
		$this->assertSame( 'Vedlikehold', $gym_mon[0]['rooms'][0]['periods'][0]['reason']['text'] );
		$this->assertSame( '08:00-22:00 closed', $this->describe( $kafe_mon[0]['rooms'][0]['periods'] ), 'Kafé is closed on Mondays.' );
	}

	public function test_get_rooms_hides_inactive_rooms() {
		global $wpdb;

		( new Creo_Rombooking_Seed( '2026-09-23' ) )->run();
		$wpdb->update( Creo_Rombooking_Schema::table( 'rooms' ), array( 'active' => 0 ), array( 'name' => 'Barnerom' ) );

		$availability = new Creo_Rombooking_Availability( 0 );

		$this->assertNotContains( 'Barnerom', array_column( $availability->get_rooms(), 'name' ) );
		$this->assertContains( 'Barnerom', array_column( $availability->get_rooms( true ), 'name' ) );
		$this->assertCount( 5, $availability->get_days( '2026-09-23', '2026-09-23' )[0]['rooms'] );
	}
}
