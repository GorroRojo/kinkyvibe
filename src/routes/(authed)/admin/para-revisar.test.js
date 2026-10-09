/**
 * «Para revisar» (decisión 0030): el botón del menú (`panelCounts(...).review`, lo que pide el
 * layout) es SIEMPRE la cantidad de filas de la tarjeta del Inicio (`load(...).todo`). Cada fila
 * cuenta 1, también la que junta varias cosas. Varios escenarios sembrados en la base de pruebas
 * (D1 de miniflare); los eventos, de mentira. Datos inventados (example.com).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { insertOrder } from '$lib/server/admin/testRows.js';
import { panelCounts } from '$lib/server/admin/panelCounts.js';
import { saveReviewSnapshot } from '$lib/server/admin/reviewSnapshots.js';
import { createProfile } from '$lib/server/cuentas/perfiles.js';
import { upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import { recordIntegrityRun } from '$lib/server/objects/integrity.js';
import { saveObject } from '$lib/server/objects/save.js';
import { load } from './+page.server.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const fake = vi.hoisted(() => ({
	/** @type {any[]} */ events: [],
	/** @type {{ slug: string, config: any }[]} */ ticketed: [],
	/** Como en dev y en los previews (true) o como en producción (false). */ localRepo: true
}));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/eventos/index.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listEvents: async () => structuredClone(fake.events),
	usesLocalRepo: () => fake.localRepo
}));
vi.mock('$lib/server/tickets/events.js', async (importOriginal) => ({
	.../** @type {object} */ (await importOriginal()),
	listTicketedEvents: async () => structuredClone(fake.ticketed),
	isTestEventSlug: () => false
}));

/** @param {string} local ej. '2026-09-30T12:00' (hora de Argentina) */
const ar = (local) => new Date(`${local}:00-03:00`).getTime();
const NOW = ar('2026-09-30T12:00');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

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
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	fake.events = [];
	fake.ticketed = [];
	fake.localRepo = true;
});
afterEach(() => {
	vi.useRealTimers();
});

/**
 * @param {string} slug
 * @param {Record<string, any>} [o]
 */
const event = (slug, o = {}) => ({
	slug,
	title: `Evento Inventado ${slug}`,
	start: '2026-10-03T21:00-03:00',
	end: '',
	status: 'abierto',
	location: 'Lugar Inventado',
	unlisted: false,
	unpublished: false,
	thumb: 'imagen.jpg',
	...o
});

/** @param {Record<string, any>} o */
const tickets = (o) => ({
	types: [{ id: 'general', name: 'General', capacity: 30, closesAt: null }],
	fondoEnabled: false,
	opensAt: null,
	closesAt: null,
	online: false,
	reminders: false,
	status: 'abierto',
	start: '2026-10-03T21:00-03:00',
	...o
});

const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: admin, user_token: 'token-de-prueba' })
);

/** La tarjeta del Inicio y el botón del menú, sobre la misma base. */
async function both() {
	const page = /** @type {any} */ (
		await load(
			/** @type {any} */ ({
				url: new URL('https://kinkyvibe.ar/admin'),
				locals,
				platform: t.platform,
				fetch: async () => Response.json({ collected: 0, goal: 0 }),
				setHeaders: () => {}
			})
		)
	);
	const counts = await panelCounts(t.platform, Date.now(), { locals });
	return { rows: /** @type {any[]} */ (page.todo), badge: counts.review };
}

/** @param {string} email */
async function accountProfile(email, title = 'Perfil Inventado') {
	const owner = await upsertVerifiedAccount(t.db, email);
	await t.db
		.prepare('UPDATE accounts SET can_have_profiles = 1 WHERE id = ?1')
		.bind(owner.id)
		.run();
	const created = await createProfile(t.db, owner.id, { kind: 'persona', title });
	if (!created.ok) throw new Error(created.message);
	return created.profile;
}

/** Una etiqueta de la base, como las guarda Etiquetas. @param {string} key */
const tag = (key) =>
	saveObject(
		t.db,
		{ type: 'etiqueta', title: key, slug: key.toLowerCase().replace(/\s+/g, '-'), data: { key } },
		{ actor: 'admin-de-prueba' }
	);

/**
 * Los escenarios: lo que se siembra y cuántas filas da (el botón tiene que decir lo mismo).
 * @type {Array<[string, () => Promise<void>, number]>}
 */
