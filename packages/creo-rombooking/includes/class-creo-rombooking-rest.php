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
