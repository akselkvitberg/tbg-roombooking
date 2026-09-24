<?php

/**
 * Sends text messages about bookings and logs them.
 *
 * The plugin does not send text messages itself. Every message is stored in
 * the events table (see `wp creo-rombooking sms-log`), and a provider can
 * send it through the `creo_rombooking_send_sms` filter.
 */
class Creo_Rombooking_Notifier {

	/**
	 * @param int      $user_id    The recipient.
	 * @param string   $text       The message.
	 * @param int|null $booking_id The booking the message is about.
	 * @return bool Whether a provider sent the message.
	 */
	public static function sms( $user_id, $text, $booking_id = null ) {
		global $wpdb;

		$phone = creo_rombooking_get_phone( $user_id )['number'];

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Creo_Rombooking_Schema::table( 'events' ),
			array(
				'booking_id' => $booking_id,
				'actor_id'   => get_current_user_id(),
				'action'     => 'sms',
				'sms_to'     => $user_id,
				'sms_text'   => $text,
				'created_at' => current_time( 'mysql' ),
			)
		);

		/**
		 * Sends a text message. Return true when it was sent.
		 *
		 * @param bool        $sent    Whether the message was sent.
		 * @param string|null $phone   The recipient's phone number.
		 * @param string      $text    The message.
		 * @param int         $user_id The recipient.
		 */
		return (bool) apply_filters( 'creo_rombooking_send_sms', false, $phone, $text, $user_id );
	}

	/**
	 * Logs something that happened to a booking.
	 *
	 * @param int    $booking_id The booking.
	 * @param string $action     E.g. `created`.
	 * @param string $reason     An optional reason.
	 */
	public static function log( $booking_id, $action, $reason = '' ) {
		global $wpdb;

		$wpdb->insert( // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
			Creo_Rombooking_Schema::table( 'events' ),
			array(
				'booking_id' => $booking_id,
				'actor_id'   => get_current_user_id(),
				'action'     => $action,
				'reason'     => $reason,
				'created_at' => current_time( 'mysql' ),
			)
		);
	}
}
