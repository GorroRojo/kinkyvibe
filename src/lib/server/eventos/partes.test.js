/**
 * Talleres en varias partes (./partes.js): los edges `parte` se escriben con saveObject() sobre el
 * taller (con su revisión) y se leen numerados, solo con lo que quien mira puede ver. Eventos
 * inventados; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { ANON } from '$lib/server/objects/visibility.js';
import { listRevisions } from '$lib/server/contenido/revisions.js';
import {
	PANEL_VIEWER,
	allWorkshops,
	coveredPartsByWorkshop,
	createWorkshopPart,
	panelParts,
	readWorkshop,
	setHideParts,
	setPerPartTickets,
	setWorkshopParts
} from './partes.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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

/**
 * @param {string} slug
 * @param {string} start
 * @param {{ visibility?: 'public' | 'hidden', data?: Record<string, unknown>, title?: string }} [o]
 */
async function event(slug, start, o = {}) {
	return saveObject(
		t.db,
		{
			type: 'evento',
			slug,
			title: o.title ?? `Evento ${slug}`,
			data: { start, ...o.data },
			visibility: o.visibility ?? 'public'
		},
		{ actor: BY }
	);
}

/** @param {number} id */
async function edgesOf(id) {
	const { results } = await t.db
		.prepare(
			"SELECT to_id, position, data FROM edges WHERE from_id = ?1 AND kind = 'parte' ORDER BY position"
		)
		.bind(id)
		.all();
	return results;
}

