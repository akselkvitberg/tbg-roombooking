<?php

/**
 * REST API under `/wp-json/creo-rombooking/v1`.
 *
 * Requests are authenticated with the logged-in user's cookie and the
 * `wp_rest` nonce (the `X-WP-Nonce` header).
 */
class Creo_Rombooking_REST {

	const NAMESPACE = 'creo-rombooking/v1';

	/**
	 * The longest date range that can be requested at once.
	 */
	const MAX_DAYS = 14;

	public function __construct() {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	public function register_routes() {
		$range_args = array(
			'from'  => array(
				'description'       => 'The first date (Y-m-d).',
				'type'              => 'string',
				'required'          => true,
				'validate_callback' => array( $this, 'validate_date' ),
			),
			'to'    => array(
				'description'       => 'The last date (Y-m-d), inclusive.',
				'type'              => 'string',
				'required'          => true,
				'validate_callback' => array( $this, 'validate_date' ),
			),
			'rooms' => array(
				'description' => 'Only these room IDs.',
				'type'        => 'array',
				'items'       => array( 'type' => 'integer' ),
			),
		);

		register_rest_route(
			self::NAMESPACE,
			'/rooms',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_rooms' ),
				'permission_callback' => array( $this, 'can_book' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/availability',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_availability' ),
				'permission_callback' => array( $this, 'can_book' ),
				'args'                => $range_args,
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/bookings/preview',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'preview_booking' ),
				'permission_callback' => array( $this, 'can_book' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/bookings',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'create_booking' ),
				'permission_callback' => array( $this, 'can_book' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/me/bookings',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => fn() => rest_ensure_response( ( new Creo_Rombooking_Mine( get_current_user_id() ) )->get_bookings() ),
				'permission_callback' => array( $this, 'can_book' ),
			)
		);

		$member_actions = array(
			'/me/bookings/(?P<id>\d+)/cancel'   => fn( $mine, $id, $params ) => $mine->cancel( $id, $params ),
			'/me/proposals/(?P<id>\d+)/accept'  => fn( $mine, $id ) => $mine->accept( $id ),
			'/me/proposals/(?P<id>\d+)/decline' => fn( $mine, $id ) => $mine->decline( $id ),
		);
		foreach ( $member_actions as $route => $handler ) {
			register_rest_route(
				self::NAMESPACE,
				$route,
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => function ( WP_REST_Request $request ) use ( $handler ) {
						$result = $handler( new Creo_Rombooking_Mine( get_current_user_id() ), (int) $request['id'], $request->get_params() );
						return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
					},
					'permission_callback' => array( $this, 'can_book' ),
				)
			);
		}

		register_rest_route(
			self::NAMESPACE,
			'/admin/requests',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => fn() => rest_ensure_response( ( new Creo_Rombooking_Admin() )->get_requests() ),
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/check',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'admin_check' ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => array(
					'roomId' => array(
						'type'     => 'integer',
						'required' => true,
					),
					'date'   => array(
						'type'              => 'string',
						'required'          => true,
						'validate_callback' => array( $this, 'validate_date' ),
					),
					'start'  => array(
						'type'     => 'integer',
						'required' => true,
					),
					'end'    => array(
						'type'     => 'integer',
						'required' => true,
					),
					'ignore' => array(
						'type'  => 'array',
						'items' => array( 'type' => 'integer' ),
					),
				),
			)
		);

		// Actions on a request: approve, reject, propose, move-existing, approve-and-cancel-existing.
		$request_actions = array(
			'approve'                     => fn( $admin, $id ) => $admin->approve( $id ),
			'reject'                      => fn( $admin, $id, $params ) => $admin->reject( $id, $params ),
			'propose'                     => fn( $admin, $id, $params ) => $admin->propose( $id, $params ),
			'move-existing'               => fn( $admin, $id, $params ) => $admin->move_existing( $id, $params ),
			'approve-and-cancel-existing' => fn( $admin, $id, $params ) => $admin->approve_and_cancel_existing( $id, $params ),
		);
		foreach ( $request_actions as $action => $handler ) {
			$this->register_action( '/admin/requests/(?P<id>\d+)/' . $action, $handler );
		}

