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

echo "===== nginx: how is indexer.goaly.fun routed? (read-only) ====="
sudo nginx -T 2>/dev/null | grep -nE "server_name|proxy_pass|listen |root " | grep -iE "indexer.goaly|42069|4200|proxy_pass|server_name .*goaly|listen .*443" | head -40 || echo "(no sudo / nothing)"
echo "----- files mentioning indexer.goaly.fun -----"
sudo grep -rl "indexer.goaly.fun" /etc/nginx/ 2>/dev/null || echo "(none / no sudo)"

echo "===== done ====="
