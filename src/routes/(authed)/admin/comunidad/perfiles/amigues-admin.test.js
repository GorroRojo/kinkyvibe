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
import { approveProfile } from '$lib/server/amigues/approvals.js';
import { getManagedProfile } from '$lib/server/cuentas/perfiles.js';
import {
	addManager,
	makeAccount,
	makeProfile,
	readAmigueFiles
} from '$lib/server/amigues/testing.js';
import { rejectPendingVenue } from '$lib/server/amigues/pendingVenues.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { deleteProfileAsAdmin } from '$lib/server/admin/cuentas.js';
import { toCsv } from '$lib/admin/csv.js';
import {
	PROFILE_CSV_COLUMNS,
	PROFILE_STATES,
	profileRowHref,
	profileState
} from '$lib/admin/perfiles.js';

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
		list: await import('./+page.server.js'),
		edit: await import('./[slug]/+page.server.js'),
		importar: await import('./importar/+page.server.js'),
		csv: await import('./clasificacion.csv/+server.js'),
		lugares: await import('../../eventos/lugares/+page.server.js'),
		profile: await import('../cuentas/perfiles/[id]/+page.server.js'),
		routes: await import('$lib/server/admin/amiguesRoutes.js')
	};
}

/**
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>, user?: any, token?: string | null }} [o]
 */
