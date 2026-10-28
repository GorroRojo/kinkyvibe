import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NAV } from '../src/lib/admin/nav.js';
import { lintPlan, navPhases, parsePlan, planIds } from './plan-lint.js';

const plan = (...sections) =>
	`# Plan\n\n## Reglas\n\n- **Regla** sin id\n\n${sections.join('\n\n')}\n`;
const fase = (n, ...lines) => `## Fase ${n}\n\n${lines.join('\n')}`;
const descartado = (...lines) => `## Descartado\n\n${lines.join('\n')}`;

const NAV_SRC = `
export const NAV = [
	{ id: 'inicio', href: '/admin', label: 'Inicio', soon: false },
	{ id: 'bandeja', href: '/admin/mensajes', label: 'Bandeja', soon: true, phase: 5, soonText: 'x' },
	{ id: 'tienda', href: '/admin/ventas/tienda', label: 'Tienda', soon: true, phase: 8 }
];`;

describe('parsePlan', () => {
	it('reads id, phase, estado, área, text, deps and nav from each item line', () => {
		const { items, errors } = parsePlan(
			plan(
				fase(
					0,
					'- `a` · fase 0 · sigue · panel · Algo · #12',
					'- `b` · fase 0 · espera gorrite · bot · Otra cosa (depende de: a, c) · nav: bandeja'
				)
			)
		);
		expect(errors).toEqual([]);
		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({ id: 'a', phase: 0, estado: 'sigue', area: 'panel' });
		expect(items[0].text).toBe('Algo · #12');
		expect(items[1]).toMatchObject({ deps: ['a', 'c'], nav: 'bandeja', sectionPhase: 0 });
	});

	it('ignores list items outside the phase and Descartado sections', () => {
		expect(parsePlan(plan()).items).toEqual([]);
	});

	it('reports an item line without an id', () => {
		const { errors } = parsePlan(plan(fase(0, '- Algo sin id · fase 0 · sigue · x · y')));
		expect(errors[0]).toMatch(/ítem sin id/);
	});
});

