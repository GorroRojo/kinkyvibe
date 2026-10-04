/**
 * Mi rincón → Lo que sigo: con un interruptor apagado (`lo_que_sigo` o `cuentas`) todo da 404;
 * sin sesión lleva a /ingresar (y de vuelta a la página del botón «Seguir», solo si es de este
 * sitio); con sesión, seguir, cambiar opciones, dejar de seguir y el CSV, siempre solo lo de esa
 * cuenta. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeAccount, makeProfile } from '$lib/server/amigues/testing.js';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';

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
});
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/utils');
	vi.resetModules();
});

const DAY = 24 * 60 * 60 * 1000;
/** Un evento inventado, a `days` días de hoy. @param {string} slug @param {number} days @param {string[]} tags */
const fakeEvent = (slug, days, tags) => ({
	path: `/calendario/${slug}`,
	meta: {
		title: `Evento ${slug}`,
		postID: slug,
		category: 'calendario',
		layout: 'calendario',
		status: 'abierto',
		start: new Date(Date.now() + days * DAY).toISOString(),
		tags
	}
});
/** Los eventos del deploy (inventados): la página arma con esto el próximo de cada cosa. */
const FAKE_POSTS = [
	fakeEvent('ya-paso', -3, ['shibari']),
	fakeEvent('lejano', 40, ['shibari', 'cine']),
	fakeEvent('cercano', 5, ['shibari']),
	{
		...fakeEvent('cancelado', 2, ['shibari']),
		meta: { ...fakeEvent('cancelado', 2, ['shibari']).meta, status: 'cancelado' }
	}
];

/** @param {{ sigo?: string, cuentas?: string, perfiles?: string, series?: string }} [flags] */
async function modules({ sigo = '1', cuentas = '1', perfiles = '0', series } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			LO_QUE_SIGO_ENABLED: sigo,
			CUENTAS_ENABLED: cuentas,
			ETIQUETAS_DB_ENABLED: '0',
			PERFILES_PUBLICOS_ENABLED: perfiles,
			// Sin pedirlo, como antes: el interruptor `series` sin tocar.
			...(series ? { SERIES_ENABLED: series } : {})
		}
	}));
	// Los posts del repo no hacen falta (y compilarlos todos tarda): eventos inventados, en la
	// base (de donde salen los eventos).
	await seedPosts(t.db, FAKE_POSTS);
	vi.doMock('$lib/utils', async (importOriginal) => ({
		.../** @type {object} */ (await importOriginal()),
		fetchMarkdownPosts: async () => FAKE_POSTS
	}));
	return {
		page: await import('./+page.server.js'),
		csv: await import('./sigo.csv/+server.js'),
		rincon: await import('../+page.server.js'),
		calendario: await import('../calendario/+page.server.js'),
		feeds: await import('$lib/server/series/feeds.js'),
		subscriptions: await import('$lib/server/series/subscriptions.js')
	};
}

/** @param {Parameters<typeof fakeRequestEvent>[0] extends infer O ? Omit<O, 'platform'> : never} o */
const ev = (o) => fakeRequestEvent({ platform: t.platform, path: '/mi-rincon/sigo', ...o });

describe('interruptores', () => {
	for (const flags of [{ sigo: '0' }, { cuentas: '0' }]) {
		it(`apagado (${JSON.stringify(flags)}): 404 en la página, las acciones y el CSV`, async () => {
			const m = await modules(flags);
			const member = await makeAccount(t.db, 'apagado');
			const notFound = { status: 404 };
			expect(await thrown(() => m.page.load(ev({ member })))).toMatchObject(notFound);
			expect(
				await thrown(() =>
					m.page.actions.seguir(ev({ member, form: { tipo: 'etiqueta', clave: 'shibari' } }))
				)
			).toMatchObject(notFound);
			expect(await thrown(() => m.csv.GET(ev({ member })))).toMatchObject(notFound);
			const { results } = await t.db.prepare('SELECT * FROM follows').all();
			expect(results).toEqual([]);
		});
	}

	it('Mi rincón muestra el link solo con los dos prendidos', async () => {
		const member = await makeAccount(t.db, 'link');
		let m = await modules({ sigo: '0' });
		expect(
			/** @type {any} */ (await m.rincon.load(ev({ path: '/mi-rincon', member }))).sigoOn
		).toBe(false);
		m = await modules();
		expect(
			/** @type {any} */ (await m.rincon.load(ev({ path: '/mi-rincon', member }))).sigoOn
		).toBe(true);
	});
});

