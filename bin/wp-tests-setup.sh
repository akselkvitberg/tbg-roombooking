#!/usr/bin/env bash

db_host=${WORDPRESS_DB_HOST:-tests-mysql}
db_user=${WORDPRESS_DB_USER:-root}
db_pass=${WORDPRESS_DB_PASSWORD:-password}

# Create a separate database for PHPUnit to avoid
# mutating the test website at http://localhost:8889.
if ! mysql --host="$db_host" --user="$db_user" --password="$db_pass" -e "use tests-phpunit"; then
  mysqladmin create tests-phpunit --host="$db_host" --user="$db_user" --password="$db_pass"
fi
