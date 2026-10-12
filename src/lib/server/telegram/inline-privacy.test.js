/**
 * El modo inline con la base (D1 de miniflare; datos inventados): solo lo que ve une visitante sin
 * cuenta. Nada oculto, «solo con cuenta», sin aprobar, no listado ni borrado, en ninguna consulta
 * (vacía, con texto, con prefijo, con el nombre exacto de lo oculto), y el lugar de un evento solo
 * como lo muestra su página (nunca la calle de un lugar que la oculta).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const ORIGIN = 'https://kinkyvibe.ar';

/** Un .md de evento que no está en la base: no cuenta (los eventos salen de la base). */
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted
			? []
			: [
					{
						path: '/calendario/evento-solo-md',
						meta: {
							postID: 'evento-solo-md',
							category: 'calendario',
							layout: 'calendario',
							title: 'Evento Solo Md Escondido',
							start: '2031-02-01T20:00:00-03:00',
							tags: [],
							authors: []
						}
					}
				]
}));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});
afterEach(() => {
	vi.resetModules();
});

/**
 * @param {'evento' | 'material'} type
 * @param {string} slug
 * @param {string} title
 * @param {Record<string, unknown>} data
 * @param {'public' | 'hidden' | 'members'} [visibility]
 */
async function dbObject(type, slug, title, data, visibility = 'public') {
	return saveObject(
		t.db,
		{ type, slug, title, visibility, data },
		{ actor: 'admin-inventade', now: NOW }
	);
}

/**
 * Borra (suave) un objeto.
 *
 * @param {{ id: number, type: string, version: number }} o
 */
async function softDelete(o) {
	await saveObject(
		t.db,
		{ id: o.id, type: o.type, version: o.version, deleted: true },
		{ actor: 'admin-inventade', now: NOW }
	);
}

/** Lo que se esconde, en todas sus formas: ningún resultado puede nombrarlo. */
const HIDDEN = [
	'Evento Oculto Escondido',
	'Evento No Listado Escondido',
	'Evento Borrado Escondido',
	'Evento Solo Md Escondido',
	'Material Oculto Escondido',
	'Material Cuentas Escondido',
	'Material Borrado Escondido',
	'Persona Oculta Escondida',
	'Persona Cuentas Escondida',
	'Persona Sin Aprobar Escondida',
	'Persona No Listada Escondida',
	'Persona Borrada Escondida',
	'Calle Secreta 1234',
	'persona@example.invalid'
];

async function seed() {
	await dbObject('evento', 'evento-visible', 'Evento Visible Inventado', {
		start: '2031-02-10T20:00:00-03:00'
	});
	await dbObject(
		'evento',
		'evento-oculto',
		'Evento Oculto Escondido',
		{
			start: '2031-02-11T20:00:00-03:00'
		},
		'hidden'
	);
	await dbObject('evento', 'evento-no-listado', 'Evento No Listado Escondido', {
		start: '2031-02-12T20:00:00-03:00',
		unlisted: true
	});
	const borrado = await dbObject('evento', 'evento-borrado', 'Evento Borrado Escondido', {
		start: '2031-02-13T20:00:00-03:00'
	});
	await softDelete(borrado);

	await dbObject('material', 'material-visible', 'Material Visible Inventado', {
		published_date: '2030-05-01'
	});
	await dbObject(
		'material',
		'material-oculto',
		'Material Oculto Escondido',
		{
			published_date: '2030-05-02'
		},
		'hidden'
	);
	await dbObject(
		'material',
		'material-cuentas',
		'Material Cuentas Escondido',
		{
			published_date: '2030-05-03'
		},
		'members'
	);
	const mBorrado = await dbObject('material', 'material-borrado', 'Material Borrado Escondido', {
		published_date: '2030-05-04'
	});
	await softDelete(mBorrado);

	await makeProfile(t.db, {
		title: 'Persona Visible Inventada',
		slug: 'persona-visible',
		data: { bio: 'Escondido no, visible', email: 'persona@example.invalid' }
	});
	await makeProfile(t.db, {
		title: 'Persona Oculta Escondida',
		slug: 'p-oculta',
		visibility: 'hidden'
	});
	await makeProfile(t.db, {
		title: 'Persona Cuentas Escondida',
		slug: 'p-cuentas',
		visibility: 'members'
	});
	await makeProfile(t.db, {
		title: 'Persona Sin Aprobar Escondida',
		slug: 'p-sin-aprobar',
		approved: false
	});
	await makeProfile(t.db, {
		title: 'Persona No Listada Escondida',
		slug: 'p-no-listada',
		data: { unlisted: true }
	});
	const pBorrada = await makeProfile(t.db, {
		title: 'Persona Borrada Escondida',
		slug: 'p-borrada'
	});
	await softDelete(pBorrada);

	// El lugar del evento visible, en «Sólo dirección parcial» desde el evento: su página muestra el
	// barrio, nunca la calle ni el nombre.
	const venue = await makeProfile(t.db, {
		title: 'Casa Escondida Inventada',
		slug: 'casa-escondida',
		kind: 'lugar',
		data: {
			address: 'Calle Secreta 1234',
			area: 'Barrio Inventado',
			venue_privacy: 'public',
			unlisted: true
		}
	});
	await setEventVenue(t.db, {
		eventSlug: 'evento-visible',
		venueId: venue.id,
		privacy: 'area',
		by: 'admin-inventade',
		now: NOW
	});
}

