import { describe, expect, it } from 'vitest';
import {
	OPERATORS,
	SEARCH_BASICS,
	operatorLabel,
	parseSearch,
	searchHelp
} from './searchSyntax.js';

/** @param {string} id */
const op = (id) =>
	/** @type {import('./searchSyntax.js').Operator} */ (OPERATORS.find((o) => o.id === id));

describe('«¿Cómo buscar?» (searchHelp, desde el registro)', () => {
	it('el sitio y el bot: las frases, las exclusiones y cada operador público, en el orden del registro', () => {
		for (const engine of /** @type {const} */ (['sitio', 'bot'])) {
			const rows = searchHelp(engine);
			const publicOps = OPERATORS.filter((o) => o.public && o.engines.includes(engine));
			expect(rows.map((r) => r.id)).toEqual([
				...SEARCH_BASICS.map((r) => r.id),
				...publicOps.map((o) => o.id)
			]);
			// Nada del panel (órdenes, personas) en la ayuda pública.
			expect(rows.some((r) => ['orden', 'estado', 'tipo', 'persona-panel'].includes(r.id))).toBe(
				false
			);
		}
	});

	it('cada línea lleva el ejemplo y la explicación del registro', () => {
		const rows = searchHelp('sitio');
		for (const o of OPERATORS.filter((x) => x.public)) {
			expect(rows.find((r) => r.id === o.id)).toEqual({
				id: o.id,
				label: operatorLabel(o),
				example: o.example,
				help: o.help
			});
		}
	});

	it('cómo se escribe cada operador', () => {
		expect(operatorLabel(op('evento'))).toBe('evento: · e:');
		expect(operatorLabel(op('wiki'))).toBe('wiki: · w:');
		expect(operatorLabel(op('etiqueta'))).toBe('#etiqueta · etiqueta:');
		expect(operatorLabel(op('persona'))).toBe('@nombre');
		expect(operatorLabel(op('lugar'))).toBe('lugar:');
	});

	it('el ejemplo de cada línea no es una de sus formas (no se ve dos veces)', () => {
		for (const engine of /** @type {const} */ (['sitio', 'bot', 'panel'])) {
			for (const row of searchHelp(engine)) {
				expect(row.label.split(' · '), `${engine}: ${row.id}`).not.toContain(row.example);
			}
		}
		expect(SEARCH_BASICS.find((r) => r.id === 'fechas')?.example).not.toBe('finde');
	});

	it('en el panel, `@` va en una sola línea con `persona:`', () => {
		const rows = searchHelp('panel');
		expect(rows.filter((r) => r.label.includes('@'))).toEqual([
			expect.objectContaining({
				id: 'persona-panel',
				label: '@nombre · persona:',
				help: 'Solo personas y perfiles.'
			})
		]);
	});

	it('los ejemplos de la ayuda pública se leen como lo que dicen en el sitio', () => {
		for (const row of searchHelp('sitio')) {
			const pq = parseSearch(row.example, 'sitio');
			if (row.id === 'frase') expect(pq.phrases).toEqual(['reduccion de danos']);
			else if (row.id === 'sin') expect(pq.exclude).toEqual(['online']);
			else if (row.id === 'fechas') {
				expect(pq.dates.map((d) => d.when.kind)).toEqual(['finde']);
				expect(pq.words).toEqual(['fiesta']);
			} else expect(pq.operators).toBe(true);
		}
	});
});
