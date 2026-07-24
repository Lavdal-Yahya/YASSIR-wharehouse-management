#!/bin/sh
# Diagnoses Traefik routing and web→api connectivity.

COMPOSE_PROJECT=yassir-wharehouse-management
WEB_CONTAINER="${COMPOSE_PROJECT}-web-1"
API_CONTAINER="${COMPOSE_PROJECT}-api-1"
TRAEFIK_CONTAINER=traefik

echo "========================================"
echo " Traefik + connectivity diagnostic"
echo "========================================"

echo ""
echo "--- Container status ---"
docker compose -f docker-compose.prod.yml ps 2>/dev/null || docker ps --filter "name=${COMPOSE_PROJECT}"

echo ""
echo "--- Networks Traefik is on ---"
docker inspect "$TRAEFIK_CONTAINER" --format '{{range $net, $v := .NetworkSettings.Networks}}  {{$net}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] Traefik container not found"

echo ""
echo "--- Networks our web container is on ---"
docker inspect "$WEB_CONTAINER" --format '{{range $net, $v := .NetworkSettings.Networks}}  {{$net}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] Web container not found"

echo ""
echo "--- Can web container reach api:3000? ---"
docker exec "$WEB_CONTAINER" wget -qO- --timeout=5 http://api:3000/api/auth/me 2>&1 \
  && echo "" \
  || echo "  [!] wget failed — api:3000 is unreachable from the web container"

echo ""
echo "--- Is api container listening on 3000? ---"
docker exec "$API_CONTAINER" wget -qO- --timeout=5 http://localhost:3000/api/auth/me 2>&1 \
  && echo "" \
  || echo "  [!] API not responding on its own localhost:3000"

echo ""
echo "--- Last 20 lines of api logs ---"
docker logs "$API_CONTAINER" --tail=20

echo ""
echo "--- Last 20 lines of web (Caddy) logs ---"
docker logs "$WEB_CONTAINER" --tail=20

echo ""
echo "========================================"
echo " Done. Paste the output above to Claude."
echo "========================================"
