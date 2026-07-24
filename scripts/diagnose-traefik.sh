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
echo "--- Subnet of yassir-wharehouse-management_default ---"
docker network inspect "${COMPOSE_PROJECT}_default" \
  --format '{{range .IPAM.Config}}  subnet: {{.Subnet}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] network not found"

echo ""
echo "--- Subnet of traefik-public ---"
docker network inspect traefik-public \
  --format '{{range .IPAM.Config}}  subnet: {{.Subnet}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] network not found"

echo ""
echo "--- API container IP on each network ---"
docker inspect "$API_CONTAINER" \
  --format '{{range $net, $v := .NetworkSettings.Networks}}  {{$net}}: {{$v.IPAddress}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] api container not found"

echo ""
echo "--- Web container IP on each network ---"
docker inspect "$WEB_CONTAINER" \
  --format '{{range $net, $v := .NetworkSettings.Networks}}  {{$net}}: {{$v.IPAddress}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] web container not found"

echo ""
echo "--- What does 'api' resolve to from inside web container? ---"
docker exec "$WEB_CONTAINER" nslookup api 2>/dev/null \
  || docker exec "$WEB_CONTAINER" cat /etc/resolv.conf 2>/dev/null \
  || echo "  [!] nslookup not available"

echo ""
echo "--- Can web container reach api container by IP directly? ---"
API_IP=$(docker inspect "$API_CONTAINER" \
  --format '{{range $net, $v := .NetworkSettings.Networks}}{{if eq $net "'"${COMPOSE_PROJECT}_default"'"}}{{$v.IPAddress}}{{end}}{{end}}' 2>/dev/null)
echo "  API IP on default network: ${API_IP:-not found}"
if [ -n "$API_IP" ]; then
  docker exec "$WEB_CONTAINER" wget -qO- --timeout=5 "http://${API_IP}:3000/api/auth/me" 2>&1 \
    && echo "" \
    || echo "  [!] direct IP connection also failed"
fi

echo ""
echo "--- Last 5 Caddy error lines ---"
docker logs "$WEB_CONTAINER" --tail=20 2>&1 | grep '"level":"error"' | tail -5

echo ""
echo "========================================"
echo " Done. Paste the output above to Claude."
echo "========================================"
