#!/usr/bin/env bash
#
# Runs WordPress with PHP's built-in server instead of wp-env, for
# environments where wp-env cannot build its Docker images (such as Claude
# Code sessions in the cloud). Needs PHP 8.2+, Composer dependencies and a
# MySQL server, for example:
#
#   docker run -d --name rb-mysql -e MYSQL_ROOT_PASSWORD=password -p 3306:3306 mysql:8
#   bin/php-server.sh            # http://localhost:8888, log in as admin/password
#   bin/php-server.sh --reset    # start over with a fresh database

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
wp_dir="${WP_DIR:-$root_dir/.tmp/wordpress}"
port="${PORT:-8888}"
db_host="${DB_HOST:-127.0.0.1}"
db_user="${DB_USER:-root}"
db_password="${DB_PASSWORD:-password}"
db_name="${DB_NAME:-rombooking}"

export WP="$root_dir/vendor/bin/wp --path=$wp_dir --allow-root"

# Runs SQL without needing the mysql client.
sql() {
  php -r '$db = new mysqli($argv[1], $argv[2], $argv[3]); $db->query($argv[4]) or exit(1);' \
    "$db_host" "$db_user" "$db_password" "$1"
}

if [[ "${1:-}" == "--reset" ]]; then
  pkill -f "php -S 0.0.0.0:$port" || true
  sql "DROP DATABASE IF EXISTS \`$db_name\`"
  rm -rf "$wp_dir"
fi

"$root_dir/bin/build-theme.sh"

if [[ ! -f "$wp_dir/wp-load.php" ]]; then
  mkdir -p "$wp_dir"
  $WP core download --locale=en_US
fi

if [[ ! -f "$wp_dir/wp-config.php" ]]; then
  $WP config create --dbhost="$db_host" --dbuser="$db_user" --dbpass="$db_password" --dbname="$db_name" \
    --extra-php <<'PHP'
define( 'WP_ENVIRONMENT_TYPE', 'local' );
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_LOG', true );
define( 'WP_DEBUG_DISPLAY', false );
PHP
fi

sql "CREATE DATABASE IF NOT EXISTS \`$db_name\`"

ln -sfn "$root_dir/vendor-theme/creo-wp/packages/creo" "$wp_dir/wp-content/themes/creo"
ln -sfn "$root_dir/packages/creo-rombooking" "$wp_dir/wp-content/plugins/creo-rombooking"

if ! $WP core is-installed 2>/dev/null; then
  $WP core install --url="http://localhost:$port" --title="Menigheten" \
    --admin_user=admin --admin_password=password --admin_email=admin@example.invalid --skip-email
fi

if ! curl --silent --head "http://localhost:$port" >/dev/null; then
  nohup php -S "0.0.0.0:$port" -t "$wp_dir" >"$root_dir/.tmp/php-server.log" 2>&1 &
fi

bash "$root_dir/bin/wp-setup.sh"

echo "WordPress runs at http://localhost:$port (admin/password, medlem/password)."