describe('armar un taller', () => {
	it('guarda los edges en orden, con versión nueva y revisión, y se lee desde cualquier parte', async () => {
		const ws = await event('taller', '2026-10-02T22:00-03:00', { title: 'Taller inventado' });
		const p2 = await event('taller-parte-2', '2026-10-09T22:00-03:00');
		const p3 = await event('taller-parte-3', '2026-10-16T22:00-03:00');
		// Al revés a propósito: manda el orden de la lista, no el de las fechas.
		const r = await setWorkshopParts(t.db, {
			eventSlug: 'taller',
			partSlugs: ['taller-parte-3', 'taller-parte-2'],
			by: BY
		});
		expect(r).toEqual({ ok: true });
		expect((await edgesOf(ws.id)).map((e) => [e.to_id, e.data])).toEqual([
			[p3.id, null],
			[p2.id, null]
		]);
		const saved = await t.db
			.prepare('SELECT version, data FROM objects WHERE id = ?1')
			.bind(ws.id)
			.first();
		expect(saved?.version).toBe(2);
		// Las partes son edges: nada en `data`.
		expect(JSON.parse(String(saved?.data))).toEqual({ start: '2026-10-02T22:00-03:00' });
		const revs = await listRevisions(t.db, ws.id);
		expect(revs[0]).toMatchObject({ version: 2, source: 'partes', savedBy: BY });

		for (const slug of ['taller', 'taller-parte-2', 'taller-parte-3']) {
			const read = await readWorkshop(t.db, slug, ANON);
			expect(read?.workshop.slug).toBe('taller');
			expect(read?.parts.map((p) => [p.slug, p.n])).toEqual([
				['taller', 1],
				['taller-parte-3', 2],
				['taller-parte-2', 3]
			]);
		}
	});

	it('un evento suelto no es taller; sacar todas las partes lo vuelve suelto', async () => {
		await event('taller', '2026-10-02T22:00-03:00');
		await event('taller-parte-2', '2026-10-09T22:00-03:00');
		expect(await readWorkshop(t.db, 'taller')).toBeNull();
		await setWorkshopParts(t.db, { eventSlug: 'taller', partSlugs: ['taller-parte-2'], by: BY });
		expect((await readWorkshop(t.db, 'taller-parte-2'))?.total).toBe(2);
		await setWorkshopParts(t.db, { eventSlug: 'taller', partSlugs: [], by: BY });
		expect(await readWorkshop(t.db, 'taller')).toBeNull();
		expect(await readWorkshop(t.db, 'taller-parte-2')).toBeNull();
	});

	it('reglas: una parte de un solo taller, sin partes de partes, sin sí mismo', async () => {
		await event('a', '2026-10-02T22:00-03:00', { title: 'Taller A' });
		await event('b', '2026-10-02T22:00-03:00', { title: 'Taller B' });
		await event('c', '2026-10-09T22:00-03:00', { title: 'Parte C' });
		expect(await setWorkshopParts(t.db, { eventSlug: 'a', partSlugs: ['a'], by: BY })).toEqual({
			ok: false,
			message: 'Un taller no puede ser parte de sí mismo.'
		});
		expect(await setWorkshopParts(t.db, { eventSlug: 'a', partSlugs: ['c', 'c'], by: BY })).toEqual(
			{
				ok: false,
				message: '«Parte C» está dos veces.'
			}
		);
		expect((await setWorkshopParts(t.db, { eventSlug: 'a', partSlugs: ['c'], by: BY })).ok).toBe(
			true
		);
		// C ya es de A.
		const twice = await setWorkshopParts(t.db, { eventSlug: 'b', partSlugs: ['c'], by: BY });
		expect(twice).toEqual({
			ok: false,
			message: '«Parte C» ya es parte de «Taller A»: sacala de ahí primero.'
		});
		// A tiene partes: no puede ser parte de B.
		const nested = await setWorkshopParts(t.db, { eventSlug: 'b', partSlugs: ['a'], by: BY });
		expect(nested.ok).toBe(false);
		// C es parte: no puede tener partes.
		const fromPart = await setWorkshopParts(t.db, { eventSlug: 'c', partSlugs: ['b'], by: BY });
		expect(fromPart).toEqual({
			ok: false,
			message: 'Este evento ya es una parte de «Taller A»: las partes se arman desde el taller.'
		});
		const missing = await setWorkshopParts(t.db, { eventSlug: 'a', partSlugs: ['nada'], by: BY });
		expect(missing).toEqual({ ok: false, message: 'No encontramos el evento «nada» en la base.' });
		const noWorkshop = await setWorkshopParts(t.db, { eventSlug: 'nada', partSlugs: [], by: BY });
		expect(noWorkshop.ok).toBe(false);
	});

	it('lo oculto no se ve: ni la parte oculta ni un taller oculto', async () => {
		await event('taller', '2026-10-02T22:00-03:00');
		await event('taller-parte-2', '2026-10-09T22:00-03:00');
		await event('taller-parte-3', '2026-10-16T22:00-03:00', { visibility: 'hidden' });
		await setWorkshopParts(t.db, {
			eventSlug: 'taller',
			partSlugs: ['taller-parte-2', 'taller-parte-3'],
			by: BY
		});
		expect((await readWorkshop(t.db, 'taller', ANON))?.parts.map((p) => p.slug)).toEqual([
			'taller',
			'taller-parte-2'
		]);
		expect(await readWorkshop(t.db, 'taller-parte-3', ANON)).toBeNull();
		expect((await readWorkshop(t.db, 'taller', PANEL_VIEWER))?.total).toBe(3);
		const all = await allWorkshops(t.db, ANON);
		expect(all.map((w) => w.parts.map((p) => p.slug))).toEqual([['taller', 'taller-parte-2']]);

		await event('oculto', '2026-11-02T22:00-03:00', { visibility: 'hidden' });
		await event('oculto-parte-2', '2026-11-09T22:00-03:00');
		await setWorkshopParts(t.db, { eventSlug: 'oculto', partSlugs: ['oculto-parte-2'], by: BY });
		expect(await readWorkshop(t.db, 'oculto-parte-2', ANON)).toBeNull();
		expect((await readWorkshop(t.db, 'oculto-parte-2', PANEL_VIEWER))?.total).toBe(2);
	});
});

