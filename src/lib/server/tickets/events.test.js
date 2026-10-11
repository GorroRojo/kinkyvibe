import { describe, expect, it } from 'vitest';
import { seedFiles } from '$lib/server/semilla/testing.js';
import { isTestEventSlug } from './events.js';

describe('eventos de prueba de la venta de entradas', () => {
	// Los eventos reales de la semilla de contenido (los .md ya no están en el repo, decisión 0032).
	const files = seedFiles('calendario');

	it('los de la semilla se reconocen como de prueba (no venden fuera de `vite dev`)', () => {
		const tests = files.filter((f) => /prueba/i.test(f.legacySlug) && /^tickets:/m.test(f.raw));
		expect(tests.length).toBeGreaterThan(0);
		for (const f of tests) expect(isTestEventSlug(f.legacySlug)).toBe(true);
	});

	it('un evento normal no es de prueba', () => {
		expect(isTestEventSlug('picantearla-2026-10')).toBe(false);
		expect(isTestEventSlug('prueba-entradas-2026-12')).toBe(true);
	});
});
