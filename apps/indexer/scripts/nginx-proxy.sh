#!/usr/bin/env bash
# Points the indexer.goaly.fun nginx server block at the local Ponder server (127.0.0.1:42069).
# Certbot attached indexer.goaly.fun to the static default block (root /var/www/html; try_files =404),
# so it served the nginx welcome page instead of proxying. This rewrites ONLY that block's `location /`
# to a reverse proxy. Safe: backs up, validates with `nginx -t`, restores on failure. Idempotent.
# Run with sudo. Other sites (api.goaly.fun, etc.) have their own server blocks and are untouched.
set -uo pipefail

F=/etc/nginx/sites-available/default

if grep -q "proxy_pass http://127.0.0.1:42069" "$F"; then
  echo "nginx already proxies indexer.goaly.fun -> 127.0.0.1:42069 (nothing to do)"
  exit 0
fi

cp "$F" /tmp/nginx-default.bak

python3 - "$F" <<'PY'
import sys
p = sys.argv[1]
t = open(p).read()
ci = t.find('indexer.goaly.fun/fullchain.pem')  # unique to the indexer 443 block
if ci == -1:
    sys.exit('indexer cert block not found')
tf = 'try_files $uri $uri/ =404;'
pos = t.rfind(tf, 0, ci)  # the try_files inside the indexer block (just before its cert lines)
if pos == -1:
    sys.exit('try_files not found in the indexer block')
repl = (
    'proxy_pass http://127.0.0.1:42069;\n'
    '        proxy_http_version 1.1;\n'
    '        proxy_set_header Host $host;\n'
    '        proxy_set_header Upgrade $http_upgrade;\n'
    '        proxy_set_header Connection "upgrade";\n'
    '        proxy_set_header X-Real-IP $remote_addr;\n'
    '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
    '        proxy_set_header X-Forwarded-Proto $scheme;'
)
open(p, 'w').write(t[:pos] + repl + t[pos + len(tf):])
print('patched indexer.goaly.fun -> reverse proxy')
PY

if nginx -t; then
  systemctl reload nginx && echo "RELOADED nginx"
else
  cp /tmp/nginx-default.bak "$F"
  echo "REVERTED (nginx -t failed, no changes applied)"
  nginx -t || true
  exit 1
fi
