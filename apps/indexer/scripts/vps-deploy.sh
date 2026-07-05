#!/usr/bin/env bash
# Runs on the VPS (invoked by .github/workflows/deploy-indexer.yml over SSH).
# Installs deps, (re)starts the Ponder process under pm2, then prints diagnostics so a failed
# start is visible in the Actions log.
set -uo pipefail

cd ~/goaly/apps/indexer || { echo "indexer dir missing"; exit 1; }

echo "===== install ====="
bun install

echo "===== (re)start goaly-indexer ====="
# Ponder serves its GraphQL/HTTP API on 0.0.0.0:42069 by default (what nginx proxies to).
if ! pm2 restart goaly-indexer --update-env; then
  pm2 start bun --name goaly-indexer -- run start
fi
pm2 save

echo "===== wait for boot ====="
sleep 12

echo "===== pm2 status ====="
pm2 describe goaly-indexer 2>/dev/null | grep -Ei "status|restarts|script path|exec cwd|out log|error log" || true

echo "===== local upstream :42069 ====="
curl -sS -m 6 -o /dev/null -w "local http: %{http_code}\n" http://127.0.0.1:42069/ || echo "local curl failed (Ponder not listening)"

echo "===== recent logs ====="
pm2 logs goaly-indexer --lines 40 --nostream 2>/dev/null || true

echo "===== done ====="
