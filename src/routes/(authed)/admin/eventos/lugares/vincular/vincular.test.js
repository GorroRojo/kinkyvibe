/**
 * Lugares → «Vincular lugares» contra un D1 de miniflare: solo admins; «Vincular» crea el edge
 * `lugar` de cada evento por el guardado de siempre (versión nueva, revisión, registro), con el
 * nivel propio del evento solo si mostraba menos; saltea los que ya tienen lugar; «Dejar como
 * texto» los saca de la lista hasta que cambie su «Dónde», y «Volver a sugerir» los devuelve.
 * Eventos y lugares inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const posts = vi.hoisted(() => ({ listed: /** @type {any[]} */ ([]) }));
vi.mock('$lib/server/contenido/posts.js', () => ({
	sitePosts: async (/** @type {unknown} */ _p, /** @type {boolean} */ _wiki, unlisted = false) =>
		structuredClone(unlisted ? [] : posts.listed)
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { eventVenueLink, setEventVenue } from '$lib/server/amigues/venues.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { actions, load } from './+page.server.js';
import { load as loadNewProfile } from '../../../comunidad/perfiles/nuevo/+page.server.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
	posts.listed = [];
});

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/**
 * Un evento con su «Dónde», en `sitePosts` y en la base.
 * @param {string} slug
 * @param {Record<string, unknown>} place
 */
async function event(slug, place) {
	posts.listed.push({
		path: `/calendario/${slug}`,
		meta: {
			category: 'calendario',
			postID: slug,
			title: `Evento ${slug}`,
			start: '2025-05-01T20:00-03:00',
			...place
		}
	});
	return /** @type {number} */ (await makeEvent(t.db, slug, { data: place }));
}

/** @param {any} locals */
async function runLoad(locals = admin) {
	/** @type {any} */
	const ev = {
		locals,
		platform: t.platform,
		url: new URL('http://localhost/admin/eventos/lugares/vincular'),
		setHeaders: () => {}
	};
	return /** @type {any} */ (await load(ev));
}

/**
 * Llama a una action como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {'vincular' | 'dejar' | 'volver'} name
 * @param {any} locals
 * @param {[string, string][]} fields
 */
async function call(name, locals, fields) {
	const body = new FormData();
	for (const [k, v] of fields) body.append(k, v);
	const url = `http://localhost/admin/eventos/lugares/vincular?/${name}`;
	/** @type {any} */
	const ev = {
		platform: t.platform,
		locals,
		request: new Request(url, { method: 'POST', body }),
		url: new URL(url)
	};
	try {
		return /** @type {any} */ (await actions[name](ev));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

/** @param {number} id */
async function versionOf(id) {
	const row = await t.db.prepare('SELECT version FROM objects WHERE id = ?1').bind(id).first();
	return Number(row?.version);
}

/** @param {number} id */
async function revisions(id) {
	const { results } = await t.db
		.prepare('SELECT version, source FROM object_revisions WHERE object_id = ?1 ORDER BY version')
		.bind(id)
		.all();
	return results;
}

/** El formulario de un grupo como lo manda la página. */
/** @param {any} group @param {number} venueId */
const groupFields = (group, venueId) =>
	/** @type {[string, string][]} */ ([
		[`lugar:${group.key}`, String(venueId)],
		[`titulo:${group.key}`, group.title],
		...group.events.map((/** @type {any} */ e) => [`evento:${group.key}`, e.slug])
	]);

describe('/admin/eventos/lugares/vincular', () => {
	it('solo admins', async () => {
		await event('a', { location_name: 'Galpón Inventado' });
		await expect(runLoad(notAdmin)).rejects.toMatchObject({ status: 403 });
		await expect(runLoad({})).rejects.toMatchObject({ status: 303 });
		for (const name of /** @type {const} */ (['vincular', 'dejar', 'volver'])) {
			expect(await call(name, notAdmin, [['solo', 'x']])).toEqual({ thrown: 403 });
		}
	});

	it('agrupa los eventos sin lugar y sugiere el lugar con su puntaje y por qué', async () => {
		const venue = await makeProfile(t.db, {
			title: 'Galpón Inventado',
			kind: 'lugar',
			data: { address: 'Avenida Falsa 123', area: 'Barrio Falso' }
		});
		await event('a', { location_name: 'Galpón Inventado', location: 'Av. Falsa 123, CABA' });
		await event('b', { location: 'Avenida Falsa 123' });
		await event('c', { location: 'Online' });
		const data = await runLoad();
		expect(data.total).toBe(3);
		expect(data.groups).toHaveLength(1);
		const [g] = data.groups;
		expect(g.events.map((/** @type {any} */ e) => e.slug).sort()).toEqual(['a', 'b']);
		expect(g.suggestions[0]).toMatchObject({ id: venue.id, score: 100 });
		expect(g.suggestions[0].reasons.join(' ')).toContain('misma calle y número');
		expect(g.marked).toBe(true);
		expect(data.venues.map((/** @type {any} */ v) => v.id)).toEqual([venue.id]);
	});

	it('«Vincular» crea los edges con revisión, versión nueva y registro; el «Dónde» queda', async () => {
		const venue = await makeProfile(t.db, {
			title: 'Galpón Inventado',
			kind: 'lugar',
			data: { address: 'Calle Falsa 123' }
		});
		const a = await event('a', { location_name: 'Galpón Inventado', location: 'Calle Falsa 123' });
		const b = await event('b', { location_name: 'Galpón Inventado' });
		const before = { a: await versionOf(a), b: await versionOf(b) };
		const [g] = (await runLoad()).groups;

		const r = await call('vincular', admin, [['solo', g.key], ...groupFields(g, venue.id)]);
		expect(r.linkResult.remaining).toEqual([]);
		const [res] = r.linkResult.results;
		expect(res.errors).toEqual([]);
		expect(res.linked.map((/** @type {any} */ l) => l.slug).sort()).toEqual(['a', 'b']);

		// «a» mostraba nombre y dirección (lo mismo que el lugar): sin nivel propio. «b» solo el
		// nombre: lleva «Sólo Nombre».
		expect(await eventVenueLink(t.db, 'a')).toEqual({ venueId: venue.id, privacy: null });
		expect(await eventVenueLink(t.db, 'b')).toEqual({ venueId: venue.id, privacy: 'name' });
		expect(await versionOf(a)).toBe(before.a + 1);
		expect(await versionOf(b)).toBe(before.b + 1);
		expect(await revisions(a)).toContainEqual({ version: before.a + 1, source: 'lugar' });

		// El «Dónde» escrito no se tocó.
		const row = await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(a).first();
		expect(JSON.parse(String(row?.data))).toMatchObject({
			location_name: 'Galpón Inventado',
			location: 'Calle Falsa 123'
		});

		const audit = (await listAudit(t.db)).filter((e) => e.action === 'venue.bulk_link');
		expect(audit).toHaveLength(1);
		expect(audit[0]).toMatchObject({ targetType: 'profile', targetId: String(venue.id) });
		expect(audit[0].summary).toContain('Vinculó 2 eventos al lugar «Galpón Inventado»');

		// Ya no aparecen para vincular.
		expect((await runLoad()).groups).toEqual([]);
	});

	it('nunca muestra del lugar más de lo que el lugar deja ver', async () => {
		const venue = await makeProfile(t.db, {
			title: 'Casa Inventada',
			kind: 'lugar',
			data: { address: 'Calle Falsa 123', venue_privacy: 'name' }
		});
		await event('a', { location_name: 'Casa Inventada', location: 'Calle Falsa 123' });
		const [g] = (await runLoad()).groups;
		await call('vincular', admin, [['solo', g.key], ...groupFields(g, venue.id)]);
		expect(await eventVenueLink(t.db, 'a')).toEqual({ venueId: venue.id, privacy: null });
	});

	it('saltea el evento que consiguió lugar en el medio (y repetir es seguro)', async () => {
		const venue = await makeProfile(t.db, { title: 'Galpón Inventado', kind: 'lugar' });
		const other = await makeProfile(t.db, { title: 'Sótano de Prueba', kind: 'lugar' });
		await event('a', { location_name: 'Galpón Inventado' });
		const b = await event('b', { location_name: 'Galpón Inventado' });
		const [g] = (await runLoad()).groups;
		// Alguien le puso otro lugar a «b» mientras tanto.
		await setEventVenue(t.db, { eventSlug: 'b', venueId: other.id, privacy: null, by: 'otre' });
		const version = await versionOf(b);

		const r = await call('vincular', admin, [['marcar', g.key], ...groupFields(g, venue.id)]);
		const [res] = r.linkResult.results;
		expect(res.linked.map((/** @type {any} */ l) => l.slug)).toEqual(['a']);
		expect(res.skipped).toEqual(['b']);
		expect(await eventVenueLink(t.db, 'b')).toEqual({ venueId: other.id, privacy: null });
		expect(await versionOf(b)).toBe(version);

		const again = await call('vincular', admin, [['marcar', g.key], ...groupFields(g, venue.id)]);
		expect(again.linkResult.results[0].linked).toEqual([]);
		expect((await listAudit(t.db)).filter((e) => e.action === 'venue.bulk_link')).toHaveLength(1);
	});

	it('todas las marcadas, de a tandas, y un lugar que ya no existe da error en ese grupo', async () => {
		const venue = await makeProfile(t.db, { title: 'Galpón Inventado', kind: 'lugar' });
		await event('a', { location_name: 'Galpón Inventado' });
		await event('b', { location: 'Barrio Falso, Ciudad Inventada' });
		const groups = (await runLoad()).groups;
		const named = groups.find((/** @type {any} */ g) => g.title === 'Galpón Inventado');
		const area = groups.find((/** @type {any} */ g) => g.title !== 'Galpón Inventado');
		const r = await call('vincular', admin, [
			['marcar', named.key],
			['marcar', area.key],
			...groupFields(named, venue.id),
			...groupFields(area, 999_999)
		]);
		const byKey = Object.fromEntries(
			r.linkResult.results.map((/** @type {any} */ x) => [x.key, x])
		);
		expect(byKey[named.key].linked).toHaveLength(1);
		expect(byKey[area.key].errors[0].message).toContain('ya no existe');
	});

	it('sin nada elegido no guarda nada', async () => {
		const r = await call('vincular', admin, [['solo', 'c-x']]);
		expect(r.status).toBe(400);
	});

	it('«Dejar como texto» lo saca de la lista hasta que cambie el «Dónde»; «Volver a sugerir»', async () => {
		await makeProfile(t.db, { title: 'Galpón Inventado', kind: 'lugar' });
		await event('a', { location_name: 'Galpón Inventada' });
		const [g] = (await runLoad()).groups;

		const r = await call('dejar', admin, [['dejar', g.key], ...groupFields(g, 0)]);
		expect(r.dismiss.ok).toBe(true);
		let data = await runLoad();
		expect(data.groups).toEqual([]);
		expect(data.dismissed).toHaveLength(1);
		const audit = (await listAudit(t.db)).filter((e) => e.action === 'venue.link_dismiss');
		expect(audit[0].summary).toContain('Dejó como texto «Galpón Inventada»');
		// No se vinculó nada ni cambió el evento.
		expect(await eventVenueLink(t.db, 'a')).toBeNull();

		// Repetirlo no hace nada (ya no está para vincular).
		expect((await call('dejar', admin, [['dejar', g.key], ...groupFields(g, 0)])).status).toBe(400);

		// «Volver a sugerir».
		const d = data.dismissed[0];
		const back = await call('volver', admin, [
			['volver', d.key],
			[`titulo:${d.key}`, d.title],
			[`dejado:${d.key}`, 'a']
		]);
		expect(back.dismiss.ok).toBe(true);
		data = await runLoad();
		expect(data.groups).toHaveLength(1);
		expect(data.dismissed).toEqual([]);

		// Si el «Dónde» cambia después de dejarlo como texto, se vuelve a sugerir.
		await call('dejar', admin, [['dejar', g.key], ...groupFields(g, 0)]);
		expect((await runLoad()).groups).toEqual([]);
		posts.listed[0].meta.location_name = 'Galpón Inventado';
		expect((await runLoad()).groups).toHaveLength(1);
	});
});

describe('«Crear lugar nuevo» (Perfiles → nuevo, completado con el «Dónde»)', () => {
	/** @param {string} query */
	const open = async (query) =>
		/** @type {any} */ (
			await loadNewProfile(
				/** @type {any} */ ({
					locals: admin,
					platform: t.platform,
					url: new URL(`http://localhost/admin/comunidad/perfiles/nuevo?${query}`)
				})
			)
		);

	it('arranca con el nombre y la dirección (sin guardar nada)', async () => {
		const data = await open('tipo=lugar&nombre=Galp%C3%B3n+Inventado&direccion=Calle+Falsa+123');
		expect(data.values).toMatchObject({ kind: 'lugar', title: 'Galpón Inventado' });
		expect(data.values.text.address).toBe('Calle Falsa 123');
		const { results } = await t.db.prepare("SELECT id FROM objects WHERE type = 'perfil'").all();
		expect(results).toEqual([]);
	});

	it('la dirección solo para lugares, y todo con un largo máximo', async () => {
		const persona = await open(`tipo=persona&nombre=${'x'.repeat(300)}&direccion=Calle+Falsa+1`);
		expect(persona.values.title).toHaveLength(200);
		expect(persona.values.text.address).toBe('');
	});
});
