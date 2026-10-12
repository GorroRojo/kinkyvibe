/**
 * Estadísticas de uso del bot con la base (D1 de miniflare; datos inventados), por las rutas de
 * verdad (`/api/telegram` y `/telegram/app/uso`) y el panel (usoPanel.js):
 *
 * - (c) Nada oculto, «solo con cuenta», sin aprobar, no listado ni borrado se cuenta nunca: ni
 *   eligiéndolo en el modo inline, ni abriéndolo con un botón armado a mano, ni con `/evento`.
 * - (d) El umbral de 5 veces lo aplica la consulta del servidor: lo de menos ni sale de la base.
 *   Y una semana con menos de 5 personas no muestra detalle.
 * - (f) Con el interruptor apagado no se escribe nada (tampoco desde la Mini App).
 * - Las filas por persona se borran a los 180 días; los totales quedan.
 */
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { setEventVenue } from '$lib/server/amigues/venues.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** Sin token: el webhook contesta en el mismo pedido y nunca llama a Telegram. */
const ENV = vi.hoisted(() => ({
	TELEGRAM_WEBHOOK_SECRET: 'un-secreto-de-prueba-largo',
	/** @type {string | undefined} */
	TELEGRAM_BOT_TOKEN: undefined
}));
vi.mock('$env/dynamic/private', () => ({ env: ENV }));

const ORIGIN = 'https://kinkyvibe.ar';
const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const TOKEN = '123456789:token-inventado-solo-para-pruebas';
const USER = { id: 4242, first_name: 'Persona Inventada', username: 'inventade' };

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
	ENV.TELEGRAM_BOT_TOKEN = undefined;
});
afterEach(() => {
	vi.resetModules();
});

/**
 * @param {'evento' | 'material'} type
 * @param {string} slug
 * @param {string} title
 * @param {Record<string, unknown>} data
 * @param {'public' | 'hidden' | 'members'} [visibility]
 */
async function dbObject(type, slug, title, data, visibility = 'public') {
	return saveObject(
		t.db,
		{ type, slug, title, visibility, data },
		{ actor: 'admin-inventade', now: NOW }
	);
}

/** Lo que nunca se puede contar (las direcciones). */
const HIDDEN_SLUGS = [
	'evento-oculto',
	'evento-no-listado',
	'evento-borrado',
	'material-oculto',
	'material-cuentas',
	'material-borrado',
	'p-oculta',
	'p-cuentas',
	'p-sin-aprobar',
	'p-no-listada',
	'casa-escondida'
];
const HIDDEN_TITLES = [
	'Evento Oculto Escondido',
	'Evento No Listado Escondido',
	'Evento Borrado Escondido',
	'Material Oculto Escondido',
	'Material Cuentas Escondido',
	'Material Borrado Escondido',
	'Persona Oculta Escondida',
	'Persona Cuentas Escondida',
	'Persona Sin Aprobar Escondida',
	'Persona No Listada Escondida',
	'Casa Escondida Inventada'
];

