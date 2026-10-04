/**
 * «Lugar» en Editar un evento (pedido de gorrite: elegir el lugar desde el evento): guardar pone,
 * cambia o saca el edge `lugar` del evento en la base (con el registro de actividad y una versión
 * nueva del evento); el evento se guarda en la base (nunca en GitHub) y su texto queda igual que
 * sin el «Lugar»;
 * cambiar solo el lugar guarda el archivo con la fecha de «Actualizado» de hoy y nada más
 * (decisión de gorrite); si guardar el archivo falla, el lugar no cambia. También «+ Crear lugar»
 * (no listado por defecto, decisión de gorrite) y la edición rápida del lugar elegido.
 * Repo de mentira, D1 de miniflare y datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { publicVenueForEvent, setEventVenue } from '$lib/server/amigues/venues.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { listRevisions } from '$lib/server/contenido/revisions.js';
import { ANON } from '$lib/server/objects/index.js';
import { parse } from 'yaml';
import {
	applyFrontmatterChanges,
	formatPostDate,
	joinMarkdown,
	splitMarkdown,
	todayInArgentina
} from '$lib/utils/eventDraft.js';

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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.doUnmock('$lib/server/eventos');
	vi.resetModules();
});

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const SLUG = 'fiesta-de-prueba-2031-05';
const PATH = `src/lib/posts/calendario/${SLUG}.md`;

/**
 * Lo que manda Editar cuando no se tocó nada del archivo: la fecha de «Actualizado» de hoy
 * (`updated_date`, como hace PostEditor en cada guardado) y nada más.
 * @param {string} raw
 */
const withTodayUpdated = (raw) => {
	const { frontmatter, body } = splitMarkdown(raw);
	return joinMarkdown(
		applyFrontmatterChanges(frontmatter, { updated_date: formatPostDate(todayInArgentina()) }),
		body
	);
};

/** @param {string} title */
const eventMd = (title) =>
	[
		'---',
		`title: ${title}`,
		'updated_date: 2031-01-01Z-03:00',
		"summary: 'Resumen inventado'",
		'tags:',
		'  - español',
		'  - AMBA',
		'  - fiesta',
		'layout: calendario',
		'category: calendario',
		'status: abierto',
		'start: 2031-05-10T21:00-03:00',
		'location: Calle Falsa 123',
		'---',
		'Texto inventado.',
		''
	].join('\n');

/**
 * La ruta con un repo de mentira (el cliente pasa por withContentDb, como en producción: el evento
 * se guarda en la base). El evento SLUG está en la base (importado de `eventMd`).
 */
async function page() {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { PERFILES_PUBLICOS_ENABLED: '1' } }));
	const raw = eventMd('Fiesta de Prueba');
	const meta = JSON.parse(JSON.stringify(parse(splitMarkdown(raw).frontmatter)));
	await runImport(t.db, 'calendario', [{ legacySlug: SLUG, raw, meta }], {
		actor: 'importacion',
		now: 1_900_000_000_000
	});
	/** @type {any[]} */
	const commits = [];
	/** @type {Map<string, string>} */
	const store = new Map([[PATH, eventMd('Fiesta de Prueba')]]);
	const fake = {
		getFile: async (/** @type {string} */ _t, /** @type {string} */ p) => store.get(p) ?? null,
		readFile: async (/** @type {string} */ _t, /** @type {string} */ p) =>
			store.has(p) ? { raw: store.get(p), sha: 'a'.repeat(40), ref: 'main' } : null,
		pathExists: async () => false,
		existingPaths: async () => [],
		listDir: async () => [],
		listTree: async () => [],
		getDirTexts: async () => [],
		commitFiles: async (/** @type {string} */ _t, /** @type {any} */ c) => {
			commits.push(c);
			return { url: 'https://example.com/commit/prueba' };
		}
	};
	vi.doMock('$lib/server/eventos', async (importOriginal) => {
		const repo = await import('$lib/server/contenido/repo.js');
		return {
			.../** @type {any} */ (await importOriginal()),
			getRepoClient: async () => repo.withContentDb(fake)
		};
	});
	const repo = await import('$lib/server/contenido/repo.js');
	repo.setContentDB(t.db);
	return {
		mod: await import('./+page.server.js'),
		commits,
		client: repo.withContentDb(fake)
	};
}

