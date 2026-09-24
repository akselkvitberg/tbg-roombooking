WP_VERSION=${1-latest}

if [[ $WP_VERSION =~ ^[0-9]+\.[0-9]+\-(beta|RC)[0-9]+$ ]]; then
	WP_BRANCH=${WP_VERSION%\-*}
	TAG_NAME="branches/$WP_BRANCH"
elif [[ $WP_VERSION =~ ^[0-9]+\.[0-9]+$ ]]; then
	TAG_NAME="branches/$WP_VERSION"
elif [[ $WP_VERSION =~ [0-9]+\.[0-9]+\.[0-9]+ ]]; then
	if [[ $WP_VERSION =~ [0-9]+\.[0-9]+\.[0] ]]; then
		# version x.x.0 means the first release of the major version, so strip off the .0 and download version x.x
		TAG_NAME="tags/${WP_VERSION%??}"
	else
		TAG_NAME="tags/$WP_VERSION"
	fi
elif [[ $WP_VERSION == 'nightly' || $WP_VERSION == 'trunk' ]]; then
	TAG_NAME="trunk"
else
	# http serves a single offer, whereas https serves multiple. we only want one
	curl -s http://api.wordpress.org/core/version-check/1.7/ > /tmp/wp-latest.json
	grep '[0-9]+\.[0-9]+(\.[0-9]+)?' /tmp/wp-latest.json
	LATEST_VERSION=$(grep -o '"version":"[^"]*' /tmp/wp-latest.json | sed 's/"version":"//')
	if [[ -z "$LATEST_VERSION" ]]; then
		echo "Latest WordPress version could not be found"
		exit 1
	fi
	TAG_NAME="tags/$LATEST_VERSION"
fi

if [ $WP_VERSION == 'latest' ]; then
	ARCHIVE_NAME='latest'
elif [[ $WP_VERSION =~ [0-9]+\.[0-9]+ ]]; then
	# https serves multiple offers, whereas http serves single.
	curl -s https://api.wordpress.org/core/version-check/1.7/ > /tmp/wp-latest.json
	if [[ $WP_VERSION =~ [0-9]+\.[0-9]+\.[0] ]]; then
		# version x.x.0 means the first release of the major version, so strip off the .0 and download version x.x
		LATEST_VERSION=${WP_VERSION%??}
	else
		# otherwise, scan the releases and get the most up to date minor version of the major release
		VERSION_ESCAPED=`echo $WP_VERSION | sed 's/\./\\\\./g'`
		LATEST_VERSION=$(grep -o '"version":"'$VERSION_ESCAPED'[^"]*' /tmp/wp-latest.json | sed 's/"version":"//' | head -1)
	fi
	if [[ -z "$LATEST_VERSION" ]]; then
		ARCHIVE_NAME="wordpress-$WP_VERSION"
	else
		ARCHIVE_NAME="wordpress-$LATEST_VERSION"
	fi
else
	ARCHIVE_NAME="wordpress-$WP_VERSION"
fi

echo "tag-name=$TAG_NAME" >> $GITHUB_OUTPUT
echo "archive-name=$ARCHIVE_NAME" >> $GITHUB_OUTPUT
