#!/usr/bin/env bash
#
# Builds the creo theme from the `vendor-theme/creo-wp` submodule so that
# wp-env and CI can load it. The theme's `build` folder is not committed.

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
theme_repo="$root_dir/vendor-theme/creo-wp"

if [ ! -f "$theme_repo/package.json" ]; then
  git -C "$root_dir" submodule update --init --depth 1 vendor-theme/creo-wp
fi

if [ -f "$theme_repo/packages/creo/build/creo.js" ] && [ "${1:-}" != "--force" ]; then
  echo "creo theme already built (use --force to rebuild)."
  exit 0
fi

cd "$theme_repo"
pnpm install --frozen-lockfile
pnpm --filter creo build
