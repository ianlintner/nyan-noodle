#!/usr/bin/env bash
# Deploy the built Nyan Noodle bundle to Azure Static Web Apps.
#
# Usage: scripts/deploy.sh [review|production]
#
# The deployment token is read from Azure into a process-local variable and
# exported only for the swa child process. It is never echoed, written to disk,
# committed, or persisted in the SWA CLI keychain (--no-use-keychain).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENVIRONMENT="${1:-review}"
case "$ENVIRONMENT" in
  review|production) ;;
  *)
    echo "usage: $0 [review|production]" >&2
    exit 2
    ;;
esac

SWA_APP_NAME="${SWA_APP_NAME:-nyan-noodle}"
SWA_RESOURCE_GROUP="${SWA_RESOURCE_GROUP:-nekoc}"

echo "==> Preflight: npm run check"
npm run check

echo "==> Preflight: clean working tree"
if [[ -n "$(git status --porcelain)" ]]; then
  echo " refusing to deploy from a dirty tree:" >&2
  git status --short >&2
  exit 1
fi

# Production deploys are only permitted from an approved/merged main commit.
if [[ "$ENVIRONMENT" == "production" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" != "main" ]]; then
    echo " refusing production deploy from branch '$branch' (main only)" >&2
    exit 1
  fi
  git fetch --quiet origin main
  if [[ "$(git rev-list --count origin/main..HEAD)" != "0" ]]; then
    echo " refusing production deploy: local main is ahead of origin/main" >&2
    exit 1
  fi
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    echo " refusing production deploy: HEAD is not origin/main" >&2
    exit 1
  fi
fi

# swa expects its config file inside the output location; copy it into dist
# without touching the tracked source config. Refreshed on every deploy so the
# deployed caching/security headers always match the repo.
cp apps/game/public/staticwebapp.config.json apps/game/dist/staticwebapp.config.json

echo "==> Fetching SWA deployment token (in memory only)"
token="$(az staticwebapp secrets list \
  --name "$SWA_APP_NAME" \
  --resource-group "$SWA_RESOURCE_GROUP" \
  --query 'properties.apiKey' -o tsv)"
if [[ -z "$token" || "$token" == "None" ]]; then
  echo " could not obtain deployment token for $SWA_APP_NAME" >&2
  exit 1
fi

echo "==> Deploying dist/ to $ENVIRONMENT environment of $SWA_APP_NAME"
# --no-use-keychain prevents the token being persisted outside this process.
SWA_CLI_DEPLOYMENT_TOKEN="$token" npx @azure/static-web-apps-cli deploy \
  --output-location ./apps/game/dist \
  --swa-config-location ./apps/game/dist \
  --env "$ENVIRONMENT" \
  --no-use-keychain
unset token

# Resolve the hostname AFTER upload: a first review deployment may not have an
# environment hostname until swa creates it. Never fall back to the production
# hostname for a review deploy — that would verify the wrong site.
host=''
for attempt in 1 2 3; do
  if [[ "$ENVIRONMENT" == "review" ]]; then
    host="$(az staticwebapp environment list \
      --name "$SWA_APP_NAME" --resource-group "$SWA_RESOURCE_GROUP" \
      --query "[?name=='review'].hostname" -o tsv)"
  else
    host="$(az staticwebapp show \
      --name "$SWA_APP_NAME" \
      --resource-group "$SWA_RESOURCE_GROUP" \
      --query defaultHostname -o tsv)"
  fi
  [[ -n "$host" && "$host" != "None" ]] && break
  sleep 5
done
if [[ -z "$host" || "$host" == "None" ]]; then
  echo " could not resolve $ENVIRONMENT hostname for $SWA_APP_NAME after upload" >&2
  exit 1
fi
if [[ "$host" != http* ]]; then host="https://$host"; fi

echo "==> Verifying deployment at $host"
node scripts/verify-deployment.mjs "$host"

echo "==> Deployed $ENVIRONMENT to $host"
