/**
 * Talleres en varias partes con una sola entrada: la lista «Las N partes del taller» en los mails
 * de entradas, transferencia y recordatorio (HTML dentro de la plantilla común y texto plano), y
 * de dónde sale (./workshopParts.js). Sin lista, los mails no cambian (los goldens de
 * templates.test.js lo comprueban caso por caso). Talleres, lugares y personas inventados; D1 de
 * miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { setPerPartTickets, setWorkshopParts } from '$lib/server/eventos/partes.js';
import { MAIL_LAYOUT_MARK } from '$lib/server/email/layout.js';
import { buildReminderEmail, buildTicketEmail, buildTransferEmail } from './email.js';
import { emailCases, fixtureOrder, fixtureTickets } from './email.fixtures.js';

/** Lugar público (ficha del evento) y lugar completo para quien compró, por dirección. */
const META = /** @type {Record<string, { location_name?: string, location?: string }>} */ ({
	'taller-inventado': { location_name: 'Espacio Inventado' },
	'taller-inventado-parte-2': { location_name: 'Otro Lugar Inventado' },
	'taller-inventado-parte-3': { location_name: 'Espacio Inventado' }
});
const BUYER = /** @type {Record<string, { location_name: string, location?: string }>} */ ({
	'taller-inventado': { location_name: 'Espacio Inventado', location: 'Calle Falsa 123' }
});

vi.mock('./events.js', async (orig) => ({
	.../** @type {object} */ (await orig()),
	getEventMeta: vi.fn(async (/** @type {string} */ slug) => META[slug] ?? null)
}));
vi.mock('../amigues/venues.js', async (orig) => ({
	.../** @type {object} */ (await orig()),
	buyerLocation: vi.fn(
		async (/** @type {any} */ _db, /** @type {string} */ slug) => BUYER[slug] ?? null
	)
}));

const { workshopPartsList } = await import('./workshopParts.js');

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const PARTS = {
	title: 'Las 3 partes del taller',
	lines: [
		'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado · Calle Falsa 123',
		'Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado',
		'Parte 3 · vie 16 oct · 19:30 · Espacio <Inventado> & Cía'
	]
};
const ORIGIN = 'https://kinkyvibe.example';
const CONTACT = 'contacto@example.com';
const EVENT = {
	title: 'Taller inventado',
	start: '2026-10-02T22:00:00-03:00',
	location: 'Calle Falsa 123',
	location_name: 'Espacio Inventado'
};

/** La tarjeta del mail (entre la etiqueta y el pie): la lista tiene que ir adentro. */
const card = (/** @type {string} */ html) =>
	html.slice(html.indexOf('<h1'), html.indexOf('</td></tr>\n<tr><td style="padding:18px'));

/** @type {[string, (parts: any) => { subject: string, html: string, text: string }][]} */
const builders = [
	[
		'entradas',
		(parts) =>
			buildTicketEmail({
				order: fixtureOrder(),
				tickets: fixtureTickets(),
				event: { ...EVENT, parts },
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			})
	],
	[
		'transferencia',
		(parts) =>
			buildTransferEmail({
				order: fixtureOrder({ payment_method: 'transferencia', surcharge_amount: 0 }),
				event: { title: EVENT.title, start: EVENT.start, parts },
				typeName: 'General',
				transferInfo: 'Alias: EJEMPLO.PRUEBA',
				contactEmail: CONTACT,
				origin: ORIGIN
			})
	],
	[
		'recordatorio',
		(parts) =>
			buildReminderEmail({
				order: fixtureOrder(),
				tickets: fixtureTickets(),
				reminder: { kind: 'hours_before', hours: 48, enabled: true },
				event: { ...EVENT, parts },
				typeName: 'General',
				origin: ORIGIN,
				contactEmail: CONTACT
			})
	]
];

