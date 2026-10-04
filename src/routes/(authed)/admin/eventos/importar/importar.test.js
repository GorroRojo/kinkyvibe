/**
 * /admin/eventos/importar: la página lista los eventos de la base para el buscador (con sus
 * entradas) y «Crear borradores» guarda en la base (objetos `evento`), nunca en GitHub. Datos
 * inventados en un D1 de miniflare. (Las pruebas del interruptor `contenido_db` apagado se fueron
 * con el interruptor: ese modo ya no existe, el contenido sale siempre de la base.)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Nada de esta página puede pasar por el cliente del repo (GitHub, el mock o el modo demo).
const repoCalls = { n: 0 };
vi.mock('$lib/server/eventos', async (importOriginal) => {
	const actual = /** @type {any} */ (await importOriginal());
	return {
		...actual,
		getRepoClient: async () => {
			repoCalls.n++;
			throw new Error('importar no tiene que usar el cliente del repo');
		}
	};
});

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { saveObject } from '$lib/server/objects/save.js';
import { clearDbPostCache } from '$lib/server/contenido/repo.js';
import { actions, load } from './+page.server.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const SOURCE = 'taller-inventado-2099-10';

beforeEach(async () => {
	await resetDB(t.db);
	clearDbPostCache();
	repoCalls.n = 0;
	await saveObject(
		t.db,
		{
			type: 'evento',
			slug: SOURCE,
			title: 'Taller Inventado',
			data: {
				start: '2099-10-02T19:00-03:00',
				end: '2099-10-02T22:00-03:00',
				status: 'abierto',
				tags: ['español', 'AMBA'],
				extra: {
					tickets: [{ id: 'general', name: 'General', price: 5000 }],
					meta_venta: 'plata:100000'
				}
			}
		},
		{ actor: 'prueba' }
	);
	clearDbPostCache();
});

const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };
const URL_ = new URL('http://localhost/admin/eventos/importar');

/** @param {any} locals @param {unknown[]} rows */
async function crear(locals, rows) {
	const body = new FormData();
	body.set('rows', JSON.stringify(rows));
	/** @type {any} */
	const event = {
		platform: t.platform,
		locals,
		request: new Request(URL_, { method: 'POST', body }),
		url: URL_
	};
	const r = /** @type {any} */ (await actions.crear(event));
	clearDbPostCache();
	return r;
}

/** @param {any} locals */
async function callLoad(locals) {
	try {
		return /** @type {any} */ (
			await load(/** @type {any} */ ({ locals, url: URL_, platform: t.platform }))
		);
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const ROW = {
	title: 'Taller Inventado',
	date: '2099-11-06',
	startTime: '19:00',
	endTime: '22:00',
	place: '',
	link: 'hola@example.com', // un mail suelto: pasa a mailto:
	price: '',
	source: SOURCE,
	slug: 'taller-inventado-2099-11'
};

describe('load', () => {
	it('los eventos de la base para el buscador, con sus entradas y meta', async () => {
		const data = await callLoad(admin);
		expect(data.dbOn).toBe(true);
		expect(data.events.map((/** @type {any} */ e) => e.slug)).toEqual([SOURCE]);
		expect(data.events[0].ticketMeta).toEqual({
			tickets: [{ id: 'general', name: 'General', price: 5000 }],
			meta_venta: 'plata:100000'
		});
		expect(data.takenSlugs).toContain(SOURCE);
	});

	it('solo admins', async () => {
		expect((await callLoad(notAdmin)).thrown).toBeGreaterThanOrEqual(300);
	});
});

describe('action crear', () => {
	it('guarda el borrador en la base (no en GitHub) y queda en Actividad', async () => {
		const r = await crear(admin, [ROW]);
		expect(r.success).toBe(true);
		expect(r.created.map((/** @type {any} */ c) => c.url)).toEqual([
			'/calendario/taller-inventado-2099-11'
		]);
		expect(r.failed).toBeNull();
		expect(repoCalls.n).toBe(0);
		const row = /** @type {any} */ (
			await t.db
				.prepare(`SELECT data, created_by FROM objects WHERE type = 'evento' AND slug = ?1`)
				.bind('taller-inventado-2099-11')
				.first()
		);
		const data = JSON.parse(row.data);
		expect(row.created_by).toBe(ADMINS[0].login);
		expect(data.link).toBe('mailto:hola@example.com');
		expect(data.extra.meta_venta).toBe('plata:100000');
		const audit = await listAudit(t.db, { limit: 5 });
		expect(audit[0]).toMatchObject({ action: 'event.import' });
	});

	it('un link que no es web, mail, tel: ni del sitio es un error de la fila', async () => {
		const r = await crear(admin, [{ ...ROW, link: 'javascript:alert(1)' }]);
		expect(r.status).toBe(400);
		expect(r.data.rowErrors[0]).toMatch(/link de inscripción/);
		const ok = await crear(admin, [{ ...ROW, link: '/calendario/otra-cosa' }]);
		expect(ok.success).toBe(true);
	});

	it('las entradas elegidas llegan como JSON y se validan', async () => {
		const tickets = {
			enabled: true,
			types: [
				{
					key: 't1',
					origId: 'general',
					id: 'general',
					name: 'General',
					mode: 'price',
					price: '6500',
					min: '0',
					suggested: '',
					capacity: '30',
					close: '',
					tiers: [],
					after: '',
					doorPrice: ''
				}
			],
			methods: { mercadopago: true, transferencia: false },
			customOpen: false,
			openAt: '',
			customClose: false,
			closeAt: '',
			modalidad: '',
			reminders: true,
			mpFee: '',
			door: true,
			doorSet: false,
			doorPrice: '',
			goalKind: 'entradas',
			goalValue: '25'
		};
		const r = await crear(admin, [{ ...ROW, tickets }]);
		expect(r.success).toBe(true);
		const row = /** @type {any} */ (
			await t.db
				.prepare(`SELECT data FROM objects WHERE type = 'evento' AND slug = ?1`)
				.bind('taller-inventado-2099-11')
				.first()
		);
		const data = JSON.parse(row.data);
		expect(data.extra.tickets).toEqual([
			{ id: 'general', name: 'General', price: 6500, capacity: 30 }
		]);
		expect(data.extra.meta_venta).toBe('entradas:25');

		const bad = await crear(admin, [
			{ ...ROW, slug: 'taller-inventado-2099-12', tickets: { enabled: true, types: 'roto' } }
		]);
		expect(bad.status).toBe(400);
		expect(bad.data.rowErrors[0]).toMatch(/Entradas|entradas/);
	});

	it('solo admins', async () => {
		const r = await crear(notAdmin, [ROW]);
		expect(r.status).toBe(403);
	});
});
