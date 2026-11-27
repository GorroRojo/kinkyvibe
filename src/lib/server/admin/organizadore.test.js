/**
 * Organizadores en el panel (src/lib/server/admin/organizadore.js): pruebas que intentan romperlo.
 * D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { ADMINS } from '$lib/server/auth.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

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
	vi.resetModules();
});

const EVENT = '/(authed)/admin/eventos/[slug]';

/**
 * Los módulos, recién cargados, con el interruptor prendido o apagado por su variable.
 * @param {{ on?: boolean }} [o]
 */
async function modules({ on = true } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { ROL_ORGANIZADORE_ENABLED: on ? '1' : '0' }
	}));
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	return {
		org: await import('./organizadore.js'),
		accounts: await import('$lib/server/cuentas/accounts.js'),
		perfiles: await import('$lib/server/cuentas/perfiles.js'),
		author: await import('$lib/server/contenido/author.js'),
		repo
	};
}

/**
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {string} name
 * @param {{ profiles?: boolean }} [o]
 */
async function account(m, name, { profiles = true } = {}) {
	const a = await m.accounts.upsertVerifiedAccount(t.db, `${name}@example.test`);
	await t.db.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1').bind(a.id).run();
	return { id: a.id, email: a.email, profiles };
}

/**
 * @param {Awaited<ReturnType<typeof modules>>} m
 * @param {{ id: string }} owner
 * @param {string} title
 */
async function profile(m, owner, title) {
	const r = /** @type {any} */ (
		await m.perfiles.createProfile(t.db, owner.id, { kind: 'grupo', title, visibility: 'public' })
	);
	expect(r.ok, JSON.stringify(r)).toBe(true);
	return /** @type {string} */ (r.profile?.slug ?? r.slug);
}

const common = {
	category: 'calendario',
	summary: 'Un evento de prueba',
	published_date: '2026-09-01Z-03:00',
	status: 'abierto',
	location_name: 'Espacio Inventado',
	tags: ['español', 'AMBA'],
	authors: [],
	payment_methods: ['transferencia'],
	tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 10 }]
};

/**
 * Tres cuentas que organizan o facilitan, una sin el permiso de perfiles, y tres eventos: el de
 * A (publicado), el de B (publicado) y uno oculto de A.
 */
async function world() {
	const m = await modules();
	const a = await account(m, 'organiza-a');
	const b = await account(m, 'organiza-b');
	const f = await account(m, 'facilita-f');
	const n = await account(m, 'sin-permiso-n');
	const colectivoA = await profile(m, a, 'Colectivo Inventado A');
	const colectivoB = await profile(m, b, 'Colectivo Inventado B');
	const personaF = await profile(m, f, 'Persona Inventada F');
	// N gestiona el perfil de A, pero sin «puede tener perfiles».
	const { id: profileA } = /** @type {{ id: number }} */ (
		await t.db.prepare('SELECT id FROM objects WHERE slug = ?1').bind(colectivoA).first()
	);
	await t.db
		.prepare(
			`INSERT INTO profile_managers (profile_id, account_id, role, created_at) VALUES (?1, ?2, 'manager', ?3)`
		)
		.bind(profileA, n.id, Date.now())
		.run();
	await t.db.prepare('UPDATE accounts SET can_have_profiles = 0 WHERE id = ?1').bind(n.id).run();
	await seedPosts(t.db, [
		{
			...common,
			postID: 'evento-a',
			title: 'Evento A',
			start: '2099-01-02T20:00-03:00',
			personas: [
				{ perfil: colectivoA, rol: 'Organiza' },
				{ perfil: personaF, rol: 'Facilita' }
			]
		},
		{
			...common,
			postID: 'evento-b',
			title: 'Evento B',
			start: '2099-01-03T20:00-03:00',
			personas: [{ perfil: colectivoB, rol: 'Organiza' }]
		},
		{
			...common,
			postID: 'evento-oculto',
			title: 'Evento oculto',
			start: '2099-01-04T20:00-03:00',
			personas: [{ perfil: colectivoA, rol: 'Organiza' }]
		}
	]);
	await t.db
		.prepare(
			`UPDATE objects SET visibility = 'hidden', version = version + 1 WHERE slug = 'evento-oculto'`
		)
		.run();
	return { m, a, b, f, n, colectivoA };
}