/**
 * @param {Record<string, string>} form
 * @param {string} [slug]
 */
const save = (form, slug = SLUG) =>
	fakeRequestEvent({
		platform: t.platform,
		path: `/admin/eventos/${slug}/editar?/save`,
		params: { slug },
		user: admin,
		form: {
			sha: 'a'.repeat(40),
			eol: 'lf',
			content: eventMd('Fiesta de Prueba (cambiada)'),
			...form
		}
	});

/** El vínculo guardado: el edge `lugar` del evento (`null` si no tiene). */
const venueRow = async (slug = SLUG) =>
	/** @type {any} */ (
		await t.db
			.prepare(
				`SELECT e.to_id AS venue_id, json_extract(e.data, '$.privacy') AS privacy FROM edges e
				JOIN objects o ON o.id = e.from_id AND o.type = 'evento'
				LEFT JOIN content_sources s ON s.object_id = o.id
				WHERE e.kind = 'lugar' AND coalesce(s.legacy_slug, o.slug) = ?1`
			)
			.bind(slug)
			.first()
	);

/** @param {string} action */
const audit = async (action) =>
	(
		await t.db
			.prepare('SELECT target_id, summary FROM admin_audit WHERE action = ?1')
			.bind(action)
			.all()
	).results;

const lugar = async (title = 'Sala Inventada', privacy = 'name') =>
	makeProfile(t.db, { title, kind: 'lugar', data: { address: 'Calle 1', venue_privacy: privacy } });

describe('guardar: el «Lugar» del evento', () => {
	/** El texto y el sha del evento SLUG en la base. @param {any} client */
	const current = async (client) =>
		/** @type {{ raw: string, sha: string }} */ (await client.readFile('t', PATH));
	/** La versión del evento SLUG en la base. */
	const version = async () =>
		Number(
			/** @type {any} */ (
				await t.db
					.prepare(
						`SELECT o.version FROM objects o JOIN content_sources s ON s.object_id = o.id
						WHERE s.legacy_slug = ?1`
					)
					.bind(SLUG)
					.first()
			)?.version
		);

	it('«Sacar lugar» lo desvincula, con registro', async () => {
		const v = await lugar();
		const { mod, client, commits } = await page();
		// «Sucede en» es un edge del evento: se vincula con el evento ya en la base (versión 2).
		await setEventVenue(t.db, { eventSlug: SLUG, venueId: v.id, privacy: 'name', by: 'otre' });
		const file = await current(client);
		const res = /** @type {any} */ (
			await mod.actions.save(
				save({ content: withTodayUpdated(file.raw), sha: file.sha, lugar: '', lugarCambio: '1' })
			)
		);
		expect(res).toMatchObject({ save: 'Guardado', savedToDb: true });
		expect(commits).toHaveLength(0);
		expect(await venueRow()).toBeNull();
		expect(await audit('event.venue_remove')).toHaveLength(1);
	});

	it('sin tocar el «Lugar», guardar no cambia el vínculo', async () => {
		const v = await lugar();
		const otro = await lugar('Otra Sala Inventada');
		const { mod, client, commits } = await page();
		// «Sucede en» es un edge del evento: se vincula con el evento ya en la base (versión 2).
		await setEventVenue(t.db, { eventSlug: SLUG, venueId: v.id, privacy: 'name', by: 'otre' });
		const file = await current(client);
		// Los campos llegan, pero sin `lugarCambio`: no se tocó.
		const res = /** @type {any} */ (
			await mod.actions.save(
				save({ sha: file.sha, lugar: String(otro.id), lugarPrivacidad: 'public' })
			)
		);
		expect(res.save).toBe('Guardado');
		expect(commits).toHaveLength(0);
		expect(await version()).toBe(3); // importado (1), el lugar (2) y este guardado (3)
		expect(await venueRow()).toMatchObject({ venue_id: v.id, privacy: 'name' });
		expect(await audit('event.venue_set')).toHaveLength(0);
	});

	it('si guardar el evento falla (alguien guardó en el medio), el lugar no se vincula', async () => {
		const v = await lugar();
		const { mod } = await page();
		const res = /** @type {any} */ (
			await mod.actions.save(save({ sha: 'b'.repeat(40), lugar: String(v.id), lugarCambio: '1' }))
		);
		expect(res.status).toBe(502);
		expect(await version()).toBe(1);
		expect(await venueRow()).toBeNull();
	});

	it('un lugar que ya no existe no guarda nada', async () => {
		const { mod, client, commits } = await page();
		const file = await current(client);
		const res = /** @type {any} */ (
			await mod.actions.save(save({ sha: file.sha, lugar: '999999', lugarCambio: '1' }))
		);
		expect(res.status).toBe(400);
		expect(res.data.error).toMatch(/ya no existe/);
		expect(commits).toHaveLength(0);
		expect(await version()).toBe(1);
		expect(await venueRow()).toBeNull();
	});
});

