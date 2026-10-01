/**
 * Rutas públicas de series con el interruptor `series` apagado (nada cambia: 404 o `null`) y
 * prendido: "Avisame si se repite" de punta a punta (suscribirse, confirmar, darse de baja), la
 * página del evento, /api/series, los calendarios .ics (contenido, link personal revocable, sin
 * datos de nadie) y Mi rincón → Calendario. D1 de miniflare; posts y mails inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import {
	DAY,
	fakeEvent,
	fakeRequestEvent,
	fakeSeriesPosts,
	insertOrder,
	linkIn,
	thrown
} from '$lib/server/series/fixtures.js';

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
	for (const m of [
		'$env/dynamic/private',
		'$lib/utils',
		'$lib/server/tickets/index.js',
		'$lib/server/tickets/checkout.js'
	])
		vi.doUnmock(m);
	vi.resetModules();
});

const EMAIL = 'persona.prueba@example.com';

/** Mails "mandados" por deliverEmail (mockeado) en la prueba actual. */
/** @type {Array<{ to: string, message: { subject: string, text: string } }>} */
let mails = [];

/**
 * Los módulos con los interruptores como se pida y posts inventados.
 * @param {{ series?: string, cuentas?: string }} [flags]
 */
async function modules({ series = '1', cuentas = '1' } = {}) {
	vi.resetModules();
	mails = [];
	vi.doMock('$env/dynamic/private', () => ({
		env: { SERIES_ENABLED: series, CUENTAS_ENABLED: cuentas }
	}));
	const now = Date.now();
	const listed = fakeSeriesPosts(now);
	const unlisted = [
		fakeEvent('privado-no-listado', now + 3 * DAY, ['taller'], { title: 'No listado de prueba' })
	];
	vi.doMock('$lib/utils', () => ({
		fetchMarkdownPosts: async (_wiki = false, onlyUnlisted = false) =>
			onlyUnlisted ? [...unlisted] : [...listed],
		fetchPost: async (/** @type {string} */ _c, /** @type {string} */ slug) => {
			const p = [...listed, ...unlisted].find((x) => x.meta.postID === slug);
			if (!p) throw new Error('404');
			return p;
		},
		thumbURL: async (/** @type {string} */ _c, /** @type {string} */ _p, /** @type {string} */ f) =>
			`/assets/${f}`,
		currentRelated: () => ({ relatedPosts: [], relatedPastCount: 0 }),
		relatedPostsFor: () => []
	}));
	vi.doMock('$lib/server/tickets/index.js', () => ({
		deliverEmail: async (/** @type {any} */ input) => {
			mails.push({ to: input.to, message: input.message });
			return 'sent';
		},
		siteOrigin: (/** @type {URL} */ url) => url.origin
	}));
	vi.doMock('$lib/server/tickets/checkout.js', () => ({
		getTicketsView: async () => null,
		summarizeTickets: () => null
	}));
	return {
		avisos: await import('./+page.server.js'),
		confirmar: await import('./confirmar/[token]/+page.server.js'),
		baja: await import('./baja/[token]/+page.server.js'),
		evento: await import('../calendario/[event]/+page.server.js'),
		api: await import('../../api/series/[tag]/+server.js'),
		icsTag: await import('../../ics/etiqueta/[tag].ics/+server.js'),
		icsMine: await import('../../ics/mio/[token].ics/+server.js'),
		calendario: await import('../mi-rincon/calendario/+page.server.js'),
		web: await import('$lib/server/series/web.js')
	};
}

/** @param {Parameters<typeof fakeRequestEvent>[0] extends infer O ? Omit<O, 'platform'> : never} o */
const ev = (o) => fakeRequestEvent({ platform: t.platform, ...o });

