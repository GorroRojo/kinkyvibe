import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isTestEventSlug } from './events.js';

describe('eventos de prueba de la venta de entradas', () => {
	const dir = 'src/lib/posts/calendario';
	const files = readdirSync(dir).filter((f) => f.endsWith('.md'));

	it('los del repo se reconocen como de prueba (no venden fuera de `vite dev`)', () => {
		const tests = files.filter(
			(f) => /prueba/i.test(f) && /^tickets:/m.test(readFileSync(`${dir}/${f}`, 'utf8'))
		);
		expect(tests.length).toBeGreaterThan(0);
		for (const f of tests) expect(isTestEventSlug(f.replace(/\.md$/, ''))).toBe(true);
	});

	it('un evento normal no es de prueba', () => {
		expect(isTestEventSlug('picantearla-2026-10')).toBe(false);
		expect(isTestEventSlug('prueba-entradas-2026-12')).toBe(true);
	});
});
