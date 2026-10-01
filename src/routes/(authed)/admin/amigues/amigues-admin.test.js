/**
 * Panel de amigues y lugares: solo admins; el editor de la base (publica al toque y, si alguien
 * guardó en el medio, 409 sin guardar nada y con lo que cambió); importar y confirmar la
 * clasificación; Eventos → Lugares (vincular y sacar); aprobar para /amigues y los pedidos "Es mi
 * perfil". D1 de miniflare; datos inventados (las fichas de amigues son las reales, públicas).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { importAmigues } from '$lib/server/amigues/importer.js';
import { createClaim } from '$lib/server/amigues/claims.js';
import { isApproved } from '$lib/server/amigues/profiles.js';
import { getManagedProfile } from '$lib/server/cuentas/perfiles.js';
import { makeAccount, makeProfile, readAmigueFiles } from '$lib/server/amigues/testing.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const fake = vi.hoisted(() => ({
	posts: [
		{
			path: '/calendario/fiesta-inventada',
			meta: {
				category: 'calendario',
				postID: 'fiesta-inventada',
				title: 'Fiesta Inventada',
				start: '2099-01-01T20:00-03:00',
				location: 'Dirección escrita en el archivo',
				tags: [],
				authors: []
			}
		}
	]
}));
vi.mock('$lib/utils', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki, /** @type {boolean} */ unlisted) =>
		wiki || unlisted ? [] : structuredClone(fake.posts)
}));

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {{ legacySlug: string, raw: string }[]} */
let files;
beforeAll(async () => {
	t = await createTestDB();
	files = await readAmigueFiles();
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

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

async function modules(flag = '1') {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { PERFILES_PUBLICOS_ENABLED: flag } }));
	return {
		edit: await import('./[slug]/+page.server.js'),
		importar: await import('./importar/+page.server.js'),
		csv: await import('./clasificacion.csv/+server.js'),
		lugares: await import('../eventos/lugares/+page.server.js'),
		profile: await import('../cuentas/perfiles/[id]/+page.server.js'),
		routes: await import('$lib/server/admin/amiguesRoutes.js')
	};
}

/**
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>, user?: any, token?: string | null }} [o]
 */
function fakeEvent({ path = '/admin/amigues', params = {}, form, user, token } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: {
			user: user === undefined ? admin : user,
			user_token: token === undefined ? 'token-de-prueba' : token
		},
		setHeaders: () => {},
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		})
	};
	return event;
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

/** @param {string} action */
const audit = async (action) =>
	(
		await t.db
			.prepare('SELECT summary, target_id FROM admin_audit WHERE action = ?1')
			.bind(action)
			.all()
	).results;

/** El formulario del editor a partir de lo que devuelve el load. @param {any} data */
function formOf(data, changes = {}) {
	const v = data.values;
	return {
		title: v.title,
		kind: v.kind,
		visibility: v.visibility,
		version: String(v.version),
		...v.text,
		...v.lists,
		...(v.unlisted ? { unlisted: 'on' } : {}),
		lat: v.lat,
		lng: v.lng,
		venue_privacy: v.venue_privacy,
		...changes
	};
}

describe('solo admins', () => {
	it('sin sesión, al login; sin permiso, 403 (loads y actions)', async () => {
		const m = await modules();
		const calls = [
			() => m.edit.load(fakeEvent({ params: { slug: 'x' }, user: null, token: null })),
			() =>
				m.edit.actions.guardarPerfil(
					fakeEvent({ params: { slug: 'x' }, form: {}, user: null, token: null })
				),
			() => m.importar.load(fakeEvent({ user: null, token: null })),
			() => m.importar.actions.importar(fakeEvent({ form: {}, user: null, token: null })),
			() => m.csv.GET(fakeEvent({ user: null, token: null })),
			() => m.lugares.load(fakeEvent({ user: null, token: null })),
			() => m.lugares.actions.vincular(fakeEvent({ form: {}, user: null, token: null })),
			() =>
				m.profile.actions.aprobar(
					fakeEvent({ params: { id: '1' }, form: {}, user: null, token: null })
				),
			() =>
				m.profile.actions.pedido(
					fakeEvent({ params: { id: '1' }, form: {}, user: null, token: null })
				)
		];
		for (const call of calls) expect((await thrown(call))?.status).toBe(303);
		const intruder = { id: 1, login: 'no-es-admin' };
		for (const call of [
			() => m.importar.actions.importar(fakeEvent({ form: {}, user: intruder })),
			() => m.lugares.actions.vincular(fakeEvent({ form: {}, user: intruder })),
			() =>
				m.edit.actions.guardarPerfil(fakeEvent({ params: { slug: 'x' }, form: {}, user: intruder }))
		]) {
			expect((await thrown(call))?.status).toBe(403);
		}
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM objects').first())?.n).toBe(0);
	});
});

