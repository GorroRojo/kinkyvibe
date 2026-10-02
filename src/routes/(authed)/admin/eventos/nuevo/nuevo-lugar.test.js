/**
 * «Lugar» al crear un evento (pedido de gorrite: elegir el lugar desde el formulario): el lugar se
 * vincula recién después de crear el evento (con su dirección), con registro; el archivo es el
 * mismo que sin el «Lugar»; si crear falla (o el lugar ya no existe) no se vincula nada; al
 * duplicar, el formulario arranca con el lugar del original. Repo de mentira, D1 de miniflare y
 * datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { fakeRequestEvent } from '$lib/server/series/fixtures.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
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

/** @param {{ failCommit?: boolean }} [opts] */
async function page({ failCommit = false } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env: { SERIES_ENABLED: '0' } }));
	/** @type {any[]} */
	const commits = [];
	vi.doMock('$lib/server/eventos', async (importOriginal) => ({
		.../** @type {any} */ (await importOriginal()),
		getRepoClient: async () => ({
			getFile: async () => null,
			getDirTexts: async () => [],
			pathExists: async () => false,
			listDir: async () => [],
			commitFiles: async (/** @type {string} */ _token, /** @type {any} */ c) => {
				if (failCommit) throw new Error('GitHub no responde (inventado)');
				commits.push(c);
				return { url: 'https://example.com/commit/prueba' };
			}
		})
	}));
	return { mod: await import('./+page.server.js'), commits };
}

/** @param {Record<string, string>} extra */
const publish = (extra) =>
	fakeRequestEvent({
		platform: t.platform,
		path: '/admin/eventos/nuevo?/publicar',
		user: admin,
		form: { slug: SLUG, featuredMode: 'none', content: EVENT_MD, ...extra }
	});

const venueRow = async (slug = SLUG) =>
	/** @type {any} */ (
		await t.db.prepare('SELECT * FROM event_venues WHERE event_slug = ?1').bind(slug).first()
	);

const lugar = async () =>
	makeProfile(t.db, { title: 'Sala Inventada', kind: 'lugar', data: { venue_privacy: 'name' } });

describe('crear un evento con lugar', () => {
	it('crea el evento y después vincula el lugar; el archivo es el mismo que sin el «Lugar»', async () => {
		const v = await lugar();
		const { mod, commits } = await page();
		const plain = /** @type {any} */ (await mod.actions.publicar(publish({})));
		expect(plain).toMatchObject({ success: true, venueSaved: false });
		expect(await venueRow()).toBeNull();
		const res = /** @type {any} */ (
			await mod.actions.publicar(
				publish({ lugar: String(v.id), lugarPrivacidad: 'address', lugarCambio: '1' })
			)
		);
		expect(res).toMatchObject({ success: true, venueSaved: true, warnings: [] });
		expect(commits).toHaveLength(2);
		expect(commits[1].files).toEqual(commits[0].files);
		expect(res.content).toBe(plain.content);
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
		expect(log.map((r) => r.action)).toEqual(['event.publish', 'event.publish', 'event.venue_set']);
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
			data: { unlisted: true, area: 'Barrio Inventado' }
		});
		const pendiente = await makeProfile(t.db, {
			title: 'Sala Pendiente Inventada',
			kind: 'lugar',
			approved: false
		});
		await makeProfile(t.db, { title: 'Persona Inventada', kind: 'persona' });
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
			area: 'Barrio Inventado'
		});
		expect(data?.venues.find((x) => x.id === pendiente.id)).toMatchObject({ approved: false });
		// De cero: sin lugar. Sin base: sin buscador (solo el texto libre).
		expect((await venuePickerData(t.db, null))?.current).toEqual({ venueId: null, privacy: null });
		expect(await venuePickerData(null, null)).toBeNull();
	});
});