describe('parte nueva y entradas', () => {
	it('crea la parte copiando el taller (sin entradas) y la suma al final', async () => {
		await event('taller', '2026-10-02T22:00-03:00', {
			title: 'Taller inventado (parte 1 de 2)',
			data: {
				summary: 'Resumen inventado',
				tags: ['taller'],
				extra: { tickets: [{ id: 'general', name: 'General', price: 1000 }], color: 'rosa' }
			}
		});
		const r = await createWorkshopPart(t.db, {
			eventSlug: 'taller',
			start: '2026-10-09T22:00-03:00',
			by: BY
		});
		expect(r).toEqual({ ok: true, slug: 'taller-parte-2' });
		const part = await t.db
			.prepare("SELECT title, data, visibility FROM objects WHERE slug = 'taller-parte-2'")
			.first();
		expect(part?.title).toBe('Taller inventado (parte 2)');
		expect(JSON.parse(String(part?.data))).toEqual({
			summary: 'Resumen inventado',
			start: '2026-10-09T22:00-03:00',
			tags: ['taller'],
			extra: { color: 'rosa' }
		});
		const ws = await readWorkshop(t.db, 'taller');
		expect(ws?.parts.map((p) => p.slug)).toEqual(['taller', 'taller-parte-2']);

		// La dirección siguiente libre aunque ya exista una «-parte-3» suelta.
		await event('taller-parte-3', '2026-12-01T22:00-03:00');
		const again = await createWorkshopPart(t.db, {
			eventSlug: 'taller',
			start: '2026-10-16T22:00-03:00',
			by: BY
		});
		expect(again).toEqual({ ok: true, slug: 'taller-parte-3-2' });
		expect(
			await createWorkshopPart(t.db, { eventSlug: 'taller', start: 'inválida', by: BY })
		).toEqual({ ok: false, message: 'Elegí cuándo empieza la parte nueva.' });
	});

	it('«Entradas por parte» va en `extra` del taller y cambia qué partes cubre su entrada', async () => {
		await event('taller', '2026-10-02T22:00-03:00', { data: { extra: { color: 'rosa' } } });
		await event('taller-parte-2', '2026-10-09T22:00-03:00', { title: 'Segunda' });
		await setWorkshopParts(t.db, { eventSlug: 'taller', partSlugs: ['taller-parte-2'], by: BY });
		let covered = await coveredPartsByWorkshop(t.db);
		expect(covered.get('taller')?.parts.map((p) => [p.slug, p.title, p.n])).toEqual([
			['taller-parte-2', 'Segunda', 2]
		]);
		expect(covered.get('taller')?.total).toBe(2);

		expect(await setPerPartTickets(t.db, { eventSlug: 'taller', perPart: true, by: BY })).toEqual({
			ok: true
		});
		const data = await t.db.prepare("SELECT data FROM objects WHERE slug = 'taller'").first();
		expect(JSON.parse(String(data?.data)).extra).toEqual({
			color: 'rosa',
			entradas_por_parte: true
		});
		expect((await readWorkshop(t.db, 'taller'))?.workshop.perPart).toBe(true);
		covered = await coveredPartsByWorkshop(t.db);
		expect(covered.has('taller')).toBe(false);
		// Las partes siguen (los edges no cambian).
		expect((await readWorkshop(t.db, 'taller'))?.total).toBe(2);

		await setPerPartTickets(t.db, { eventSlug: 'taller', perPart: false, by: BY });
		const back = await t.db.prepare("SELECT data FROM objects WHERE slug = 'taller'").first();
		expect(JSON.parse(String(back?.data)).extra).toEqual({ color: 'rosa' });
	});

	it('el panel sugiere los «-parte-N» sueltos y sabe si el evento es una parte', async () => {
		await event('taller', '2026-10-02T22:00-03:00');
		await event('taller-parte-2', '2026-10-09T22:00-03:00');
		await event('taller-parte-3', '2026-10-16T22:00-03:00');
		await event('tallerista', '2026-10-16T22:00-03:00');
		let state = await panelParts(t.db, 'taller');
		expect(state?.suggestions.map((s) => s.slug)).toEqual(['taller-parte-2', 'taller-parte-3']);
		await setWorkshopParts(t.db, { eventSlug: 'taller', partSlugs: ['taller-parte-2'], by: BY });
		state = await panelParts(t.db, 'taller');
		expect(state?.suggestions.map((s) => s.slug)).toEqual(['taller-parte-3']);
		const part = await panelParts(t.db, 'taller-parte-2');
		expect(part).toMatchObject({ inDb: true, isPart: true, current: { n: 2 } });
		expect(await panelParts(t.db, 'no-esta')).toEqual({
			inDb: false,
			workshop: null,
			suggestions: []
		});
	});
});

