/**
 * Lugares → «Importar de eventos» (vista previa): cada candidato con su nombre, dirección,
 * eventos y fechas; los eventos que mostrarían otra cosa quedan sin marcar y dicen qué cambiaría;
 * nada se manda sin confirmar; hay CSV. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { planVenueImport } from '$lib/utils/venueImport.js';
import Page from './+page.svelte';

/** @param {string} slug @param {Record<string, unknown>} place @param {string} start */
const ev = (slug, place, start) => ({
	slug,
	title: `Evento ${slug}`,
	start,
	meta: { category: 'calendario', ...place }
});

const { candidates, skipped } = planVenueImport(
	[
		ev('a', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123, CABA' }, '2024-03-01'),
		ev('b', { location_name: 'Galpón Inventado' }, '2025-06-01'),
		ev(
			'c',
			{ location_name: 'El Galpón de Prueba', location: 'Calle Falsa 123, CABA' },
			'2024-01-01'
		),
		ev('d', { location: 'Barrio Falso, Ciudad Inventada' }, '2023-01-01'),
		ev('e', { location: 'Online' }, '2023-01-01'),
		// En un lugar que ya existe: se ofrece vincularlo (no hay nada que crear).
		ev('f', { location_name: 'Sótano Inventado' }, '2023-05-01')
	],
	{
		venues: [{ id: 9, slug: 'sotano', title: 'Sótano Inventado', data: { kind: 'lugar' } }]
	}
);

const body = render(Page, {
	props: {
		data: /** @type {any} */ ({ candidates, skipped, total: 5 })
	}
}).body;

describe('/admin/eventos/lugares/importar', () => {
	it('lista los candidatos con su dirección, cantidad de eventos y fechas', () => {
		expect(body).toContain('Leímos 5 eventos');
		expect(body).toContain('1 online');
		expect(body).toContain('value="Galpón Inventado"');
		expect(body).toContain('3 eventos (2024-01-01 a 2025-06-01)');
		expect(body).toContain('Calle Falsa 123, CABA');
		expect(body).toMatch(/Juntamos .*El Galpón de Prueba/);
		expect(body).toContain('sin nombre: escribí uno');
	});

	it('marca lo propuesto y avisa qué cambiaría en los demás', () => {
		/** @param {string} value */
		const checked = (value) =>
			new RegExp(`<input[^>]*value="${value}"[^>]*checked`).test(body) ||
			new RegExp(`<input[^>]*checked[^>]*value="${value}"`).test(body);
		const named = candidates.find((c) => c.hasName);
		const area = candidates.find((c) => !c.hasName);
		expect(checked(String(named?.key))).toBe(true);
		expect(checked(String(area?.key))).toBe(false);
		expect(checked('a')).toBe(true);
		expect(checked('b')).toBe(true);
		expect(checked('c')).toBe(false);
		expect(body).toContain('Cambiaría: se va a ver con el nombre «Galpón Inventado»');
	});

	it('cómo se crean: no listados por defecto, con «Públicos» y la opción de cada lugar', () => {
		expect(body).toContain('Cómo se crean');
		const radio = (/** @type {string} */ value) =>
			body.match(new RegExp(`<input[^>]*type="radio"[^>]*value="${value}"[^>]*>`))?.[0] ?? '';
		expect(radio('unlisted')).toMatch(/checked/);
		expect(radio('unlisted')).toContain('name="listado"');
		expect(radio('listed')).not.toMatch(/checked/);
		expect(body).toContain('No listados (no aparecen en Amigues)');
		expect(body).toContain('Públicos');
		// Cada lugar nuevo tiene su opción, que arranca «como todos»; el que ya existe no.
		const named = candidates.find((c) => c.hasName && !c.existing);
		const existing = candidates.find((c) => c.existing);
		expect(named).toBeDefined();
		expect(existing).toBeDefined();
		expect(body).toContain(`name="listado:${named?.key}"`);
		expect(body).not.toContain(`name="listado:${existing?.key}"`);
		expect(body).toContain('Como todos (No listado)');
		expect(body).toContain('no aparece en Amigues');
	});

	it('no manda nada sin confirmar, y tiene CSV', () => {
		// El botón de la lista solo abre la confirmación (type="button"); el submit está ahí.
		expect(body).toMatch(/<button[^>]*type="button"[^>]*>Crear lugares…<\/button>/);
		expect(body).not.toMatch(/type="submit"/);
		expect(body).toContain('CSV');
	});
});