const CASES = [
	['nada de nada', async () => {}, 0],
	[
		'3 transferencias de 2 eventos: 2 filas (una por evento)',
		async () => {
			const transfer = { status: 'awaiting_transfer', method: 'transferencia' };
			await insertOrder(t.db, {
				...transfer,
				slug: 'uno',
				created: NOW - HOUR,
				expires: NOW + DAY
			});
			await insertOrder(t.db, {
				...transfer,
				slug: 'uno',
				created: NOW - HOUR,
				expires: NOW + DAY
			});
			await insertOrder(t.db, {
				...transfer,
				slug: 'dos',
				created: NOW - HOUR,
				expires: NOW + DAY
			});
			// Vencida: no cuenta.
			await insertOrder(t.db, {
				...transfer,
				slug: 'dos',
				created: NOW - 3 * DAY,
				expires: NOW - DAY
			});
		},
		2
	],
	[
		'mails que no salieron y una orden para revisar: una fila cada una',
		async () => {
			for (let i = 0; i < 3; i++) {
				await insertOrder(t.db, {
					slug: 'uno',
					created: NOW - 2 * HOUR,
					updated: NOW - 2 * HOUR,
					emailSentAt: null
				});
			}
			await insertOrder(t.db, {
				slug: 'uno',
				created: NOW - DAY,
				needsReview: 'duplicate_payment'
			});
		},
		4
	],
	[
		'25 mails que no salieron: la tarjeta muestra 20, el botón dice 20',
		async () => {
			for (let i = 0; i < 25; i++) {
				await insertOrder(t.db, {
					slug: 'uno',
					created: NOW - 2 * HOUR,
					updated: NOW - 2 * HOUR - i,
					emailSentAt: null
				});
			}
		},
		20
	],
	[
		'un perfil nuevo: 1 fila; tres perfiles nuevos: igual 1 fila (juntos)',
		async () => {
			await accountProfile('una-cuenta@example.com', 'Perfil Uno');
			await accountProfile('otra-cuenta@example.com', 'Perfil Dos');
			await accountProfile('tercera-cuenta@example.com', 'Perfil Tres');
		},
		1
	],
	[
		'eventos que vienen: 3 sin imagen (1 fila), un borrador solo (1), sobrevendido (1), sin link (1)',
		async () => {
			fake.events = [
				event('sin-imagen-1', { thumb: undefined }),
				event('sin-imagen-2', { thumb: undefined }),
				event('sin-imagen-3', { thumb: undefined }),
				event('borrador', { unlisted: true, draft: true }),
				event('online')
			];
			fake.ticketed = [
				{
					slug: 'online',
					config: tickets({
						online: true,
						types: [{ id: 'general', name: 'General', capacity: 1, closesAt: null }]
					})
				}
			];
			await insertOrder(t.db, { slug: 'online', quantity: 2, created: NOW - DAY });
		},
		4
	],
	[
		'transferencia tildada sin datos para transferir: 1 fila',
		async () => {
			fake.events = [event('fiesta')];
			fake.ticketed = [
				{ slug: 'fiesta', config: tickets({ paymentMethods: ['mercadopago', 'transferencia'] }) }
			];
		},
		1
	],
	[
		'el chequeo nocturno con 3 problemas: 1 fila',
		async () => {
			await recordIntegrityRun(
				t.db,
				[
					{ code: 'dangling_edge', message: 'inventado', edgeId: 1 },
					{ code: 'dangling_edge', message: 'inventado', edgeId: 2 },
					{ code: 'invalid_data', message: 'inventado', objectId: 3 }
				],
				NOW - 8 * HOUR
			);
		},
		1
	],
	[
		'etiquetas: dos fuera del árbol (y un alias, que no cuenta): 1 fila',
		async () => {
			await tag('Suelta Inventada');
			const otra = await tag('Otra Suelta');
			const alias = await tag('Alias Inventado');
			await t.db
				.prepare(
					`INSERT INTO edges (from_id, kind, to_id, position, data, created_at, created_by)
					VALUES (?1, 'alias_de', ?2, 0, NULL, ?3, 'admin-de-prueba')`
				)
				.bind(alias.id, otra.id, NOW)
				.run();
		},
		1
	],
	[
		'el importador encontró cosas para revisar: 1 fila; sin nada, ninguna',
		async () => {
			await saveReviewSnapshot(
				t.db,
				'importacion',
				{ count: 7, detail: { calendario: 5, material: 2 } },
				{ by: 'admin-de-prueba', now: NOW - DAY }
			);
		},
		1
	],
	[
		'de todo un poco',
		async () => {
			fake.events = [event('sin-imagen', { thumb: undefined }), event('fiesta')];
			fake.ticketed = [{ slug: 'fiesta', config: tickets({ paymentMethods: ['transferencia'] }) }];
			await insertOrder(t.db, {
				slug: 'fiesta',
				status: 'awaiting_transfer',
				method: 'transferencia',
				created: NOW - HOUR,
				expires: NOW + DAY
			});
			await insertOrder(t.db, { slug: 'fiesta', created: NOW - DAY, needsReview: 'late_payment' });
			await accountProfile('una-cuenta@example.com');
			await tag('Suelta Inventada');
			await saveReviewSnapshot(t.db, 'importacion', { count: 1 }, { by: 'admin-de-prueba' });
			await recordIntegrityRun(
				t.db,
				[{ code: 'dangling_edge', message: 'inventado', edgeId: 7 }],
				NOW - HOUR
			);
		},
		// transferencia tildada sin datos, la transferencia, la orden, sin imagen, el perfil, las
		// etiquetas, el importador y el chequeo nocturno.
		8
	]
];

