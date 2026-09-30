#!/bin/bash
# Claude Code SessionStart hook: make sure dependencies are installed so agents can run
# `npm run lint`, `npx vitest run` and `npm run build` before pushing.
#
# Fast path: does nothing when node_modules exists and package-lock.json hasn't changed since the
# last install this hook did (tracked by a hash stamp inside node_modules). Runs `npm ci` only when
# node_modules is missing or the lockfile changed. Never fails the session: errors are reported
# and the hook exits 0.
set -uo pipefail

dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$dir" || exit 0
[ -f package-lock.json ] || exit 0

stamp="node_modules/.guardrails-lock-hash"
hash="$(sha256sum package-lock.json 2>/dev/null || shasum -a 256 package-lock.json)"
hash="${hash%% *}"

if [ -d node_modules ]; then
	if [ ! -f "$stamp" ]; then
		# Installed by hand before this hook existed: trust it and start tracking from here.
		echo "$hash" >"$stamp"
		exit 0
	fi
	[ "$(cat "$stamp")" = "$hash" ] && exit 0
	reason="package-lock.json changed"
else
	reason="node_modules is missing"
fi

echo "session-start: $reason, running npm ci..." >&2
if npm ci --no-audit --no-fund --loglevel=error >/dev/null 2>&1; then
	echo "$hash" >"$stamp"
	echo "session-start: dependencies installed." >&2
else
	echo "session-start: npm ci failed; run it by hand to see the error." >&2
fi
exit 0