describe('sin sesión', () => {
	it('la página lleva a /ingresar', async () => {
		const m = await modules();
		expect(await thrown(() => m.page.load(ev({})))).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fmi-rincon%2Fsigo'
		});
	});
	it('«Seguir» lleva a /ingresar y vuelve a la página del botón (solo de este sitio)', async () => {
		const m = await modules();
		const form = { tipo: 'etiqueta', clave: 'shibari', volver: '/wiki/shibari' };
		expect(await thrown(() => m.page.actions.seguir(ev({ form })))).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fwiki%2Fshibari'
		});
		const evil = { ...form, volver: 'https://example.com/robar' };
		expect(await thrown(() => m.page.actions.seguir(ev({ form: evil })))).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fmi-rincon%2Fsigo'
		});
	});
});

describe('con sesión', () => {
	it('seguir una etiqueta (por alias), cambiar opciones, el CSV y dejar de seguir', async () => {
		const m = await modules();
		const member = await makeAccount(t.db, 'con-sesion');
		const r = /** @type {any} */ (
			await m.page.actions.seguir(ev({ member, form: { tipo: 'etiqueta', clave: 'Shibari' } }))
		);
		expect(r).toMatchObject({ ok: true, kind: 'etiqueta', key: 'shibari' });

		let data = /** @type {any} */ (await m.page.load(ev({ member })));
		expect(data.follows).toHaveLength(1);
		expect(data.follows[0]).toMatchObject({
			key: 'shibari',
			href: '/wiki/shibari',
			options: { calendario: true, mail_nuevo: true, recordatorio: false }
		});

		await m.page.actions.opciones(
			ev({ member, form: { tipo: 'etiqueta', clave: 'shibari', recordatorio: 'on' } })
		);
		data = await m.page.load(ev({ member }));
		expect(data.follows[0].options).toEqual({
			calendario: false,
			mail_nuevo: false,
			recordatorio: true
		});

		const res = await m.csv.GET(ev({ path: '/mi-rincon/sigo/sigo.csv', member }));
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		const text = await res.text();
		expect(text).toContain('Etiqueta');
		expect(text).toContain('https://kinkyvibe.ar/wiki/shibari');

		await m.page.actions.dejar(ev({ member, form: { tipo: 'etiqueta', clave: 'shibari' } }));
		data = await m.page.load(ev({ member }));
		expect(data.follows).toEqual([]);
	});

	it('no sigue etiquetas que no existen ni perfiles que no puede ver', async () => {
		const m = await modules();
		const member = await makeAccount(t.db, 'no-puede');
		const hidden = await makeProfile(t.db, { title: 'Oculto Inventado', visibility: 'hidden' });
		for (const form of [
			{ tipo: 'etiqueta', clave: 'esta-etiqueta-no-existe' },
			{ tipo: 'perfil', clave: String(hidden.id) },
			{ tipo: 'cuenta', clave: member.id }
		]) {
			const r = /** @type {any} */ (await m.page.actions.seguir(ev({ member, form })));
			expect(r.status).toBe(404);
		}
		const { results } = await t.db.prepare('SELECT * FROM follows').all();
		expect(results).toEqual([]);
	});

	it('sigue un lugar visible; otra cuenta no ve nada de eso', async () => {
		const m = await modules();
		const a = await makeAccount(t.db, 'sigue-lugar');
		const b = await makeAccount(t.db, 'otra-cuenta');
		const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const r = /** @type {any} */ (
			await m.page.actions.seguir(
				ev({ member: a, form: { tipo: 'perfil', clave: String(venue.id) } })
			)
		);
		expect(r).toMatchObject({ ok: true, title: 'Lugar Inventado' });
		const mine = /** @type {any} */ (await m.page.load(ev({ member: a })));
		expect(mine.follows[0]).toMatchObject({ label: 'Lugar', title: 'Lugar Inventado' });
		const theirs = /** @type {any} */ (await m.page.load(ev({ member: b })));
		expect(theirs.follows).toEqual([]);
		const csv = await (await m.csv.GET(ev({ member: b }))).text();
		expect(csv).not.toContain('Lugar Inventado');
	});
});