describe('«Para revisar»: el botón del menú cuenta las filas de la tarjeta del Inicio', () => {
	it.each(CASES)('%s', async (_name, seed, expected) => {
		await seed();
		const { rows, badge } = await both();
		expect(rows.length).toBe(expected);
		expect(badge).toBe(rows.length);
	});

	it('sin la tabla de la última revisión (base sin la migración 0047): igual, sin esa fila', async () => {
		await saveReviewSnapshot(t.db, 'importacion', { count: 3 }, { by: 'admin-de-prueba' });
		await accountProfile('una-cuenta@example.com');
		await t.db.prepare('ALTER TABLE review_snapshots RENAME TO review_snapshots_aparte').run();
		try {
			const { rows, badge } = await both();
			expect(rows.map((r) => r.id)).not.toContain('import-review');
			expect(rows.length).toBe(1);
			expect(badge).toBe(1);
		} finally {
			await t.db.prepare('ALTER TABLE review_snapshots_aparte RENAME TO review_snapshots').run();
		}
	});

	it('las filas nuevas dicen qué hay y llevan a su página', async () => {
		await tag('Suelta Inventada');
		await saveReviewSnapshot(
			t.db,
			'importacion',
			{ count: 7, detail: { calendario: 5, material: 2 } },
			{ by: 'admin-de-prueba', now: NOW - 2 * HOUR }
		);
		const { rows } = await both();
		expect(rows.find((r) => r.id === 'tags-review')).toMatchObject({
			kind: 'item',
			title: '1 cosa para revisar en Etiquetas',
			text: '1 fuera del árbol',
			action: 'Ver',
			href: '/admin/etiquetas'
		});
		expect(rows.find((r) => r.id === 'import-review')).toMatchObject({
			kind: 'item',
			title: '7 archivos .md para revisar en Contenido → En la base',
			text: '5 eventos · 2 publicaciones de material · revisado mié 30 sep · 10:00',
			action: 'Ver',
			href: '/admin/contenido/base'
		});
	});

	it('no le pide nada a GitHub (los PRs de contenido ya no son filas), tampoco en producción', async () => {
		fake.localRepo = false;
		const realFetch = globalThis.fetch;
		/** @type {string[]} */
		const asked = [];
		globalThis.fetch = /** @type {typeof fetch} */ (
			async (input) => {
				asked.push(String(input instanceof Request ? input.url : input));
				return Response.json({});
			}
		);
		try {
			await accountProfile('una-cuenta@example.com');
			const { rows, badge } = await both();
			expect(asked.filter((u) => u.includes('github.com'))).toEqual([]);
			expect(rows.map((r) => r.id.replace(/\d+$/, ''))).toEqual(['profile-']);
			expect(badge).toBe(1);
		} finally {
			globalThis.fetch = realFetch;
		}
	});
});