async function seed() {
	await dbObject('evento', 'evento-visible', 'Evento Visible Inventado', {
		start: '2031-02-10T20:00:00-03:00'
	});
	await dbObject(
		'evento',
		'evento-oculto',
		'Evento Oculto Escondido',
		{ start: '2031-02-11T20:00:00-03:00' },
		'hidden'
	);
	await dbObject('evento', 'evento-no-listado', 'Evento No Listado Escondido', {
		start: '2031-02-12T20:00:00-03:00',
		unlisted: true
	});
	const borrado = await dbObject('evento', 'evento-borrado', 'Evento Borrado Escondido', {
		start: '2031-02-13T20:00:00-03:00'
	});
	await saveObject(
		t.db,
		{ id: borrado.id, type: borrado.type, version: borrado.version, deleted: true },
		{ actor: 'admin-inventade', now: NOW }
	);
	await dbObject('material', 'material-visible', 'Material Visible Inventado', {
		published_date: '2030-05-01'
	});
	await dbObject(
		'material',
		'material-oculto',
		'Material Oculto Escondido',
		{ published_date: '2030-05-02' },
		'hidden'
	);
	await dbObject(
		'material',
		'material-cuentas',
		'Material Cuentas Escondido',
		{ published_date: '2030-05-03' },
		'members'
	);
	const mBorrado = await dbObject('material', 'material-borrado', 'Material Borrado Escondido', {
		published_date: '2030-05-04'
	});
	await saveObject(
		t.db,
		{ id: mBorrado.id, type: mBorrado.type, version: mBorrado.version, deleted: true },
		{ actor: 'admin-inventade', now: NOW }
	);
	await makeProfile(t.db, { title: 'Persona Visible Inventada', slug: 'persona-visible' });
	await makeProfile(t.db, {
		title: 'Persona Oculta Escondida',
		slug: 'p-oculta',
		visibility: 'hidden'
	});
	await makeProfile(t.db, {
		title: 'Persona Cuentas Escondida',
		slug: 'p-cuentas',
		visibility: 'members'
	});
	await makeProfile(t.db, {
		title: 'Persona Sin Aprobar Escondida',
		slug: 'p-sin-aprobar',
		approved: false
	});
	await makeProfile(t.db, {
		title: 'Persona No Listada Escondida',
		slug: 'p-no-listada',
		data: { unlisted: true }
	});
	// Un lugar no listado al que lleva el evento visible: el índice lo tiene, pero no se cuenta.
	const venue = await makeProfile(t.db, {
		title: 'Casa Escondida Inventada',
		slug: 'casa-escondida',
		kind: 'lugar',
		data: { address: 'Calle Inventada 1', area: 'Barrio Inventado', unlisted: true }
	});
	await setEventVenue(t.db, {
		eventSlug: 'evento-visible',
		venueId: venue.id,
		privacy: 'public',
		by: 'admin-inventade',
		now: NOW
	});
}

/** @param {boolean} on */
async function flags(on) {
	const { setFlag, clearFlagCache } = await import('$lib/server/flags.js');
	await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
	await setFlag(t.db, 'telegram_estadisticas', on, { by: 'prueba' });
	clearFlagCache();
}

/** La ruta del webhook recién cargada (sin cachés de otra prueba). */
async function webhookRoute() {
	vi.resetModules();
	(await import('$lib/server/contenido/posts.js')).clearContentCache();
	const { clearInlineSource } = await import('./inlineSource.js');
	const { resetInlineRate } = await import('./inline.js');
	clearInlineSource();
	resetInlineRate();
	const { POST } = await import('../../../routes/api/telegram/+server.js');
	const { shortHash } = await import('./nav.js');
	/** @param {object} update */
	const post = async (update) => {
		const request = new Request(`${ORIGIN}/api/telegram`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-telegram-bot-api-secret-token': ENV.TELEGRAM_WEBHOOK_SECRET
			},
			body: JSON.stringify(update)
		});
		const res = await POST(
			/** @type {any} */ ({ request, url: new URL(request.url), platform: t.platform, fetch })
		);
		expect(res.status).toBe(200);
		return res.text();
	};
	return { post, shortHash };
}

const priv = { id: USER.id, type: 'private' };

/** @returns {Promise<{ tipo: string, clave: string, n: number }[]>} */
async function totals() {
	const { results } = await t.db
		.prepare('SELECT tipo, clave, n FROM telegram_uso_totales ORDER BY tipo, clave')
		.all();
	return /** @type {any} */ (results);
}

/** @returns {Promise<Record<string, unknown>[]>} */
async function people() {
	const { results } = await t.db.prepare('SELECT * FROM telegram_uso_personas').all();
	return results;
}