/** El modo inline recién cargado, con la base de prueba. */
async function inlineDeps() {
	vi.resetModules();
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	const { inlineSource, clearInlineSource } = await import('./inlineSource.js');
	const { inlineEventInfo } = await import('./events.js');
	const { planInlineQuery, resetInlineRate } = await import('./inline.js');
	const { planUpdate } = await import('./router.js');
	const { listUpcomingEvents } = await import('./events.js');
	const { shortHash } = await import('./nav.js');
	clearInlineSource();
	resetInlineRate();
	const chatDeps = {
		listUpcoming: () => listUpcomingEvents(t.platform, NOW),
		origin: ORIGIN,
		now: () => NOW,
		inline: { source: () => inlineSource(t.platform, NOW) }
	};
	return {
		/** Buscar en todo el sitio desde el chat (`/buscar <texto>`). @param {string} text */
		chat: async (text) =>
			planUpdate(
				{ message: { chat: { id: 9, type: 'private' }, from: { id: 9 }, text } },
				chatDeps
			),
		/** Tocar un resultado (aunque no esté en la lista). @param {string} href @param {string} query */
		open: async (href, query) =>
			planUpdate(
				{
					callback_query: {
						id: 'cb',
						from: { id: 9 },
						data: `r:${shortHash(href)}:0:${query}`,
						message: { message_id: 3, chat: { id: 9, type: 'private' } }
					}
				},
				chatDeps
			),
		/** @param {string} query @param {string} [offset] */
		ask: async (query, offset = '') => {
			const plan = await planInlineQuery(
				{ id: 'iq', from: { id: 1 }, query, offset },
				{
					source: () => inlineSource(t.platform, NOW),
					events: (metas) => inlineEventInfo(t.platform, metas),
					origin: ORIGIN,
					now: () => NOW
				}
			);
			return /** @type {any} */ (plan?.steps[0]);
		}
	};
}

describe('modo inline: solo lo público', () => {
	it('nada oculto, solo con cuenta, sin aprobar, no listado ni borrado, en ninguna consulta', async () => {
		await seed();
		const { ask } = await inlineDeps();
		const queries = [
			'',
			'escondido',
			'escondida',
			'inventado',
			'evento:',
			'material:',
			'amigues:',
			'wiki:',
			'evento: escondido',
			'amigues: escondida',
			'calle secreta',
			...HIDDEN
		];
		const answers = [];
		for (const q of queries) answers.push(await ask(q));
		const json = JSON.stringify(answers);
		for (const text of HIDDEN) expect(json, text).not.toContain(text);
		for (const slug of [
			'evento-oculto',
			'evento-no-listado',
			'evento-borrado',
			'evento-solo-md',
			'material-oculto',
			'material-cuentas',
			'material-borrado',
			'p-oculta',
			'p-cuentas',
			'p-sin-aprobar',
			'p-no-listada',
			'p-borrada',
			'casa-escondida'
		]) {
			expect(json, slug).not.toContain(`/${slug}`);
		}
		// Lo visible sí aparece.
		const titles = answers.flatMap((a) => a.results.map((/** @type {any} */ r) => r.title));
		expect(titles).toEqual(
			expect.arrayContaining([
				'Evento Visible Inventado',
				'Material Visible Inventado',
				'Persona Visible Inventada'
			])
		);
	});

	it('el lugar de un evento, como su página: el barrio, nunca la calle ni el nombre oculto', async () => {
		await seed();
		const { ask } = await inlineDeps();
		const a = await ask('evento:');
		const card = a.results.find((/** @type {any} */ r) => r.title === 'Evento Visible Inventado');
		expect(card.description).toContain('Barrio Inventado');
		expect(card.input_message_content.message_text).toContain('Barrio Inventado');
		expect(JSON.stringify(a)).not.toContain('Calle Secreta');
		expect(JSON.stringify(a)).not.toContain('Casa Escondida');
	});

	it('buscar desde el chat: tampoco nada oculto, ni abriendo su tarjeta a mano', async () => {
		await seed();
		const { chat, open } = await inlineDeps();
		/** @type {string[]} */
		const answers = [];
		for (const q of ['escondido', 'escondida', 'inventado', 'calle secreta', ...HIDDEN]) {
			// Lo buscado vuelve en el texto («No encontré nada para «…»») y en los botones: eso no es
			// una fuga, se saca antes de mirar.
			answers.push(
				JSON.stringify(await chat(`/buscar ${q}`))
					.split(q)
					.join('…')
			);
		}
		const json = answers.join('\n');
		for (const text of HIDDEN) expect(json, text).not.toContain(text);
		for (const slug of [
			'evento-oculto',
			'evento-no-listado',
			'evento-borrado',
			'material-oculto',
			'material-cuentas',
			'material-borrado',
			'p-oculta',
			'p-cuentas',
			'p-sin-aprobar',
			'p-no-listada',
			'p-borrada',
			'casa-escondida'
		]) {
			expect(json, slug).not.toContain(`/${slug}`);
		}
		expect(json).toContain('Material Visible Inventado');
		expect(json).toContain('Persona Visible Inventada');
		// Un botón armado a mano con la dirección de algo oculto: «ya no está», sin mostrar nada.
		for (const href of [
			'/material/material-oculto',
			'/amigues/p-cuentas',
			'/calendario/evento-oculto'
		]) {
			const p = await open(href, 'escondido');
			expect(p?.steps, href).toEqual([]);
			expect(JSON.stringify(p), href).not.toContain('Escondid');
		}
	});
});
