<?php

function creo_rombooking_update_check( $transient ) {
	if ( ! is_object( $transient ) ) {
		return $transient;
	}

	$base_url = 'https://creo-wp.creoweb.no';

	$remote = wp_remote_get(
		"$base_url/creo-rombooking.json",
		array(
			'timeout' => 10,
			'headers' => array(
				'Accept' => 'application/json',
			),
		)
	);

	if (
		is_wp_error( $remote ) ||
		wp_remote_retrieve_response_code( $remote ) !== 200
	) {
		return $transient;
	}

	$plugin_data = get_plugin_data( CREO_ROMBOOKING_FILE );
	$data        = json_decode( wp_remote_retrieve_body( $remote ), true );
	$version     = $plugin_data['Version'];
	$new_version = $data['version'] ?? $version;
	$filename    = $data['filename'] ?? '';

	$update_data = array(
		'slug'           => CREO_ROMBOOKING_BASENAME,
		'new_version'    => $version,
		'url'            => $base_url,
		'package'        => "$base_url/creo-rombooking-$version.zip",
		'tested'         => $data['tested'] ?? null,
		'requires'       => $data['requires'] ?? null,
		'requires_php'   => $data['requires_php'] ?? null,
		'upgrade_notice' => '',
		'icons'          => array(),
	);

	if ( version_compare( $version, $new_version, '<' ) ) {
		$update_data['new_version']                      = $new_version;
		$update_data['package']                          = "$base_url/$filename";
		$transient->response[ CREO_ROMBOOKING_BASENAME ] = (object) $update_data;
	} else {
		$transient->no_update[ CREO_ROMBOOKING_BASENAME ] = (object) $update_data;
	}

	return $transient;
}
add_filter( 'pre_set_site_transient_update_plugins', 'creo_rombooking_update_check' );
add_filter( 'pre_set_transient_update_plugins', 'creo_rombooking_update_check' );