describe('(c) solo se cuenta lo público', () => {
	it('ni eligiéndolo en el modo inline, ni con un botón armado a mano, ni con /evento', async () => {
		await seed();
		await flags(true);
		const { post, shortHash } = await webhookRoute();
		const queries = [
			'',
			'escondido',
			'escondida',
			'inventado',
			'inventada',
			'evento:',
			'material:',
			'amigues:',
			'casa escondida',
			...HIDDEN_TITLES
		];
		for (const query of queries) {
			await post({ inline_query: { id: 'iq', from: USER, query, offset: '' } });
			// Elegir cada resultado posible (y algunos que no existen).
			for (let i = 0; i < 12; i++) {
				await post({ chosen_inline_result: { result_id: String(i), from: USER, query } });
			}
		}
		for (const slug of HIDDEN_SLUGS) {
			for (const kind of ['calendario', 'material', 'amigues']) {
				const hash = shortHash(`/${kind}/${slug}`);
				for (const data of [`r:${hash}:0:escondido`, `r:${hash}:0:${slug}`, `cd:a:${hash}:0`]) {
					await post({
						callback_query: {
							id: 'cb',
							from: USER,
							data,
							message: { message_id: 3, chat: priv }
						}
					});
				}
			}
			await post({ message: { chat: priv, from: USER, text: `/evento ${slug}` } });
		}
		for (const title of HIDDEN_TITLES) {
			await post({ message: { chat: priv, from: USER, text: `/evento ${title}` } });
		}
		// Lo visible, para ver que sí se cuenta.
		await post({ message: { chat: priv, from: USER, text: '/evento Evento Visible' } });
		await post({
			callback_query: {
				id: 'cb',
				from: USER,
				data: `r:${shortHash('/material/material-visible')}:0:material visible`,
				message: { message_id: 3, chat: priv }
			}
		});

		const rows = await totals();
		const objects = rows.filter((r) => r.tipo === 'objeto' || r.tipo === 'inline_elegido');
		const keys = objects.map((r) => r.clave);
		for (const slug of HIDDEN_SLUGS) {
			expect(
				keys.filter((k) => k.endsWith(`:${slug}`)),
				slug
			).toEqual([]);
		}
		expect(keys).toEqual(
			expect.arrayContaining([
				'evento:evento-visible',
				'material:material-visible',
				'amigues:persona-visible'
			])
		);
		// Las cosas son siempre «tipo:dirección», nunca un título.
		for (const k of keys) expect(k).toMatch(/^(evento|material|wiki|serie|amigues):[^\s/]+$/u);
	});
});

describe('(f) con el interruptor apagado no se escribe nada', () => {
	it('el webhook no cuenta nada; prendido, sí', async () => {
		await seed();
		await flags(false);
		const updates = [
			{ message: { chat: priv, from: USER, text: '/buscar inventado' } },
			{ message: { chat: priv, from: USER, text: '/start' } },
			{
				callback_query: { id: 'cb', from: USER, data: 'h', message: { message_id: 3, chat: priv } }
			},
			{ inline_query: { id: 'iq', from: USER, query: 'inventado', offset: '' } },
			{ chosen_inline_result: { result_id: '0', from: USER, query: 'inventado' } }
		];
		let route = await webhookRoute();
		/** @type {string[]} */
		const off = [];
		for (const u of updates) off.push(await route.post(u));
		expect(await totals()).toEqual([]);
		expect(await people()).toEqual([]);

		await flags(true);
		route = await webhookRoute();
		/** @type {string[]} */
		const on = [];
		for (const u of updates) on.push(await route.post(u));
		// Lo mismo para la persona, prendido o apagado.
		expect(on).toEqual(off);
		const p = await people();
		expect(p).toHaveLength(1);
		expect(p[0]).toMatchObject({
			telegram_id: '4242',
			interacciones: updates.length,
			nombre: 'Persona Inventada',
			usuario: 'inventade'
		});
		expect((await totals()).length).toBeGreaterThan(0);
	});

	it('la Mini App: apagado nada; prendido, solo con un initData válido', async () => {
		ENV.TELEGRAM_BOT_TOKEN = TOKEN;
		const now = Date.now();
		/** @param {string} token */
		const signed = (token) => {
			const fields = {
				auth_date: String(Math.floor(now / 1000) - 60),
				user: JSON.stringify(USER)
			};
			const dcs = Object.keys(fields)
				.sort()
				.map((k) => `${k}=${fields[/** @type {keyof typeof fields} */ (k)]}`)
				.join('\n');
			const secret = createHmac('sha256', 'WebAppData').update(token).digest();
			const hash = createHmac('sha256', secret).update(dcs).digest('hex');
			return new URLSearchParams({ ...fields, hash }).toString();
		};
		const open = async (/** @type {string} */ initData) => {
			vi.resetModules();
			const { POST } = await import('../../../routes/telegram/app/uso/+server.js');
			const request = new Request(`${ORIGIN}/telegram/app/uso`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ initData })
			});
			const res = await POST(/** @type {any} */ ({ request, platform: t.platform }));
			expect(res.status).toBe(204);
		};
		await flags(false);
		await open(signed(TOKEN));
		expect(await people()).toEqual([]);
		expect(await totals()).toEqual([]);

		await flags(true);
		await open(signed('999:otro-token-inventado'));
		await open('cualquier cosa');
		expect(await people()).toEqual([]);
		await open(signed(TOKEN));
		expect(await people()).toMatchObject([{ telegram_id: '4242', interacciones: 1 }]);
		expect(await totals()).toEqual([{ tipo: 'miniapp', clave: 'calendario', n: 1 }]);
	});
});

