#!/bin/sh
# Revive contract: bring the dev server back after a restart/hibernate.
# Idempotent - exits immediately when the app already answers.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

node scripts/preview.mjs stop || true

# The live preview for this checkout is registered on :3100 (:8080 is held by
# another app on this machine, so binding there would fail or land on its port).
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:3100/; then
  exit 0
fi

setsid nohup npm run dev -- --port 3100 >>/tmp/app-startup.log 2>&1 </dev/null &