describe('lintPlan', () => {
	const ok = (...lines) => lintPlan(plan(fase(0, ...lines)));

	it('accepts a well-formed plan', () => {
		expect(
			lintPlan(
				plan(
					fase(0, '- `a` · fase 0 · hecho · panel · Algo · #1'),
					fase(3, '- `b` · fase 3 · sigue · entradas · Otra (depende de: a)'),
					descartado('- `c` · fase 0 · descartado · sitio · No va')
				)
			)
		).toEqual([]);
	});

	it('accepts a hecho line without a PR number, and still checks the rest of it', () => {
		expect(ok('- `a` · fase 0 · hecho · panel · Algo')).toEqual([]);
		expect(ok('- `a` · fase 0 · hecho · panel · Algo · [panel.md](panel.md)')).toEqual([]);
		expect(ok('- `a` · fase 0 · hecho · panel · Algo · #12')).toEqual([]);
		expect(ok('- `a` · fase 0 · hecho · panel')).toEqual([expect.stringMatching(/falta qué es/)]);
		expect(ok('- `a` · hecho · panel · Algo')[0]).toMatch(/falta la fase/);
		expect(ok('- `a` · fase 0 · hecha · panel · Algo')[0]).toMatch(/estado «hecha» inválido/);
	});

	it('fails on duplicate ids', () => {
		const out = ok('- `a` · fase 0 · sigue · x · y', '- `a` · fase 0 · sigue · x · z');
		expect(out).toEqual([expect.stringMatching(/`a`.*id repetido \(ya está en la línea/)]);
	});

	it('fails on invalid ids', () => {
		expect(ok('- `Algo Raro` · fase 0 · sigue · x · y')[0]).toMatch(/id inválido/);
	});

	it('fails on a missing or out-of-range phase', () => {
		expect(ok('- `a` · sigue · x · y · z')[0]).toMatch(/falta la fase/);
		expect(ok('- `a` · fase 9 · sigue · x · y')[0]).toMatch(/falta la fase/);
	});

	it('fails on a missing or unknown estado', () => {
		expect(ok('- `a` · fase 0 · pendiente · x · y')[0]).toMatch(/estado «pendiente» inválido/);
		expect(ok('- `a` · fase 0')).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/estado «» inválido/),
				expect.stringMatching(/falta el área/),
				expect.stringMatching(/falta qué es/)
			])
		);
	});

	it('fails when the line phase is not the section phase', () => {
		expect(ok('- `a` · fase 2 · sigue · x · y')[0]).toMatch(/dice fase 2 pero está en «Fase 0»/);
	});

	it('keeps descartado and the Descartado section together', () => {
		expect(ok('- `a` · fase 0 · descartado · x · y')[0]).toMatch(/va en la sección «Descartado»/);
		expect(lintPlan(plan(descartado('- `a` · fase 0 · sigue · x · y')))[0]).toMatch(
			/el estado tiene que ser «descartado»/
		);
	});

	it('fails on a dependency that does not exist', () => {
		expect(ok('- `a` · fase 0 · sigue · x · y (depende de: nada)')[0]).toMatch(
			/depende de «nada», que no existe/
		);
	});

	it('fails on a dependency in a later phase, and allows the same or an earlier one', () => {
		const later = lintPlan(
			plan(
				fase(0, '- `a` · fase 0 · sigue · x · y (depende de: b)'),
				fase(3, '- `b` · fase 3 · sigue · x · y (depende de: a)')
			)
		);
		expect(later).toEqual([expect.stringMatching(/«b», que está en una fase posterior \(3 > 0\)/)]);
	});

	it('fails on an item that depends on itself', () => {
		expect(ok('- `a` · fase 0 · sigue · x · y (depende de: a)')[0]).toMatch(/depende de sí mismo/);
	});

	it('fails on an empty plan', () => {
		expect(lintPlan('# Plan\n')).toEqual(['el plan no tiene ningún ítem']);
	});

	describe('against nav.js', () => {
		const withNav = (...lines) =>
			lintPlan(
				plan(
					fase(5, '- `bandeja` · fase 5 · algún día · mails · Bandeja · nav: bandeja'),
					fase(8, '- `tienda` · fase 8 · algún día · tienda · Tienda · nav: tienda'),
					...lines
				),
				NAV_SRC
			);

		it('accepts matching phases', () => {
			expect(withNav()).toEqual([]);
		});

		it('fails when nav.js and the plan disagree on a phase', () => {
			const out = lintPlan(
				plan(
					fase(4, '- `bandeja` · fase 4 · algún día · mails · Bandeja · nav: bandeja'),
					fase(8, '- `tienda` · fase 8 · algún día · tienda · Tienda · nav: tienda')
				),
				NAV_SRC
			);
			expect(out).toEqual([expect.stringMatching(/nav.js dice `phase: 5`.*el plan dice fase 4/)]);
		});

		it('fails when a nav section with a phase has no plan item', () => {
			const out = lintPlan(
				plan(fase(5, '- `bandeja` · fase 5 · algún día · mails · Bandeja · nav: bandeja')),
				NAV_SRC
			);
			expect(out).toEqual([expect.stringMatching(/sección «tienda» tiene `phase: 8`/)]);
		});

		it('fails on a nav: that is not a section with a phase, or that is used twice', () => {
			expect(withNav(fase(0, '- `x` · fase 0 · sigue · panel · X · nav: inicio'))).toEqual([
				expect.stringMatching(/«nav: inicio» no es una sección/)
			]);
			expect(withNav(fase(0, '- `x` · fase 0 · sigue · panel · X · nav: tienda'))).toEqual(
				expect.arrayContaining([expect.stringMatching(/«nav: tienda» ya lo usa la línea/)])
			);
		});
	});
});

describe('navPhases', () => {
	it('reads the phase of each nav item from the source', () => {
		expect(navPhases(NAV_SRC)).toEqual(
			new Map([
				['bandeja', 5],
				['tienda', 8]
			])
		);
	});

	it('matches the real NAV in src/lib/admin/nav.js', () => {
		const source = readFileSync(new URL('../src/lib/admin/nav.js', import.meta.url), 'utf8');
		const real = new Map(NAV.filter((i) => i.phase !== undefined).map((i) => [i.id, i.phase]));
		expect(real.size).toBeGreaterThan(0);
		expect(navPhases(source)).toEqual(real);
	});
});

describe('docs/plan.md', () => {
	it('passes the lint (the same check as the CI job)', () => {
		const text = readFileSync(new URL('../docs/plan.md', import.meta.url), 'utf8');
		const source = readFileSync(new URL('../src/lib/admin/nav.js', import.meta.url), 'utf8');
		expect(lintPlan(text, source)).toEqual([]);
		expect(planIds(text).size).toBeGreaterThan(0);
	});
});