describe('interruptor apagado: nada cambia', () => {
	it('las páginas y endpoints nuevos dan 404; la página del evento no trae series', async () => {
		const m = await modules({ series: '0' });
		const notFound = { status: 404 };
		expect(
			await thrown(() => m.avisos.load(ev({ path: '/avisos?serie=Picantearla' })))
		).toMatchObject(notFound);
		expect(
			await thrown(() =>
				m.avisos.actions.suscribir(ev({ form: { serie: 'Picantearla', email: EMAIL } }))
			)
		).toMatchObject(notFound);
		expect(await thrown(() => m.confirmar.load(ev({ params: { token: 'x' } })))).toMatchObject(
			notFound
		);
		expect(await thrown(() => m.api.GET(ev({ params: { tag: 'Picantearla' } })))).toMatchObject(
			notFound
		);
		expect(await thrown(() => m.icsTag.GET(ev({ params: { tag: 'Picantearla' } })))).toMatchObject(
			notFound
		);
		expect(
			await thrown(() => m.icsMine.GET(ev({ params: { token: 'x'.repeat(43) } })))
		).toMatchObject(notFound);
		expect(
			await thrown(() =>
				m.calendario.load(ev({ member: { id: crypto.randomUUID(), email: EMAIL } }))
			)
		).toMatchObject(notFound);
		const data = /** @type {any} */ (
			await m.evento.load(
				ev({ path: '/calendario/serie-prueba-2', params: { event: 'serie-prueba-2' } })
			)
		);
		expect(data.series).toBeNull();
		expect(mails).toHaveLength(0);
	});
	it('el cron no hace nada de series', async () => {
		const m = await modules({ series: '0' });
		expect(
			await m.web.runSeriesCron({ db: t.db, origin: 'https://kinkyvibe.ar', fetch })
		).toBeNull();
		const seen = await t.db.prepare('SELECT COUNT(*) AS n FROM series_editions_seen').first();
		expect(Number(seen?.n)).toBe(0);
	});
});

describe('prendido: "Avisame si se repite" de punta a punta', () => {
	it('suscribirse → confirmar con el link → darse de baja con el link', async () => {
		const m = await modules();
		const r = /** @type {any} */ (
			await m.avisos.actions.suscribir(
				ev({ path: '/avisos', form: { serie: 'Picantearla', email: EMAIL } })
			)
		);
		expect(r).toMatchObject({ ok: true, status: 'pending', seriesName: 'Picantearla' });
		expect(mails).toHaveLength(1);
		expect(mails[0].to).toBe(EMAIL);

		const confirm = String(linkIn(mails[0].message.text, '/avisos/confirmar/'));
		const token = confirm.split('/').pop() ?? '';
		// GET solo muestra el botón: no confirma (los antivirus del correo abren los links)
		await m.confirmar.load(ev({ params: { token } }));
		const before = await t.db.prepare('SELECT confirmed_at FROM series_subscriptions').first();
		expect(before?.confirmed_at).toBeNull();
		expect(await m.confirmar.actions.default(ev({ params: { token }, form: {} }))).toMatchObject({
			ok: true,
			seriesName: 'Picantearla'
		});
		const again = /** @type {any} */ (
			await m.confirmar.actions.default(ev({ params: { token }, form: {} }))
		);
		expect(again.status).toBe(400);

		const unsub = String(linkIn(mails[0].message.text, '/avisos/baja/')).split('/').pop() ?? '';
		expect(await m.baja.load(ev({ params: { token: unsub } }))).toEqual({
			valid: true,
			seriesName: 'Picantearla'
		});
		expect(await m.baja.actions.default(ev({ params: { token: unsub }, form: {} }))).toEqual({
			ok: true,
			seriesName: 'Picantearla'
		});
		const left = await t.db.prepare('SELECT COUNT(*) AS n FROM series_subscriptions').first();
		expect(Number(left?.n)).toBe(0);
	});

	it('la baja anda aunque después se apague el interruptor', async () => {
		let m = await modules();
		await m.avisos.actions.suscribir(ev({ form: { serie: 'Picantearla', email: EMAIL } }));
		const unsub = String(linkIn(mails[0].message.text, '/avisos/baja/')).split('/').pop() ?? '';
		m = await modules({ series: '0' });
		expect(await m.baja.actions.default(ev({ params: { token: unsub }, form: {} }))).toMatchObject({
			ok: true
		});
	});

	it('con cuenta: sin mail ni confirmación; la baja desde la página', async () => {
		const m = await modules();
		const account = await upsertVerifiedAccount(t.db, EMAIL);
		const member = { id: account.id, email: EMAIL };
		expect(
			await m.avisos.actions.suscribir(ev({ member, form: { serie: 'Picantearla', cuenta: '1' } }))
		).toMatchObject({ ok: true, status: 'confirmed' });
		expect(mails).toHaveLength(0);
		const page = /** @type {any} */ (
			await m.avisos.load(ev({ member, path: '/avisos?serie=Picantearla' }))
		);
		expect(page.account).toEqual({ member: true, subscribed: ['Picantearla'] });
		expect(
			await m.avisos.actions.baja(ev({ member, form: { serie: 'Picantearla' } }))
		).toMatchObject({ ok: true, status: 'removed' });
	});

	it('una serie que no existe: 404 en la página, 400 al suscribirse', async () => {
		const m = await modules();
		expect(await thrown(() => m.avisos.load(ev({ path: '/avisos?serie=taller' })))).toMatchObject({
			status: 404
		});
		const r = /** @type {any} */ (
			await m.avisos.actions.suscribir(ev({ form: { serie: 'taller', email: EMAIL } }))
		);
		expect(r.status).toBe(400);
	});
});