/**
 * Un pedido de mentira, como lo ve hooks.server.js.
 * @param {{ routeId: string, path: string, params?: Record<string, string>, method?: string,
 *   member?: { id: string, email: string } | null, user?: any }} o
 */
function request({ routeId, path, params = {}, method = 'GET', member = null, user }) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	return /** @type {any} */ ({
		url,
		params,
		route: { id: routeId },
		platform: t.platform,
		locals: { user, user_token: user ? 'prueba' : '', member: member ?? undefined },
		request: new Request(url, { method, body: method === 'POST' ? new URLSearchParams() : null })
	});
}

/** @param {{ id: string, email: string }} who @param {string} slug @param {string} [suffix] */
const eventReq = (who, slug, suffix = '', method = 'GET', query = '') =>
	request({
		routeId: `${EVENT}${suffix}`,
		path: `/admin/eventos/${encodeURIComponent(slug)}${suffix}${query}`,
		params: { slug },
		method,
		member: who
	});

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

describe('qué pedidos puede hacer (ruta, método y acción)', () => {
	it('solo lo de la lista; la acción es la primera clave que empieza con /', async () => {
		const { organizerRequestAllowed: ok } = await import('./organizadore.js');
		const at = (/** @type {string} */ path) => new URL(path, 'https://kinkyvibe.ar');
		expect(ok({ routeId: `${EVENT}/ventas`, method: 'GET', url: at('/x') })).toBe(true);
		expect(ok({ routeId: `${EVENT}/editar`, method: 'POST', url: at('/x?/save') })).toBe(true);
		expect(ok({ routeId: `${EVENT}/ingreso`, method: 'POST', url: at('/x?/checkin') })).toBe(true);
		for (const [suffix, query] of [
			['/editar', '?/partes_crear'],
			['/editar', '?/crearLugar'],
			['/editar', '?/editarLugar'],
			['/editar', ''],
			['/ingreso', '?/sell'],
			['/ingreso', '?/syncSales'],
			['/ingreso', '?/reveal'],
			['/ingreso', '?/sell&/checkin'],
			['/ordenes', '?/refund'],
			['/ordenes', '?/confirm'],
			['/codigos', '?/create'],
			['', '?/confirmar'],
			['', '?/crearLinkPuerta']
		]) {
			expect(ok({ routeId: `${EVENT}${suffix}`, method: 'POST', url: at(`/x${query}`) })).toBe(
				false
			);
		}
		expect(ok({ routeId: `${EVENT}/editar`, method: 'PUT', url: at('/x?/save') })).toBe(false);
		expect(ok({ routeId: `${EVENT}/editar`, method: 'DELETE', url: at('/x') })).toBe(false);
		for (const routeId of [
			'/(authed)/admin/ajustes',
			'/(authed)/admin/comunidad/cuentas',
			'/(authed)/admin/buscar',
			'/(authed)/admin/[...rest]',
			'/(authed)/edit/[category=category]/[postID]',
			`${EVENT}/mail`,
			`${EVENT}/ordenes.csv`,
			`${EVENT}/lista-espera`,
			`${EVENT}/preguntas`,
			`${EVENT}/gastos`,
			null
		]) {
			expect(ok({ routeId, method: 'GET', url: at('/x') }), String(routeId)).toBe(false);
		}
	});

	// Cada ruta del panel: si no está en la lista, ni GET ni POST; si está, solo sus acciones, y
	// esas acciones existen de verdad en la ruta.
	const routeFiles = Object.keys(
		import.meta.glob(['/src/routes/**/+page.server.js', '/src/routes/**/+server.js'])
	).filter((f) => f.startsWith('/src/routes/(authed)/'));
	it.each(routeFiles)('%s', async (file) => {
		const { ORGANIZER_ROUTES, organizerRequestAllowed: ok } = await import('./organizadore.js');
		const routeId = file
			.replace(/^\/src\/routes/, '')
			.replace(/\/\+(page\.server|server)\.js$/, '')
			.replace(/^$/, '/');
		const allowed = ORGANIZER_ROUTES[routeId];
		const url = (/** @type {string} */ q) => new URL(`/x${q}`, 'https://kinkyvibe.ar');
		if (!allowed) {
			expect(ok({ routeId, method: 'GET', url: url('') })).toBe(false);
			expect(ok({ routeId, method: 'POST', url: url('?/save') })).toBe(false);
			expect(ok({ routeId, method: 'POST', url: url('') })).toBe(false);
			return;
		}
		if (!file.endsWith('+page.server.js')) return;
		const mod = await vi.importActual(/* @vite-ignore */ file.replace(/^\/src/, '/src'));
		const names = Object.keys(/** @type {any} */ (mod).actions ?? {});
		for (const name of allowed.actions) expect(names, `${routeId} ?/${name}`).toContain(name);
		for (const name of names) {
			expect(ok({ routeId, method: 'POST', url: url(`?/${name}`) }), `${routeId} ?/${name}`).toBe(
				allowed.actions.includes(name)
			);
		}
	});
});

