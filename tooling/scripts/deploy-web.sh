#!/usr/bin/env bash
# Deploys the website (apps/web) to Vercel production: pulls the project settings, builds on this machine and
# uploads the prebuilt output. Git deployments stay off (vercel.json), so this script is the only way to ship.
#
# Usage: tooling/scripts/deploy-web.sh [--preview]
# Needs in .env.local (never committed): VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
set -a
# shellcheck disable=SC1091
. "$root/.env.local"
set +a
: "${VERCEL_TOKEN:?VERCEL_TOKEN missing from .env.local}"
export VERCEL_ORG_ID="${VERCEL_TEAM_ID:?VERCEL_TEAM_ID missing from .env.local}"
export VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:?VERCEL_PROJECT_ID missing from .env.local}"
export NEXT_TELEMETRY_DISABLED=1
# The production domain; deployment URLs themselves sit behind Vercel's login (standard protection).
site="https://keystone-works-three.vercel.app"

target=production
prod=(--prod)
if [ "${1:-}" = "--preview" ]; then
  target=preview
  prod=()
fi

vercel() { npx --yes vercel@63.1.2 "$@" --token "$VERCEL_TOKEN"; }

cd "$root"
if [ -n "$(git status --porcelain -- apps/web packages)" ]; then
  echo "deploy-web: apps/web or packages has uncommitted changes; commit them first." >&2
  exit 1
fi

cd "$root/apps/web"
vercel pull --yes --environment="$target"
vercel build "${prod[@]}"
url="$(vercel deploy --prebuilt "${prod[@]}" | tail -1)"
echo "deploy-web: deployed $(git rev-parse --short HEAD) to $url"

[ "$target" = production ] || exit 0

# Smoke test: every route answers 200 on the production domain.
for path in / /listen /listen/pride-and-prejudice /listen/idgah /privacy /terms /refunds /licenses /support \
  /samples/idgah.mp3; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$site$path")"
  echo "  $code $path"
  [ "$code" = 200 ] || { echo "deploy-web: $path answered $code" >&2; exit 1; }
done
