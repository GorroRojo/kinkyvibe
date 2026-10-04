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

/**
 * @param {any} locals
 * @param {unknown[]} rows
 * @param {{ allSlugs?: string[], dryRun?: boolean, importAt?: number, platform?: any }} [opts]
 */
async function crear(locals, rows, { allSlugs, dryRun, importAt, platform } = {}) {
	const body = new FormData();
	body.set('rows', JSON.stringify(rows));
	if (allSlugs) body.set('allSlugs', JSON.stringify(allSlugs));
	if (dryRun) body.set('dryRun', '1');
	if (importAt) body.set('importAt', String(importAt));
	/** @type {any} */
	const event = {
		platform: platform ?? t.platform,
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

/** `n` filas inventadas, cada una con su dirección. @param {number} n */
const manyRows = (n) =>
	Array.from({ length: n }, (_, i) => ({
		...ROW,
		title: `Taller Inventado ${i + 1}`,
		slug: `taller-inventado-tanda-${i + 1}`
	}));

/** Cuántos eventos con estas direcciones hay en la base. @param {string[]} slugs */
async function countEvents(slugs) {
	const r = /** @type {any} */ (
		await t.db
			.prepare(
				`SELECT COUNT(*) AS n FROM objects
				 WHERE type = 'evento' AND slug IN (SELECT value FROM json_each(?1))`
			)
			.bind(JSON.stringify(slugs))
			.first()
	);
	return Number(r.n);
}

/**
 * Una base que falla al guardar el evento con la dirección `slug` (para probar un guardado que se
 * corta a mitad de una tanda).
 * @param {string} slug
 */
function platformFailingOn(slug) {
	const real = t.db;
	const db = new Proxy(real, {
		get(target, prop) {
			if (prop === 'prepare') {
				return (/** @type {string} */ sql) => {
					const st = target.prepare(sql);
					if (!/INSERT INTO objects/.test(sql)) return st;
					return new Proxy(st, {
						get(s, p) {
							if (p === 'bind') {
								return (/** @type {unknown[]} */ ...args) => {
									if (args.includes(slug)) throw new Error('Falla inventada');
									return s.bind(...args);
								};
							}
							const v = /** @type {any} */ (s)[p];
							return typeof v === 'function' ? v.bind(s) : v;
						}
					});
				};
			}
			const v = /** @type {any} */ (target)[prop];
			return typeof v === 'function' ? v.bind(target) : v;
		}
	});
	return { ...t.platform, env: { ...t.platform.env, DB: db } };
}

describe('de a tandas (hasta 200 filas)', () => {
	it('la página puede importar 200 filas: revisa todas y después guarda de a 40', async () => {
		const data = await callLoad(admin);
		expect(data.maxRows).toBe(200);
		expect(data.chunk).toBe(40);
		const rows = manyRows(200);
		const allSlugs = rows.map((r) => r.slug);
		// 1. Revisar (no guarda nada).
		for (let from = 0; from < rows.length; from += data.chunk) {
			const r = await crear(admin, rows.slice(from, from + data.chunk), {
				allSlugs,
				dryRun: true
			});
			expect(r.success).toBe(true);
			expect(r.checked).toBe(Math.min(data.chunk, rows.length - from));
		}
		expect(await countEvents(allSlugs)).toBe(0);
		// 2. Guardar.
		const importAt = Date.now();
		const created = [];
		for (let from = 0; from < rows.length; from += data.chunk) {
			const r = await crear(admin, rows.slice(from, from + data.chunk), { allSlugs, importAt });
			expect(r.success).toBe(true);
			expect(r.failed).toBeNull();
			created.push(...r.created);
		}
		expect(created.map((c) => c.slug)).toEqual(allSlugs);
		expect(await countEvents(allSlugs)).toBe(200);
		// Una línea en Actividad por tanda.
		const audit = await listAudit(t.db, { limit: 10 });
		expect(audit.filter((a) => a.action === 'event.import')).toHaveLength(5);
	});

	it('más de 40 filas en un pedido, o más de 200 en total: no guarda nada', async () => {
		const tooMany = await crear(admin, manyRows(41));
		expect(tooMany.status).toBe(400);
		const rows = manyRows(201);
		const r = await crear(admin, rows.slice(0, 40), { allSlugs: rows.map((x) => x.slug) });
		expect(r.status).toBe(400);
		expect(r.data.error).toMatch(/hasta 200/);
		expect(await countEvents(rows.map((x) => x.slug))).toBe(0);
	});

	it('una dirección repetida en otra tanda es un error de la fila', async () => {
		const rows = manyRows(45);
		rows[44].slug = rows[3].slug;
		const allSlugs = rows.map((r) => r.slug);
		const r = await crear(admin, rows.slice(40), { allSlugs, dryRun: true });
		expect(r.status).toBe(400);
		expect(r.data.rowErrors[4]).toMatch(/misma dirección/);
	});

	it('si se reintenta una tanda (se cortó la respuesta), no se duplica nada', async () => {
		const rows = manyRows(80);
		const allSlugs = rows.map((r) => r.slug);
		const importAt = Date.now();
		const first = await crear(admin, rows.slice(0, 40), { allSlugs, importAt });
		expect(first.success).toBe(true);
		// La misma tanda otra vez, con el mismo importAt: ya estaba guardada.
		const again = await crear(admin, rows.slice(0, 40), { allSlugs, importAt });
		expect(again.success).toBe(true);
		expect(again.failed).toBeNull();
		expect(again.created.map((/** @type {any} */ c) => c.slug)).toEqual(allSlugs.slice(0, 40));
		expect(again.created.every((/** @type {any} */ c) => c.again)).toBe(true);
		const second = await crear(admin, rows.slice(40), { allSlugs, importAt });
		expect(second.success).toBe(true);
		expect(await countEvents(allSlugs)).toBe(80);
		const all = /** @type {any} */ (
			await t.db
				.prepare(`SELECT COUNT(*) AS n FROM objects WHERE type = 'evento' AND slug LIKE ?1`)
				.bind('taller-inventado-tanda-%')
				.first()
		);
		expect(Number(all.n)).toBe(80);
		// Actividad: solo lo que se creó de verdad (dos tandas, no tres).
		const audit = await listAudit(t.db, { limit: 10 });
		expect(audit.filter((a) => a.action === 'event.import')).toHaveLength(2);
		// Otra importación (otro importAt) con una dirección ya usada: choque, como siempre.
		const other = await crear(admin, rows.slice(0, 1), { importAt: importAt + 1 });
		expect(other.status).toBe(409);
	});

	it('un guardado que falla a mitad de una tanda: lo anterior queda y se dice qué fila falló', async () => {
		const rows = manyRows(80);
		const allSlugs = rows.map((r) => r.slug);
		const importAt = Date.now();
		const first = await crear(admin, rows.slice(0, 40), { allSlugs, importAt });
		expect(first.success).toBe(true);
		const broken = await crear(admin, rows.slice(40), {
			allSlugs,
			importAt,
			platform: platformFailingOn(rows[52].slug)
		});
		expect(broken.success).toBe(true);
		expect(broken.created).toHaveLength(12);
		expect(broken.failed).toMatchObject({
			index: 12,
			slug: rows[52].slug,
			title: rows[52].title,
			pending: 27
		});
		expect(broken.failed.message).toMatch(/Falla inventada/);
		expect(await countEvents(allSlugs)).toBe(52);
	});
});