describe('quién entra y a qué evento', () => {
	it('organiza A: su evento sí; el de B, uno oculto, uno que no existe o slugs armados, no', async () => {
		const { m, a } = await world();
		const ctx = /** @type {any} */ (
			await m.org.organizerAccess(eventReq(a, 'evento-a', '/ventas'))
		);
		expect(ctx).toMatchObject({
			accountId: a.id,
			login: `cuenta:${a.id}`,
			event: { slug: 'evento-a', title: 'Evento A', profiles: ['Colectivo Inventado A'] }
		});
		expect(ctx.events.map((/** @type {any} */ e) => e.slug)).toEqual(['evento-a']);
		for (const slug of [
			'evento-b',
			'evento-oculto',
			'no-existe',
			'../evento-b',
			'evento-a/../evento-b',
			'evento-a%2F..%2Fevento-b',
			'EVENTO-B',
			'',
			'_evento-a'
		]) {
			expect(await m.org.organizerAccess(eventReq(a, slug, '/ventas')), slug).toBe('deny');
		}
	});

	it('el resto del panel le da 404 (ajustes, comunidad, buscar, inicio de otro lado, el editor viejo)', async () => {
		const { m, a } = await world();
		for (const [routeId, path] of [
			['/(authed)/admin/ajustes', '/admin/ajustes'],
			['/(authed)/admin/comunidad/cuentas', '/admin/comunidad/cuentas'],
			['/(authed)/admin/buscar', '/admin/buscar?q=a'],
			['/(authed)/admin/eventos', '/admin/eventos'],
			['/(authed)/admin/[...rest]', '/admin/cualquier-cosa'],
			['/(authed)/edit/[category=category]/[postID]', '/edit/calendario/evento-a']
		]) {
			expect(
				await m.org.organizerAccess(request({ routeId, path, member: a, params: {} })),
				routeId
			).toBe('deny');
		}
		// Su inicio, sí (lleva a «Tus eventos»), sin evento.
		const home = /** @type {any} */ (
			await m.org.organizerAccess(
				request({ routeId: '/(authed)/admin', path: '/admin', member: a })
			)
		);
		expect(home.event).toBe(null);
	});

	it('POST directo a cada acción de plata, mails o del sitio de su propio evento: 404', async () => {
		const { m, a } = await world();
		for (const [suffix, action] of [
			['/ordenes', 'refund'],
			['/ordenes', 'refundAll'],
			['/ordenes', 'confirm'],
			['/ordenes', 'cancel'],
			['/ordenes', 'resend'],
			['/ordenes', 'dni'],
			['/codigos', 'create'],
			['/codigos', 'toggle'],
			['/ingreso', 'sell'],
			['/ingreso', 'syncSales'],
			['/ingreso', 'reveal'],
			['/editar', 'partes_crear'],
			['/editar', 'crearLugar'],
			['', 'confirmar'],
			['', 'setLink'],
			['', 'sendLink'],
			['', 'crearLinkPuerta'],
			['/mail', 'send']
		]) {
			expect(
				await m.org.organizerAccess(eventReq(a, 'evento-a', suffix, 'POST', `?/${action}`)),
				`${suffix} ${action}`
			).toBe('deny');
		}
		// Las que sí: guardar el evento y marcar ingresos.
		expect(
			await m.org.organizerAccess(eventReq(a, 'evento-a', '/editar', 'POST', '?/save'))
		).toMatchObject({ event: { slug: 'evento-a' } });
		expect(
			await m.org.organizerAccess(eventReq(a, 'evento-a', '/ingreso', 'POST', '?/checkin'))
		).toMatchObject({ event: { slug: 'evento-a' } });
		// Y guardar el evento de B, no.
		expect(await m.org.organizerAccess(eventReq(a, 'evento-b', '/editar', 'POST', '?/save'))).toBe(
			'deny'
		);
	});

	it('«Facilita» o sin «puede tener perfiles»: no es organizadore (el panel, como hoy: sin acceso)', async () => {
		const { m, f, n } = await world();
		for (const who of [f, n]) {
			const req = eventReq(who, 'evento-a', '/ventas');
			expect(await m.org.organizerAccess(req)).toBe(null);
			// Sin `locals.organizer`, la ruta pide admin: a /login.
			const r = /** @type {any} */ (
				await thrown(() => m.org.requireAdminOrOrganizer(req.locals, req.url, 'evento-a'))
			);
			expect(r?.status).toBe(303);
			expect(r?.location).toMatch(/^\/login/);
		}
	});

	it('interruptor apagado: nadie entra como organizadore', async () => {
		const { a } = await world();
		const m = await modules({ on: false });
		const req = eventReq(a, 'evento-a', '/ventas');
		expect(await m.org.organizerAccess(req)).toBe(null);
		const r = /** @type {any} */ (
			await thrown(() => m.org.requireAdminOrOrganizer(req.locals, req.url, 'evento-a'))
		);
		expect(r?.status).toBe(303);
		// «Tus eventos» da 404 a cualquiera.
		const page = await import('../../../routes/(authed)/admin/organizo/+page.server.js');
		const r2 = /** @type {any} */ (
			await thrown(() =>
				page.load(/** @type {any} */ ({ locals: req.locals, setHeaders: () => {} }))
			)
		);
		expect(r2?.status).toBe(404);
	});

	it('une admin pasa como siempre (no se vuelve organizadore)', async () => {
		const { m, a } = await world();
		const req = request({
			routeId: `${EVENT}/ventas`,
			path: '/admin/eventos/evento-b/ventas',
			params: { slug: 'evento-b' },
			member: a,
			user: { id: ADMINS[0].id, login: ADMINS[0].login, name: null, avatar_url: '' }
		});
		expect(await m.org.organizerAccess(req)).toBe(null);
	});

	it('requireAdminOrOrganizer vuelve a mirar el evento del pedido', async () => {
		const { m, a } = await world();
		const req = eventReq(a, 'evento-a', '/ventas');
		req.locals.organizer = await m.org.organizerAccess(req);
		expect(m.org.requireAdminOrOrganizer(req.locals, req.url, 'evento-a')).toMatchObject({
			login: `cuenta:${a.id}`
		});
		const r = /** @type {any} */ (
			await thrown(() => m.org.requireAdminOrOrganizer(req.locals, req.url, 'evento-b'))
		);
		expect(r?.status).toBe(404);
		// Una página que no es de un evento (sin slug) con un evento en el pedido: también.
		const r2 = /** @type {any} */ (
			await thrown(() => m.org.requireAdminOrOrganizer(req.locals, req.url, ''))
		);
		expect(r2?.status).toBe(404);
	});
});