describe('guardar en la base', () => {
	const FIXTURE = 'fiesta-inventada-2031-01';
	const FIXTURE_PATH = `src/lib/posts/calendario/${FIXTURE}.md`;
	const raws = /** @type {Record<string, string>} */ (
		import.meta.glob('../../../../../../lib/server/contenido/fixtures/calendario/*.md', {
			query: '?raw',
			import: 'default',
			eager: true
		})
	);
	const metas = /** @type {Record<string, Record<string, any> | undefined>} */ (
		import.meta.glob('../../../../../../lib/server/contenido/fixtures/calendario/*.md', {
			import: 'metadata',
			eager: true
		})
	);
	const files = Object.keys(raws)
		.filter((p) => p.endsWith(`/${FIXTURE}.md`))
		.map((p) => ({ legacySlug: FIXTURE, raw: raws[p], meta: metas[p] ?? null }));

	/**
	 * Guarda el evento de la base con el título cambiado (y `extra`); devuelve el resultado y el
	 * texto que queda en la base.
	 * @param {Record<string, string>} extra
	 */
	async function saveFromDb(extra) {
		await runImport(t.db, 'calendario', files, { actor: 'importacion', now: 1_900_000_000_000 });
		const { mod, client, commits } = await page();
		const file = /** @type {{ raw: string, sha: string }} */ (
			await client.readFile('t', FIXTURE_PATH)
		);
		const content = file.raw.replace(/^title: .*$/m, 'title: Fiesta Inventada (cambiada)');
		const res = /** @type {any} */ (
			await mod.actions.save(save({ content, sha: file.sha, ...extra }, FIXTURE))
		);
		return { res, commits, raw: await client.getFile('t', FIXTURE_PATH) };
	}

	it('el lugar se vincula igual y el texto guardado es el mismo que sin el «Lugar»', async () => {
		expect(files).toHaveLength(1);
		const plain = await saveFromDb({});
		expect(plain.res).toMatchObject({ save: 'Guardado', savedToDb: true });
		await resetDB(t.db);
		const v = await lugar();
		const withVenue = await saveFromDb({ lugar: String(v.id), lugarCambio: '1' });
		expect(withVenue.res).toMatchObject({ save: 'Guardado', savedToDb: true, venueSaved: true });
		// Nada fue a GitHub: el evento está en la base.
		expect(withVenue.commits).toHaveLength(0);
		expect(withVenue.raw).toContain('title: Fiesta Inventada (cambiada)');
		expect(withVenue.raw).toBe(plain.raw);
		expect(await venueRow(FIXTURE)).toMatchObject({ venue_id: v.id, privacy: null });
	});

	it('cambiar solo el lugar guarda una versión nueva con la fecha de hoy, a nombre de quien guardó', async () => {
		await runImport(t.db, 'calendario', files, { actor: 'importacion', now: 1_900_000_000_000 });
		const v = await lugar();
		const { mod, client } = await page();
		const file = /** @type {{ raw: string, sha: string }} */ (
			await client.readFile('t', FIXTURE_PATH)
		);
		const res = /** @type {any} */ (
			await mod.actions.save(
				save(
					{
						content: withTodayUpdated(file.raw),
						sha: file.sha,
						lugar: String(v.id),
						lugarPrivacidad: 'area',
						lugarCambio: '1'
					},
					FIXTURE
				)
			)
		);
		expect(res).toMatchObject({ save: 'Guardado', savedToDb: true, venueSaved: true });
		const raw = /** @type {string} */ (await client.getFile('t', FIXTURE_PATH));
		expect(raw).toMatch(
			new RegExp(`^updated_date: '?${formatPostDate(todayInArgentina())}'?$`, 'm')
		);
		// Sin la línea de «Actualizado», el texto es el mismo de antes.
		/** @param {string} text */
		const withoutUpdated = (text) =>
			text
				.split('\n')
				.filter((l) => !l.startsWith('updated_date:'))
				.join('\n');
		expect(withoutUpdated(raw)).toBe(withoutUpdated(file.raw));
		const object = /** @type {any} */ (
			await t.db
				.prepare(
					`SELECT o.id FROM objects o JOIN content_sources s ON s.object_id = o.id
					WHERE s.legacy_slug = ?1`
				)
				.bind(FIXTURE)
				.first()
		);
		const revs = await listRevisions(t.db, object.id);
		// El texto (versión 2) y después el lugar (versión 3: el edge `lugar` es un guardado del
		// evento, con su historial).
		expect(revs.map((r) => [r.version, r.source, r.savedBy])).toEqual([
			[3, 'lugar', admin.login],
			[2, 'panel', admin.login],
			[1, 'import', 'importacion']
		]);
		expect(await venueRow(FIXTURE)).toMatchObject({ venue_id: v.id, privacy: 'area' });
	});
});