		$this->register_action( '/admin/series/(?P<id>\d+)/approve-free', fn( $admin, $id ) => $admin->approve_free( $id ) );
		$this->register_action( '/admin/series/(?P<id>\d+)/reject-rest', fn( $admin, $id, $params ) => $admin->reject_rest( $id, $params ) );
		$this->register_action( '/admin/bookings/(?P<id>\d+)/cancel', fn( $admin, $id, $params ) => $admin->cancel_booking( $id, $params ) );
		$this->register_action( '/admin/bookings/(?P<id>\d+)/move', fn( $admin, $id, $params ) => $admin->move_booking( $id, $params ) );

		register_rest_route(
			self::NAMESPACE,
			'/admin/sms-log',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => fn( WP_REST_Request $request ) => rest_ensure_response( ( new Creo_Rombooking_Admin() )->sms_log( $request['page'] ) ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => array(
					'page' => array(
						'type'    => 'integer',
						'default' => 1,
						'minimum' => 1,
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/admin/availability',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'get_admin_availability' ),
				'permission_callback' => array( $this, 'can_manage' ),
				'args'                => $range_args,
			)
		);
	}

	/**
	 * Registers a POST route for an administrator's action on a booking or series.
	 *
	 * @param string   $route   The route, with an `id` parameter.
	 * @param callable $handler Gets the admin service, the ID and the parameters; returns the result or an error.
	 */
	protected function register_action( $route, callable $handler ) {
		register_rest_route(
			self::NAMESPACE,
			$route,
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => function ( WP_REST_Request $request ) use ( $handler ) {
					$result = $handler( new Creo_Rombooking_Admin(), (int) $request['id'], $request->get_params() );
					return is_wp_error( $result ) ? $result : rest_ensure_response( $result );
				},
				'permission_callback' => array( $this, 'can_manage' ),
			)
		);
	}

	/**
	 * GET /admin/check: whether a room is free at a time, for proposals and moves.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response
	 */
	public function admin_check( WP_REST_Request $request ) {
		$status = ( new Creo_Rombooking_Admin() )->check(
			(int) $request['roomId'],
			$request['date'],
			(int) $request['start'],
			(int) $request['end'],
			(array) ( $request['ignore'] ?? array() )
		);

		return rest_ensure_response( array( 'status' => $status ) );
	}

	/**
	 * Members (and administrators) can book.
	 *
	 * @return true|WP_Error
	 */
	public function can_book() {
		if ( creo_rombooking_is_member() ) {
			return true;
		}
		return $this->forbidden( __( 'Room booking is only available to members.', 'creo-rombooking' ) );
	}

	/**
	 * @return true|WP_Error
	 */
	public function can_manage() {
		if ( creo_rombooking_can_manage() ) {
			return true;
		}
		return $this->forbidden( __( 'Only administrators can do this.', 'creo-rombooking' ) );
	}

	/**
	 * @param string $message The error message.
	 * @return WP_Error 401 when logged out, otherwise 403.
	 */
	protected function forbidden( $message ) {
		if ( ! is_user_logged_in() ) {
			$message = __( 'You must be logged in to book rooms.', 'creo-rombooking' );
		}
		return new WP_Error( 'creo_rombooking_forbidden', $message, array( 'status' => rest_authorization_required_code() ) );
	}

	/**
	 * @param mixed $value The parameter value.
	 * @return true|WP_Error
	 */
	public function validate_date( $value ) {
		if ( Creo_Rombooking_Availability::is_date( $value ) ) {
			return true;
		}
		return new WP_Error( 'rest_invalid_param', __( 'The date must be in the format YYYY-MM-DD.', 'creo-rombooking' ) );
	}