describe('(d) el panel: el umbral lo aplica la consulta', () => {
	const WEEK_NOW = Date.parse('2031-02-12T15:00:00-03:00');
	const WEEK = '2031-W07';

	/** @param {number} n cuántas personas usaron el bot esa semana */
	async function fill(n) {
		const statements = [];
		for (let i = 1; i <= n; i++) {
			statements.push(
				t.db
					.prepare(
						`INSERT INTO telegram_uso_personas (telegram_id, dia, interacciones, nombre, usuario)
						VALUES (?1, ?2, ?3, ?4, '')`
					)
					.bind(String(1000 + i), '2031-02-11', i, `Persona ${i}`)
			);
		}
		for (const [tipo, clave, k] of [
			['busqueda', 'cuerdas', 6],
			['busqueda', 'rara de pocas', 4],
			['busqueda', 'otra rara', 1],
			['inline', 'fiesta', 5],
			['objeto', 'material:material-visible', 5],
			['objeto', 'material:otra-cosa', 2],
			['pantalla', 'home', 1],
			['comando', 'buscar', 2]
		]) {
			statements.push(
				t.db
					.prepare(
						'INSERT INTO telegram_uso_totales (semana, tipo, clave, n) VALUES (?1, ?2, ?3, ?4)'
					)
					.bind(WEEK, tipo, clave, k)
			);
		}
		await t.db.batch(statements);
	}

	/** La base, anotando cada consulta y sus parámetros. */
	function spyDB() {
		/** @type {{ sql: string, args: unknown[] }[]} */
		const seen = [];
		const db = {
			prepare(/** @type {string} */ sql) {
				const stmt = t.db.prepare(sql);
				return {
					bind: (/** @type {unknown[]} */ ...args) => {
						seen.push({ sql, args });
						return stmt.bind(...args);
					}
				};
			},
			batch: (/** @type {any[]} */ s) => t.db.batch(s)
		};
		return { db: /** @type {any} */ (db), seen };
	}

	it('lo de menos de 5 veces no sale de la base, solo su suma', async () => {
		await fill(5);
		const { loadBotUsage } = await import('./usoPanel.js');
		const { db, seen } = spyDB();
		const usage = await loadBotUsage(db, {
			days: 30,
			week: WEEK,
			now: WEEK_NOW,
			titles: async () =>
				new Map([['material:material-visible', { title: 'Material', href: '/m' }]])
		});
		if (!usage.available || usage.detail.hidden) throw new Error('sin detalle');
		expect(usage.detail.lists.busqueda).toEqual({
			items: [{ clave: 'cuerdas', n: 6 }],
			otherN: 5,
			otherKeys: 2
		});
		expect(usage.detail.lists.inline.items).toEqual([{ clave: 'fiesta', n: 5 }]);
		expect(usage.detail.lists.objeto).toEqual({
			items: [{ clave: 'material:material-visible', n: 5, title: 'Material', href: '/m' }],
			otherN: 2,
			otherKeys: 1
		});
		// Pantallas y comandos van todos (no son lo buscado ni una cosa).
		expect(usage.detail.plain.pantalla).toEqual([{ clave: 'home', n: 1, title: 'Inicio' }]);
		expect(usage.detail.plain.comando).toEqual([{ clave: 'buscar', n: 2, title: '/buscar' }]);
		const json = JSON.stringify(usage);
		expect(json).not.toContain('rara');
		expect(json).not.toContain('otra-cosa');
		// El umbral está en la consulta (no se filtra después).
		const detail = seen.find((q) => /SELECT tipo, clave, n/.test(q.sql) && /n >= \?2/.test(q.sql));
		expect(detail?.args.slice(0, 2)).toEqual([WEEK, 5]);
		// Y la consulta, sola, no trae nada de menos de 5.
		const raw = await t.db
			.prepare(/** @type {string} */ (detail?.sql))
			.bind(...(detail?.args ?? []))
			.all();
		expect(raw.results.every((r) => Number(r.n) >= 5)).toBe(true);
		// Las personas, sin el id de Telegram.
		expect(usage.people).toHaveLength(5);
		expect(json).not.toContain('1001');
	});

	it('una semana con menos de 5 personas no muestra detalle (ni lo lee)', async () => {
		await fill(4);
		const { loadBotUsage } = await import('./usoPanel.js');
		const { db, seen } = spyDB();
		const usage = await loadBotUsage(db, { days: 30, week: WEEK, now: WEEK_NOW });
		if (!usage.available) throw new Error('sin tablas');
		expect(usage.detail).toEqual({ hidden: true, people: 4 });
		expect(seen.some((q) => /SELECT tipo, clave, n/.test(q.sql))).toBe(false);
		// Los totales por tipo, siempre.
		const week = usage.weeks.find((w) => w.week === WEEK);
		expect(week?.totals).toMatchObject({ busqueda: 11, objeto: 7, pantalla: 1 });
		expect(week?.people).toBe(4);
	});

	it('una cuenta vinculada se muestra con su cuenta; si no, el nombre de Telegram', async () => {
		await fill(1);
		const now = WEEK_NOW;
		await t.db.batch([
			t.db
				.prepare(
					`INSERT INTO accounts (id, email, email_verified_at, created_at, updated_at)
					VALUES (?1, ?2, ?3, ?3, ?3)`
				)
				.bind('a'.repeat(8) + '-0000-4000-8000-' + '0'.repeat(12), 'cuenta@example.com', now),
			t.db
				.prepare(
					`INSERT INTO telegram_chats (account_id, chat_id, linked_at, updated_at)
					VALUES (?1, '1001', ?2, ?2)`
				)
				.bind('a'.repeat(8) + '-0000-4000-8000-' + '0'.repeat(12), now)
		]);
		const { loadBotUsage } = await import('./usoPanel.js');
		const usage = await loadBotUsage(t.db, { days: 30, now });
		if (!usage.available) throw new Error('sin tablas');
		expect(usage.people[0]).toMatchObject({
			name: 'Persona 1',
			account: { label: 'cuenta@example.com' },
			total: 1,
			lastDay: '2031-02-11'
		});
	});
});

describe('retención', () => {
	it('las filas por persona duran 180 días; los totales quedan', async () => {
		const { pruneUso, arDay } = await import('./uso.js');
		const now = Date.parse('2031-06-30T12:00:00-03:00');
		const day = (/** @type {number} */ d) => arDay(now - d * 86_400_000);
		await t.db.batch([
			...[179, 180, 181, 400].map((d) =>
				t.db
					.prepare(
						`INSERT INTO telegram_uso_personas (telegram_id, dia, interacciones) VALUES ('7', ?1, 1)`
					)
					.bind(day(d))
			),
			t.db.prepare(
				`INSERT INTO telegram_uso_totales (semana, tipo, clave, n) VALUES ('2030-W01', 'pantalla', 'home', 3)`
			)
		]);
		expect(await pruneUso(t.db, now)).toBe(2);
		const left = (await people()).map((r) => r.dia).sort();
		expect(left).toEqual([day(180), day(179)]);
		expect(await totals()).toEqual([{ tipo: 'pantalla', clave: 'home', n: 3 }]);
	});
});