describe('«+ Crear lugar»', () => {
	it('crea un lugar aprobado y no listado en Amigues (con registro) y lo devuelve para elegirlo', async () => {
		const { mod } = await page();
		const event = fakeRequestEvent({
			platform: t.platform,
			path: `/admin/eventos/${SLUG}/editar?/crearLugar`,
			params: { slug: SLUG },
			user: admin,
			form: { title: 'Sala Nueva Inventada', address: 'Calle Inventada 99' }
		});
		const res = /** @type {any} */ (await mod.actions.crearLugar(event));
		// Decisión de gorrite: no listado por defecto (como al importar lugares desde los eventos).
		expect(res.venueCreated).toMatchObject({
			title: 'Sala Nueva Inventada',
			visibility: 'public',
			unlisted: true,
			approved: true,
			privacy: null,
			address: 'Calle Inventada 99'
		});
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(res.venueCreated.id).first()
		);
		expect(JSON.parse(row.data)).toMatchObject({
			kind: 'lugar',
			address: 'Calle Inventada 99',
			unlisted: true
		});
		expect(await audit('profile.create')).toHaveLength(1);
	});

	it('«Público» lo crea listado; no listado no cambia lo que muestra el evento', async () => {
		const { mod } = await page();
		/** @param {string} title @param {Record<string, string>} extra */
		const create = async (title, extra) =>
			/** @type {any} */ (
				await mod.actions.crearLugar(
					fakeRequestEvent({
						platform: t.platform,
						path: `/admin/eventos/${SLUG}/editar?/crearLugar`,
						params: { slug: SLUG },
						user: admin,
						form: { title, address: 'Calle Inventada 99', ...extra }
					})
				)
			).venueCreated;
		const listed = await create('Sala Listada', { listado: 'listed' });
		const unlisted = await create('Sala No Listada', {});
		const odd = await create('Sala Rara', { listado: 'cualquier cosa' });
		expect(listed.unlisted).toBe(false);
		expect(unlisted.unlisted).toBe(true);
		expect(odd.unlisted).toBe(true);
		const data = /** @type {any} */ (
			await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(listed.id).first()
		);
		expect(JSON.parse(data.data).unlisted).toBeUndefined();
		// La página del evento muestra igual el lugar no listado y el listado (según su nivel).
		await makeEvent(t.db, 'a');
		await makeEvent(t.db, 'b');
		await setEventVenue(t.db, { eventSlug: 'a', venueId: listed.id, privacy: null, by: 'x' });
		await setEventVenue(t.db, { eventSlug: 'b', venueId: unlisted.id, privacy: null, by: 'x' });
		const a = /** @type {any} */ (await publicVenueForEvent(t.db, 'a', ANON));
		const b = /** @type {any} */ (await publicVenueForEvent(t.db, 'b', ANON));
		expect(b).toMatchObject({
			level: 'public',
			name: 'Sala No Listada',
			address: 'Calle Inventada 99'
		});
		/** @param {Record<string, unknown>} view sin el nombre ni el link (son de cada lugar) */
		const shape = (view) =>
			Object.fromEntries(Object.entries(view).filter(([k]) => k !== 'name' && k !== 'href'));
		expect(shape(b)).toEqual(shape(a));
		expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
	});

	it('sin nombre no crea nada; sin admin, a iniciar sesión', async () => {
		const { mod } = await page();
		const res = /** @type {any} */ (
			await mod.actions.crearLugar(
				fakeRequestEvent({
					platform: t.platform,
					path: `/admin/eventos/${SLUG}/editar?/crearLugar`,
					params: { slug: SLUG },
					user: admin,
					form: { title: '  ', address: 'Calle 1' }
				})
			)
		);
		expect(res.status).toBe(400);
		const anon = await thrown(() =>
			mod.actions.crearLugar(
				fakeRequestEvent({
					platform: t.platform,
					path: `/admin/eventos/${SLUG}/editar?/crearLugar`,
					params: { slug: SLUG },
					form: { title: 'Sala', address: '' }
				})
			)
		);
		expect(anon?.status).toBe(303);
		expect(
			(await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'perfil'").first())?.n
		).toBe(0);
	});
});

