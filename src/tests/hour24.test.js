// Guard: every date formatter in src/ that prints an hour must use a 24-hour clock.
//
// es-AR in recent ICU/CLDR data (Node 22+, current browsers) defaults to a 12-hour clock, so a
// bare `new Intl.DateTimeFormat('es-AR', { hour: '2-digit' })` or `toLocaleString('es-AR')` prints
// «10:00 p. m.». Use `argFormat` from $lib/utils/dates.js (or pass `hourCycle: 'h23'`), and for
// date-fns use `HH`/`H`, never `h`/`a`/`p`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} dir @returns {string[]} */
function sourceFiles(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return e.name === 'posts' ? [] : sourceFiles(p);
		return /\.(js|ts|svelte)$/.test(e.name) && !/\.(test|spec)\.js$/.test(e.name) ? [p] : [];
	});
}

/**
 * The text between the parentheses that open at `open` (index of the `(`).
 * @param {string} s @param {number} open
 */
function argsAt(s, open) {
	let depth = 0;
	for (let i = open; i < s.length; i++) {
		if (s[i] === '(') depth++;
		else if (s[i] === ')' && --depth === 0) return s.slice(open + 1, i);
	}
	return s.slice(open + 1);
}

/** @param {string} s @param {number} i */
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

/**
 * Formatter calls that can print a 12-hour time.
 * @param {string} src
 * @returns {{ line: number, code: string }[]}
 */
export function twelveHourCalls(src) {
	/** @type {{ line: number, code: string }[]} */
	const found = [];
	const calls = /new Intl\.DateTimeFormat\(|\.toLocaleString\(|\.toLocaleTimeString\(/g;
	for (const m of src.matchAll(calls)) {
		const open = (m.index ?? 0) + m[0].length - 1;
		const args = argsAt(src, open);
		const lineStart = src.lastIndexOf('\n', m.index) + 1;
		const before = src.slice(lineStart, m.index);
		// Locales other than es-AR used here (sv-SE, en-CA) are 24-hour or print no time.
		if (/^\s*'(?!es-AR')[a-z]{2}-[A-Z]{2}'/.test(args)) continue;
		const printsHour =
			/\bhour\s*:|timeStyle\s*:/.test(args) ||
			(m[0] === '.toLocaleTimeString(' && !/\btimeStyle|\bhour\b/.test(args)) ||
			// toLocaleString with no options on a Date prints date and time.
			(m[0] === '.toLocaleString(' && !args.includes(',') && /Date\(/.test(before));
		if (printsHour && !/hourCycle\s*:\s*'h23'/.test(args)) {
			found.push({
				line: lineOf(src, m.index ?? 0),
				code: src.slice(m.index, open + 1) + args + ')'
			});
		}
	}
	// date-fns: format(d, '…') with 12-hour tokens (h, K, a, p) outside quoted literals.
	for (const m of src.matchAll(/\bformat\(\s*[^,()]+(?:\([^()]*\))?\s*,\s*'([^']*)'/g)) {
		const tokens = m[1].replace(/''|'[^']*'/g, '');
		if (/[hKap]/.test(tokens)) found.push({ line: lineOf(src, m.index ?? 0), code: m[0] });
	}
	return found;
}

describe('twelveHourCalls (the guard itself)', () => {
	it('flags 12-hour-capable formatters', () => {
		const bad = [
			"new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' })",
			"d.toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' })",
			"new Date(x).toLocaleTimeString('es-AR')",
			"{new Date().toLocaleString('es-AR')}",
			"format(start, 'h')",
			"format(toArgentina(start), 'h:mm aaa')"
		];
		for (const code of bad) expect(twelveHourCalls(code), code).toHaveLength(1);
	});

	it('accepts 24-hour formatters, numbers and dates without a time', () => {
		const good = [
			"new Intl.DateTimeFormat('es-AR', { hour: '2-digit', hourCycle: 'h23' })",
			"d.toLocaleString('es-AR', { timeStyle: 'short', hourCycle: 'h23', timeZone: TZ })",
			"new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' })",
			"new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium' })",
			"Number(x).toLocaleString('es-AR')",
			"argFormat({ hour: '2-digit', minute: '2-digit' })",
			"format(start, 'HH:mm')",
			"format(d, 'yyyy-MM-dd')",
			"format(d, 'EEEE dd')"
		];
		for (const code of good) expect(twelveHourCalls(code), code).toEqual([]);
	});
});

describe('every time in src/ uses a 24-hour clock', () => {
	it('no formatter can print «a. m.»/«p. m.»', () => {
		const offenders = sourceFiles(SRC).flatMap((file) =>
			twelveHourCalls(fs.readFileSync(file, 'utf8')).map(
				({ line, code }) => `${path.relative(SRC, file)}:${line}  ${code.replace(/\s+/g, ' ')}`
			)
		);
		expect(offenders, 'use argFormat() from $lib/utils/dates.js').toEqual([]);
	});
});
