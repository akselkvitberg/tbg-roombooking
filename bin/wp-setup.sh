#!/usr/bin/env bash
#
# Sets up a development site: the creo theme in Norwegian, test users,
# a page with the room booking block, and example data.
#
# Runs in the wp-env `cli` container, and with `bin/php-server.sh`.
# Uses `$WP` as the WP-CLI command (default: `wp`).

set -euo pipefail

WP=${WP:-wp}

if [[ $($WP option get creo_rombooking_dev_setup 2>/dev/null) ]]; then
  $WP rewrite flush --hard
  exit 0
fi

$WP theme activate creo
$WP plugin activate creo-rombooking

$WP language core install nb_NO --activate || echo "Could not install nb_NO. Continuing in English."
$WP option update blogname "Menigheten"
$WP option update timezone_string "Europe/Oslo"
$WP option update date_format "j. F Y"
$WP option update time_format "H:i"
$WP option update start_of_week 1
$WP rewrite structure /%postname%/ --hard

# `bcc-login` creates this role. Without it, we create it so that test users
# can be members or not.
if ! $WP role exists bcc-login-member >/dev/null 2>&1; then
  $WP role create bcc-login-member Member --clone=subscriber
fi

create_user() {
  local login=$1 name=$2 role=$3 phone=${4:-}
  if ! $WP user get "$login" >/dev/null 2>&1; then
    $WP user create "$login" "$login@example.invalid" --role="$role" --display_name="$name" --user_pass=password
  fi
  if [[ -n "$phone" ]]; then
    # Simulates the phone number from the token (see creo_rombooking_dev_token_phone()).
    $WP user meta update "$login" creo_rombooking_dev_token_phone "$phone"
  fi
}

$WP user meta update admin creo_rombooking_dev_token_phone "+47 00 00 00 00"
create_user medlem "Test Medlem" bcc-login-member "+47 00 00 00 01"
create_user medlem-uten-tlf "Test Uten Telefon" bcc-login-member
create_user gjest "Test Gjest" subscriber

page_id=$($WP post list --post_type=page --name=rombooking --field=ID)
if [[ -z "$page_id" ]]; then
  $WP post create --post_type=page --post_status=publish --post_title="Rombooking" --post_name=rombooking \
    --post_content='<!-- wp:creo-rombooking/app {"align":"wide"} /-->'
fi

$WP creo-rombooking seed --reset

$WP option update creo_rombooking_dev_setup 1
