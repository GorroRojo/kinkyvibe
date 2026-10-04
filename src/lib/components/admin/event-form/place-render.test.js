/**
 * «📍 Lugar» del formulario de eventos (PlaceSection; pedido de gorrite: elegir el lugar desde el
 * evento): el buscador de lugares (con ocultos, no listados y sin aprobar marcados), el nivel de
 * privacidad para el evento («Igual que el Lugar (…)» y los demás) y el «Dónde» en texto libre,
 * plegado cuando hay un lugar. También que Editar y Crear lo usan y mandan lo elegido en campos
 * aparte del archivo. Lugares inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { datosFieldId, datosFields, splitPlaceFields } from '$lib/admin/postFields.js';
import { VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/admin/eventos/fiesta-de-prueba/editar') })
}));

const { default: PlaceSection } = await import('./PlaceSection.svelte');
const { default: PostEditor } = await import('$lib/components/admin/PostEditor.svelte');
const { default: NewEvent } =
	await import('../../../../routes/(authed)/admin/eventos/nuevo/+page.svelte');

/** @param {Partial<import('$lib/utils/venueChoice.js').VenueOption>} o */
const option = (o) => ({
	id: 1,
	slug: 'sala-inventada',
	title: 'Sala Inventada',
	visibility: 'public',
	unlisted: false,
	approved: true,
	privacy: null,
	address: '',
	area: '',
	city: '',
	version: 1,
	...o
});
const VENUES = [
	option({
		id: 1,
		title: 'Sala Inventada',
		privacy: 'name',
		address: 'Calle Inventada 123',
		area: 'Barrio Inventado'
	}),
	option({
		id: 2,
		slug: 'casa-oculta',
		title: 'Casa Oculta',
		visibility: 'hidden',
		unlisted: true
	}),
	option({ id: 3, slug: 'sala-pendiente', title: 'Sala Pendiente', approved: false })
];
const placeFields = splitPlaceFields(datosFields('editar')).place;

/** @param {Record<string, any>} props */
const place = (props) =>
	render(PlaceSection, {
		props: {
			fields: placeFields,
			idFor: datosFieldId('editar'),
			values: { location: '', location_map: '', location_name: '' },
			idPrefix: 'edit',
			...props
		}
	}).body;

/** @param {string} body @param {string} id */
const hasId = (body, id) => body.includes(`id="${id}"`);

describe('PlaceSection', () => {
	it('sin base (sin buscador): solo el «Dónde» en texto libre, como antes', () => {
		const body = place({ picker: null });
		expect(hasId(body, 'sec-lugar')).toBe(true);
		for (const id of ['location-input', 'location_map-input', 'location_name-input'])
			expect(hasId(body, id), id).toBe(true);
		expect(hasId(body, 'edit-venue-search')).toBe(false);
		expect(body).not.toContain('<details');
	});

	it('sin lugar elegido: el buscador, con las marcas, «Crear lugar» y el texto libre a la vista', () => {
		const body = place({
			picker: { venues: VENUES, current: { venueId: null, privacy: null }, flagOn: true },
			choice: { venueId: null, privacy: null }
		});
		expect(hasId(body, 'edit-venue-search')).toBe(true);
		for (const title of ['Sala Inventada', 'Casa Oculta', 'Sala Pendiente'])
			expect(body).toContain(title);
		for (const mark of ['Oculto', 'No listado', 'Sin aprobar']) expect(body).toContain(mark);
		// El panel ve la dirección (decisión de gorrite).
		expect(body).toContain('Calle Inventada 123, Barrio Inventado');
		// Acción de texto (`.kv-link`): el «+» ahora es el ícono de adelante.
		expect(body).toMatch(
			/<button[^>]*class="kv-link"[^>]*>(?:(?!<\/button>)[\s\S])*<svg(?:(?!<\/button>)[\s\S])*Crear lugar\s*<\/button>/
		);
		expect(hasId(body, 'location-input')).toBe(true);
		expect(body).not.toContain('<details');
		expect(hasId(body, 'edit-venue-flag')).toBe(false);
	});

	it('con un lugar: el nivel para el evento («Igual que el Lugar» y los demás) y el texto libre plegado', () => {
		const body = place({
			picker: { venues: VENUES, current: { venueId: 1, privacy: null }, flagOn: true },
			choice: { venueId: 1, privacy: null }
		});
		expect(hasId(body, 'edit-venue-chosen')).toBe(true);
		expect(hasId(body, 'edit-venue-privacy')).toBe(true);
		expect(body).toContain('Calle Inventada 123, Barrio Inventado');
		// «Editar» abre la edición rápida (nombre, dirección, barrio y ciudad), que va por su cuenta.
		expect(hasId(body, 'edit-venue-edit-open')).toBe(true);
		expect(hasId(body, 'edit-venue-edit')).toBe(false);
		expect(body).toContain('Igual que el Lugar (Sólo Nombre)');
		for (const label of Object.values(VENUE_PRIVACY_LABELS)) expect(body).toContain(label);
		expect(body).toContain('Cambiar');
		expect(body).toContain('Sacar lugar');
		expect(body).toContain('/admin/comunidad/perfiles/sala-inventada');
		// El buscador, recién con «Cambiar».
		expect(hasId(body, 'edit-venue-search')).toBe(false);
		expect(body).toMatch(
			/<details[^>]*>\s*<summary[^>]*>Usar texto libre en vez de un lugar<\/summary>/
		);
		expect(hasId(body, 'location-input')).toBe(true);
	});

	it('avisa si el texto libre tiene una dirección y el nivel no la muestra; con el interruptor apagado, que se guarda igual', () => {
		const body = place({
			picker: { venues: VENUES, current: { venueId: 1, privacy: 'area' }, flagOn: false },
			choice: { venueId: 1, privacy: 'area' },
			values: { location: 'Calle Falsa 123', location_map: '', location_name: '' }
		});
		expect(body).toContain('el archivo es público');
		expect(hasId(body, 'edit-venue-flag')).toBe(true);
		expect(body).toMatch(/<option value="area"[^>]*selected/);
		const shows = place({
			picker: { venues: VENUES, current: { venueId: 1, privacy: 'public' }, flagOn: true },
			choice: { venueId: 1, privacy: 'public' },
			values: { location: 'Calle Falsa 123', location_map: '', location_name: '' }
		});
		expect(shows).not.toContain('el archivo es público');
	});

	it('un lugar que ya no existe: lo avisa y deja sacarlo', () => {
		const body = place({
			picker: { venues: VENUES, current: { venueId: 99, privacy: null }, flagOn: true },
			choice: { venueId: 99, privacy: null }
		});
		expect(hasId(body, 'edit-venue-missing')).toBe(true);
		expect(body).toContain('Sacar lugar');
	});
});

