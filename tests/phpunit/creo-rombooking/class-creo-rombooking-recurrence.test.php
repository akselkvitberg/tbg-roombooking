<?php

class Creo_Rombooking_Recurrence_Test extends WP_UnitTestCase {

	public function test_single_date() {
		$this->assertSame( array( '2026-10-01' ), Creo_Rombooking_Recurrence::dates( '2026-10-01', 'none', 5 ) );
	}

	public function test_weekly_by_count() {
		$this->assertSame(
			array( '2026-10-01', '2026-10-08', '2026-10-15' ),
			Creo_Rombooking_Recurrence::dates( '2026-10-01', 'weekly', 3 )
		);
	}

	public function test_every_other_week_until_a_date() {
		$this->assertSame(
			array( '2026-10-01', '2026-10-15', '2026-10-29' ),
			Creo_Rombooking_Recurrence::dates( '2026-10-01', 'biweekly', null, '2026-11-11' )
		);
	}

	public function test_the_end_date_is_included() {
		$this->assertSame(
			array( '2026-10-01', '2026-10-08' ),
			Creo_Rombooking_Recurrence::dates( '2026-10-01', 'weekly', null, '2026-10-08' )
		);
	}

	public function test_monthly_skips_months_without_the_day() {
		$this->assertSame(
			array( '2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31' ),
			Creo_Rombooking_Recurrence::dates( '2026-01-31', 'monthly', 4 )
		);
		$this->assertSame(
			array( '2026-11-15', '2026-12-15', '2027-01-15' ),
			Creo_Rombooking_Recurrence::dates( '2026-11-15', 'monthly', 3 )
		);
	}

	public function test_at_most_26_occurrences() {
		$this->assertCount( 26, Creo_Rombooking_Recurrence::dates( '2026-10-01', 'weekly', 100 ) );
		$this->assertCount( 26, Creo_Rombooking_Recurrence::dates( '2026-10-01', 'weekly', null, '2028-01-01' ) );
	}
}