describe('«Editar» el lugar elegido (edición rápida)', () => {
	/** @param {Record<string, string>} form @param {any} [user] */
	const editEvent = (form, user = admin) =>
		fakeRequestEvent({
			platform: t.platform,
			path: `/admin/eventos/${SLUG}/editar?/editarLugar`,
			params: { slug: SLUG },
			user,
			form
		});

	it('guarda nombre, dirección, barrio y ciudad en el perfil (con registro y autoría); lo demás queda', async () => {
		const v = await makeProfile(t.db, {
			title: 'Sala Vieja Inventada',
			kind: 'lugar',
			data: {
				address: 'Calle 1',
				venue_privacy: 'area',
				unlisted: true,
				how_to_get_there: 'Por la puerta verde'
			}
		});
		const { mod } = await page();
		const res = /** @type {any} */ (
			await mod.actions.editarLugar(
				editEvent({
					lugar: String(v.id),
					version: String(v.version),
					title: 'Sala Nueva Inventada',
					address: 'Calle Inventada 2',
					area: 'Barrio Inventado',
					city: 'Ciudad Inventada'
				})
			)
		);
		expect(res.venueUpdated).toMatchObject({
			id: v.id,
			title: 'Sala Nueva Inventada',
			address: 'Calle Inventada 2',
			area: 'Barrio Inventado',
			city: 'Ciudad Inventada',
			privacy: 'area',
			unlisted: true,
			version: v.version + 1
		});
		const row = /** @type {any} */ (
			await t.db
				.prepare('SELECT title, data, updated_by FROM objects WHERE id = ?1')
				.bind(v.id)
				.first()
		);
		expect(row.title).toBe('Sala Nueva Inventada');
		expect(row.updated_by).toBe(admin.login);
		expect(JSON.parse(row.data)).toMatchObject({
			address: 'Calle Inventada 2',
			area: 'Barrio Inventado',
			city: 'Ciudad Inventada',
			venue_privacy: 'area',
			unlisted: true,
			how_to_get_there: 'Por la puerta verde'
		});
		const log = /** @type {any[]} */ (
			(
				await t.db
					.prepare("SELECT actor_login, target_id FROM admin_audit WHERE action = 'profile.update'")
					.all()
			).results
		);
		expect(log).toEqual([{ actor_login: admin.login, target_id: String(v.id) }]);
	});

	it('los errores vuelven para mostrarlos al lado de cada campo, sin guardar', async () => {
		const v = await lugar();
		const { mod } = await page();
		const base = {
			lugar: String(v.id),
			version: String(v.version),
			address: '',
			area: '',
			city: ''
		};
		const empty = /** @type {any} */ (
			await mod.actions.editarLugar(editEvent({ ...base, title: ' ' }))
		);
		expect(empty.status).toBe(400);
		expect(empty.data.venueErrors).toEqual({ title: 'Escribí el nombre del lugar.' });
		const long = /** @type {any} */ (
			await mod.actions.editarLugar(editEvent({ ...base, title: 'Sala', area: 'x'.repeat(150) }))
		);
		expect(long.status).toBe(400);
		expect(long.data.venueErrors.area).toMatch(/Barrio/);
		const stale = /** @type {any} */ (
			await mod.actions.editarLugar(editEvent({ ...base, title: 'Sala', version: '99' }))
		);
		expect(stale.status).toBe(409);
		expect(stale.data.venueError).toMatch(/Alguien más cambió este lugar/);
		const gone = /** @type {any} */ (
			await mod.actions.editarLugar(editEvent({ ...base, lugar: '999999', title: 'Sala' }))
		);
		expect(gone.status).toBe(404);
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT title, version FROM objects WHERE id = ?1').bind(v.id).first()
		);
		expect(row).toMatchObject({ title: 'Sala Inventada', version: v.version });
		expect(await audit('profile.update')).toHaveLength(0);
	});

	it('solo admins: sin sesión a iniciar sesión, sin ser admin 403', async () => {
		const v = await lugar();
		const { mod } = await page();
		const form = { lugar: String(v.id), version: String(v.version), title: 'Robado' };
		expect((await thrown(() => mod.actions.editarLugar(editEvent(form, null))))?.status).toBe(303);
		expect(
			(
				await thrown(() =>
					mod.actions.editarLugar(editEvent(form, { id: 1, login: 'no-es-admin' }))
				)
			)?.status
		).toBe(403);
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT title FROM objects WHERE id = ?1').bind(v.id).first()
		);
		expect(row.title).toBe('Sala Inventada');
	});
});

