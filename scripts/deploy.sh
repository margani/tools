#!/usr/bin/env bash
# Deploy command of the Workers Builds trigger on main. Writes version.json so
# a deploy can be checked live: https://tools.whosane.dev/version.json must
# name the commit that was just merged.
set -euo pipefail
: "${WORKERS_CI_COMMIT_SHA:?run this from Cloudflare Workers Builds, not by hand}"
printf '{"commit":"%s"}\n' "$WORKERS_CI_COMMIT_SHA" > version.json
npx --yes wrangler@4.150.0 deploy
