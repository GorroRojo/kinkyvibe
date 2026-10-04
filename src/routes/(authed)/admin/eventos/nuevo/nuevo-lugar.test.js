/**
 * «Lugar» al crear un evento (pedido de gorrite: elegir el lugar desde el formulario): el lugar se
 * vincula recién después de crear el evento (con su dirección), con registro; el archivo es el
 * mismo que sin el «Lugar»; si crear falla (o el lugar ya no existe) no se vincula nada; al
 * duplicar, el formulario arranca con el lugar del original. «Sucede en» es el edge `lugar` del
 * evento en la base: con `contenido_db` el evento nuevo nace en la base y se vincula; si va a
 * GitHub (todavía no está en la base), se crea y avisa que el lugar no se guardó. Repo de mentira,
 * D1 de miniflare y datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import { makeEvent, makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';
import { venuePickerData } from '$lib/server/amigues/eventFormVenue.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

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
const SLUG = 'fiesta-de-prueba-2031-10';

const EVENT_MD = [
	'---',
	'title: Fiesta de Prueba (4ª Edición)',
	"summary: 'Resumen inventado'",
	'tags:',
	'  - español',
	'  - AMBA',
	'  - fiesta',
	'layout: calendario',
	'category: calendario',
	'status: abierto',
	'start: 2031-10-10T21:00-03:00',
	'---',
	'Texto inventado.',
	''
].join('\n');

/**
 * La ruta con un repo de mentira. `contenido` prende `contenido_db` (el cliente pasa por
 * withContentDb, como en producción: el evento nuevo va a la base).
 * @param {{ failCommit?: boolean, contenido?: boolean }} [opts]
 */
async function page({ failCommit = false, contenido = false } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: { SERIES_ENABLED: '0', CONTENIDO_DB_ENABLED: contenido ? '1' : '0' }
	}));
	/** @type {any[]} */
	const commits = [];
	const fake = {
		getFile: async () => null,
		getDirTexts: async () => [],
		pathExists: async () => false,
		existingPaths: async () => [],
		listDir: async () => [],
		listTree: async () => [],
		commitFiles: async (/** @type {string} */ _token, /** @type {any} */ c) => {
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
	return { mod: await import('./+page.server.js'), commits, repo };
}

/** @param {Record<string, string>} extra */
const publish = (extra) =>
	fakeRequestEvent({
		platform: t.platform,
		path: '/admin/eventos/nuevo?/publicar',
		user: admin,
		form: { slug: SLUG, featuredMode: 'none', content: EVENT_MD, ...extra }
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

const lugar = async () =>
	makeProfile(t.db, { title: 'Sala Inventada', kind: 'lugar', data: { venue_privacy: 'name' } });

describe('crear un evento con lugar', () => {
	it('crea el evento y después vincula el lugar; el archivo es el mismo que sin el «Lugar»', async () => {
		// Con `contenido_db`: el evento nuevo nace en la base y el lugar es su edge.
		const control = await page({ contenido: true });
		const plain = /** @type {any} */ (await control.mod.actions.publicar(publish({})));
		expect(plain).toMatchObject({ success: true, venueSaved: false });
		expect(await venueRow()).toBeNull();
		const plainText = (await control.repo.findDbEvent(t.db, SLUG))?.raw;
		expect(plainText).toBeTruthy();
		await resetDB(t.db);

		const v = await lugar();
		const { mod, commits, repo } = await page({ contenido: true });
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({ lugar: String(v.id), lugarPrivacidad: 'address', lugarCambio: '1' })
			)
		);
		expect(res).toMatchObject({ success: true, venueSaved: true, warnings: [] });
		expect(commits).toHaveLength(0); // todo en la base
		expect(res.content).toBe(plain.content);
		expect((await repo.findDbEvent(t.db, SLUG))?.raw).toBe(plainText);
		expect(await venueRow()).toMatchObject({ venue_id: v.id, privacy: 'address' });
		const log = /** @type {any[]} */ (
			(
				await t.db
					.prepare('SELECT action, target_id FROM admin_audit WHERE target_id = ?1 ORDER BY id')
					.bind(SLUG)
					.all()
			).results
		);
		// Primero el evento, después el lugar.
		expect(log.map((r) => r.action)).toEqual(['event.publish', 'event.venue_set']);
	});

	it('si el evento va a GitHub (todavía no está en la base), se crea igual y avisa que el lugar no', async () => {
		const v = await lugar();
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({ lugar: String(v.id), lugarPrivacidad: 'address', lugarCambio: '1' })
			)
		);
		expect(res).toMatchObject({ success: true, venueSaved: false });
		expect(commits).toHaveLength(1);
		expect(res.warnings.join(' ')).toMatch(/el lugar no: .*todavía no está en la base/);
		expect(await venueRow()).toBeNull();
	});

	it('si crear el evento falla, no se vincula nada', async () => {
		const v = await lugar();
		const { mod } = await page({ failCommit: true });
		const res = /** @type {any} */ (
			await mod.actions.publicar(publish({ lugar: String(v.id), lugarCambio: '1' }))
		);
		expect(res.status).toBe(502);
		expect(await venueRow()).toBeNull();
	});

	it('si el lugar ya no existe, no se crea el evento', async () => {
		const { mod, commits } = await page();
		const res = /** @type {any} */ (
			await mod.actions.publicar(publish({ lugar: '424242', lugarCambio: '1' }))
		);
		expect(res.status).toBe(400);
		expect(res.data.error).toMatch(/ya no existe/);
		expect(commits).toHaveLength(0);
		expect(await venueRow()).toBeNull();
	});
});

describe('los lugares para el formulario', () => {
	it('al duplicar, arranca con el lugar del original; marca ocultos, no listados y sin aprobar', async () => {
		const v = await lugar();
		const oculto = await makeProfile(t.db, {
			title: 'Casa Oculta Inventada',
			kind: 'lugar',
			visibility: 'hidden',
			data: { unlisted: true, address: 'Calle Escondida 1', area: 'Barrio Inventado' }
		});
		const pendiente = await makeProfile(t.db, {
			title: 'Sala Pendiente Inventada',
			kind: 'lugar',
			approved: false
		});
		await makeProfile(t.db, { title: 'Persona Inventada', kind: 'persona' });
		await makeEvent(t.db, 'fiesta-de-prueba-2031-08');
		await setEventVenue(t.db, {
			eventSlug: 'fiesta-de-prueba-2031-08',
			venueId: v.id,
			privacy: 'area',
			by: 'otre'
		});
		const data = await venuePickerData(t.db, 'fiesta-de-prueba-2031-08');
		expect(data?.current).toEqual({ venueId: v.id, privacy: 'area' });
		expect(data?.venues.map((x) => x.title)).toEqual([
			'Casa Oculta Inventada',
			'Sala Inventada',
			'Sala Pendiente Inventada'
		]);
		expect(data?.venues.find((x) => x.id === oculto.id)).toMatchObject({
			visibility: 'hidden',
			unlisted: true,
			approved: true,
			// El panel ve la dirección (decisión de gorrite).
			address: 'Calle Escondida 1',
			area: 'Barrio Inventado'
		});
		expect(data?.venues.find((x) => x.id === pendiente.id)).toMatchObject({ approved: false });
		// De cero: sin lugar. Sin base: sin buscador (solo el texto libre).
		expect((await venuePickerData(t.db, null))?.current).toEqual({ venueId: null, privacy: null });
		expect(await venuePickerData(null, null)).toBeNull();
	});
});