const EVENT = `---
title: Fiesta de prueba
summary: Una fiesta inventada para las pruebas
published_date: 2026-09-01Z-03:00
category: calendario
layout: calendario
status: abierto
start: 2026-12-19T22:00-03:00
location: Calle Falsa 123
tags:
  - español
  - AMBA
---

Texto de **prueba**.
`;
const common = { tagUsage: {}, profiles: [], authorUsage: {}, maxImageBytes: 5 * 1024 * 1024 };

/** @param {string} body @param {string} name */
const hiddenValue = (body, name) =>
	body.match(new RegExp(`<input type="hidden" name="${name}" value="([^"]*)"`))?.[1];

describe('Editar y Crear usan el «Lugar»', () => {
	it('Editar: la sección (con el «Dónde» fuera de Datos) y lo elegido en campos aparte, sin tocar', () => {
		const body = render(PostEditor, {
			props: {
				data: {
					...common,
					post: { raw: EVENT, sha: 'sha-de-prueba', path: 'src/lib/posts/calendario/fiesta.md' },
					image: null,
					sales: null,
					venuePicker: { venues: VENUES, current: { venueId: 1, privacy: 'name' }, flagOn: true }
				},
				form: null,
				category: 'calendario',
				postID: 'fiesta-de-prueba',
				embedded: true
			}
		}).body;
		expect(hasId(body, 'sec-lugar')).toBe(true);
		expect(hasId(body, 'edit-venue-chosen')).toBe(true);
		// El «Dónde» va en «Lugar», después de «Datos».
		expect(body.indexOf('id="location-input"')).toBeGreaterThan(body.indexOf('id="sec-lugar"'));
		expect(hiddenValue(body, 'lugar')).toBe('1');
		expect(hiddenValue(body, 'lugarPrivacidad')).toBe('name');
		expect(hiddenValue(body, 'lugarCambio')).toBe('');
		// Sin `soloLugar`: cambiar solo el lugar guarda el archivo como siempre, con la fecha de
		// «Actualizado» de hoy y nada más (decisión de gorrite).
		expect(hiddenValue(body, 'soloLugar')).toBeUndefined();
		const sent = body.match(/<textarea hidden="" name="content">([^<]*)<\/textarea>/)?.[1] ?? '';
		/** @param {string} text */
		const withoutUpdated = (text) =>
			text
				.split('\n')
				.filter((l) => !l.startsWith('updated_date:'))
				.join('\n');
		expect(sent).toMatch(/^updated_date: /m);
		expect(withoutUpdated(sent)).toBe(withoutUpdated(EVENT));
		// El archivo no lleva nada del lugar.
		const file = body.match(/<textarea hidden="" name="content">([^<]*)<\/textarea>/)?.[1] ?? '';
		expect(file).toContain('title: Fiesta de prueba');
		expect(file).not.toMatch(/lugar|venue|Sala Inventada/i);
	});

	it('Crear: al duplicar un evento con lugar, arranca con ese lugar (y se manda como cambio)', () => {
		const body = render(NewEvent, {
			props: {
				data: /** @type {any} */ ({
					...common,
					source: null,
					seriesPrompt: null,
					template: EVENT,
					today: '2026-10-02',
					prefill: { date: '', startTime: '', endTime: '' },
					duplicables: [],
					takenSlugs: [],
					mock: false,
					venuePicker: { venues: VENUES, current: { venueId: 1, privacy: null }, flagOn: true }
				}),
				form: null
			}
		}).body;
		expect(hasId(body, 'sec-lugar')).toBe(true);
		expect(hasId(body, 'ev-venue-chosen')).toBe(true);
		expect(hiddenValue(body, 'lugar')).toBe('1');
		expect(hiddenValue(body, 'lugarCambio')).toBe('1');
		expect(body).toContain('Sala Inventada · Igual que el Lugar (Sólo Nombre)');
	});
});