describe('prendido: páginas', () => {
	it('evento: «Edición N de…», anterior/siguiente y si ya pasó', async () => {
		const m = await modules();
		const data = /** @type {any} */ (
			await m.evento.load(
				ev({ path: '/calendario/serie-prueba-2', params: { event: 'serie-prueba-2' } })
			)
		);
		const [s] = data.series.list;
		expect(s).toMatchObject({ id: 'Picantearla', number: 8, total: 3, past: true });
		expect(s.prev.slug).toBe('serie-prueba-1');
		expect(s.next.slug).toBe('serie-prueba-3');
		expect(data.series.account).toEqual({ member: false, subscribed: [] });
		const other = /** @type {any} */ (
			await m.evento.load(ev({ path: '/calendario/otra-cosa', params: { event: 'otra-cosa' } }))
		);
		expect(other.series).toBeNull();
	});

	it('/api/series: serie con imagen y ediciones; etiqueta común solo el calendario', async () => {
		const m = await modules();
		const res = await m.api.GET(ev({ params: { tag: 'Picantearla' } }));
		const body = await res.json();
		expect(body.series).toMatchObject({
			id: 'Picantearla',
			image: '/assets/picantearla-miniatura.webp'
		});
		expect(body.series.upcoming.map((/** @type {any} */ e) => e.slug)).toEqual(['serie-prueba-3']);
		expect(body.series.past.map((/** @type {any} */ e) => e.slug)).toEqual([
			'serie-prueba-2',
			'serie-prueba-1'
		]);
		expect(body.feed).toBe('/ics/etiqueta/Picantearla.ics');
		const plain = await (await m.api.GET(ev({ params: { tag: 'taller' } }))).json();
		expect(plain).toMatchObject({ series: null, feed: '/ics/etiqueta/taller.ics' });
		expect(await thrown(() => m.api.GET(ev({ params: { tag: 'no-existe-nada' } })))).toMatchObject({
			status: 404
		});
	});
});

describe('prendido: calendarios .ics', () => {
	it('de una serie: sus ediciones, nada más', async () => {
		const m = await modules();
		const res = await m.icsTag.GET(ev({ params: { tag: 'Picantearla' } }));
		expect(res.headers.get('content-type')).toContain('text/calendar');
		const text = await res.text();
		expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(3);
		expect(text).toContain('UID:serie-prueba-3@kinkyvibe.ar');
		expect(text).not.toContain('otra-cosa');
		expect(text).not.toContain('privado-no-listado');
		expect(text).toContain('X-WR-CALNAME:Picantearla · KinkyVibe');
	});

	it('personal: solo tus eventos (también no listados), sin mails; revocado deja de andar', async () => {
		const m = await modules();
		const account = await upsertVerifiedAccount(t.db, EMAIL);
		const member = { id: account.id, email: EMAIL };
		await insertOrder(t.db, { email: EMAIL, slug: 'serie-prueba-3' });
		await insertOrder(t.db, { email: EMAIL, slug: 'privado-no-listado' });
		await insertOrder(t.db, { email: 'otra.persona@example.com', slug: 'otra-cosa' });

		const created = /** @type {any} */ (await m.calendario.actions.crear(ev({ member, form: {} })));
		const token = created.path.match(/^\/ics\/mio\/(.+)\.ics$/)[1];
		const res = await m.icsMine.GET(ev({ params: { token } }));
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		const text = await res.text();
		expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(text).toContain('UID:serie-prueba-3@kinkyvibe.ar');
		expect(text).toContain('UID:privado-no-listado@kinkyvibe.ar');
		expect(text).not.toContain('otra-cosa');
		expect(text).not.toContain('@example.com');

		const page = /** @type {any} */ (await m.calendario.load(ev({ member })));
		expect(page.feed).toMatchObject({ lastUsedAt: expect.any(Number) });
		expect(JSON.stringify(page)).not.toContain(token);

		await m.calendario.actions.revocar(ev({ member, form: {} }));
		expect(await thrown(() => m.icsMine.GET(ev({ params: { token } })))).toMatchObject({
			status: 404
		});
	});

	it('personal: con las cuentas apagadas, 404', async () => {
		const m = await modules({ cuentas: '0' });
		expect(
			await thrown(() => m.icsMine.GET(ev({ params: { token: 'x'.repeat(43) } })))
		).toMatchObject({
			status: 404
		});
	});

	it('Mi rincón → Calendario sin sesión: al ingreso', async () => {
		const m = await modules();
		expect(await thrown(() => m.calendario.load(ev({})))).toMatchObject({ status: 303 });
	});
});