describe('importar y clasificar desde el panel', () => {
	it('importa las fichas, queda en Actividad y se confirma (o cambia) el tipo', async () => {
		const m = await modules('0');
		const preview = /** @type {any} */ (await m.importar.load(fakeEvent()));
		expect(preview.summary.created).toBe(31);
		expect(preview.rows).toEqual([]);
		const r = /** @type {any} */ (await m.importar.actions.importar(fakeEvent({ form: {} })));
		expect(r.importResult.summary).toMatchObject({ created: 31, error: 0 });
		expect((await audit('amigues.import')).length).toBe(1);
		const after = /** @type {any} */ (await m.importar.load(fakeEvent()));
		expect(after.summary.unchanged).toBe(31);
		expect(after.rows.length).toBe(31);
		const kv = after.rows.find((/** @type {any} */ x) => x.legacySlug === 'KinkyVibe');
		expect(kv).toMatchObject({ kind: 'proyecto', confirmedAt: null });
		// Confirmar como lugar (cambia el tipo con saveObject) y queda confirmado.
		const c = /** @type {any} */ (
			await m.importar.actions.confirmar(
				fakeEvent({
					form: { profile: String(kv.profileId), kind: 'lugar', version: String(kv.version) }
				})
			)
		);
		expect(c.confirm.ok).toBe(true);
		const rows = /** @type {any} */ (await m.importar.load(fakeEvent())).rows;
		expect(rows.find((/** @type {any} */ x) => x.legacySlug === 'KinkyVibe')).toMatchObject({
			kind: 'lugar',
			confirmedBy: admin.login
		});
		const csv = await (await m.csv.GET(fakeEvent())).text();
		expect(csv).toContain('KinkyVibe');
		expect(csv).toContain('confirmado');
		expect(csv).toContain('a confirmar');
	});
});

describe('editor de la base', () => {
	it('con el interruptor apagado, las fichas importadas se siguen editando en su .md', async () => {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const m = await modules('0');
		expect(await m.routes.editorPageData(t.platform, 'Gorro_Rojo')).toBeNull();
		// Un lugar (solo existe en la base) se edita en la base igual.
		const v = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		expect((await m.routes.editorPageData(t.platform, v.slug))?.editor).toBe('db');
	});

	it('guarda y publica; si alguien guardó en el medio, 409 y no se pisa nada', async () => {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const m = await modules('1');
		const opened = /** @type {any} */ (
			await m.edit.load(fakeEvent({ path: '/admin/amigues/Yuyo', params: { slug: 'Yuyo' } }))
		);
		expect(opened).toMatchObject({ editor: 'db', profile: { urlSlug: 'Yuyo', kind: 'persona' } });
		expect(opened.source).toMatchObject({ legacySlug: 'Yuyo', confirmedAt: null });

		const first = /** @type {any} */ (
			await m.edit.actions.guardarPerfil(
				fakeEvent({
					params: { slug: 'Yuyo' },
					form: formOf(opened, { bio: 'Editado por une admin' })
				})
			)
		);
		expect(first.perfil.ok).toBe(true);
		expect((await audit('profile.update')).length).toBe(1);

		// Otra pestaña con la versión vieja.
		const stale = /** @type {any} */ (
			await m.edit.actions.guardarPerfil(
				fakeEvent({
					params: { slug: 'Yuyo' },
					form: formOf(opened, { bio: 'Lo de la otra pestaña' })
				})
			)
		);
		expect(stale.status).toBe(409);
		expect(stale.data.perfil.conflict.changes).toEqual(
			expect.arrayContaining([
				{ field: 'bio', label: 'Presentación', theirs: 'Editado por une admin' }
			])
		);
		// Lo escrito vuelve intacto al formulario.
		expect(stale.data.perfil.values.text.bio).toBe('Lo de la otra pestaña');
		const now = /** @type {any} */ (await m.edit.load(fakeEvent({ params: { slug: 'Yuyo' } })));
		expect(now.values.text.bio).toBe('Editado por une admin');
		expect((await audit('profile.update')).length).toBe(1);

		const confirm = /** @type {any} */ (
			await m.edit.actions.confirmarTipo(fakeEvent({ params: { slug: 'Yuyo' }, form: {} }))
		);
		expect(confirm.perfil.ok).toBe(true);
	});

	it('crear un lugar desde Eventos → Lugares: nace aprobado y abre su editor', async () => {
		const m = await modules('0');
		const r = await thrown(() =>
			m.lugares.actions.crearPerfil(
				fakeEvent({
					form: {
						title: 'Galpón Nuevo Inventado',
						kind: 'lugar',
						visibility: 'public',
						version: '0'
					}
				})
			)
		);
		expect(r).toMatchObject({
			status: 303,
			location: '/admin/amigues/galpon-nuevo-inventado?guardado=creado'
		});
		const row = await t.db
			.prepare("SELECT id FROM objects WHERE slug = 'galpon-nuevo-inventado'")
			.first();
		expect(await isApproved(t.db, Number(row?.id))).toBe(true);
	});
});