function fakeEvent({ path = '/admin/comunidad/perfiles', params = {}, form, user, token } = {}) {
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
			() => m.lugares.actions.aprobarLugar(fakeEvent({ form: {}, user: null, token: null })),
			() => m.lugares.actions.rechazarLugar(fakeEvent({ form: {}, user: null, token: null })),
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
			() => m.lugares.actions.aprobarLugar(fakeEvent({ form: { lugar: '1' }, user: intruder })),
			() => m.lugares.actions.rechazarLugar(fakeEvent({ form: { lugar: '1' }, user: intruder })),
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
			await m.edit.load(
				fakeEvent({ path: '/admin/comunidad/perfiles/Yuyo', params: { slug: 'Yuyo' } })
			)
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
			location: '/admin/comunidad/perfiles/galpon-nuevo-inventado?guardado=creado'
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
		// El evento sale de la base.
		await seedPosts(t.db, fake.posts);
		const v = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const bad = /** @type {any} */ (
			await m.lugares.actions.vincular(
				fakeEvent({ form: { evento: 'no-existe', lugar: String(v.id) } })
			)
		);
		expect(bad.status).toBe(400);
		// «Sucede en» es un edge del evento: los eventos que se pueden elegir ya están en la base (un
		// evento que no está, como `no-existe`, no se vincula).
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

describe('Eventos → Lugares: los que cargan las cuentas (decisión de gorrite)', () => {
	it('lista los lugares sin aprobar; aprobar los publica y rechazar los deja para quien los cargó, con registro', async () => {
		const m = await modules('1');
		const cuenta = await makeAccount(t.db, 'carga-lugares');
		const a = await makeProfile(t.db, {
			title: 'Sala Pendiente Inventada',
			kind: 'lugar',
			approved: false,
			actor: `cuenta:${cuenta.id}`,
			data: { address: 'Calle Inventada 123', area: 'Barrio Inventado' }
		});
		const b = await makeProfile(t.db, {
			title: 'Bar Pendiente Inventado',
			kind: 'lugar',
			approved: false,
			actor: `cuenta:${cuenta.id}`
		});
		// Los aprobados (los del panel y los importados) y los que no son lugares no están.
		await makeProfile(t.db, { title: 'Lugar Aprobado Inventado', kind: 'lugar' });
		await makeProfile(t.db, { title: 'Persona Sin Aprobar', approved: false });

		const data = /** @type {any} */ (await m.lugares.load(fakeEvent()));
		expect(data.pending.map((/** @type {any} */ v) => v.title)).toEqual([
			'Sala Pendiente Inventada',
			'Bar Pendiente Inventado'
		]);
		expect(data.pending[0]).toMatchObject({
			address: 'Calle Inventada 123',
			area: 'Barrio Inventado',
			byAccount: true
		});

		const ok = /** @type {any} */ (
			await m.lugares.actions.aprobarLugar(fakeEvent({ form: { lugar: String(a.id) } }))
		);
		expect(ok.pending.ok).toBe(true);
		expect(await isApproved(t.db, a.id)).toBe(true);
		expect((await audit('profile.approve'))[0]).toMatchObject({ target_id: String(a.id) });
		// Ya aprobado: no se aprueba de nuevo ni se puede rechazar desde acá.
		const again = /** @type {any} */ (
			await m.lugares.actions.aprobarLugar(fakeEvent({ form: { lugar: String(a.id) } }))
		);
		expect(again.status).toBe(404);
		const lateReject = /** @type {any} */ (
			await m.lugares.actions.rechazarLugar(fakeEvent({ form: { lugar: String(a.id) } }))
		);
		expect(lateReject.status).toBe(409);

		// Rechazar (decisión de gorrite): no se borra; queda quién, cuándo y el motivo.
		const rejected = /** @type {any} */ (
			await m.lugares.actions.rechazarLugar(
				fakeEvent({ form: { lugar: String(b.id), motivo: '  Falta   la dirección  ' } })
			)
		);
		expect(rejected.pending.ok).toBe(true);
		const row = await t.db
			.prepare('SELECT deleted_at FROM objects WHERE id = ?1')
			.bind(b.id)
			.first();
		expect(row).not.toBeNull();
		expect(row?.deleted_at).toBeNull();
		expect(await isApproved(t.db, b.id)).toBe(false);
		const rejection = await t.db
			.prepare('SELECT rejected_by, reason FROM profile_rejections WHERE profile_id = ?1')
			.bind(b.id)
			.first();
		expect(rejection).toMatchObject({ reason: 'Falta la dirección' });
		expect(String(rejection?.rejected_by)).not.toBe('');
		expect((await audit('profile.reject'))[0]).toMatchObject({ target_id: String(b.id) });
		expect(await audit('profile.delete')).toEqual([]);
		// Sale de "Para aprobar" y no se rechaza dos veces.
		expect(/** @type {any} */ (await m.lugares.load(fakeEvent())).pending).toEqual([]);
		const twice = /** @type {any} */ (
			await m.lugares.actions.rechazarLugar(fakeEvent({ form: { lugar: String(b.id) } }))
		);
		expect(twice.status).toBe(409);
		expect(await audit('profile.reject')).toHaveLength(1);
		// Pasa a "Rechazados" (decisión de gorrite), con quién, cuándo y el motivo.
		const withRejected = /** @type {any} */ (await m.lugares.load(fakeEvent()));
		expect(withRejected.rejected).toEqual([
			expect.objectContaining({
				id: b.id,
				title: 'Bar Pendiente Inventado',
				byAccount: true,
				rejectedBy: String(rejection?.rejected_by),
				reason: 'Falta la dirección'
			})
		]);
		expect(typeof withRejected.rejected[0].rejectedAt).toBe('number');
		// "Aprobar" desde "Rechazados": lo publica, borra el rechazo y sale de la lista.
		const lateApprove = /** @type {any} */ (
			await m.lugares.actions.aprobarLugar(fakeEvent({ form: { lugar: String(b.id) } }))
		);
		expect(lateApprove.pending.ok).toBe(true);
		expect(await isApproved(t.db, b.id)).toBe(true);
		expect(
			await t.db
				.prepare('SELECT 1 FROM profile_rejections WHERE profile_id = ?1')
				.bind(b.id)
				.first()
		).toBeNull();
		expect(/** @type {any} */ (await m.lugares.load(fakeEvent())).rejected).toEqual([]);
		expect(await audit('profile.approve')).toHaveLength(2);
		// approveProfile (la ficha del lugar) también borra un rechazo.
		const c = await makeProfile(t.db, {
			title: 'Otro Bar Inventado',
			kind: 'lugar',
			approved: false,
			actor: `cuenta:${cuenta.id}`
		});
		await m.lugares.actions.rechazarLugar(fakeEvent({ form: { lugar: String(c.id) } }));
		await approveProfile(t.db, c.id, 'admin-de-prueba');
		expect(
			await t.db
				.prepare('SELECT 1 FROM profile_rejections WHERE profile_id = ?1')
				.bind(c.id)
				.first()
		).toBeNull();

		// Algo que no es un lugar no se aprueba ni se rechaza desde acá.
		const persona = await makeProfile(t.db, { title: 'Otra Persona', approved: false });
		for (const action of [m.lugares.actions.aprobarLugar, m.lugares.actions.rechazarLugar]) {
			const r = /** @type {any} */ (
				await action(fakeEvent({ form: { lugar: String(persona.id) } }))
			);
			expect(r.status).toBe(404);
		}
		expect(await isApproved(t.db, persona.id)).toBe(false);
	});
});

describe('Eventos → Lugares: rechazar es solo de admins', () => {
	it('sin sesión o sin ser admin, no se rechaza ni se aprueba un lugar que espera', async () => {
		const m = await modules('1');
		const cuenta = await makeAccount(t.db, 'carga-lugares');
		const v = await makeProfile(t.db, {
			title: 'Sala Pendiente Inventada',
			kind: 'lugar',
			approved: false,
			actor: `cuenta:${cuenta.id}`
		});
		const form = { lugar: String(v.id), motivo: 'Inventado' };
		const intruder = { id: 1, login: 'no-es-admin' };
		expect(
			(
				await thrown(() =>
					m.lugares.actions.rechazarLugar(fakeEvent({ form, user: null, token: null }))
				)
			)?.status
		).toBe(303);
		expect(
			(await thrown(() => m.lugares.actions.rechazarLugar(fakeEvent({ form, user: intruder }))))
				?.status
		).toBe(403);
		expect(
			(await thrown(() => m.lugares.actions.aprobarLugar(fakeEvent({ form, user: intruder }))))
				?.status
		).toBe(403);
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM profile_rejections').first())?.n).toBe(0);
		expect(await isApproved(t.db, v.id)).toBe(false);
		expect(/** @type {any} */ (await m.lugares.load(fakeEvent())).pending).toHaveLength(1);
	});

	it('"Rechazados": sin sesión o sin ser admin, ni se ve ni se aprueba', async () => {
		const m = await modules('1');
		const cuenta = await makeAccount(t.db, 'carga-lugares');
		const v = await makeProfile(t.db, {
			title: 'Sala Rechazada Inventada',
			kind: 'lugar',
			approved: false,
			actor: `cuenta:${cuenta.id}`
		});
		await m.lugares.actions.rechazarLugar(
			fakeEvent({ form: { lugar: String(v.id), motivo: 'Motivo inventado' } })
		);
		const form = { lugar: String(v.id) };
		const intruder = { id: 1, login: 'no-es-admin' };
		expect(
			(await thrown(() => m.lugares.load(fakeEvent({ user: null, token: null }))))?.status
		).toBe(303);
		expect((await thrown(() => m.lugares.load(fakeEvent({ user: intruder }))))?.status).toBe(403);
		expect(
			(
				await thrown(() =>
					m.lugares.actions.aprobarLugar(fakeEvent({ form, user: null, token: null }))
				)
			)?.status
		).toBe(303);
		expect(
			(await thrown(() => m.lugares.actions.aprobarLugar(fakeEvent({ form, user: intruder }))))
				?.status
		).toBe(403);
		expect(await isApproved(t.db, v.id)).toBe(false);
		expect(/** @type {any} */ (await m.lugares.load(fakeEvent())).rejected).toHaveLength(1);
	});
});

describe('aprobar y pedidos "Es mi perfil" (ficha de un perfil)', () => {
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

describe('Comunidad › Perfiles (/admin/comunidad/perfiles): una sola lista (decisión de gorrite)', () => {
	/** Un perfil de cada origen y de cada estado, más las 31 fichas importadas. */
	async function seed() {
		await importAmigues(t.db, files, { actor: 'admin-de-prueba' });
		const a = await makeAccount(t.db, 'cuenta-inventada');
		const actor = `cuenta:${a.id}`;
		const panel = await makeProfile(t.db, { title: 'Lugar Del Panel', kind: 'lugar' });
		const pending = await makeProfile(t.db, { title: 'Persona De Cuenta', actor, approved: false });
		const rejected = await makeProfile(t.db, {
			title: 'Lugar Rechazado',
			kind: 'lugar',
			actor,
			approved: false
		});
		await rejectPendingVenue(t.db, rejected.id, { by: admin.login, reason: '' });
		await addManager(t.db, pending.id, a.id);
		await addManager(t.db, rejected.id, a.id);
		const hidden = await makeProfile(t.db, { title: 'Perfil Oculto', visibility: 'hidden' });
		const gone = await makeProfile(t.db, { title: 'Perfil Borrado' });
		await deleteProfileAsAdmin(t.db, gone.id, gone.version, admin);
		return { panel, pending, rejected, hidden, gone };
	}

	/** @param {any} m @param {string} [qs] */
	const listed = async (m, qs = '') =>
		/** @type {any} */ (
			await m.list.load(fakeEvent({ path: `/admin/comunidad/perfiles${qs ? `?${qs}` : ''}` }))
		);

	it('sin sesión, al login; sin ser admin, 403 (load y actions)', async () => {
		const m = await modules();
		for (const user of [null, { id: 1, login: 'no-es-admin' }]) {
			const status = user ? 403 : 303;
			const token = user ? 'token-de-prueba' : null;
			expect((await thrown(() => m.list.load(fakeEvent({ user, token }))))?.status).toBe(status);
			for (const action of Object.values(m.list.actions)) {
				const e = await thrown(() =>
					/** @type {any} */ (action)(fakeEvent({ form: { claim: '1' }, user, token }))
				);
				expect(e?.status).toBe(status);
			}
		}
	});

	for (const flag of ['1', '0']) {
		it(`une admin ve todos (ocultos y borrados también), con origen y estado (interruptor ${flag})`, async () => {
			const s = await seed();
			const m = await modules(flag);
			const all = await listed(m);
			expect(all).toMatchObject({ editor: 'db', flagOn: flag === '1', dbAvailable: true });
			expect(all.notImported).toBe(0);
			expect(all.profiles).toHaveLength(36);
			expect(all.counts).toMatchObject({ total: 36, toApprove: 1, hidden: 1, deleted: 1 });
			const byTitle = Object.fromEntries(all.profiles.map((/** @type {any} */ p) => [p.title, p]));
			/** @param {string} title */
			const summary = (title) => {
				const p = byTitle[title];
				return { origin: p.origin, state: profileState(p), href: profileRowHref(p) };
			};
			const yuyo = all.profiles.find((/** @type {any} */ p) => p.legacySlug === 'Yuyo');
			expect(summary(yuyo.title)).toEqual({
				origin: 'ficha',
				state: 'aprobado',
				href: '/admin/comunidad/perfiles/Yuyo'
			});
			expect(summary('Lugar Del Panel')).toMatchObject({ origin: 'panel', state: 'aprobado' });
			expect(summary('Persona De Cuenta')).toMatchObject({
				origin: 'cuenta',
				state: 'para-aprobar'
			});
			expect(summary('Lugar Rechazado')).toMatchObject({ origin: 'cuenta', state: 'rechazado' });
			expect(summary('Perfil Oculto')).toMatchObject({ origin: 'panel', state: 'oculto' });
			expect(summary('Perfil Borrado')).toEqual({
				origin: 'panel',
				state: 'borrado',
				href: `/admin/comunidad/cuentas/perfiles/${s.gone.id}`
			});
		});
	}

	it('filtros: origen, estado (coinciden con profileState), tipo y búsqueda, combinados', async () => {
		const s = await seed();
		const m = await modules();
		/** @param {string} qs */
		const ids = async (qs) => (await listed(m, qs)).profiles.map((/** @type {any} */ p) => p.id);
		expect(await ids('origen=ficha')).toHaveLength(31);
		expect((await ids('origen=cuenta')).sort()).toEqual([s.pending.id, s.rejected.id].sort());
		expect((await ids('origen=panel')).sort()).toEqual([s.panel.id, s.hidden.id, s.gone.id].sort());
		expect(await ids('estado=rechazado')).toEqual([s.rejected.id]);
		expect(await ids('estado=para-aprobar')).toEqual([s.pending.id]);
		expect(await ids('estado=oculto')).toEqual([s.hidden.id]);
		expect(await ids('estado=borrado')).toEqual([s.gone.id]);
		// rejectPendingVenue() solo no escribe Actividad (la action de Eventos › Lugares sí), así que
		// el rechazado también sigue «sin revisar».
		expect((await ids('estado=sin-revisar')).sort()).toEqual([s.pending.id, s.rejected.id].sort());
		expect(await ids('tipo=lugar&origen=cuenta')).toEqual([s.rejected.id]);
		expect(await ids('q=rechaz&estado=rechazado&origen=cuenta&tipo=lugar')).toEqual([
			s.rejected.id
		]);
		expect(await ids('q=rechaz&estado=aprobado')).toEqual([]);
		// Los cinco estados excluyentes reparten todos los perfiles, y cada fila es de su estado.
		let total = 0;
		for (const state of ['aprobado', 'para-aprobar', 'rechazado', 'oculto', 'borrado']) {
			const rows = (await listed(m, `estado=${state}`)).profiles;
			for (const p of rows) expect(profileState(p), p.title).toBe(state);
			total += rows.length;
		}
		expect(total).toBe(36);
		expect(Object.keys(PROFILE_STATES)).toContain('sin-revisar');
	});

	it('el CSV es lo que se ve: con los filtros puestos, con origen y estado', async () => {
		await seed();
		const m = await modules();
		const { profiles } = await listed(m, 'origen=cuenta');
		const csv = toCsv(profiles, PROFILE_CSV_COLUMNS, { bom: false });
		const lines = csv.trim().split('\r\n');
		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain('origen,estado');
		expect(csv).toContain('Lugar Rechazado');
		expect(csv).toContain('Creado por una cuenta,Rechazado');
		expect(csv).toContain('Creado por una cuenta,Para aprobar');
		expect(csv).toContain('cuenta-inventada@example.com');
		expect(csv).not.toContain('Lugar Del Panel');
	});

	it('pedidos «Es mi perfil»: su pestaña los lista y se aprueban desde la lista', async () => {
		const m = await modules();
		const p = await makeProfile(t.db, { title: 'Ficha Inventada' });
		const a = await makeAccount(t.db, 'reclama-desde-la-lista');
		await createClaim(t.db, { accountId: a.id, profileId: p.id, connection: 'c' });
		const page = await listed(m, 'vista=pedidos');
		expect(page.filters.view).toBe('pedidos');
		expect(page.claims).toHaveLength(1);
		const r = /** @type {any} */ (
			await m.list.actions.pedido(
				fakeEvent({ form: { claim: String(page.claims[0].id), decision: 'aprobar' } })
			)
		);
		expect(r.claim.ok).toBe(true);
		expect((await getManagedProfile(t.db, a.id, p.slug))?.role).toBe('owner');
	});

	it('«Fichas .md» solo con el interruptor apagado: la lista de .md de siempre', async () => {
		const off = await modules('0');
		expect((await listed(off, 'vista=fichas')).editor).toBe('md');
		const on = await modules('1');
		const page = await listed(on, 'vista=fichas');
		expect(page.editor).toBe('db');
		expect(page.filters.view).toBe('');
	});
});