describe('la página', () => {
	it('cada cosa seguida trae su emoji, su grupo y el próximo evento (no el pasado ni el cancelado)', async () => {
		const m = await modules();
		const member = await makeAccount(t.db, 'tarjetas');
		const venue = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		await m.page.actions.seguir(ev({ member, form: { tipo: 'etiqueta', clave: 'shibari' } }));
		await m.page.actions.seguir(ev({ member, form: { tipo: 'perfil', clave: String(venue.id) } }));
		const data = /** @type {any} */ (await m.page.load(ev({ member })));
		const tag = data.follows.find((/** @type {any} */ f) => f.kind === 'etiqueta');
		expect(tag).toMatchObject({ name: 'shibari', series: false, profileKind: null });
		expect(tag.next).toMatchObject({ title: 'Evento cercano', href: '/calendario/cercano' });
		const place = data.follows.find((/** @type {any} */ f) => f.kind === 'perfil');
		expect(place).toMatchObject({ name: 'Lugar Inventado', profileKind: 'lugar', next: null });
	});

	it('«Agregar»: etiquetas del árbol con cuántos eventos próximos tienen; perfiles solo con perfiles públicos', async () => {
		const member = await makeAccount(t.db, 'agregar');
		await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		await makeProfile(t.db, { title: 'Oculto Inventado', visibility: 'hidden' });
		let m = await modules();
		let data = /** @type {any} */ (await m.page.load(ev({ member })));
		const byId = new Map(data.add.tags.map((/** @type {any} */ o) => [o.id, o]));
		expect(byId.get('shibari')).toMatchObject({ name: 'shibari', count: 2, inTree: true });
		expect(byId.get('Rancheadita Kinky')).toMatchObject({ series: true });
		expect(byId.has('root')).toBe(false);
		expect(data.add.profiles).toEqual([]);

		m = await modules({ perfiles: '1' });
		data = /** @type {any} */ (await m.page.load(ev({ member })));
		expect(data.add.profiles).toEqual([
			{ key: expect.any(String), name: 'Lugar Inventado', kind: 'lugar' }
		]);
	});

	it('«Agregar» sigue con las opciones de siempre sin salir de la página', async () => {
		const m = await modules({ perfiles: '1' });
		const member = await makeAccount(t.db, 'agregar-seguir');
		await makeProfile(t.db, { title: 'Persona Inventada' });
		// Sin JavaScript: el nombre escrito, como en la URL de la etiqueta.
		const r = /** @type {any} */ (
			await m.page.actions.seguir(
				ev({ member, form: { tipo: 'etiqueta', clave: 'Rancheadita-Kinky' } })
			)
		);
		expect(r).toMatchObject({
			action: 'seguir',
			ok: true,
			kind: 'etiqueta',
			key: 'Rancheadita Kinky',
			options: { calendario: true, mail_nuevo: true, recordatorio: false }
		});
		// Con JavaScript: lo elegido en el buscador (un perfil, por su id).
		const { profiles } = /** @type {any} */ (await m.page.load(ev({ member }))).add;
		expect(profiles).toHaveLength(1);
		const p = /** @type {any} */ (
			await m.page.actions.seguir(
				ev({ member, form: { tipo: 'perfil', clave: profiles[0]?.key ?? '' } })
			)
		);
		expect(p).toMatchObject({ ok: true, kind: 'perfil' });
		const data = /** @type {any} */ (await m.page.load(ev({ member })));
		expect(data.follows.map((/** @type {any} */ f) => [f.kind, f.available])).toEqual([
			['etiqueta', true],
			['perfil', true]
		]);
		expect(data.follows[0].series).toBe(true);
		// Lo que no existe no se sigue, y la página lo dice junto al buscador.
		const bad = /** @type {any} */ (
			await m.page.actions.seguir(
				ev({ member, form: { tipo: 'etiqueta', clave: 'no-existe-inventada' } })
			)
		);
		expect(bad.status).toBe(404);
		expect(bad.data).toMatchObject({ action: 'seguir', error: expect.any(String) });
	});
});

describe('tu calendario', () => {
	it('mis entradas y donde participo: prendidos de entrada, se guardan por cuenta', async () => {
		const m = await modules();
		const a = await makeAccount(t.db, 'cal-prefs');
		const b = await makeAccount(t.db, 'cal-prefs-otra');
		expect(/** @type {any} */ (await m.page.load(ev({ member: a }))).calendar).toEqual({
			entradas: true,
			participo: true
		});
		const r = await m.page.actions.calendario(ev({ member: a, form: { entradas: 'on' } }));
		expect(r).toMatchObject({ ok: true, calendar: { entradas: true, participo: false } });
		expect(/** @type {any} */ (await m.page.load(ev({ member: a }))).calendar).toEqual({
			entradas: true,
			participo: false
		});
		expect(/** @type {any} */ (await m.page.load(ev({ member: b }))).calendar).toEqual({
			entradas: true,
			participo: true
		});
	});
});

