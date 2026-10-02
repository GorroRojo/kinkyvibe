/**
 * «Lugar» en Editar un evento (pedido de gorrite: elegir el lugar desde el evento): guardar pone,
 * cambia o saca el lugar en `event_venues` (con el registro de actividad), tanto si el evento se
 * guarda en GitHub como en la base (`contenido_db`); el archivo queda igual que sin el «Lugar»;
 * cambiar solo el lugar no toca el archivo; si guardar el archivo falla, el lugar no cambia.
 * Repo de mentira, D1 de miniflare y datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';
import { runImport } from '$lib/server/contenido/importer.js';

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

/** @param {string} title */
const eventMd = (title) =>
	[
		'---',
		`title: ${title}`,
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
 * La ruta con un repo de mentira. `contenido` prende `contenido_db` (el cliente pasa por
 * withContentDb, como en producción); `failCommit` hace fallar el guardado.
 * @param {{ contenido?: boolean, failCommit?: boolean }} [opts]
 */
async function page({ contenido = false, failCommit = false } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { CONTENIDO_DB_ENABLED: contenido ? '1' : '0', PERFILES_PUBLICOS_ENABLED: '1' }
	}));
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
			if (failCommit) throw new Error('GitHub no responde (inventado)');
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

const venueRow = async (slug = SLUG) =>
	/** @type {any} */ (
		await t.db.prepare('SELECT * FROM event_venues WHERE event_slug = ?1').bind(slug).first()
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

describe('guardar en GitHub', () => {
	it('elegir un lugar lo vincula (con registro) y el archivo queda igual que sin el «Lugar»', async () => {
		const v = await lugar();
		const { mod, commits } = await page();
		const plain = /** @type {any} */ (await mod.actions.save(save({})));
		expect(plain.save).toBe('Guardado');
		expect(await venueRow()).toBeNull();
		const res = /** @type {any} */ (
			await mod.actions.save(
				save({ lugar: String(v.id), lugarPrivacidad: 'area', lugarCambio: '1' })
			)
		);
		expect(res).toMatchObject({ save: 'Guardado', venueSaved: true });
		expect(commits).toHaveLength(2);
		expect(commits[1].files).toEqual(commits[0].files);
		expect(commits[1].files[0].content).not.toMatch(/Sala Inventada|lugar/i);
		expect(await venueRow()).toMatchObject({ venue_id: v.id, privacy: 'area' });
		const log = await audit('event.venue_set');
		expect(log).toEqual([
			expect.objectContaining({
				target_id: SLUG,
				summary: expect.stringContaining('Sólo dirección parcial (Barrio)')
			})
		]);
	});

	it('cambiar solo el nivel no guarda el archivo (ni la fecha de «Actualizado»)', async () => {
		const v = await lugar();
		await setEventVenue(t.db, { eventSlug: SLUG, venueId: v.id, privacy: null, by: 'otre' });
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.save(
				save({
					lugar: String(v.id),
					lugarPrivacidad: 'hidden',
					lugarCambio: '1',
					soloLugar: '1'
				})
			)
		);
		expect(res).toMatchObject({ save: 'Guardado', venueOnly: true, venueSaved: true });
		expect(commits).toHaveLength(0);
		expect(await venueRow()).toMatchObject({ venue_id: v.id, privacy: 'hidden' });
	});

	it('«Sacar lugar» lo desvincula, con registro', async () => {
		const v = await lugar();
		await setEventVenue(t.db, { eventSlug: SLUG, venueId: v.id, privacy: 'name', by: 'otre' });
		const { mod } = await page();
		const res = /** @type {any} */ (
			await mod.actions.save(save({ lugar: '', lugarCambio: '1', soloLugar: '1' }))
		);
		expect(res.save).toBe('Guardado');
		expect(await venueRow()).toBeNull();
		expect(await audit('event.venue_remove')).toHaveLength(1);
	});

	it('sin tocar el «Lugar», guardar no cambia el vínculo', async () => {
		const v = await lugar();
		const otro = await lugar('Otra Sala Inventada');
		await setEventVenue(t.db, { eventSlug: SLUG, venueId: v.id, privacy: 'name', by: 'otre' });
		const { mod, commits } = await page();
		// Los campos llegan, pero sin `lugarCambio`: no se tocó.
		const res = /** @type {any} */ (
			await mod.actions.save(save({ lugar: String(otro.id), lugarPrivacidad: 'public' }))
		);
		expect(res.save).toBe('Guardado');
		expect(commits).toHaveLength(1);
		expect(await venueRow()).toMatchObject({ venue_id: v.id, privacy: 'name' });
		expect(await audit('event.venue_set')).toHaveLength(0);
	});

	it('si guardar el archivo falla, el lugar no se vincula', async () => {
		const v = await lugar();
		const { mod } = await page({ failCommit: true });
		const res = /** @type {any} */ (
			await mod.actions.save(save({ lugar: String(v.id), lugarCambio: '1' }))
		);
		expect(res.status).toBe(502);
		expect(await venueRow()).toBeNull();
	});

	it('un lugar que ya no existe no guarda nada', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.save(save({ lugar: '999999', lugarCambio: '1' }))
		);
		expect(res.status).toBe(400);
		expect(res.data.error).toMatch(/ya no existe/);
		expect(commits).toHaveLength(0);
		expect(await venueRow()).toBeNull();
	});
});

describe('guardar en la base (contenido_db)', () => {
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
		const { mod, client, commits } = await page({ contenido: true });
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
});

describe('«+ Crear lugar»', () => {
	it('crea un lugar aprobado (con registro) y lo devuelve para elegirlo', async () => {
		const { mod } = await page();
		const event = fakeRequestEvent({
			platform: t.platform,
			path: `/admin/eventos/${SLUG}/editar?/crearLugar`,
			params: { slug: SLUG },
			user: admin,
			form: { title: 'Sala Nueva Inventada', address: 'Calle Inventada 99' }
		});
		const res = /** @type {any} */ (await mod.actions.crearLugar(event));
		expect(res.venueCreated).toMatchObject({
			title: 'Sala Nueva Inventada',
			visibility: 'public',
			approved: true,
			privacy: null
		});
		// Sin la dirección (el buscador no la necesita).
		expect(JSON.stringify(res.venueCreated)).not.toContain('Calle Inventada 99');
		const row = /** @type {any} */ (
			await t.db.prepare('SELECT data FROM objects WHERE id = ?1').bind(res.venueCreated.id).first()
		);
		expect(JSON.parse(row.data)).toMatchObject({ kind: 'lugar', address: 'Calle Inventada 99' });
		expect(await audit('profile.create')).toHaveLength(1);
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
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM objects').first())?.n).toBe(0);
	});
});

describe('la ficha del evento (fila «Lugar»)', () => {
	it('muestra el lugar vinculado y qué se muestra; «Cambiar» lleva a la sección del formulario', async () => {
		const v = await lugar();
		const { panelVenueRow } = await import('$lib/server/amigues/eventFormVenue.js');
		expect(await panelVenueRow(t.db, SLUG)).toBeNull();
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
