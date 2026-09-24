<?php

/**
 * Seeds example data from the prototype: rooms, opening hours, closures,
 * recurring bookings, requests and conflicts.
 *
 * All names are made up. Dates are relative to the Monday of the current
 * week, so weekdays (and therefore conflicts) match the prototype, which was
 * drawn for the week starting Monday 21 September 2026.
 */
class Creo_Rombooking_Seed {

	/**
	 * The Monday the prototype's dates are relative to.
	 */
	const PROTOTYPE_MONDAY = '2026-09-21';

	/**
	 * Login of the test member whose bookings show as «Din booking».
	 */
	const MEMBER_LOGIN = 'medlem';

	/**
	 * Monday of the current week (Y-m-d).
	 *
	 * @var string
	 */
	protected $monday;

	/**
	 * Room IDs by prototype key.
	 *
	 * @var array<string, int>
	 */
	protected $rooms = array();

	/**
	 * Owner user IDs by display name.
	 *
	 * @var array<string, int>
	 */
	protected $owners = array();

	/**
	 * @param string|null $today Today's date (Y-m-d). Defaults to today in the site's timezone.
	 */
	public function __construct( $today = null ) {
		$today        = new DateTimeImmutable( $today ?? creo_rombooking_today() );
		$this->monday = $today->modify( '-' . ( (int) $today->format( 'N' ) - 1 ) . ' days' )->format( 'Y-m-d' );
	}

	/**
	 * Converts `HH:MM` to minutes after midnight.
	 *
	 * @param string $time The time.
	 * @return int
	 */
	public static function minutes( $time ) {
		list( $hours, $minutes ) = array_map( 'intval', explode( ':', $time ) );
		return $hours * 60 + $minutes;
	}

	/**
	 * Maps a date in the prototype to the same weekday relative to the current week.
	 *
	 * @param string $prototype_date A date in the prototype (Y-m-d).
	 * @return string
	 */
	public function date( $prototype_date ) {
		$offset = ( new DateTimeImmutable( self::PROTOTYPE_MONDAY ) )->diff( new DateTimeImmutable( $prototype_date ) );
		$days   = (int) $offset->format( '%r%a' );
		return ( new DateTimeImmutable( $this->monday ) )->modify( "$days days" )->format( 'Y-m-d' );
	}

	/**
	 * Inserts all example data. Expects empty tables.
	 *
	 * @return array<string, int> The number of rows created per type.
	 */
	public function run() {
		$this->seed_rooms();
		$this->seed_closures();
		$series   = $this->seed_weekly_bookings();
		$bookings = $this->seed_single_bookings();
		$requests = $this->seed_requests();

		return array(
			'rooms'    => count( $this->rooms ),
			'series'   => $series,
			'bookings' => $bookings,
			'requests' => $requests,
		);
	}

