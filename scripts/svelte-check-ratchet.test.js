import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASELINE_FILE, compare, parseMachineOutput } from './svelte-check-ratchet.js';

const sample = [
	'1790731371981 START "/repo"',
	'1790731371981 ERROR "src/a.svelte" 1:2 "Type error"',
	'1790731371981 WARNING "src/b.svelte" 3:4 "Unused"',
	'1790731371981 ERROR "src/c.js" 5:6 "Other"',
	'1790731371981 COMPLETED 4897 FILES 2 ERRORS 1 WARNINGS 3 FILES_WITH_PROBLEMS'
].join('\n');

describe('svelte-check ratchet', () => {
	it('parses the error count and error lines', () => {
		const r = parseMachineOutput(sample);
		expect(r?.errors).toBe(2);
		expect(r?.lines).toHaveLength(2);
	});

	it('returns null when svelte-check did not finish', () => {
		expect(parseMachineOutput('boom')).toBeNull();
	});

	it('fails only when the count rises above the baseline', () => {
		expect(compare(26, 25).ok).toBe(false);
		expect(compare(25, 25).ok).toBe(true);
		const lower = compare(20, 25);
		expect(lower.ok).toBe(true);
		expect(lower.message).toMatch(/Lower "errors".* to 20/);
	});

	it('has a numeric baseline', () => {
		expect(Number.isInteger(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).errors)).toBe(true);
	});
});
