#!/usr/bin/env bash
# Runs on the VPS (invoked by .github/workflows/deploy-indexer.yml over SSH).
# Installs deps, (re)starts the Ponder process under pm2, and prints a brief health probe.
set -uo pipefail

cd ~/goaly/apps/indexer || { echo "indexer dir missing"; exit 1; }

echo "===== install ====="
bun install

echo "===== (re)start goaly-indexer ====="
# Ponder serves its GraphQL/HTTP API on 127.0.0.1:42069 (what nginx proxies indexer.goaly.fun to).
# Delete + start fresh so pm2 always runs the current start args (a plain restart can keep stale args).
pm2 delete goaly-indexer >/dev/null 2>&1 || true
pm2 start bun --name goaly-indexer -- run start
pm2 save

echo "===== health probe ====="
sleep 12
curl -s -o /dev/null -w "127.0.0.1:42069/health -> %{http_code}\n" --max-time 8 http://127.0.0.1:42069/health \
  || echo "Ponder not responding yet — check: pm2 logs goaly-indexer"

echo "===== done ====="