	/**
	 * Rooms and their weekly opening hours.
	 */
	protected function seed_rooms() {
		global $wpdb;

		$rooms = array(
			'storsal' => array( 'Storsalen', 250, 'manual', 'Salen med scene og lydanlegg.' ),
			'kafe'    => array( 'Kafé', 60, 'auto', 'Kafé med kjøkken.' ),
			'm1'      => array( 'Møterom 1', 12, 'auto', 'Møterom med skjerm.' ),
			'm2'      => array( 'Møterom 2', 8, 'auto', 'Lite møterom.' ),
			'barn'    => array( 'Barnerom', 20, 'auto', 'Lekerom for barn.' ),
			'gym'     => array( 'Gymsal', 80, 'manual', 'Gymsal med garderober.' ),
		);

		$order = 0;
		foreach ( $rooms as $key => list( $name, $capacity, $approval, $description ) ) {
			$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
				Creo_Rombooking_Schema::table( 'rooms' ),
				array(
					'name'         => $name,
					'description'  => $description,
					'capacity'     => $capacity,
					'approval'     => $approval,
					'instructions' => '',
					'active'       => 1,
					'sort_order'   => $order++,
				)
			);
			$this->rooms[ $key ] = (int) $wpdb->insert_id;

			// 0 = Sunday, as in PHP's `w` format.
			for ( $weekday = 0; $weekday <= 6; $weekday++ ) {
				$hours = $this->opening_hours( $key, $weekday );
				if ( $hours ) {
					$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
						Creo_Rombooking_Schema::table( 'opening_hours' ),
						array(
							'room_id'   => $this->rooms[ $key ],
							'weekday'   => $weekday,
							'start_min' => self::minutes( $hours[0] ),
							'end_min'   => self::minutes( $hours[1] ),
						)
					);
				}
			}
		}
	}

	/**
	 * Opening hours from the prototype.
	 *
	 * @param string $room    The prototype room key.
	 * @param int    $weekday 0 (Sunday) to 6 (Saturday).
	 * @return array{0: string, 1: string}|null
	 */
	protected function opening_hours( $room, $weekday ) {
		if ( $room === 'kafe' && $weekday === 1 ) {
			return null;
		}
		if ( $room === 'barn' ) {
			return array( '08:00', '20:00' );
		}
		if ( $room === 'gym' && $weekday >= 1 && $weekday <= 5 ) {
			return array( '15:00', '22:00' );
		}
		return array( '08:00', '22:00' );
	}

	/**
	 * Closed and blocked periods.
	 */
	protected function seed_closures() {
		global $wpdb;

		$closures = array(
			array( 'gym', '2026-10-06', null, null, 'closed', 'Vedlikehold' ),
			array( 'storsal', '2026-09-25', '08:00', '12:00', 'blocked', 'Rengjøring' ),
		);

		foreach ( $closures as list( $room, $date, $from, $to, $type, $reason ) ) {
			$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
				Creo_Rombooking_Schema::table( 'closures' ),
				array(
					'room_id'   => $this->rooms[ $room ],
					'date'      => $this->date( $date ),
					'start_min' => $from ? self::minutes( $from ) : null,
					'end_min'   => $to ? self::minutes( $to ) : null,
					'type'      => $type,
					'reason'    => $reason,
				)
			);
		}
	}

	/**
	 * Recurring weekly bookings, from seven weeks back to twelve weeks ahead.
	 *
	 * @return int The number of series created.
	 */
	protected function seed_weekly_bookings() {
		// Room, weekday (0 = Sunday), from, to, owner, purpose, people. `null` owner = the test member.
		$weekly = array(
			array( 'storsal', 0, '10:00', '13:00', 'Stabsteamet', 'Søndagssamling', 180 ),
			array( 'storsal', 3, '18:00', '21:00', 'Kor A', 'Korøving', 35 ),
			array( 'storsal', 6, '11:00', '15:00', 'Tone Eksempel', 'Bursdagsfeiring', 40 ),
			array( 'kafe', 0, '13:00', '14:30', 'Kaféteamet', 'Kirkekaffe', 50 ),
			array( 'kafe', 2, '10:00', '12:00', 'Seniortreffet', 'Formiddagstreff', 25 ),
			array( 'kafe', 3, '17:30', '19:00', null, 'Middag for frivillige', 30 ),
			array( 'kafe', 5, '19:00', '22:00', 'Ungdomsgruppa', 'Fredagskafé', 40 ),
			array( 'm1', 1, '09:00', '10:00', 'Per Demodal', 'Ukentlig arbeidsmøte', 5 ),
			array( 'm1', 2, '09:00', '10:00', 'Per Demodal', 'Ukentlig arbeidsmøte', 5 ),
			array( 'm1', 3, '09:00', '10:00', 'Per Demodal', 'Ukentlig arbeidsmøte', 5 ),
			array( 'm1', 4, '09:00', '10:00', 'Per Demodal', 'Ukentlig arbeidsmøte', 5 ),
			array( 'm1', 5, '09:00', '10:00', 'Per Demodal', 'Ukentlig arbeidsmøte', 5 ),
			array( 'm1', 4, '17:00', '18:30', null, 'Planlegging av basar', 6 ),
			array( 'm2', 1, '18:00', '20:00', 'Samtalegruppa', 'Samtalegruppe', 7 ),
			array( 'm2', 3, '10:00', '11:30', 'Babysang', 'Babysang', 8 ),
			array( 'm2', 3, '19:00', '21:00', 'Kari Prøvesen', 'Styremøte', 7 ),
			array( 'barn', 0, '10:00', '13:00', 'Barneteamet', 'Søndagsskole', 15 ),
			array( 'barn', 3, '17:00', '18:30', 'Barnekoret', 'Barnekorøving', 18 ),
			array( 'gym', 2, '18:00', '20:00', 'Innebandygruppa', 'Innebandy', 20 ),
			array( 'gym', 3, '16:00', '17:30', 'Turngruppa', 'Turn for barn', 25 ),
			array( 'gym', 6, '10:00', '13:00', 'Idrettslaget', 'Trening', 30 ),
		);

		$weeks_back  = 7;
		$occurrences = 20;

		foreach ( $weekly as list( $room, $weekday, $from, $to, $owner, $purpose, $people ) ) {
			// Monday is day 0 of the week here; Sunday is the last day.
			$day_of_week = ( $weekday + 6 ) % 7;
			$first       = ( new DateTimeImmutable( $this->monday ) )->modify( ( $day_of_week - 7 * $weeks_back ) . ' days' );
			$user_id     = $this->owner( $owner );
			$series_id   = $this->insert_series( $user_id, $room, 'weekly', $first->format( 'Y-m-d' ), $occurrences );

			for ( $i = 0; $i < $occurrences; $i++ ) {
				$date = $first->modify( ( 7 * $i ) . ' days' )->format( 'Y-m-d' );
				if ( $this->is_closed( $room, $date ) ) {
					continue;
				}
				$this->insert_booking( $user_id, $room, $date, $from, $to, $purpose, $people, 'approved', $series_id );
			}
		}

		return count( $weekly );
	}

	/**
	 * Single approved bookings and pending requests without conflicts.
	 *
	 * @return int The number of bookings created.
	 */
	protected function seed_single_bookings() {
		$bookings = array(
			array( 'm1', '2026-09-23', '12:00', '13:30', 'Mari Testrud', 'Styremøte', 7, 'requested' ),
			array( 'gym', '2026-09-23', '19:00', '21:00', 'Jonas Prøvesen', 'Volleyball', 14, 'requested' ),
			array( 'storsal', '2026-10-02', '18:00', '21:00', 'Lars Eksempelsen', 'Foredragskveld', 120, 'requested' ),
			array( 'gym', '2026-10-13', '15:30', '17:00', 'Nærskolen', 'Ekstra kroppsøving', 28, 'approved' ),
			array( 'gym', '2026-11-03', '16:00', '18:00', 'Idrettslaget', 'Kamp', 40, 'approved' ),
		);

		foreach ( $bookings as list( $room, $date, $from, $to, $owner, $purpose, $people, $status ) ) {
			$id = $this->insert_booking( $this->owner( $owner ), $room, $this->date( $date ), $from, $to, $purpose, $people, $status );
			// Requests were sent some days ago, so that the oldest is handled first.
			$this->sent_ago( 'bookings', $id, $status === 'requested' ? 90 : 300 );
		}

		return count( $bookings );
	}

	/**
	 * Requests that conflict with existing bookings, and a recurring request.
	 *
	 * @return int The number of requests created.
	 */
	protected function seed_requests() {
		$count = 0;

		// Conflicts with the Saturday birthday party in Storsalen.
		$id = $this->insert_booking( $this->owner( 'Jonas Prøvesen' ), 'storsal', $this->date( '2026-09-26' ), '11:00', '15:00', 'Konsertøving for koret', 50, 'requested', null, true );
		$this->sent_ago( 'bookings', $id, 46 );
		++$count;

		// Conflicts with the weekly work meeting in Møterom 1.
		$id = $this->insert_booking( $this->owner( 'Mari Testrud' ), 'm1', $this->date( '2026-10-01' ), '09:00', '10:30', 'Planleggingsmøte for basaren', 6, 'requested', null, true );
		$this->sent_ago( 'bookings', $id, 20 );
		++$count;

		// Eight Tuesdays in Gymsal: one falls on a closed day and one conflicts.
		$user_id   = $this->owner( 'Eva Prøvesen' );
		$first     = new DateTimeImmutable( $this->date( '2026-09-29' ) );
		$series_id = $this->insert_series( $user_id, 'gym', 'weekly', $first->format( 'Y-m-d' ), 8 );

		for ( $i = 0; $i < 8; $i++ ) {
			$date = $first->modify( ( 7 * $i ) . ' days' )->format( 'Y-m-d' );
			if ( $this->is_closed( 'gym', $date ) ) {
				continue;
			}
			$id = $this->insert_booking( $user_id, 'gym', $date, '16:00', '17:30', 'Lek og idrett for barn', 25, 'requested', $series_id, true );
			$this->sent_ago( 'bookings', $id, 64 );
			++$count;
		}
		$this->sent_ago( 'series', $series_id, 64 );

		return $count;
	}

	/**
	 * Whether a room is closed the whole day.
	 *
	 * @param string $room The prototype room key.
	 * @param string $date The date (Y-m-d).
	 * @return bool
	 */
	protected function is_closed( $room, $date ) {
		global $wpdb;

		$weekday = (int) ( new DateTimeImmutable( $date ) )->format( 'w' );
		if ( ! $this->opening_hours( $room, $weekday ) ) {
			return true;
		}

		$table = Creo_Rombooking_Schema::table( 'closures' );
		return (bool) $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->prepare(
				"SELECT COUNT(*) FROM $table WHERE room_id = %d AND date = %s AND start_min IS NULL", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				$this->rooms[ $room ],
				$date
			)
		);
	}

	/**
	 * @param int    $user_id     The owner.
	 * @param string $room        The prototype room key.
	 * @param string $rule        `weekly`, `biweekly` or `monthly`.
	 * @param string $start_date  The first date (Y-m-d).
	 * @param int    $occurrences The number of occurrences.
	 * @return int The series ID.
	 */
	protected function insert_series( $user_id, $room, $rule, $start_date, $occurrences ) {
		global $wpdb;

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Creo_Rombooking_Schema::table( 'series' ),
			array(
				'user_id'     => $user_id,
				'room_id'     => $this->rooms[ $room ],
				'rule'        => $rule,
				'start_date'  => $start_date,
				'occurrences' => $occurrences,
				'created_at'  => current_time( 'mysql' ),
			)
		);

		return (int) $wpdb->insert_id;
	}

	/**
	 * @param int      $user_id        The owner.
	 * @param string   $room           The prototype room key.
	 * @param string   $date           The date (Y-m-d).
	 * @param string   $from           Start time (HH:MM).
	 * @param string   $to             End time (HH:MM).
	 * @param string   $purpose        The purpose.
	 * @param int      $people         The number of people.
	 * @param string   $status         `requested` or `approved`.
	 * @param int|null $series_id      The series, if any.
	 * @param bool     $check_conflict Whether to link the booking to an approved booking it overlaps.
	 * @return int The booking ID.
	 */
	protected function insert_booking( $user_id, $room, $date, $from, $to, $purpose, $people, $status, $series_id = null, $check_conflict = false ) {
		global $wpdb;

		$table     = Creo_Rombooking_Schema::table( 'bookings' );
		$start_min = self::minutes( $from );
		$end_min   = self::minutes( $to );
		$conflict  = null;

		if ( $check_conflict ) {
			$conflict = $wpdb->get_var( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
				$wpdb->prepare(
					"SELECT id FROM $table WHERE room_id = %d AND date = %s AND status = 'approved' AND start_min < %d AND end_min > %d ORDER BY start_min LIMIT 1", // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					$this->rooms[ $room ],
					$date,
					$end_min,
					$start_min
				)
			);
		}

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			$table,
			array(
				'series_id'     => $series_id,
				'room_id'       => $this->rooms[ $room ],
				'user_id'       => $user_id,
				'date'          => $date,
				'start_min'     => $start_min,
				'end_min'       => $end_min,
				'purpose'       => $purpose,
				'people'        => $people,
				'status'        => $status,
				'conflict_with' => $conflict ? (int) $conflict : null,
				'created_at'    => current_time( 'mysql' ),
			)
		);

		return (int) $wpdb->insert_id;
	}

	/**
	 * Moves the time a row was created back.
	 *
	 * @param string $table The table: `bookings` or `series`.
	 * @param int    $id    The row.
	 * @param int    $hours Hours back.
	 */
	protected function sent_ago( $table, $id, $hours ) {
		global $wpdb;

		$wpdb->update( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			Creo_Rombooking_Schema::table( $table ),
			array( 'created_at' => current_datetime()->modify( "-$hours hours" )->format( 'Y-m-d H:i:s' ) ),
			array( 'id' => $id )
		);
	}

	/**
	 * Returns the user ID for a made-up owner, creating the user if needed.
	 *
	 * @param string|null $name The display name, or null for the test member.
	 * @return int
	 */
	protected function owner( $name ) {
		if ( $name === null ) {
			$user = get_user_by( 'login', self::MEMBER_LOGIN );
			if ( $user ) {
				return $user->ID;
			}
			$name = 'Test Medlem';
		}

		if ( isset( $this->owners[ $name ] ) ) {
			return $this->owners[ $name ];
		}

		$login = 'rb-' . sanitize_title( $name );
		$user  = get_user_by( 'login', $login );

		if ( $user ) {
			$user_id = $user->ID;
		} else {
			$user_id = wp_insert_user(
				array(
					'user_login'   => $login,
					'user_email'   => "$login@example.invalid",
					'user_pass'    => wp_generate_password( 24 ),
					'display_name' => $name,
					'role'         => get_role( CREO_ROMBOOKING_MEMBER_ROLE ) ? CREO_ROMBOOKING_MEMBER_ROLE : 'subscriber',
				)
			);
			if ( is_wp_error( $user_id ) ) {
				throw new RuntimeException( esc_html( $user_id->get_error_message() ) );
			}
		}

		$this->owners[ $name ] = $user_id;
		return $user_id;
	}

	/**
	 * Deletes all booking data, the made-up owners and saved phone numbers.
	 */
	public static function reset() {
		require_once ABSPATH . 'wp-admin/includes/user.php';

		$owners = get_users(
			array(
				'search'         => 'rb-*',
				'search_columns' => array( 'user_login' ),
			)
		);

		foreach ( $owners as $user ) {
			wp_delete_user( $user->ID );
		}

		// Forget phone numbers entered when booking, so that test users start over.
		delete_metadata( 'user', 0, 'creo_rombooking_phone', '', true );

		Creo_Rombooking_Schema::uninstall();
		Creo_Rombooking_Schema::install();
	}
}
