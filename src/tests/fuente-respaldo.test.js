// Guard for the Lato fallback (style.scss): while Lato loads (`font-display: swap`, unchanged) the
// text uses Arial or Roboto resized to Lato's measures, so the swap doesn't move the page. Every
// place that asks for Lato lists the fallbacks right after it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const STYLE = read('lib/styles/style.scss');
const faces = [...STYLE.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
/** @param {string} face */
const family = (face) => face.match(/font-family:\s*'([^']+)'/)?.[1];

describe('Lato fallback', () => {
	it('Lato keeps font-display: swap', () => {
		const lato = faces.filter((f) => family(f) === 'Lato');
		expect(lato.length).toBe(4);
		for (const f of lato) expect(f).toMatch(/font-display:\s*swap/);
	});

	it('each fallback face has local() fonts and the four metric overrides, for 400 and 700', () => {
		for (const name of ['Lato Fallback', 'Lato Fallback Roboto']) {
			const own = faces.filter((f) => family(f) === name);
			expect(own.map((f) => f.match(/font-weight:\s*(\d+)/)?.[1]).sort(), name).toEqual([
				'400',
				'700'
			]);
			for (const f of own) {
				expect(f).toMatch(/src:\s*local\(/);
				expect(f).not.toMatch(/url\(/);
				for (const d of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override'])
					expect(f, `${name} ${d}`).toMatch(new RegExp(`${d}:\\s*\\d+(\\.\\d+)?%`));
			}
		}
	});

	it('wherever Lato is asked for, the fallbacks come right after', () => {
		for (const rel of ['lib/styles/style.scss', 'routes/+error.svelte']) {
			const uses = [...read(rel).matchAll(/font-family:\s*'Lato',[^;]*;/g)].map((m) => m[0]);
			expect(uses.length, rel).toBeGreaterThan(0);
			for (const u of uses)
				expect(u, rel).toContain("'Lato', 'Lato Fallback', 'Lato Fallback Roboto', sans-serif");
		}
	});
});