describe('Eventos → Lugares', () => {
	it('vincula un evento a un lugar con su privacidad, avisa si el .md tiene dirección, y lo saca', async () => {
		const m = await modules('0');
		const v = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const bad = /** @type {any} */ (
			await m.lugares.actions.vincular(
				fakeEvent({ form: { evento: 'no-existe', lugar: String(v.id) } })
			)
		);
		expect(bad.status).toBe(400);
		const ok = /** @type {any} */ (
			await m.lugares.actions.vincular(
				fakeEvent({
					form: { evento: 'fiesta-inventada', lugar: String(v.id), privacidad: 'hidden' }
				})
			)
		);
		expect(ok.link.ok).toBe(true);
		const data = /** @type {any} */ (await m.lugares.load(fakeEvent()));
		expect(data.links).toEqual([
			expect.objectContaining({ eventSlug: 'fiesta-inventada', privacy: 'hidden' })
		]);
		expect(data.events[0]).toMatchObject({ slug: 'fiesta-inventada', mdAddress: true });
		expect(data.venues[0]).toMatchObject({ title: 'Lugar Inventado', events: 1 });
		expect((await audit('event.venue_set')).length).toBe(1);
		const removed = /** @type {any} */ (
			await m.lugares.actions.desvincular(fakeEvent({ form: { evento: 'fiesta-inventada' } }))
		);
		expect(removed.link.ok).toBe(true);
		expect(/** @type {any} */ (await m.lugares.load(fakeEvent())).links).toEqual([]);
	});
});

describe('aprobar y pedidos "Es mi perfil" (Cuentas → Perfiles)', () => {
	it('aprobar y sacar de Amigues quedan en Actividad', async () => {
		const m = await modules();
		const p = await makeProfile(t.db, { title: 'Perfil De Cuenta', approved: false });
		await m.profile.actions.aprobar(fakeEvent({ params: { id: String(p.id) }, form: {} }));
		expect(await isApproved(t.db, p.id)).toBe(true);
		await m.profile.actions.desaprobar(fakeEvent({ params: { id: String(p.id) }, form: {} }));
		expect(await isApproved(t.db, p.id)).toBe(false);
		expect((await audit('profile.approve'))[0].summary).toContain('Perfil De Cuenta');
		expect((await audit('profile.unapprove')).length).toBe(1);
	});

	it('aprobar un pedido: la cuenta pasa a ser dueñe; el registro no lleva el mail', async () => {
		const m = await modules();
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		const a = await makeAccount(t.db, 'reclama');
		await createClaim(t.db, { accountId: a.id, profileId: p.id, connection: 'c' });
		const detail = /** @type {any} */ (
			await m.profile.load(fakeEvent({ params: { id: String(p.id) } }))
		);
		expect(detail.claims).toHaveLength(1);
		const r = /** @type {any} */ (
			await m.profile.actions.pedido(
				fakeEvent({
					params: { id: String(p.id) },
					form: { claim: String(detail.claims[0].id), decision: 'aprobar' }
				})
			)
		);
		expect(r.claim.ok).toBe(true);
		expect((await getManagedProfile(t.db, a.id, p.slug))?.role).toBe('owner');
		const rows = await audit('profile.claim_approve');
		expect(rows).toHaveLength(1);
		expect(JSON.stringify(rows)).not.toContain('reclama@example.com');
	});
});
