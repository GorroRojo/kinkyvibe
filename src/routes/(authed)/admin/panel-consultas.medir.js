/**
 * Un GET entero de une admin a cada página del panel, con lo que suman `hooks.server.js` (el árbol
 * de etiquetas; sin cookie de cuenta, `loadMember` no consulta) y los layouts (el raíz, el de
 * (authed), el de /admin y, en la ficha de un evento, el de /admin/eventos/<slug>): cuántas idas a
 * D1 hace y en cuántas tandas en fila (cada tanda en fila es una ida y vuelta a la base, que está
 * lejos: ~130 ms desde Buenos Aires). Como en producción, con las tandas automáticas
 * ($lib/server/db/autoBatch.js); como referencia, también con `KV_D1_TANDAS = "off"`.
 *
 * - **frío**: un isolate nuevo (nada recordado de otro pedido);
 * - **caliente**: un pedido antes en el mismo isolate;
 * - **nav**: caliente, pero una navegación del lado del cliente desde otra página del panel
 *   (`__data.json`): solo corren los loads que cambiaron, y los layouts que pida un `parent()`.
 *
 * Una «ida» es una tanda que sale a D1; las que salen a la par cuentan por separado, así que en
 * latencia lo que pesa son las tandas en fila (olas). Es una medición a pedido, no una prueba de
 * la CI (tarda ~2 minutos): `npm run medir:panel` (vitest.medir.config.js; ver
 * src/routes/(content)/pedido-consultas.test.js para las públicas, que sí corren). Los topes de
 * abajo son lo medido, para ver si empeoró. Imprime la tabla (idas/olas); con
 * `KV_CONSULTAS=detalle`, además cada consulta por tanda y, sin tandas,
 * quién la pidió. La semilla pública
 * (src/lib/server/semilla) más eventos, órdenes y perfiles inventados. D1 de miniflare.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { loadSeed } from '$lib/server/semilla/index.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { ADMINS } from '$lib/server/auth.js';
import etiquetas from '$lib/server/semilla/etiquetas.json';
import wiki from '$lib/server/semilla/wiki.json';
import amigues from '$lib/server/semilla/amigues.json';
import calendario from '$lib/server/semilla/calendario.json';
import material from '$lib/server/semilla/material.json';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 300_000 });

const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/** Cada consulta tarda esto de más, para contar bien lo que sale a la par. */
const DELAY_MS = 15;
const DETAIL = process.env.KV_CONSULTAS === 'detalle';
const BY = 'admin-de-prueba';
const EVENT = 'encuentro-futuro-inventado';
const PROFILE = 'autore-inventade';
const MATERIAL = '6-tips-para-tops';
const admin = { id: ADMINS[0].id, login: ADMINS[0].login, name: null, avatar_url: '' };

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;

/** La fecha de hoy en Argentina (AAAA-MM-DD). */
const todayAR = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const ticketed = {
	category: 'calendario',
	summary: 'Un evento de prueba',
	published_date: '2026-09-01Z-03:00',
	status: 'abierto',
	modalidad: 'presencial',
	location_name: 'Espacio Inventado',
	tags: ['BDSM'],
	authors: [PROFILE],
	payment_methods: ['transferencia', 'mercadopago'],
	tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
};

/**
 * Una orden aprobada (Mercado Pago) o esperando la transferencia.
 * @param {string} eventSlug
 * @param {number} n
 * @param {boolean} [transfer]
 */
async function order(eventSlug, n, transfer = false) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: { id: 'general', price: 10000, capacity: 50 },
			quantity: 1,
			method: transfer ? 'transferencia' : 'mercadopago',
			holders: [{ name: `Persona Inventada ${n}`, pronouns: 'elle' }],
			buyer: {
				name: `Persona Inventada ${n}`,
				pronouns: 'elle',
				email: `persona${n}@example.com`,
				dni: `30111${String(n).padStart(3, '0')}`
			}
		})
	);
	if (transfer) return;
	await applyPayment(t.db, {
		id: 1000 + n,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 10000,
		currency_id: 'ARS'
	});
}

