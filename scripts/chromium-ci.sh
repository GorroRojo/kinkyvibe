#!/usr/bin/env bash
# Chromium para Playwright en la CI (jobs `e2e` y `ui-impacto` de .github/workflows/ci.yml).
#
# Baja Chromium si no está (la CI lo guarda en caché por versión de @playwright/test) y suma sus
# librerías del sistema SOLO si falta alguna. Las máquinas de GitHub (ubuntu-22.04) ya traen casi
# todo, y `playwright install-deps` hace `apt-get update` + `apt-get install`: casi siempre tarda
# ~20 s, pero a veces el espejo de apt tarda más de 9 minutos (pasó en noviembre de 2026).
set -euo pipefail

npx playwright install chromium

browsers="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
missing=$(find "$browsers" -type f \( -name chrome -o -name chrome-headless-shell \) \
	-exec ldd {} \; 2>/dev/null | grep 'not found' | sort -u || true)

if [ -n "$missing" ]; then
	echo "Faltan librerías del sistema para Chromium:"
	echo "$missing"
	npx playwright install-deps chromium
else
	echo "Chromium tiene todas sus librerías: no hace falta playwright install-deps."
fi
