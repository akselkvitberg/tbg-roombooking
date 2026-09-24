<?php

class Creo_Rombooking_Schema_Test extends WP_UnitTestCase {

	public function test_creates_all_tables() {
		global $wpdb;

		foreach ( Creo_Rombooking_Schema::TABLES as $name ) {
			$table = Creo_Rombooking_Schema::table( $name );
			$this->assertSame( $table, $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ), "Missing table $table" );
		}
	}

	public function test_stores_schema_version() {
		$this->assertSame( Creo_Rombooking_Schema::VERSION, (int) get_option( Creo_Rombooking_Schema::OPTION ) );
	}

	public function test_gives_administrators_the_manage_capability() {
		$this->assertTrue( get_role( 'administrator' )->has_cap( CREO_ROMBOOKING_MANAGE ) );
		$this->assertTrue( get_role( 'creo_rombooking_admin' )->has_cap( CREO_ROMBOOKING_MANAGE ) );
	}
}
