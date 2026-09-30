#!/usr/bin/env node
// svelte-check ratchet: fails only if the number of svelte-check errors goes UP from the baseline
// stored in scripts/svelte-check-baseline.json. main has pre-existing errors, so plain
// `npm run check` can't block merges yet; this at least stops new ones.
//
//   node scripts/svelte-check-ratchet.js
//
// When the count goes down, it passes and asks you to lower the baseline in the same PR, so the
// ratchet only ever tightens. Once the count reaches 0, CI can run `npm run check` directly and
// this script can go.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BASELINE_FILE = fileURLToPath(
	new URL('./svelte-check-baseline.json', import.meta.url)
);

/**
 * Parse `svelte-check --output machine` output.
 * @param {string} output
 * @returns {{ errors: number, lines: string[] } | null} null if the COMPLETED line is missing
 */
export function parseMachineOutput(output) {
	const done = output.match(/^\d+ COMPLETED \d+ FILES (\d+) ERRORS/m);
	if (!done) return null;
	const lines = output.split('\n').filter((l) => /^\d+ ERROR /.test(l));
	return { errors: Number(done[1]), lines };
}

/**
 * @param {number} errors current count
 * @param {number} baseline allowed count
 * @returns {{ ok: boolean, message: string }}
 */
export function compare(errors, baseline) {
	if (errors > baseline) {
		return {
			ok: false,
			message:
				`svelte-check: ${errors} errors, above the baseline of ${baseline}. ` +
				`Fix the new errors (see the list above); don't raise the baseline to get green.`
		};
	}
	if (errors < baseline) {
		return {
			ok: true,
			message:
				`svelte-check: ${errors} errors, below the baseline of ${baseline}. Nice! ` +
				`Lower "errors" in scripts/svelte-check-baseline.json to ${errors} in this PR.`
		};
	}
	return { ok: true, message: `svelte-check: ${errors} errors, same as the baseline.` };
}

function main() {
	const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).errors;
	execFileSync('npx', ['svelte-kit', 'sync'], { stdio: 'inherit' });
	const res = spawnSync(
		'npx',
		['svelte-check', '--tsconfig', './jsconfig.json', '--output', 'machine'],
		{ encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
	);
	const parsed = parseMachineOutput(res.stdout ?? '');
	if (!parsed) {
		console.error(res.stdout, res.stderr);
		console.error('svelte-check: could not find the COMPLETED line; it probably crashed.');
		process.exit(1);
	}
	for (const line of parsed.lines) console.log(line);
	const { ok, message } = compare(parsed.errors, baseline);
	const annotation = ok ? (parsed.errors < baseline ? '::notice::' : '') : '::error::';
	console.log((process.env.GITHUB_ACTIONS ? annotation : '') + message);
	process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
