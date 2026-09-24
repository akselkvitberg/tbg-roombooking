<?php

/**
 * Capability for administrators of room bookings.
 */
const CREO_ROMBOOKING_MANAGE = 'creo_rombooking_manage';

/**
 * Role that `bcc-login` gives to members.
 */
const CREO_ROMBOOKING_MEMBER_ROLE = 'bcc-login-member';

/**
 * Registers the script for a webpack entry.
 *
 * @param string $entry The name of the webpack entry.
 */
function creo_rombooking_register_entry( $entry ) {
	$script_url        = CREO_ROMBOOKING_URI . "/build/$entry.js";
	$script_asset_path = CREO_ROMBOOKING_PATH . "/build/$entry.asset.php";

	if ( file_exists( $script_asset_path ) ) {
		$script_asset = require $script_asset_path;
		wp_register_script(
			$entry,
			$script_url,
			$script_asset['dependencies'],
			$script_asset['version'],
			true
		);
		wp_set_script_translations( $entry, 'creo-rombooking', CREO_ROMBOOKING_PATH . '/languages' );
	}
}

/**
 * Whether the user can administer room bookings.
 *
 * @param int|null $user_id The user ID. Defaults to the current user.
 * @return bool
 */
function creo_rombooking_can_manage( $user_id = null ) {
	$user_id = $user_id ?? get_current_user_id();
	return $user_id > 0 && user_can( $user_id, CREO_ROMBOOKING_MANAGE );
}

/**
 * Whether the user is a member and can book rooms.
 *
 * Membership comes from the `bcc-login-member` role that `bcc-login` gives to
 * members. When that role does not exist (local development without
 * `bcc-login`), every logged-in user counts as a member.
 *
 * @param int|null $user_id The user ID. Defaults to the current user.
 * @return bool
 */
function creo_rombooking_is_member( $user_id = null ) {
	$user_id = $user_id ?? get_current_user_id();
	$user    = $user_id > 0 ? get_userdata( $user_id ) : false;

	if ( ! $user ) {
		return false;
	}

	if ( creo_rombooking_can_manage( $user_id ) ) {
		$is_member = true;
	} elseif ( get_role( CREO_ROMBOOKING_MEMBER_ROLE ) ) {
		$is_member = in_array( CREO_ROMBOOKING_MEMBER_ROLE, (array) $user->roles, true );
	} else {
		$is_member = true;
	}

	/**
	 * Filters whether a user is a member who can book rooms.
	 *
	 * @param bool    $is_member Whether the user is a member.
	 * @param WP_User $user      The user.
	 */
	return (bool) apply_filters( 'creo_rombooking_is_member', $is_member, $user );
}

/**
 * Whether the site runs in a local or development environment, where test
 * users and seed data are allowed.
 *
 * @return bool
 */
function creo_rombooking_is_dev() {
	return in_array( wp_get_environment_type(), array( 'local', 'development' ), true );
}

/**
 * Returns the user's mobile phone number and where it came from.
 *
 * The number is expected as a claim in the token from `bcc-login`. When the
 * token has no number, the member enters one when booking, and it is stored
 * in user meta.
 *
 * @param int|null $user_id The user ID. Defaults to the current user.
 * @return array{number: string|null, source: 'token'|'profile'|null}
 */
function creo_rombooking_get_phone( $user_id = null ) {
	$user_id = $user_id ?? get_current_user_id();

	/**
	 * Filters the phone number from the user's token.
	 *
	 * @param string|null $number  The phone number, or null when unknown.
	 * @param int         $user_id The user ID.
	 */
	$number = apply_filters( 'creo_rombooking_token_phone', null, $user_id );

	if ( ! empty( $number ) ) {
		return array(
			'number' => (string) $number,
			'source' => 'token',
		);
	}

	$number = get_user_meta( $user_id, 'creo_rombooking_phone', true );

	return array(
		'number' => $number ? (string) $number : null,
		'source' => $number ? 'profile' : null,
	);
}

/**
 * Today's date in the site's timezone (Y-m-d).
 *
 * @return string
 */
function creo_rombooking_today() {
	return wp_date( 'Y-m-d' );
}

/**
 * Runs a callback while holding a lock on each room, so that changes to the
 * same room happen one at a time and two people cannot get the same time.
 *
 * @param int[]    $room_ids The rooms.
 * @param callable $callback Returns the result.
 * @return mixed|WP_Error The callback's result, or an error when a room stays locked.
 */
function creo_rombooking_with_room_locks( array $room_ids, callable $callback ) {
	global $wpdb;

	$room_ids = array_unique( array_map( 'intval', $room_ids ) );
	// Always lock in the same order, so that two requests cannot wait for each other.
	sort( $room_ids );
	$held = array();

	try {
		foreach ( $room_ids as $room_id ) {
			$lock = 'creo_rombooking_room_' . $room_id;
			if ( ! $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 10)', $lock ) ) ) { // phpcs:ignore WordPress.DB.DirectDatabaseQuery
				return new WP_Error( 'creo_rombooking_busy', __( 'Many are booking right now. Try again.', 'creo-rombooking' ), array( 'status' => 503 ) );
			}
			$held[] = $lock;
		}

		return $callback();
	} finally {
		foreach ( $held as $lock ) {
			$wpdb->query( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		}
	}
}