	/**
	 * GET /rooms: the active rooms, without the room instructions.
	 *
	 * @return WP_REST_Response
	 */
	public function get_rooms() {
		$availability = new Creo_Rombooking_Availability( get_current_user_id() );

		$rooms = array_map(
			function ( $room ) {
				return array(
					'id'          => $room['id'],
					'name'        => $room['name'],
					'description' => $room['description'],
					'capacity'    => $room['capacity'],
					'approval'    => $room['approval'],
					'imageUrl'    => $room['imageId'] ? wp_get_attachment_image_url( $room['imageId'], 'medium' ) : null,
				);
			},
			$availability->get_rooms()
		);

		return rest_ensure_response( $rooms );
	}

	/**
	 * GET /availability: statuses without names or purposes of other people's bookings.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_availability( WP_REST_Request $request ) {
		return $this->availability_response( $request, false );
	}

	/**
	 * GET /admin/availability: statuses with names and purposes.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_admin_availability( WP_REST_Request $request ) {
		return $this->availability_response( $request, true );
	}

	/**
	 * POST /bookings/preview: checks each date of the booking form while the
	 * member fills it in. Incomplete forms are not an error here; the
	 * response lists what to correct.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response
	 */
	public function preview_booking( WP_REST_Request $request ) {
		$bookings  = new Creo_Rombooking_Bookings();
		$validated = $bookings->validate( $request->get_params(), get_current_user_id(), false );

		if ( $validated['errors'] ) {
			return rest_ensure_response(
				array(
					'approval'    => $validated['data']['room']['approval'] ?? null,
					'occurrences' => array(),
					'counts'      => null,
					'errors'      => $validated['errors'],
				)
			);
		}

		$preview = $bookings->preview( $validated['data'] );

		// Which booking a date conflicts with is not for members to know.
		$preview['occurrences'] = array_map(
			fn( $occurrence ) => array(
				'date'   => $occurrence['date'],
				'status' => $occurrence['status'],
			),
			$preview['occurrences']
		);

		return rest_ensure_response( $preview );
	}

	/**
	 * POST /bookings: creates a booking or a series.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_booking( WP_REST_Request $request ) {
		$result = ( new Creo_Rombooking_Bookings() )->create( $request->get_params(), get_current_user_id() );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$response = rest_ensure_response( $result );
		$response->set_status( 201 );
		return $response;
	}

	/**
	 * @param WP_REST_Request $request      The request.
	 * @param bool            $with_details Whether to include names and purposes.
	 * @return WP_REST_Response|WP_Error
	 */
	protected function availability_response( WP_REST_Request $request, $with_details ) {
		$from = $request['from'];
		$to   = $request['to'];
		$days = ( new DateTimeImmutable( $from ) )->diff( new DateTimeImmutable( $to ) );

		if ( $days->invert ) {
			return new WP_Error( 'rest_invalid_param', __( 'The last date must be on or after the first date.', 'creo-rombooking' ), array( 'status' => 400 ) );
		}

		if ( $days->days >= self::MAX_DAYS ) {
			return new WP_Error(
				'rest_invalid_param',
				/* translators: %d: number of days */
				sprintf( __( 'You can get at most %d days at a time.', 'creo-rombooking' ), self::MAX_DAYS ),
				array( 'status' => 400 )
			);
		}

		$availability = new Creo_Rombooking_Availability( get_current_user_id(), $with_details );
		$now          = current_datetime();

		return rest_ensure_response(
			array(
				'from' => $from,
				'to'   => $to,
				'now'  => array(
					'date'   => $now->format( 'Y-m-d' ),
					'minute' => (int) $now->format( 'G' ) * 60 + (int) $now->format( 'i' ),
				),
				'day'  => array(
					'start' => Creo_Rombooking_Availability::DAY_START,
					'end'   => Creo_Rombooking_Availability::DAY_END,
					'slot'  => Creo_Rombooking_Availability::SLOT,
				),
				'days' => $availability->get_days( $from, $to, $request['rooms'] ),
			)
		);
	}
}