beforeAll(async () => {
	t = await createTestDB();
	const seeded = await loadSeed(
		t.db,
		{ etiquetas, wiki, amigues, calendario, material },
		{ actor: BY }
	);
	expect(seeded.errors).toEqual([]);
	await makeProfile(t.db, { title: 'Autore Inventade', slug: PROFILE });
	await seedPosts(t.db, [
		{
			...ticketed,
			postID: EVENT,
			title: 'Encuentro Futuro Inventado',
			start: '2099-03-06T20:00-03:00'
		},
		{
			...ticketed,
			postID: 'otro-futuro-inventado',
			title: 'Otro Futuro',
			start: '2099-04-06T20:00-03:00'
		},
		{
			...ticketed,
			postID: 'hoy-inventado',
			title: 'Hoy Inventado',
			start: `${todayAR()}T23:00-03:00`
		},
		{
			...ticketed,
			postID: 'hoy-inventado-2',
			title: 'Hoy Inventado 2',
			start: `${todayAR()}T23:30-03:00`
		},
		{
			...ticketed,
			postID: 'pasado-inventado',
			title: 'Pasado Inventado',
			start: '2026-09-20T20:00-03:00',
			status: 'agotadas'
		}
	]);
	let n = 0;
	for (const slug of [EVENT, EVENT, EVENT, 'otro-futuro-inventado', 'hoy-inventado']) {
		await order(slug, ++n);
	}
	await order(EVENT, ++n, true);
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/** Lo de arriba de cada página: el layout raíz, el de (authed) y el de /admin. */
const LAYOUTS = [
	() => import('../../+layout.server.js'),
	() => import('../+layout.server.js'),
	() => import('./+layout.server.js')
];
/** La ficha de un evento suma el suyo. */
const EVENT_LAYOUT = () => import('./eventos/[slug]/+layout.server.js');

/**
 * Las páginas: dirección, parámetros, el `+page.server.js` (o `null`: solo los layouts) y si
 * está dentro de la ficha de un evento.
 * @type {{ path: string, params?: Record<string, string>, page: (() => Promise<any>) | null, event?: boolean, layouts?: (() => Promise<any>)[] }[]}
 */
const PAGES = [
	{ path: '(solo layouts)', page: null },
	{ path: '/admin', page: () => import('./+page.server.js') },
	{ path: '/admin/eventos', page: () => import('./eventos/+page.server.js') },
	{ path: '/admin/eventos/nuevo', page: () => import('./eventos/nuevo/+page.server.js') },
	{ path: '/admin/eventos/agenda', page: () => import('./eventos/agenda/+page.server.js') },
	{ path: '/admin/eventos/series', page: () => import('./eventos/series/+page.server.js') },
	{ path: '/admin/eventos/lugares', page: () => import('./eventos/lugares/+page.server.js') },
	{ path: '/admin/eventos/roles', page: () => import('./eventos/roles/+page.server.js') },
	{
		path: `/admin/eventos/${EVENT}`,
		event: true,
		page: () => import('./eventos/[slug]/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/editar`,
		event: true,
		page: () => import('./eventos/[slug]/editar/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/ventas`,
		event: true,
		page: () => import('./eventos/[slug]/ventas/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/ordenes`,
		event: true,
		page: () => import('./eventos/[slug]/ordenes/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/transferencias`,
		event: true,
		page: () => import('./eventos/[slug]/transferencias/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/ingreso`,
		event: true,
		page: () => import('./eventos/[slug]/ingreso/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/codigos`,
		event: true,
		page: () => import('./eventos/[slug]/codigos/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/preguntas`,
		event: true,
		page: () => import('./eventos/[slug]/preguntas/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/lista-espera`,
		event: true,
		page: () => import('./eventos/[slug]/lista-espera/+page.server.js')
	},
	{
		path: `/admin/eventos/${EVENT}/mails`,
		event: true,
		page: () => import('./eventos/[slug]/mails/+page.server.js')
	},
	{ path: '/admin/checkin', page: () => import('./checkin/+page.server.js') },
	{ path: '/admin/contenido/material', page: () => import('./contenido/material/+page.server.js') },
	{
		path: `/admin/contenido/material/${MATERIAL}`,
		params: { slug: MATERIAL },
		page: () => import('./contenido/material/[slug]/+page.server.js')
	},
	{
		path: '/admin/contenido/material/nuevo',
		page: () => import('./contenido/material/nuevo/+page.server.js')
	},
	{
		path: '/admin/contenido/no-listadas',
		page: () => import('./contenido/no-listadas/+page.server.js')
	},
	{
		path: '/admin/contenido/biblioteca',
		page: () => import('./contenido/biblioteca/+page.server.js')
	},
	{
		path: `/edit/material/${MATERIAL}`,
		params: { category: 'material', postID: MATERIAL },
		page: () => import('../edit/[category=category]/[postID]/+page.server.js')
	},
	{ path: '/admin/ventas', page: () => import('./ventas/+page.server.js') },
	{
		path: '/admin/ventas/transferencias',
		page: () => import('./ventas/transferencias/+page.server.js')
	},
	{ path: '/admin/ventas/codigos', page: () => import('./ventas/codigos/+page.server.js') },
	{ path: '/admin/comunidad/perfiles', page: () => import('./comunidad/perfiles/+page.server.js') },
	{
		path: `/admin/comunidad/perfiles/${PROFILE}`,
		params: { slug: PROFILE },
		page: () => import('./comunidad/perfiles/[slug]/+page.server.js')
	},
	{ path: '/admin/comunidad/personas', page: () => import('./comunidad/personas/+page.server.js') },
	{ path: '/admin/comunidad/cuentas', page: () => import('./comunidad/cuentas/+page.server.js') },
	{ path: '/admin/etiquetas', page: () => import('./etiquetas/+page.server.js') },
	{
		path: '/admin/etiquetas/wiki/BDSM',
		params: { term: 'BDSM' },
		page: () => import('./etiquetas/wiki/[term]/+page.server.js')
	},
	{ path: '/admin/ajustes', page: () => import('./ajustes/+page.server.js') },
	{ path: '/admin/ajustes/actividad', page: () => import('./ajustes/actividad/+page.server.js') },
	{ path: '/admin/ajustes/admins', page: () => import('./ajustes/admins/+page.server.js') },
	{
		path: '/admin/ajustes/automatizaciones',
		page: () => import('./ajustes/automatizaciones/+page.server.js')
	},
	{ path: '/admin/ajustes/cobros', page: () => import('./ajustes/cobros/+page.server.js') },
	{ path: '/admin/ajustes/fondo', page: () => import('./ajustes/fondo/+page.server.js') },
	{
		path: '/admin/ajustes/interruptores',
		page: () => import('./ajustes/interruptores/+page.server.js')
	},
	{ path: '/admin/ajustes/propinas', page: () => import('./ajustes/propinas/+page.server.js') },
	{ path: '/admin/ajustes/textos-bot', page: () => import('./ajustes/textos-bot/+page.server.js') },
	{
		path: '/admin/ajustes/vistas-previas',
		page: () => import('./ajustes/vistas-previas/+page.server.js')
	},
	{
		path: '/admin/estadisticas/ventas',
		page: () => import('./estadisticas/ventas/+page.server.js')
	},
	{
		path: '/admin/estadisticas/asistencia',
		page: () => import('./estadisticas/asistencia/+page.server.js')
	},
	{ path: '/admin/estadisticas/bot', page: () => import('./estadisticas/bot/+page.server.js') },
	{
		path: '/admin/estadisticas/visitas',
		page: () => import('./estadisticas/visitas/+page.server.js')
	},
	{
		path: '/admin/mensajes/plantillas',
		page: () => import('./mensajes/plantillas/+page.server.js')
	},
	{
		path: '/admin/mensajes/configuracion',
		page: () => import('./mensajes/configuracion/+page.server.js')
	},
	{
		path: '/admin/mensajes/lo-que-sigo',
		page: () => import('./mensajes/lo-que-sigo/+page.server.js')
	}
];

/** fetch de afuera (fondo.kinkyvibe.ar y lo demás), sin red. */
const fakeFetch = async () =>
	new Response(JSON.stringify({ percent: 20 }), {
		headers: { 'content-type': 'application/json' }
	});

/**
 * Los módulos de un isolate (`vi.resetModules` antes: uno nuevo) y una base que cuenta.
 * @param {(typeof PAGES)[number]} spec
 * @param {boolean} batching
 */
async function isolate(spec, batching) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS, trace: DETAIL });
	const env = { ...t.env, DB: counted.db, ...(batching ? {} : { KV_D1_TANDAS: 'off' }) };
	const loaders = [
		...LAYOUTS,
		...(spec.event ? [EVENT_LAYOUT] : []),
		...(spec.page ? [spec.page] : [])
	];
	return {
		counted,
		platform: { env },
		repo: await import('$lib/server/contenido/repo.js'),
		db: await import('$lib/server/db'),
		tags: await import('$lib/server/etiquetas/source.js'),
		member: await import('$lib/server/cuentas/web.js'),
		author: await import('$lib/server/contenido/author.js'),
		nodes: await Promise.all(loaders.map((l) => l()))
	};
}

/**
 * Qué nodos vuelven a correr en una navegación del lado del cliente desde otra página del panel
 * (`__data.json`): el layout raíz y el de /admin no (no leen `url` ni `params`; el de /admin usa
 * `untrack`), el de (authed) sí (lee `url.pathname`), el de la ficha de un evento sí (lee
 * `params.slug`; desde otra página, cambió) y la página siempre. Ojo: un `await parent()` igual
 * corre los de arriba.
 * @param {number} n
 * @param {(typeof PAGES)[number]} spec
 */
function navNodes(n, spec) {
	const rerun = [false, true, false, ...(spec.event ? [true] : [])];
	return Array.from({ length: n }, (_, i) => rerun[i] ?? true);
}

/**
 * Un GET de une admin, como lo atiende SvelteKit: los hooks en fila, después los loads de los
 * layouts y la página a la par (cada `parent()` espera a los de arriba).
 * @param {Awaited<ReturnType<typeof isolate>>} iso
 * @param {(typeof PAGES)[number]} spec
 * @param {boolean} [nav] una navegación desde otra página del panel (ver {@link navNodes})
 */
async function request(iso, spec, nav = false) {
	const path = spec.page ? spec.path : '/admin';
	const url = new URL(path, 'https://kinkyvibe.ar');
	const params = spec.params ?? (spec.event ? { slug: EVENT } : {});
	const cookies = { get: () => undefined, delete: () => {}, set: () => {}, getAll: () => [] };
	const base = /** @type {any} */ ({
		url,
		params,
		route: { id: path },
		request: new Request(url),
		platform: iso.platform,
		cookies,
		fetch: fakeFetch,
		locals: { user: admin, user_token: 'prueba' },
		setHeaders: () => {},
		untrack: (/** @type {() => any} */ fn) => fn(),
		depends: () => {},
		getClientAddress: () => '203.0.113.9',
		isDataRequest: false,
		isSubRequest: false
	});
	fake.event = base;
	try {
		// hooks.server.js
		iso.repo.setContentDB(iso.db.getDB(iso.platform));
		await iso.tags.applySiteTags(iso.platform);
		await iso.member.loadMember(base);
		return await iso.author.runAsPanelAuthor(
			{ login: admin.login, name: null, superadmin: true },
			async () => {
				// Como `render_data` de SvelteKit: cada nodo una vez; `parent()` corre (en orden, uno
				// detrás del otro) los de arriba que todavía no corrieron, aunque no hayan cambiado.
				/** @type {(() => Promise<any>)[]} */
				const functions = iso.nodes.map((node, i) => {
					/** @type {Promise<any> | undefined} */
					let running;
					const parent = async () => {
						const data = {};
						for (let j = 0; j < i; j++) Object.assign(data, await functions[j]());
						return data;
					};
					return () => (running ??= Promise.resolve().then(() => node.load({ ...base, parent })));
				});
				const rerun = nav ? navNodes(iso.nodes.length, spec) : iso.nodes.map(() => true);
				return await Promise.all(functions.map((fn, i) => (rerun[i] ? fn() : null)));
			}
		);
	} finally {
		fake.event = null;
	}
}

/**
 * @typedef {{ trips: number, waves: number, statements: number }} Count
 * @typedef {{ coldOn: Count, warmOn: Count, navOn: Count, coldOff: Count, warmOff: Count, navOff: Count }} Row
 */

/** @type {Record<string, Row>} */
const table = {};

/**
 * Las consultas por tanda: sin tandas, con quién la pidió; con tandas, cada sentencia de cada ida
 * (quién la pidió no se ve: la manda $lib/server/db/autoBatch.js).
 * @param {ReturnType<typeof countingDB>} counted
 * @param {boolean} batching
 */
function byWave(counted, batching) {
	if (!batching) return counted.describe();
	return counted.log
		.slice()
		.sort((a, b) => a.wave - b.wave)
		.map((q) => {
			const list = q.sql.split(';\n').map((s) => s.replace(/\s+/g, ' ').trim().slice(0, 100));
			return `  ${q.wave}. (${list.length})\n${list.map((s) => `       · ${s}`).join('\n')}`;
		})
		.join('\n');
}

/**
 * Las cuentas de una página en frío y en caliente, con tandas y sin.
 * @param {(typeof PAGES)[number]} spec
 */
async function measure(spec) {
	/** @type {Partial<Row>} */
	const row = {};
	for (const batching of [true, false]) {
		const iso = await isolate(spec, batching);
		for (const when of ['cold', 'warm', 'nav']) {
			iso.counted.reset();
			await request(iso, spec, when === 'nav');
			const key = /** @type {'coldOn'} */ (`${when}${batching ? 'On' : 'Off'}`);
			row[key] = {
				trips: iso.counted.queries,
				waves: iso.counted.waves,
				statements: iso.counted.statements
			};
			if (DETAIL) {
				const label = `${batching ? 'con' : 'sin'} tandas, ${{ cold: 'frío', warm: 'caliente', nav: 'navegación' }[when]}`;
				console.info(`[${spec.path}, ${label}]\n${byWave(iso.counted, batching)}`);
			}
		}
	}
	table[spec.path] = /** @type {Row} */ (row);
	return /** @type {Row} */ (row);
}

/**
 * Lo medido: las tandas en fila (olas) con las tandas automáticas, en caliente y en una navegación
 * desde otra página del panel, para que no empeore sin darse cuenta. Si una página baja, bajá su
 * número acá. Las olas son estables; las idas no (dos tandas a la par pueden salir juntas o
 * separadas según qué vuelve antes) y en frío varía en una ola, así que eso va solo como
 * comentario.
 * @type {Record<string, { caliente: number, nav: number }>}
 */
const BOUNDS = {
	[`/admin/eventos/${EVENT}/editar`]: { caliente: 10, nav: 13 }, // frío 13
	[`/admin/eventos/${EVENT}`]: { caliente: 8, nav: 8 }, // frío 11
	'/admin/eventos/nuevo': { caliente: 8, nav: 9 }, // frío 13
	[`/admin/contenido/material/${MATERIAL}`]: { caliente: 6, nav: 9 }, // frío 11
	[`/admin/eventos/${EVENT}/ventas`]: { caliente: 6, nav: 6 }, // frío 10
	[`/admin/eventos/${EVENT}/ordenes`]: { caliente: 6, nav: 6 }, // frío 9
	[`/admin/eventos/${EVENT}/transferencias`]: { caliente: 6, nav: 6 }, // frío 10
	[`/admin/eventos/${EVENT}/preguntas`]: { caliente: 6, nav: 6 }, // frío 9
	[`/admin/eventos/${EVENT}/codigos`]: { caliente: 6, nav: 6 }, // frío 9
	[`/admin/eventos/${EVENT}/lista-espera`]: { caliente: 6, nav: 6 }, // frío 9
	[`/admin/eventos/${EVENT}/mails`]: { caliente: 6, nav: 6 }, // frío 9
	[`/admin/comunidad/perfiles/${PROFILE}`]: { caliente: 6, nav: 6 }, // frío 9
	[`/admin/eventos/${EVENT}/ingreso`]: { caliente: 5, nav: 5 }, // frío 9
	'/admin/contenido/material/nuevo': { caliente: 6, nav: 6 }, // frío 11
	[`/edit/material/${MATERIAL}`]: { caliente: 6, nav: 7 }, // frío 11
	'/admin/eventos/series': { caliente: 5, nav: 5 }, // frío 9
	'/admin': { caliente: 4, nav: 4 }, // frío 9
	'/admin/ventas': { caliente: 4, nav: 5 }, // frío 9
	'/admin/etiquetas': { caliente: 5, nav: 5 }, // frío 10
	'/admin/ajustes/fondo': { caliente: 4, nav: 1 }, // frío 9
	'(solo layouts)': { caliente: 4, nav: 0 }, // frío 9
	'/admin/eventos': { caliente: 4, nav: 3 }, // frío 9
	'/admin/eventos/agenda': { caliente: 4, nav: 3 }, // frío 9
	'/admin/eventos/lugares': { caliente: 4, nav: 1 }, // frío 9
	'/admin/eventos/roles': { caliente: 4, nav: 1 }, // frío 9
	'/admin/checkin': { caliente: 4, nav: 3 }, // frío 9
	'/admin/contenido/material': { caliente: 4, nav: 4 }, // frío 9
	'/admin/contenido/no-listadas': { caliente: 4, nav: 1 }, // frío 9
	'/admin/contenido/biblioteca': { caliente: 4, nav: 1 }, // frío 9
	'/admin/ventas/transferencias': { caliente: 4, nav: 3 }, // frío 9
	'/admin/ventas/codigos': { caliente: 4, nav: 3 }, // frío 9
	'/admin/comunidad/perfiles': { caliente: 4, nav: 3 }, // frío 9
	'/admin/comunidad/personas': { caliente: 4, nav: 3 }, // frío 9
	'/admin/comunidad/cuentas': { caliente: 4, nav: 2 }, // frío 9
	'/admin/ajustes': { caliente: 4, nav: 2 }, // frío 9
	'/admin/ajustes/actividad': { caliente: 4, nav: 1 }, // frío 9
	'/admin/ajustes/admins': { caliente: 4, nav: 2 }, // frío 9
	'/admin/ajustes/automatizaciones': { caliente: 4, nav: 3 }, // frío 9
	'/admin/ajustes/cobros': { caliente: 4, nav: 1 }, // frío 9
	'/admin/ajustes/interruptores': { caliente: 4, nav: 1 }, // frío 9
	'/admin/ajustes/propinas': { caliente: 4, nav: 1 }, // frío 9
	'/admin/ajustes/textos-bot': { caliente: 4, nav: 1 }, // frío 9
	'/admin/ajustes/vistas-previas': { caliente: 4, nav: 1 }, // frío 9
	'/admin/estadisticas/ventas': { caliente: 4, nav: 2 }, // frío 9
	'/admin/estadisticas/asistencia': { caliente: 4, nav: 2 }, // frío 9
	'/admin/estadisticas/bot': { caliente: 4, nav: 1 }, // frío 9
	'/admin/estadisticas/visitas': { caliente: 4, nav: 1 }, // frío 9
	'/admin/mensajes/plantillas': { caliente: 4, nav: 1 }, // frío 9
	'/admin/mensajes/configuracion': { caliente: 4, nav: 1 }, // frío 9
	'/admin/mensajes/lo-que-sigo': { caliente: 4, nav: 2 }, // frío 9
	'/admin/etiquetas/wiki/BDSM': { caliente: 3, nav: 1 } // frío 8
};

describe('un GET de une admin a cada página del panel: idas a D1', () => {
	for (const spec of PAGES) {
		it(spec.path, async () => {
			const r = await measure(spec);
			expect(r.warmOn.waves).toBeLessThanOrEqual(r.coldOn.waves);
			const bound = BOUNDS[spec.path];
			expect(bound).toBeDefined();
			expect({ caliente: r.warmOn.waves, nav: r.navOn.waves }).toEqual({
				caliente: Math.min(r.warmOn.waves, bound.caliente),
				nav: Math.min(r.navOn.waves, bound.nav)
			});
		});
	}

	afterAll(() => {
		const lines = Object.entries(table)
			.sort(([, a], [, b]) => b.warmOn.trips - a.warmOn.trips || b.coldOn.trips - a.coldOn.trips)
			.map(
				([path, r]) =>
					`${path.padEnd(48)} on frío ${r.coldOn.trips}/${r.coldOn.waves} caliente ${r.warmOn.trips}/${r.warmOn.waves} nav ${r.navOn.trips}/${r.navOn.waves} · sentencias ${r.coldOn.statements}/${r.warmOn.statements} · off olas ${r.coldOff.waves}/${r.warmOff.waves}/${r.navOff.waves} (consultas ${r.coldOff.trips}/${r.warmOff.trips})`
			);
		console.info(`idas/olas (frío, caliente)\n${lines.join('\n')}`);
	});
});
