#!/usr/bin/env bash
# Deploy command of the Workers Builds trigger on main. Writes version.json so
# a deploy can be checked live: https://tools.whosane.dev/version.json must
# name the commit that was just merged.
set -euo pipefail
: "${WORKERS_CI_COMMIT_SHA?run this from Cloudflare Workers Builds, not by hand}"
# Not WORKERS_CI_COMMIT_SHA itself: on a manual build it holds the branch name
# ("main"), which made version.json useless for checking a deploy (#1).
commit=$(git rev-parse HEAD)
printf '{"commit":"%s"}\n' "$commit" > version.json
npx --yes wrangler@4.150.0 deploy