describe('lo que hace adentro', () => {
	it('guarda su evento: HTML acotado, con su cuenta en el historial y en Actividad', async () => {
		const { m, a } = await world();
		const req = eventReq(a, 'evento-a', '/editar', 'POST', '?/save');
		const org = /** @type {any} */ (await m.org.organizerAccess(req));
		const path = 'src/lib/posts/calendario/evento-a.md';
		const file = /** @type {any} */ (await m.repo.readDbPostFile(path));
		const content = `${file.raw.trimEnd()}\n\n<b>Hola</b> <script>alert(1)</script><img src=x onerror="alert(2)">\n`;
		const url = new URL('/admin/eventos/evento-a/editar?/save', 'https://kinkyvibe.ar');
		const event = /** @type {any} */ ({
			url,
			params: { slug: 'evento-a' },
			route: { id: `${EVENT}/editar` },
			platform: t.platform,
			locals: { user: undefined, user_token: '', member: a, organizer: org },
			fetch,
			request: new Request(url, {
				method: 'POST',
				body: new URLSearchParams({ content, sha: file.sha })
			})
		});
		const editar =
			await import('../../../routes/(authed)/admin/eventos/[slug]/editar/+page.server.js');
		const result = /** @type {any} */ (
			await m.author.runAsPanelAuthor({ login: org.login, name: org.name, superadmin: false }, () =>
				editar.actions.save(event)
			)
		);
		expect(result, JSON.stringify(result)).toMatchObject({ save: 'Guardado' });
		const row = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT updated_by, json_extract(data, '$.body_html') AS html FROM objects WHERE slug = 'evento-a'`
				)
				.first()
		);
		expect(row).toEqual({ updated_by: `cuenta:${a.id}`, html: 'corta' });
		const audit = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT actor_login, action, summary FROM admin_audit WHERE action = 'event.organizer_edit'`
				)
				.first()
		);
		expect(audit).toEqual({
			actor_login: `cuenta:${a.id}`,
			action: 'event.organizer_edit',
			summary: 'Colectivo Inventado A (organiza) editó «Evento A»'
		});
		// Con un evento que no es el suyo en el pedido (aunque el contexto sea válido): 404.
		const other = { ...event, params: { slug: 'evento-b' } };
		const r = /** @type {any} */ (await thrown(() => editar.actions.save(other)));
		expect(r?.status).toBe(404);
	});

	it('la puerta: marca ingresos como organizadore, pero no vende ni ve el DNI completo', async () => {
		const { m, a } = await world();
		const req = eventReq(a, 'evento-a', '/ingreso', 'POST', '?/sell');
		req.locals.organizer = await m.org.organizerAccess(
			eventReq(a, 'evento-a', '/ingreso', 'POST', '?/checkin')
		);
		const door = await import('$lib/server/tickets/doorScreen.js');
		expect(door.adminActor(req)).toMatchObject({ kind: 'organizer', by: `cuenta:${a.id}` });
		const actions = door.doorActions(door.adminActor);
		expect(/** @type {any} */ (await thrown(() => actions.sell(req)))?.status).toBe(404);
		expect(/** @type {any} */ (await thrown(() => actions.syncSales(req)))?.status).toBe(404);
		expect(/** @type {any} */ (await thrown(() => actions.reveal(req)))?.status).toBe(403);
		// Con la puerta de otro evento en el pedido: 404 antes de hacer nada.
		const otherReq = { ...req, params: { slug: 'evento-b' } };
		expect(/** @type {any} */ (await thrown(() => door.adminActor(otherReq)))?.status).toBe(404);
	});

	it('el lugar: solo los públicos, sin la dirección de los que no la muestran', async () => {
		const { organizerVenuePicker } = await import('./organizadore.js');
		/** @param {any} v */
		const venue = (v) => ({
			slug: `l${v.id}`,
			title: `Lugar ${v.id}`,
			visibility: 'public',
			unlisted: false,
			approved: true,
			privacy: 'public',
			address: 'Calle Inventada 123',
			area: '',
			city: '',
			version: 1,
			...v
		});
		const picker = /** @type {any} */ ({
			current: { venueId: 4, privacy: null },
			venues: [
				venue({ id: 1 }),
				venue({ id: 2, visibility: 'hidden' }),
				venue({ id: 3, approved: false }),
				venue({ id: 4, visibility: 'hidden', privacy: 'area' }),
				venue({ id: 5, unlisted: true }),
				venue({ id: 6, privacy: 'name' })
			]
		});
		const out = /** @type {any} */ (organizerVenuePicker(picker));
		expect(out.limited).toBe(true);
		expect(out.venues.map((/** @type {any} */ v) => [v.id, v.address])).toEqual([
			[1, 'Calle Inventada 123'],
			[4, ''],
			[6, '']
		]);
	});
});
