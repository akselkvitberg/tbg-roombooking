<?php

class Creo_Rombooking_Seed_Test extends WP_UnitTestCase {

	public function test_minutes() {
		$this->assertSame( 480, Creo_Rombooking_Seed::minutes( '08:00' ) );
		$this->assertSame( 1290, Creo_Rombooking_Seed::minutes( '21:30' ) );
	}

	public function test_dates_keep_their_weekday_relative_to_the_current_week() {
		// Friday 13 November 2026 is in the week starting Monday 9 November.
		$seed = new Creo_Rombooking_Seed( '2026-11-13' );

		$this->assertSame( '2026-11-09', $seed->date( '2026-09-21' ) );
		$this->assertSame( '2026-11-14', $seed->date( '2026-09-26' ), 'Saturday stays Saturday.' );
		$this->assertSame( '2026-11-24', $seed->date( '2026-10-06' ), 'Two weeks later, still Tuesday.' );
	}

	public function test_adds_the_prototype_data() {
		global $wpdb;

		$counts = ( new Creo_Rombooking_Seed( '2026-09-23' ) )->run();

		$this->assertSame( 6, $counts['rooms'] );
		$this->assertSame( 21, $counts['series'] );
		$this->assertSame( 5, $counts['bookings'] );
		// Two conflicts and a series of eight, where one date is closed.
		$this->assertSame( 9, $counts['requests'] );

		$bookings = Creo_Rombooking_Schema::table( 'bookings' );
		$rooms    = Creo_Rombooking_Schema::table( 'rooms' );

		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$conflicts = $wpdb->get_results(
			"SELECT r.name, b.date, b.purpose, b.people, e.purpose AS existing
			FROM $bookings b
			JOIN $rooms r ON r.id = b.room_id
			JOIN $bookings e ON e.id = b.conflict_with
			ORDER BY b.date",
			ARRAY_A
		);
		// phpcs:enable

		$this->assertSame(
			array(
				array(
					'name'     => 'Storsalen',
					'date'     => '2026-09-26',
					'purpose'  => 'Konsertøving for koret',
					'people'   => '50',
					'existing' => 'Bursdagsfeiring',
				),
				array(
					'name'     => 'Møterom 1',
					'date'     => '2026-10-01',
					'purpose'  => 'Planleggingsmøte for basaren',
					'people'   => '6',
					'existing' => 'Ukentlig arbeidsmøte',
				),
				array(
					'name'     => 'Gymsal',
					'date'     => '2026-10-13',
					'purpose'  => 'Lek og idrett for barn',
					'people'   => '25',
					'existing' => 'Ekstra kroppsøving',
				),
				array(
					'name'     => 'Gymsal',
					'date'     => '2026-11-03',
					'purpose'  => 'Lek og idrett for barn',
					'people'   => '25',
					'existing' => 'Kamp',
				),
			),
			$conflicts
		);
	}

	public function test_skips_bookings_on_closed_days() {
		global $wpdb;

		( new Creo_Rombooking_Seed( '2026-09-23' ) )->run();

		$bookings = Creo_Rombooking_Schema::table( 'bookings' );
		$rooms    = Creo_Rombooking_Schema::table( 'rooms' );

		// Gymsal is closed on Tuesday 6 October, and Kafé is closed on Mondays.
		// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$gym_on_closed_day = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $bookings b JOIN $rooms r ON r.id = b.room_id WHERE r.name = 'Gymsal' AND b.date = '2026-10-06'" );
		$kafe_on_monday    = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $bookings b JOIN $rooms r ON r.id = b.room_id WHERE r.name = 'Kafé' AND WEEKDAY(b.date) = 0" );
		// phpcs:enable

		$this->assertSame( 0, $gym_on_closed_day );
		$this->assertSame( 0, $kafe_on_monday );
	}
}