describe('tu calendario en la misma página (lo que estaba en Mi rincón → Calendario)', () => {
	it('con `series`: el link secreto se crea acá, anda, se ve una vez y se revoca', async () => {
		const m = await modules({ series: '1' });
		const member = await makeAccount(t.db, 'cal-link');
		let data = /** @type {any} */ (await m.page.load(ev({ member })));
		expect(data).toMatchObject({ seriesOn: true, feed: null });

		const r = /** @type {any} */ (await m.page.actions.crearLink(ev({ member, form: {} })));
		expect(r).toMatchObject({ action: 'link', ok: true });
		const token = r.url.match(/^https?:\/\/[^/]+\/ics\/mio\/(.+)\.ics$/)[1];
		expect(await m.feeds.accountForFeed(t.db, token)).toBe(member.id);

		data = await m.page.load(ev({ member }));
		expect(data.feed).toMatchObject({ createdAt: expect.any(Number) });
		// El token no vuelve nunca en la página.
		expect(JSON.stringify(data)).not.toContain(token);

		expect(await m.page.actions.revocarLink(ev({ member, form: {} }))).toMatchObject({
			action: 'revocarLink',
			ok: true
		});
		expect(await m.feeds.accountForFeed(t.db, token)).toBeNull();
		expect(/** @type {any} */ (await m.page.load(ev({ member }))).feed).toBeNull();
	});

	it('sin `series` (el .ics personal da 404): sin link ni acciones del link', async () => {
		const m = await modules({ series: '0' });
		const member = await makeAccount(t.db, 'cal-sin-series');
		expect(await m.page.load(ev({ member }))).toMatchObject({ seriesOn: false, feed: null });
		for (const action of /** @type {const} */ (['crearLink', 'revocarLink'])) {
			expect(await thrown(() => m.page.actions[action](ev({ member, form: {} })))).toMatchObject({
				status: 404
			});
		}
		const { results } = await t.db.prepare('SELECT * FROM calendar_feeds').all();
		expect(results).toEqual([]);
	});

	it('las acciones del link también piden sesión y los dos interruptores', async () => {
		let m = await modules({ series: '1' });
		expect(await thrown(() => m.page.actions.crearLink(ev({ form: {} })))).toMatchObject({
			status: 303,
			location: '/ingresar?next=%2Fmi-rincon%2Fsigo'
		});
		m = await modules({ series: '1', sigo: '0' });
		const member = await makeAccount(t.db, 'cal-sigo-apagado');
		expect(await thrown(() => m.page.actions.crearLink(ev({ member, form: {} })))).toMatchObject({
			status: 404
		});
	});

	it('Mi rincón → Calendario sigue andando: con «Lo que sigo» lleva acá; apagado, como siempre', async () => {
		const member = await makeAccount(t.db, 'cal-viejo');
		let m = await modules({ series: '1' });
		const on = /** @type {any} */ (
			await m.calendario.load(ev({ path: '/mi-rincon/calendario', member }))
		);
		expect(on).toEqual({ sigoOn: true, feed: null, series: [] });
		// Una pestaña vieja todavía puede crear y revocar el link desde ahí.
		const created = /** @type {any} */ (
			await m.calendario.actions.crear(ev({ path: '/mi-rincon/calendario', member, form: {} }))
		);
		expect(created.path).toMatch(/^\/ics\/mio\/.+\.ics$/);
		expect(/** @type {any} */ (await m.page.load(ev({ member }))).feed).not.toBeNull();

		m = await modules({ series: '1', sigo: '0' });
		const off = /** @type {any} */ (
			await m.calendario.load(ev({ path: '/mi-rincon/calendario', member }))
		);
		expect(off).toMatchObject({ sigoOn: false, series: [] });
		expect(off.feed).toMatchObject({ createdAt: expect.any(Number) });
	});

	it('«Avisame» que la cuenta pidió antes: aparece en la lista al abrir la página, y el link de baja viejo anda', async () => {
		// Con «Lo que sigo» apagado, «Avisame» con cuenta escribe en series_subscriptions.
		let m = await modules({ series: '1', sigo: '0' });
		const a = await makeAccount(t.db, 'avisame-antes');
		const b = await makeAccount(t.db, 'avisame-otra');
		for (const acc of [a, b])
			await m.subscriptions.subscribeAccount({
				db: t.db,
				seriesTag: 'shibari',
				accountId: acc.id,
				now: Date.now() - DAY
			});
		const { results } = await t.db
			.prepare('SELECT id FROM series_subscriptions WHERE account_id = ?1')
			.bind(a.id)
			.all();
		const oldLink = await m.subscriptions.unsubscribeUrl(
			t.db,
			'https://kinkyvibe.ar',
			String(results[0].id)
		);

		m = await modules({ series: '1' });
		const data = /** @type {any} */ (await m.page.load(ev({ member: a })));
		expect(data.follows).toHaveLength(1);
		expect(data.follows[0]).toMatchObject({
			key: 'shibari',
			options: { calendario: true, mail_nuevo: true, recordatorio: false }
		});
		// Solo los de esta cuenta: la otra espera al cron.
		const left = await t.db.prepare('SELECT account_id FROM series_subscriptions').all();
		expect(left.results.map((r) => r.account_id)).toEqual([b.id]);

		const token = oldLink.split('/avisos/baja/')[1];
		expect(await m.subscriptions.unsubscribe(t.db, token)).toEqual({
			ok: true,
			seriesTag: 'shibari'
		});
		const after = /** @type {any} */ (await m.page.load(ev({ member: a })));
		expect(after.follows[0].options.mail_nuevo).toBe(false);
	});
});
