/**
 * Eventos → Lugares, "Dónde sucede cada evento": el desplegable dice qué se muestra de la
 * dirección (no "qué dirección") y la opción "igual que el lugar" muestra el nivel que vale
 * ahora para el lugar elegido (decisión de gorrite).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';
import { noticeBefore, textOf } from '$lib/testing/html.js';

/** @param {{ id: number, title: string, privacy: string | null }} v */
const venue = (v) => ({
	slug: `lugar-${v.id}`,
	visibility: 'public',
	area: 'Barrio Inventado',
	city: 'Ciudad de Prueba',
	hasMap: false,
	events: 0,
	...v
});

/**
 * @param {ReturnType<typeof venue>[]} venues
 * @param {any[]} [links]
 * @param {any[]} [events]
 */
const page = (
	venues,
	links = [],
	events = [{ slug: 'evento-inventado', title: 'Evento Inventado', start: '2026-11-01' }]
) =>
	render(Page, {
		props: {
			data: /** @type {any} */ ({
				pending: [],
				rejected: [],
				venues,
				links,
				events
			}),
			form: null
		}
	}).body;

/** @param {string} body */
const privacySelect = (body) =>
	body.match(/<select name="privacidad"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? '';

/** @param {string} body las celdas de texto de las tablas */
const cells = (body) =>
	[...body.matchAll(/<td class="small[^"]*">([^<]*)<\/td>/g)].map((m) => m[1]);

describe('/admin/eventos/lugares: qué se muestra de la dirección en un evento', () => {
	it('el desplegable habla de qué se muestra y cada opción lo dice explícito', () => {
		const body = page([venue({ id: 1, title: 'Sótano Inventado', privacy: 'name' })]);
		expect(body).toContain('Qué se muestra de la dirección en este evento');
		expect(body).not.toContain('Dirección en este evento');
		const options = [...privacySelect(body).matchAll(/<option([^>]*)>([^<]*)<\/option>/g)];
		expect(options.map((m) => m[2])).toEqual([
			'Igual que el Lugar (Sólo Nombre)',
			'Nombre + dirección',
			'Sólo Nombre',
			'Sólo dirección',
			'Sólo dirección parcial (Barrio)',
			'Nada'
		]);
		expect(options[0][1]).toContain('value=""');
	});

	it('si el lugar elegido no tiene nivel, "Igual que el Lugar" es Nombre + dirección', () => {
		const body = page([
			venue({ id: 1, title: 'Galpón Inventado', privacy: null }),
			venue({ id: 2, title: 'Sótano Inventado', privacy: 'hidden' })
		]);
		expect(privacySelect(body)).toContain('Igual que el Lugar (Nombre + dirección)');
	});

	it('la lista de eventos usa los mismos textos (y el nivel del lugar de cada uno)', () => {
		const link = { venueDeleted: false, updatedAt: 0, updatedBy: 'alguien-inventado' };
		const body = page(
			[
				venue({ id: 1, title: 'Galpón Inventado', privacy: null }),
				venue({ id: 2, title: 'Sótano Inventado', privacy: 'area' })
			],
			[
				{ ...link, eventSlug: 'a', venueId: 2, venueTitle: 'Sótano Inventado', privacy: null },
				{ ...link, eventSlug: 'b', venueId: 1, venueTitle: 'Galpón Inventado', privacy: 'address' }
			]
		);
		expect(cells(body)).toEqual([
			// la lista de lugares (Galpón sin nivel elegido)
			'Nombre + dirección',
			'Sólo dirección parcial (Barrio)',
			// la de eventos
			'Igual que el Lugar (Sólo dirección parcial (Barrio))',
			'Sólo dirección'
		]);
	});
});

describe('/admin/eventos/lugares: la dirección escrita en el archivo del evento', () => {
	const NOTE = 'Su archivo tiene la dirección escrita (el repo es público): sacala del';
	const link = {
		eventSlug: 'evento-inventado',
		venueId: 1,
		venueTitle: 'Galpón Inventado',
		venueDeleted: false,
		updatedAt: 0,
		updatedBy: 'alguien-inventado'
	};
	const venues = [venue({ id: 1, title: 'Galpón Inventado', privacy: null })];
	/** @param {boolean} mdAddress */
	const events = (mdAddress) => [
		{ slug: 'evento-inventado', title: 'Evento Inventado', start: '2026-11-01', mdAddress }
	];

	it('si el evento no muestra la dirección: nota fija en el aviso amarillo (Notice)', () => {
		const body = page(venues, [{ ...link, privacy: 'area' }], events(true));
		expect(textOf(body)).toContain(NOTE);
		const tag = noticeBefore(body, NOTE);
		expect(tag).toContain('class="kv-notice warn');
		expect(tag).not.toContain('role=');
	});

	it('si la muestra (o el archivo no la tiene), no avisa', () => {
		expect(textOf(page(venues, [{ ...link, privacy: 'public' }], events(true)))).not.toContain(
			NOTE
		);
		expect(textOf(page(venues, [{ ...link, privacy: 'area' }], events(false)))).not.toContain(NOTE);
	});
});