describe('la ficha del evento (fila «Lugar»)', () => {
	it('muestra el lugar vinculado y qué se muestra; «Cambiar» lleva a la sección del formulario', async () => {
		const v = await lugar();
		const { panelVenueRow } = await import('$lib/server/amigues/eventFormVenue.js');
		expect(await panelVenueRow(t.db, SLUG)).toBeNull();
		await makeEvent(t.db, SLUG);
		await setEventVenue(t.db, { eventSlug: SLUG, venueId: v.id, privacy: null, by: 'otre' });
		const row = await panelVenueRow(t.db, SLUG);
		expect(row).toMatchObject({
			title: 'Sala Inventada',
			slug: v.slug,
			privacy: 'Igual que el Lugar (Sólo Nombre)'
		});
		vi.resetModules();
		vi.doMock('$app/stores', async () => {
			const { readable } = await import('svelte/store');
			return {
				page: readable({ url: new URL(`http://localhost/admin/eventos/${SLUG}`), data: {} })
			};
		});
		const { render } = await import('svelte/server');
		const { default: Page } = await import('../+page.svelte');
		vi.doUnmock('$app/stores');
		const event = {
			slug: SLUG,
			title: 'Fiesta de Prueba',
			start: '2031-05-10T21:00-03:00',
			end: '',
			location: 'Calle Falsa 123',
			locationName: '',
			place: 'AMBA',
			authors: [],
			tags: []
		};
		const base = { event, checklist: [], stream: null, sale: null, online: false, draft: false };
		const body = render(Page, {
			props: {
				data: /** @type {any} */ ({ ...base, missing: [], venue: row }),
				form: /** @type {any} */ (null)
			}
		}).body;
		expect(body).toContain('Sala Inventada');
		expect(body).toContain('Se muestra: Igual que el Lugar (Sólo Nombre)');
		expect(body).toContain(`href="/admin/eventos/${SLUG}/editar#sec-lugar"`);
		expect(body).toContain('Cambiar');
		const none = render(Page, {
			props: {
				data: /** @type {any} */ ({ ...base, missing: [], venue: null }),
				form: /** @type {any} */ (null)
			}
		}).body;
		expect(none).toContain('Elegir un lugar');
		expect(none).toContain('Calle Falsa 123');
	});
});