describe('«Si ocultás el taller, ocultar también sus partes»', () => {
	/** Las direcciones de los eventos que ve el público en las listas y si ve cada página. */
	async function publicView() {
		const posts = await import('$lib/server/contenido/posts.js');
		posts.clearContentCache();
		const listed = (await posts.sitePosts(t.platform))
			.map((p) => p.meta.postID)
			.filter((s) => s.startsWith('taller'))
			.sort();
		/** @type {Record<string, boolean>} */
		const pages = {};
		for (const slug of ['taller', 'taller-parte-2']) {
			pages[slug] = (await posts.siteEvent(t.platform, slug, { html: false })) !== null;
		}
		const admin = await posts.siteEvent(t.platform, 'taller-parte-2', {
			viewer: { role: 'admin', id: 'admin-de-prueba' },
			html: false
		});
		return { listed, pages, admin: admin !== null };
	}

	/** @param {'public' | 'hidden'} visibility */
	async function setWorkshopVisibility(visibility) {
		const row = /** @type {any} */ (
			await t.db.prepare("SELECT id, version FROM objects WHERE slug = 'taller'").first()
		);
		await saveObject(
			t.db,
			{ id: Number(row.id), type: 'evento', version: Number(row.version), visibility },
			{ actor: BY, now: Date.now() + 1000 }
		);
	}

	it('apagado (por defecto): ocultar el taller no oculta sus partes, como siempre', async () => {
		await event('taller', '2026-10-02T22:00-03:00', { data: { extra: { color: 'rosa' } } });
		await event('taller-parte-2', '2026-10-09T22:00-03:00');
		await setWorkshopParts(t.db, { eventSlug: 'taller', partSlugs: ['taller-parte-2'], by: BY });
		expect((await readWorkshop(t.db, 'taller'))?.workshop.hideParts).toBe(false);
		await setWorkshopVisibility('hidden');
		expect(await publicView()).toEqual({
			listed: ['taller-parte-2'],
			pages: { taller: false, 'taller-parte-2': true },
			admin: true
		});
	});

	it('prendido: va en `extra` del taller y, con el taller oculto, las partes tampoco se ven', async () => {
		await event('taller', '2026-10-02T22:00-03:00', { data: { extra: { color: 'rosa' } } });
		await event('taller-parte-2', '2026-10-09T22:00-03:00');
		await setWorkshopParts(t.db, { eventSlug: 'taller', partSlugs: ['taller-parte-2'], by: BY });
		expect(await setHideParts(t.db, { eventSlug: 'taller', hideParts: true, by: BY })).toEqual({
			ok: true
		});
		const data = await t.db.prepare("SELECT data FROM objects WHERE slug = 'taller'").first();
		expect(JSON.parse(String(data?.data)).extra).toEqual({ color: 'rosa', ocultar_partes: true });
		expect((await readWorkshop(t.db, 'taller'))?.workshop.hideParts).toBe(true);
		expect((await panelParts(t.db, 'taller'))?.workshop?.workshop.hideParts).toBe(true);

		// Con el taller a la vista, todo se ve igual.
		expect(await publicView()).toEqual({
			listed: ['taller', 'taller-parte-2'],
			pages: { taller: true, 'taller-parte-2': true },
			admin: true
		});
		// Taller oculto: la parte tampoco (salvo para admins).
		await setWorkshopVisibility('hidden');
		expect(await publicView()).toEqual({
			listed: [],
			pages: { taller: false, 'taller-parte-2': false },
			admin: true
		});

		// Apagarlo vuelve a lo de siempre y saca la clave.
		await setHideParts(t.db, { eventSlug: 'taller', hideParts: false, by: BY });
		const back = await t.db.prepare("SELECT data FROM objects WHERE slug = 'taller'").first();
		expect(JSON.parse(String(back?.data)).extra).toEqual({ color: 'rosa' });
		expect((await publicView()).listed).toEqual(['taller-parte-2']);
	});

	it('una parte nueva no copia la opción (es solo del taller)', async () => {
		await event('taller', '2026-10-02T22:00-03:00', {
			data: { extra: { color: 'rosa', ocultar_partes: true } }
		});
		await createWorkshopPart(t.db, {
			eventSlug: 'taller',
			start: '2026-10-09T22:00-03:00',
			by: BY
		});
		const part = await t.db
			.prepare("SELECT data FROM objects WHERE slug = 'taller-parte-2'")
			.first();
		expect(JSON.parse(String(part?.data)).extra).toEqual({ color: 'rosa' });
	});
});