describe('la lista de partes en los mails', () => {
	it.each(builders)('%s: en el HTML, dentro de la tarjeta de la plantilla común', (_, build) => {
		const { html } = build(PARTS);
		expect(html).toContain(MAIL_LAYOUT_MARK);
		const inCard = card(html);
		expect(inCard).toContain('data-kv-mail="partes"');
		expect(inCard).toContain(
			'<p style="margin:0 0 6px;font-weight:bold">Las 3 partes del taller</p>'
		);
		expect(inCard).toContain(
			'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado · Calle Falsa 123<br>Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado<br>Parte 3 · vie 16 oct · 19:30 · Espacio &lt;Inventado&gt; &amp; Cía'
		);
		// Después de los datos del evento (título y fecha).
		expect(inCard.indexOf('data-kv-mail="partes"')).toBeGreaterThan(
			inCard.indexOf('<strong>Taller inventado</strong>')
		);
	});

	it.each(builders)('%s: en el texto plano, una línea por parte, sin «hs» ni ISO', (_, build) => {
		const { text } = build(PARTS);
		const from = text.indexOf('Las 3 partes del taller');
		expect(from).toBeGreaterThan(text.indexOf('Taller inventado'));
		const block = text.slice(from).split('\n').slice(0, 4);
		expect(block).toEqual([
			'Las 3 partes del taller',
			'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado · Calle Falsa 123',
			'Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado',
			'Parte 3 · vie 16 oct · 19:30 · Espacio <Inventado> & Cía'
		]);
		for (const line of block) {
			expect(line).not.toMatch(/\bhs\b/);
			expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
		}
	});

	it.each(builders)(
		'%s: sin lista (null o vacía), igual byte a byte que sin el campo',
		(_, build) => {
			const none = build(undefined);
			expect(build(null)).toEqual(none);
			expect(build({ title: 'Las 0 partes del taller', lines: [] })).toEqual(none);
			expect(none.html).not.toContain('partes del taller');
			expect(none.text).not.toContain('partes del taller');
		}
	);

	it('los casos de los goldens no traen lista (siguen siendo los mails de siempre)', () => {
		for (const [, , input] of emailCases()) expect(input.event?.parts).toBeUndefined();
	});
});

describe('workshopPartsList: de dónde sale la lista', () => {
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

	const BY = 'admin-de-prueba';
	/** @param {string} slug @param {string} start @param {Record<string, unknown>} [data] */
	const event = (slug, start, data = {}) =>
		saveObject(
			t.db,
			{
				type: 'evento',
				slug,
				title: `Evento ${slug}`,
				data: { start, ...data },
				visibility: 'public'
			},
			{ actor: BY }
		);

	async function workshop() {
		await event('taller-inventado', '2026-10-02T22:00-03:00');
		await event('taller-inventado-parte-2', '2026-10-09T22:00-03:00');
		await event('taller-inventado-parte-3', '2026-10-16T19:30-03:00', { status: 'cancelado' });
		const r = await setWorkshopParts(t.db, {
			eventSlug: 'taller-inventado',
			partSlugs: ['taller-inventado-parte-2', 'taller-inventado-parte-3'],
			by: BY
		});
		expect(r).toEqual({ ok: true });
	}

	it('taller con una sola entrada: todas las partes con su fecha y su lugar', async () => {
		await workshop();
		expect(await workshopPartsList(t.db, 'taller-inventado')).toEqual({
			title: 'Las 3 partes del taller',
			lines: [
				'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado · Calle Falsa 123',
				'Parte 2 · vie 9 oct · 22:00 · Otro Lugar Inventado',
				'Parte 3 · vie 16 oct · 19:30 · Espacio Inventado · cancelada'
			]
		});
	});

	it('sin compra aprobada, el lugar como se ve en el sitio; online, «Online»', async () => {
		await workshop();
		expect((await workshopPartsList(t.db, 'taller-inventado', { buyer: false }))?.lines[0]).toBe(
			'Parte 1 · vie 2 oct · 22:00 · Espacio Inventado'
		);
		expect((await workshopPartsList(t.db, 'taller-inventado', { online: true }))?.lines).toEqual([
			'Parte 1 · vie 2 oct · 22:00 · Online',
			'Parte 2 · vie 9 oct · 22:00 · Online',
			'Parte 3 · vie 16 oct · 19:30 · Online · cancelada'
		]);
	});

	it('«Entradas por parte», una parte o un evento suelto: sin lista', async () => {
		await workshop();
		await event('evento-suelto', '2026-10-20T21:00-03:00');
		expect(await workshopPartsList(t.db, 'taller-inventado-parte-2')).toBeNull();
		expect(await workshopPartsList(t.db, 'evento-suelto')).toBeNull();
		expect(await workshopPartsList(t.db, 'no-existe')).toBeNull();
		expect(
			await setPerPartTickets(t.db, { eventSlug: 'taller-inventado', perPart: true, by: BY })
		).toEqual({ ok: true });
		expect(await workshopPartsList(t.db, 'taller-inventado')).toBeNull();
	});

	it('sin base o si la lectura falla: sin lista (nunca frena el mail)', async () => {
		expect(await workshopPartsList(null, 'taller-inventado')).toBeNull();
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('base rota');
			}
		});
		expect(await workshopPartsList(broken, 'taller-inventado')).toBeNull();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
