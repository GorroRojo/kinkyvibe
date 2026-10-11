/**
 * Lugares → «Vincular lugares»: cada grupo con su «Dónde» como lo escribieron, cantidad de
 * eventos y fechas, las sugerencias con su puntaje y por qué (la segura, elegida y marcada), qué
 * cambiaría en los eventos, y las acciones (Vincular, Buscar otro lugar, Crear lugar nuevo con el
 * nombre y la dirección, Dejar como texto). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

/** @param {string} slug @param {string} name @param {string} location @param {string} start */
const ev = (slug, name, location, start) => ({
	slug,
	title: `Evento ${slug}`,
	start,
	name,
	location,
	mapUrl: '',
	level: /** @type {const} */ ('public')
});

const venues = [
	{
		id: 1,
		slug: 'galpon-inventado',
		title: 'Galpón Inventado',
		address: 'Avenida Falsa 123',
		area: 'Barrio Falso',
		city: '',
		privacy: /** @type {const} */ ('public'),
		data: { kind: 'lugar', address: 'Avenida Falsa 123', area: 'Barrio Falso' }
	},
	{
		id: 2,
		slug: 'sotano',
		title: 'Sótano de Prueba',
		address: '',
		area: '',
		city: '',
		privacy: /** @type {const} */ ('public'),
		data: { kind: 'lugar' }
	}
];

const data = /** @type {any} */ ({
	total: 6,
	skipped: { online: 1, empty: 0, linked: 2 },
	venues,
	groups: [
		{
			key: 'c-a',
			title: 'Galpón Inventado',
			names: [{ text: 'Galpón Inventado', count: 2 }],
			locations: [{ text: 'Av. Falsa 123, CABA', count: 2 }],
			mapUrl: '',
			events: [
				ev('a', 'Galpón Inventado', 'Av. Falsa 123, CABA', '2024-03-01T20:00-03:00'),
				ev('b', 'Galpón Inventado', 'Av. Falsa 123, CABA', '2025-06-01T20:00-03:00')
			],
			first: '2024-03-01T20:00-03:00',
			last: '2025-06-01T20:00-03:00',
			suggestions: [{ id: 1, score: 100, reasons: ['mismo nombre («Galpón Inventado»)'] }],
			marked: true
		},
		{
			key: 'c-c',
			title: 'Un Lugar Nuevo',
			names: [{ text: 'Un Lugar Nuevo', count: 1 }],
			locations: [{ text: 'Calle Inventada 9', count: 1 }],
			mapUrl: '',
			events: [ev('c', 'Un Lugar Nuevo', 'Calle Inventada 9', '2023-01-01T20:00-03:00')],
			first: '2023-01-01T20:00-03:00',
			last: '2023-01-01T20:00-03:00',
			suggestions: [],
			marked: false
		}
	],
	dismissed: [
		{
			key: 'c-d',
			title: 'Casa de Alguien',
			names: [{ text: 'Casa de Alguien', count: 1 }],
			locations: [],
			mapUrl: '',
			events: [ev('d', 'Casa de Alguien', '', '2022-01-01T20:00-03:00')],
			first: '2022-01-01T20:00-03:00',
			last: '2022-01-01T20:00-03:00'
		}
	]
});

const body = render(Page, { props: { data, form: null } }).body;

/** @param {string} html @param {string} attrs */
const inputWith = (html, attrs) =>
	(html.match(/<input[^>]*>/g) ?? []).find((tag) =>
		attrs.split(' ').every((a) => tag.includes(a))
	) ?? '';

describe('/admin/eventos/lugares/vincular', () => {
	it('cada grupo con lo escrito, cantidad de eventos y fechas', () => {
		expect(body).toContain('Vincular lugares');
		expect(body).toContain('Leímos 6 eventos');
		expect(body).toContain('<strong>Galpón Inventado</strong>');
		expect(body).toContain('2 eventos · vie 1 mar 2024 a dom 1 jun 2025');
		expect(body).toContain('«Av. Falsa 123, CABA» (2)');
	});

	it('la sugerencia con su puntaje y por qué, elegida y marcada si es segura', () => {
		expect(body).toContain('100 %');
		expect(body).toContain('mismo nombre («Galpón Inventado»)');
		expect(body).toContain('Avenida Falsa 123, Barrio Falso');
		expect(inputWith(body, 'type="radio" name="lugar:c-a" value="1"')).toMatch(/checked/);
		expect(inputWith(body, 'name="marcar" value="c-a"')).toMatch(/checked/);
		expect(body).toContain('1 lugar marcado, 2 eventos');
	});

	it('avisa qué cambiaría en los eventos con ese lugar', () => {
		expect(body).toMatch(/Con «Galpón Inventado», 2 eventos se van a ver distinto/);
	});

	it('sin sugerencias: no se puede marcar, y ofrece buscar o crear con el nombre y la dirección', () => {
		expect(body).toContain('Sin sugerencias: buscá un lugar o creá uno nuevo.');
		expect(inputWith(body, 'name="marcar" value="c-c"')).toMatch(/disabled/);
		expect(body).toContain(
			'href="/admin/comunidad/perfiles/nuevo?tipo=lugar&amp;nombre=Un+Lugar+Nuevo&amp;direccion=Calle+Inventada+9"'
		);
		expect(body).toContain('Buscar otro lugar');
	});

	it('Vincular, Dejar como texto y lo que quedó como texto', () => {
		expect(body).toMatch(/<button[^>]*name="solo"[^>]*value="c-a"/);
		expect(body).toMatch(/<button[^>]*name="dejar"[^>]*value="c-a"[^>]*formaction="\?\/dejar"/);
		expect(body).toContain('Vincular todas las marcadas');
		expect(body).toContain('Quedaron como texto');
		expect(body).toContain('Casa de Alguien');
		expect(body).toMatch(/<button[^>]*name="volver"[^>]*value="c-d"/);
	});

	it('sin nada para vincular, el estado vacío', () => {
		const empty = render(Page, {
			props: { data: { ...data, groups: [], dismissed: [] }, form: null }
		}).body;
		expect(empty).toContain('No queda nada para vincular');
	});
});
