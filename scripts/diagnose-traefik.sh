#!/bin/sh
# Diagnoses why Traefik isn't routing to the warehouse web container.

COMPOSE_PROJECT=yassir-wharehouse-management
WEB_CONTAINER="${COMPOSE_PROJECT}-web-1"
TRAEFIK_CONTAINER=traefik

echo "========================================"
echo " Traefik routing diagnostic"
echo "========================================"

echo ""
echo "--- Networks Traefik is on ---"
docker inspect "$TRAEFIK_CONTAINER" --format '{{range $net, $v := .NetworkSettings.Networks}}  {{$net}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] Traefik container '$TRAEFIK_CONTAINER' not found. Is the name different?"

echo ""
echo "--- Networks our web container is on ---"
docker inspect "$WEB_CONTAINER" --format '{{range $net, $v := .NetworkSettings.Networks}}  {{$net}}{{"\n"}}{{end}}' 2>/dev/null \
  || echo "  [!] Web container '$WEB_CONTAINER' not found."

echo ""
echo "--- All Docker networks on this host ---"
docker network ls

echo ""
echo "--- Labels on our web container (what Traefik sees) ---"
docker inspect "$WEB_CONTAINER" --format '{{range $k,$v := .Config.Labels}}  {{$k}}={{$v}}{{"\n"}}{{end}}' 2>/dev/null

echo ""
echo "--- Traefik HTTP routers (requires Traefik API on port 8080) ---"
curl -sf http://localhost:8080/api/http/routers 2>/dev/null \
  | grep -o '"name":"[^"]*"' \
  || echo "  (Traefik API not exposed on :8080 — skipped)"

echo ""
echo "========================================"
echo " Done. Paste the output above to Claude."
echo "========================================"
