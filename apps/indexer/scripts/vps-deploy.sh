#!/usr/bin/env bash
# Runs on the VPS (invoked by .github/workflows/deploy-indexer.yml over SSH).
# Installs deps, (re)starts the Ponder process under pm2, then prints diagnostics so a failed
# start is visible in the Actions log.
set -uo pipefail

cd ~/goaly/apps/indexer || { echo "indexer dir missing"; exit 1; }

echo "===== install ====="
bun install

echo "===== start script on the VPS (must contain --schema) ====="
grep '"start"' package.json || true

echo "===== env present (names only) ====="
if [ -f .env ]; then grep -oE '^[A-Z_]+=' .env | sort -u; else echo "(no .env)"; fi

echo "===== diagnostic: run ponder start directly for 35s (clean error, no pm2 spam) ====="
pm2 delete goaly-indexer >/dev/null 2>&1 || true
timeout 35 bun run start 2>&1 | tail -45 || echo "(direct run exited or timed out)"

echo "===== fresh (re)start goaly-indexer ====="
# Delete + start fresh so pm2 always picks up the current package.json/args (a plain restart can
# keep a crash-looped process on stale args). Ponder serves on 0.0.0.0:42069 (what nginx proxies to).
pm2 delete goaly-indexer >/dev/null 2>&1 || true
pm2 flush goaly-indexer >/dev/null 2>&1 || true
pm2 start bun --name goaly-indexer -- run start
pm2 save

echo "===== wait for boot ====="
sleep 15

echo "===== pm2 status ====="
pm2 describe goaly-indexer 2>/dev/null | grep -Ei "status|restarts|script path|exec cwd|out log|error log" || true

echo "===== local upstream :42069 ====="
curl -sS -m 6 -o /dev/null -w "local http: %{http_code}\n" http://127.0.0.1:42069/ || echo "local curl failed (Ponder not listening)"

echo "===== recent logs ====="
pm2 logs goaly-indexer --lines 40 --nostream 2>/dev/null || true

echo "===== raw indexer.goaly.fun nginx blocks (default file) ====="
sudo awk 'NR>=108 && NR<=180' /etc/nginx/sites-available/default 2>/dev/null || echo "(no sudo)"

echo "===== is Ponder listening on :42069 now? ====="
sleep 5
curl -s -o /dev/null -w "127.0.0.1:42069 -> %{http_code}\n" --max-time 5 http://127.0.0.1:42069/ || echo "42069 not responding"
curl -s -o /dev/null -w "127.0.0.1:42069/health -> %{http_code}\n" --max-time 5 http://127.0.0.1:42069/health || true
sudo ss -ltnp 2>/dev/null | grep -E ":42069" || echo "(nothing on 42069)"

echo "===== done ====="
