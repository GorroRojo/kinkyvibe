/**
 * Datos de prueba del modo demo (ver docs/demo.md), para la base de un deploy de preview
 * (`kinkyvibe-preview`). Nunca para la base `kinkyvibe` (producción).
 *
 * Todo se genera relativo a un instante `now` (y a "hoy" en Argentina): un evento hoy a la
 * noche con la puerta andando, eventos que vienen, eventos pasados con historia para las
 * estadísticas, transferencias que vencen en unas horas, etc. Es determinístico salvo por ese
 * corrimiento: mismas personas, montos y órdenes en cada carga (los ids y tokens de las entradas
 * los genera la base al azar).
 *
 * Lo usan:
 * - `reloadDemoData` (POST /api/preview-seed, botón «Recargar datos de prueba» del aviso del modo
 *   demo): borra los datos de prueba anteriores y vuelve a cargar todo con `now = Date.now()`.
 *   Solo se importa dentro de `if (PREVIEW_BUILD)`: no existe en el bundle de producción.
 * - `scripts/demo/seed.js` (CLI): el mismo SQL a un archivo, y los .md de los eventos.
 *
 * Qué es "de prueba" (y lo único que se borra al recargar): los eventos con slug `demo-*` y todo
 * lo que cuelga de ellos (órdenes, entradas, envíos, avisos, archivos de la capa demo), más las
 * filas marcadas como del seed (`SEED_BY`, `SEED_DETAIL`) y la "última visita" del admin de
 * prueba.
 *
 * Sin imports de Node ni de `$lib`: corre en el Worker y en Node (los perfiles de prueba van con
 * saveObject(), en ./seedProfiles.js, que solo usa imports relativos).
 *
 * Noche 3 (rama de demo `claude/n3-demo`): además prende los interruptores nuevos
 * (`N3_FLAGS`), y carga preventas escalonadas, gorra, propinas, personas
 * con rol y preguntas de inscripción, lugares con su privacidad, un pedido «Es mi perfil» y
 * suscripciones a series. Cada cosa en su sección, salteada si la base no tiene su migración.
 *
 * Para agregar una tabla: sumar una sección a SECTIONS (reset = cómo borrar SOLO lo del seed,
 * rows = los INSERT; `optional` = la tabla viene de una migración que puede no estar).
 */
import { DEMO_FILES_SQL } from './overlay.js';
import { DEMO_ACCOUNTS, DEMO_VENUES, ensureDemoProfiles } from './seedProfiles.js';

/** Quién "hizo" lo que inserta el seed: sirve para borrarlo en la próxima corrida. */
export const SEED_BY = 'seed-demo';
/** `detail` de las filas del registro de actividad que inventa el seed. */
export const SEED_DETAIL = '{"datos_de_prueba":true}';
/** Marca en el frontmatter de los eventos que genera el seed. */
export const EVENT_MARKER =
	'# generado por scripts/demo/seed.js (datos de prueba, no es un evento real)';
/** Carpeta de los eventos (paths de la capa demo, relativos a la raíz del repo). */
export const EVENTS_PATH = 'src/lib/posts/calendario';
/**
 * Noche 3: los interruptores que la demo prende en cada recarga (src/lib/server/flags.js). En la
 * base del preview, nunca en producción; los valores por defecto del código no cambian.
 */
export const N3_FLAGS = Object.freeze([
	'cuentas',
	'propinas',
	'perfiles_publicos',
	'personas_eventos',
	'series',
	'borrar_desde_panel',
	// Noche 4: etiquetas desde la base (#164/#173). El demo importa las etiquetas desde el panel
	// (Etiquetas → Importar); sin importar, el sitio sigue leyendo el archivo.
	'etiquetas_db',
	// Contenido a la base (#166/#167/#169). El demo importa desde Contenido → En la base; lo que
	// no está en la base sigue saliendo de su .md.
	'contenido_db'
]);
/** Rol agregado "desde el panel" (#139), además de los fijos. */
export const N3_CUSTOM_ROLE = 'Cuida la puerta';
/** Mails de las suscripciones de prueba a series (#141); el hash se calcula al cargar. */
export const N3_SERIES_SUBSCRIBERS = Object.freeze([
	{ tag: 'Picantearla', email: 'demo.aviso.uno@example.invalid', daysAgo: 30 },
	{ tag: 'Picantearla', email: 'demo.aviso.dos@example.invalid', daysAgo: 12 },
	{ tag: 'Cine para Sucixs', email: 'demo.aviso.tres@example.invalid', daysAgo: 5 }
]);
/** Id y login del admin de prueba (src/lib/server/demo/identity.js). */
const DEMO_ADMIN_ID = -1;
const DEMO_ADMIN_LOGIN = 'demo';

/* ------------------------------------------------------------------------------------------ */
/*  Utilidades                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** PRNG determinístico (mulberry32): mismas personas y montos en cada corrida. */
function rng(/** @type {number} */ seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Una expresión SQL que va tal cual (p. ej. un valor al azar generado por la base). */
const raw = (/** @type {string} */ expr) => ({ raw: expr });

/** @param {unknown} v */
export function sql(v) {
	if (v === null || v === undefined) return 'NULL';
	if (typeof v === 'object' && 'raw' in v) return String(/** @type {{raw: string}} */ (v).raw);
	if (typeof v === 'number') {
		if (!Number.isFinite(v)) throw new Error('número inválido');
		return String(v);
	}
	return `'${String(v).replaceAll("'", "''")}'`;
}

/**
 * @param {string} table
 * @param {Record<string, unknown>} row
 */
function insert(table, row) {
	const cols = Object.keys(row);
	return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => sql(row[c])).join(', ')});`;
}

/**
 * INSERT de varias filas por sentencia (el SQL queda mucho más corto), cada una de a lo sumo
 * ~16 KB, en una sola línea.
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
function insertMany(table, rows) {
	if (!rows.length) return [];
	const cols = Object.keys(rows[0]);
	const head = `INSERT INTO ${table} (${cols.join(', ')}) VALUES `;
	const out = [];
	/** @type {string[]} */
	let values = [];
	let size = 0;
	for (const row of rows) {
		const v = `(${cols.map((c) => sql(row[c])).join(', ')})`;
		if (values.length && size + v.length > 16000) {
			out.push(head + values.join(', ') + ';');
			values = [];
			size = 0;
		}
		values.push(v);
		size += v.length + 2;
	}
	out.push(head + values.join(', ') + ';');
	return out;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Argentina: UTC−3 todo el año. */
const AR = -3 * HOUR;

/** "YYYY-MM-DD" de hoy en Argentina. */
export function todayInArgentina(/** @type {number} */ now) {
	return new Date(now + AR).toISOString().slice(0, 10);
}

/**
 * @param {string} today YYYY-MM-DD
 * @param {number} offset días
 * @param {string} time HH:MM (Argentina)
 */
function arInstant(today, offset, time) {
	const [y, m, d] = today.split('-').map(Number);
	const [hh, mm] = time.split(':').map(Number);
	return Date.UTC(y, m - 1, d + offset, hh, mm) - AR;
}

/** Instante → "2026-09-30T22:00-03:00". */
function arIso(/** @type {number} */ ms) {
	return new Date(ms + AR).toISOString().slice(0, 16) + '-03:00';
}

/* ------------------------------------------------------------------------------------------ */
/*  Precio (mismas reglas que computePrice y los CHECK de migrations/0002_tickets.sql)         */
/* ------------------------------------------------------------------------------------------ */

const CONTRIBUTION = { solidaria: 10, 'muy-solidaria': 30, sugar: 50 };

/**
 * @param {{unit: number, quantity: number, option: string, percent: number|null,
 *   discount?: {code: string, kind: 'percent'|'fixed', value: number} | null,
 *   method: 'mercadopago'|'transferencia'|'gratis', fee?: number}} p
 */
export function price(p) {
	const { unit, quantity, option, percent, discount = null, fee = 2 } = p;
	const fondoPer = option === 'fondo' ? Math.round((unit * (percent ?? 0)) / 100) : 0;
	const contribPer =
		option in CONTRIBUTION
			? Math.round((unit * CONTRIBUTION[/** @type {'sugar'} */ (option)]) / 100)
			: 0;
	const subtotal = unit * quantity - fondoPer * quantity + contribPer * quantity;
	let discountAmount = 0;
	if (discount && option !== 'gorra') {
		discountAmount =
			discount.kind === 'percent'
				? Math.round((subtotal * discount.value) / 100)
				: Math.min(discount.value, subtotal);
	}
	const base = subtotal - discountAmount;
	const method = base === 0 ? 'gratis' : p.method === 'gratis' ? 'mercadopago' : p.method;
	const surcharge =
		method === 'mercadopago' && base > 0 ? Math.ceil((base * 100) / (100 - fee)) - base : 0;
	return {
		fondo_amount: fondoPer * quantity,
		fondo_contribution: contribPer * quantity,
		subtotal,
		discount_code:
			discountAmount > 0 || (discount && option !== 'gorra') ? (discount?.code ?? null) : null,
		discount_amount: discountAmount,
		surcharge_amount: surcharge,
		total: base + surcharge,
		payment_method: method
	};
}

/* ------------------------------------------------------------------------------------------ */
/*  Personas inventadas                                                                        */
/* ------------------------------------------------------------------------------------------ */

const FIRST = [
	'Ari',
	'Sasha',
	'Noa',
	'Lu',
	'Río',
	'Cami',
	'Alex',
	'Juli',
	'Robin',
	'Dani',
	'Sol',
	'Maxi',
	'Tami',
	'Fran',
	'Lian',
	'Kai',
	'Nico',
	'Eli',
	'Mar',
	'Pau',
	'Val',
	'Jo',
	'Ro',
	'Emi',
	'Tobi',
	'Cande',
	'Lola',
	'Uma',
	'Bruno',
	'Iara',
	'Teo',
	'Zoe',
	'Santi',
	'Mora',
	'Gael',
	'Ámbar'
];
const LAST = [
	'Ejemplo',
	'Prueba',
	'Inventade',
	'Ficción',
	'Simulacro',
	'Ensayo',
	'Borrador',
	'Maqueta',
	'Boceto',
	'Muestra',
	'Demo',
	'Ficticie'
];
const PRONOUNS = ['elle', 'ella', 'él', 'ella/elle', 'él/elle', 'cualquiera', 'elle/ella'];

/**
 * @typedef {{name: string, pronouns: string, email: string, dni: string | null}} Person
 */

/** 64 personas inventadas, siempre las mismas. */
export function people() {
	const r = rng(42);
	/** @type {Person[]} */
	const out = [];
	const used = new Set();
	while (out.length < 64) {
		const first = FIRST[Math.floor(r() * FIRST.length)];
		const last = LAST[Math.floor(r() * LAST.length)];
		const name = `${first} ${last}`;
		if (used.has(name)) continue;
		used.add(name);
		const slug = name
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z]+/g, '.');
		out.push({
			name,
			pronouns: PRONOUNS[Math.floor(r() * PRONOUNS.length)],
			email: `${slug}@example.invalid`,
			// DNI de mentira (99.xxx.xxx), y a veces sin DNI.
			dni: r() < 0.85 ? String(99000000 + Math.floor(r() * 999999)) : null
		});
	}
	return out;
}

/* ------------------------------------------------------------------------------------------ */
/*  Eventos inventados                                                                         */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} TicketType
 * @prop {string} id
 * @prop {string} name
 * @prop {number} [price]
 * @prop {{minimo: number, sugerido: number}} [gorra]
 * @prop {number} capacity
 * @prop {number} [closeDaysBefore]
 * @prop {{id: string, name: string, price: number, quantity?: number}[]} [tiers] preventas
 * @prop {string} [after] se habilita cuando se agota este tipo
 */

/**
 * @typedef {object} DemoEvent
 * @prop {string} slug
 * @prop {string} series
 * @prop {string} title
 * @prop {string} summary
 * @prop {number} offset días desde hoy
 * @prop {string} startTime
 * @prop {string} endTime
 * @prop {number} [endNextDay]
 * @prop {boolean} kv
 * @prop {boolean} online
 * @prop {string[]} tags
 * @prop {string[]} authors
 * @prop {string} status
 * @prop {boolean} [draft]
 * @prop {number} [opensInDays] la venta abre en N días (a las 12:00)
 * @prop {TicketType[]} tickets
 * @prop {{perfil: string, rol: string}[]} [personas] personas con rol (#139)
 * @prop {string} [puertaPrecio] hay entradas en la puerta, a este precio
 * @prop {boolean} [tiered] tiene tipos con preventas (sus órdenes van aparte: `ticket_tier`)
 * @prop {string} [streamLink]
 * @prop {string} [location]
 * @prop {string} [locationName]
 * @prop {string} body
 * @prop {number} start
 * @prop {number} end
 */

/**
 * @param {string} today
 * @returns {DemoEvent[]}
 */
export function events(today) {
	/** @type {Omit<DemoEvent, 'slug' | 'start' | 'end'>[]} */
	const list = [];
	const party = (/** @type {number} */ offset, extra = {}) =>
		list.push({
			series: 'noche-latex',
			title: 'Noche Látex (demo)',
			summary: 'EVENTO INVENTADO para probar el panel. Fiesta mensual de una serie que no existe.',
			offset,
			startTime: '22:00',
			endTime: '04:00',
			endNextDay: 1,
			kv: true,
			online: false,
			tags: ['español', 'KinkyVibe', 'pago', 'AMBA', 'evento', 'queer'],
			authors: ['KinkyVibe'],
			status: 'abierto',
			location: 'Calle Inventada 1234, Ciudad de Buenos Aires',
			locationName: 'Galpón de Prueba',
			tickets: [
				{ id: 'general', name: 'General', price: 12000, capacity: 50 },
				{ id: 'anticipada', name: 'Anticipada', price: 9000, capacity: 15, closeDaysBefore: 3 }
			],
			body: 'Fiesta **inventada** de la serie Noche Látex (demo), para probar el panel de admin.',
			personas: [
				{ perfil: 'colectivo-demo', rol: 'Organiza' },
				{ perfil: 'persona-demo-integrante', rol: N3_CUSTOM_ROLE }
			],
			...extra
		});
	for (const o of [-84, -56, -28, 0]) party(o);
	party(28, {
		status: 'agotadas',
		tickets: [
			{ id: 'general', name: 'General', price: 13000, capacity: 20 },
			{ id: 'anticipada', name: 'Anticipada', price: 10000, capacity: 5, closeDaysBefore: 3 }
		]
	});
	party(56, { status: 'anunciado', opensInDays: 30 });

	for (const o of [-63, -35, -7, 14, 42]) {
		list.push({
			series: 'munch-martes',
			title: 'Munch de los martes (demo)',
			summary: 'EVENTO INVENTADO para probar el panel. Encuentro social sin juego, a la gorra.',
			offset: o,
			startTime: '19:30',
			endTime: '22:00',
			kv: true,
			online: false,
			tags: ['español', 'KinkyVibe', 'a la gorra', 'AMBA', 'grupo'],
			authors: ['KinkyVibe'],
			status: 'abierto',
			location: 'Avenida de Ejemplo 500, Ciudad de Buenos Aires',
			locationName: 'Bar Imaginario',
			tickets: [
				{ id: 'gorra', name: 'A la gorra', gorra: { minimo: 0, sugerido: 2000 }, capacity: 30 }
			],
			body: 'Munch **inventado** para probar el panel: charla, algo para tomar y gente nueva.'
		});
	}

	const workshop = (/** @type {number} */ offset, level = 1, extra = {}) =>
		list.push({
			series: `taller-cuerdas-${level}`,
			title: `Taller de cuerdas: nivel ${level} (demo)`,
			summary: 'EVENTO INVENTADO para probar el panel. Taller presencial de amarres.',
			offset,
			startTime: '15:00',
			endTime: '18:00',
			kv: false,
			online: false,
			tags: ['español', 'pago', 'AMBA', 'taller', 'cuerdas', level === 1 ? 'inicial' : 'shibari'],
			// Autore existente (la validación de contenido exige un perfil de amigues o KinkyVibe);
			// sin la etiqueta KinkyVibe, así que es un evento sin Fondo.
			authors: ['KinkyVibe'],
			status: 'abierto',
			location: 'Pasaje Ficticio 42, Ciudad de Buenos Aires',
			locationName: 'Espacio de Ensayo',
			tickets: [
				{ id: 'general', name: 'General', price: 15000 + (level - 1) * 3000, capacity: 12 },
				{ id: 'anticipada', name: 'Anticipada', price: 12000, capacity: 6, closeDaysBefore: 5 }
			],
			body: 'Taller **inventado** para probar el panel. No existe: no vengas 🙂',
			personas: [
				{ perfil: 'persona-demo-integrante', rol: 'Enseña' },
				{ perfil: 'colectivo-demo', rol: 'Organiza' }
			],
			...extra
		});
	workshop(-49);
	workshop(10);
	workshop(45, 2, { draft: true, status: 'anunciado' });

	const talk = (/** @type {number} */ offset, topic = 'consentimiento', link = true) =>
		list.push({
			series: `charla-${topic}`,
			title: `Charla online: ${topic} (demo)`,
			summary: 'EVENTO INVENTADO para probar el panel. Charla online a la gorra.',
			offset,
			startTime: '20:00',
			endTime: '21:30',
			kv: true,
			online: true,
			tags: ['español', 'KinkyVibe', 'a la gorra', 'Online', 'charla'],
			authors: ['KinkyVibe'],
			status: 'abierto',
			tickets: [
				{
					id: 'gorra',
					name: 'A la gorra',
					gorra: { minimo: 1000, sugerido: 4000 },
					capacity: 80
				},
				{ id: 'libre', name: 'Libre', gorra: { minimo: 0, sugerido: 2000 }, capacity: 40 }
			],
			streamLink: link
				? `https://example.invalid/sala-demo-${topic}-${offset < 0 ? 'pasada' : 'proxima'}`
				: undefined,
			body: `Charla **inventada** sobre ${topic}, para probar las entradas de eventos online.`
		});
	talk(-21);
	talk(5);
	talk(20, 'aftercare', false);

	// Noche 3 · C (#134): preventas escalonadas, un tipo encadenado y entradas en la puerta.
	list.push({
		series: 'fiesta-preventas',
		title: 'Fiesta con preventas (demo)',
		summary: 'EVENTO INVENTADO para probar las preventas escalonadas y la «Última tanda».',
		offset: 18,
		startTime: '22:00',
		endTime: '04:00',
		endNextDay: 1,
		kv: true,
		online: false,
		tags: ['español', 'KinkyVibe', 'pago', 'AMBA', 'evento', 'queer'],
		authors: ['KinkyVibe'],
		status: 'abierto',
		location: 'Calle Inventada 400, Ciudad de Buenos Aires',
		locationName: 'Lugar de Prueba',
		tiered: true,
		puertaPrecio: '$ 13.000, solo efectivo',
		tickets: [
			{
				id: 'general',
				name: 'General',
				capacity: 25,
				tiers: [
					{ id: 'preventa-1', name: 'Preventa 1', price: 8000, quantity: 5 },
					{ id: 'preventa-2', name: 'Preventa 2', price: 9000, quantity: 10 },
					{ id: 'general', name: 'General', price: 10000 }
				]
			},
			{ id: 'ultima-tanda', name: 'Última tanda', price: 12000, capacity: 10, after: 'general' }
		],
		body: 'Fiesta **inventada**: los primeros 5 a $ 8.000, los 10 siguientes a $ 9.000 y el resto a $ 10.000. Cuando se agota General, se habilita la Última tanda.'
	});

	return list.map((e) => {
		const start = arInstant(today, e.offset, e.startTime);
		const end = arInstant(today, e.offset + (e.endNextDay ?? 0), e.endTime);
		const date = new Date(start + AR).toISOString().slice(0, 10);
		return { ...e, slug: `demo-${e.series}-${date}`, start, end };
	});
}

/** @param {DemoEvent} e */
export function eventMarkdown(e) {
	const lines = [
		'---',
		EVENT_MARKER,
		// Publicado un mes antes del evento (mismo formato que los eventos reales).
		`published_date: ${new Date(e.start - 30 * DAY + AR).toISOString().slice(0, 10)}Z-03:00`,
		`title: ${sql(e.title)}`,
		`summary: ${sql(e.summary)}`,
		'tags:',
		...e.tags.map((t) => `  - ${t}`),
		'layout: calendario',
		'category: calendario',
		'authors:',
		...e.authors.map((a) => `  - ${a}`),
		// Esta rama no se mergea: en su preview los eventos inventados se ven en el calendario,
		// salvo el borrador (sin listar, como guarda el panel un borrador).
		...(e.draft ? ['force_unlisted: true'] : []),
		`status: ${e.status}`,
		`start: ${arIso(e.start)}`,
		`end: ${arIso(e.end)}`
	];
	if (e.location) lines.push(`location: ${e.location}`, `location_name: ${e.locationName}`);
	if (e.online) lines.push('modalidad: online');
	if (e.personas?.length) {
		lines.push('personas:');
		for (const p of e.personas) lines.push(`  - perfil: ${p.perfil}`, `    rol: ${p.rol}`);
	}
	lines.push('tickets:');
	for (const t of e.tickets) {
		lines.push(`  - id: ${t.id}`, `    name: ${t.name}`);
		if (t.gorra) {
			lines.push(`    a_la_gorra: { minimo: ${t.gorra.minimo}, sugerido: ${t.gorra.sugerido} }`);
		} else if (t.tiers) {
			lines.push('    tiers:');
			for (const tr of t.tiers) {
				lines.push(
					`      - id: ${tr.id}`,
					`        name: ${tr.name}`,
					`        price: ${tr.price}`
				);
				if (tr.quantity) lines.push(`        quantity: ${tr.quantity}`);
			}
		} else lines.push(`    price: ${t.price}`);
		lines.push(`    capacity: ${t.capacity}`);
		if (t.after) lines.push(`    after: ${t.after}`);
		if (t.closeDaysBefore) lines.push(`    close: ${arIso(e.start - t.closeDaysBefore * DAY)}`);
	}
	if (e.puertaPrecio) lines.push('puerta: true', `puerta_precio: ${e.puertaPrecio}`);
	if (e.opensInDays) {
		const [y, m, d] = new Date(e.start + AR).toISOString().slice(0, 10).split('-').map(Number);
		const open = Date.UTC(y, m - 1, d - (e.offset - e.opensInDays), 12, 0) - AR;
		lines.push(`tickets_open: ${arIso(open)}`);
	}
	lines.push('payment_methods: [mercadopago, transferencia]', '---', '');
	const draft = e.draft
		? '> 📝 Borrador inventado: todavía sin venta, para probar cómo se ve un evento en preparación.\n\n'
		: '';
	return `${lines.join('\n')}> **⚠️ Evento inventado (datos de prueba del modo demo).** No existe.\n\n${draft}${e.body}\n`;
}

/* ------------------------------------------------------------------------------------------ */
/*  Órdenes y entradas                                                                         */
/* ------------------------------------------------------------------------------------------ */

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Todos los datos de prueba, relativos a `now`.
 *
 * @param {{today: string, now: number, bundledSlugs?: string[]}} opts `bundledSlugs`: los eventos
 *   `demo-*` que trae el deploy (de corridas anteriores del seed): los que ya no tocan se tapan
 *   en la capa demo.
 */
export function buildData({ today, now, bundledSlugs = [] }) {
	const r = rng(20260930);
	const pick = (/** @type {any[]} */ a) => a[Math.floor(r() * a.length)];
	const hex = (/** @type {number} */ n) =>
		Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
	const uuid = () =>
		`${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;

	const persons = people();
	const evs = events(today);
	const FONDO_PERCENT = 20;
	/** "Por vencer": dentro de unas horas desde que se cargan los datos. */
	const soon = now + 3 * HOUR;

	/**
	 * @type {Array<{code: string, kind: 'percent' | 'fixed', value: number, event_slug: string | null,
	 *   starts_at: number | null, ends_at: number | null, max_uses: number | null, active: number}>}
	 */
	const discountCodes = [
		{
			code: 'DEMO20',
			kind: 'percent',
			value: 20,
			event_slug: null,
			starts_at: null,
			ends_at: null,
			max_uses: null,
			active: 1
		},
		{
			code: 'UNUSO',
			kind: 'percent',
			value: 50,
			event_slug: null,
			starts_at: null,
			ends_at: null,
			max_uses: 1,
			active: 1
		},
		{
			code: 'VENCIDO',
			kind: 'percent',
			value: 15,
			event_slug: null,
			starts_at: null,
			ends_at: arInstant(today, -10, '23:59'),
			max_uses: null,
			active: 1
		},
		{
			code: 'INACTIVO',
			kind: 'fixed',
			value: 500,
			event_slug: null,
			starts_at: null,
			ends_at: null,
			max_uses: null,
			active: 0
		},
		{
			code: 'FUTURO',
			kind: 'percent',
			value: 25,
			event_slug: null,
			starts_at: arInstant(today, 20, '00:00'),
			ends_at: null,
			max_uses: 20,
			active: 1
		}
	];
	const tonight = evs.find((e) => e.offset === 0);
	const nextWorkshop = evs.find((e) => e.series === 'taller-cuerdas-1' && e.offset > 0);
	if (!tonight || !nextWorkshop) throw new Error('faltan eventos');
	discountCodes.push(
		{
			code: 'LATEX1000',
			kind: 'fixed',
			value: 1000,
			event_slug: tonight.slug,
			starts_at: null,
			ends_at: null,
			max_uses: 10,
			active: 1
		},
		{
			code: 'CUERDAS10',
			kind: 'percent',
			value: 10,
			event_slug: nextWorkshop.slug,
			starts_at: null,
			ends_at: null,
			max_uses: null,
			active: 1
		}
	);
	const codeByName = Object.fromEntries(discountCodes.map((c) => [c.code, c]));
	let unusoUsed = false;

	/** @type {Record<string, unknown>[]} */
	const orders = [];
	/** @type {Record<string, unknown>[]} */
	const tickets = [];
	/** @type {Record<string, unknown>[]} */
	const reminderSends = [];
	/** @type {Record<string, unknown>[]} */
	const streamSends = [];
	/** @type {Map<string, Set<string>>} */
	const codesByEvent = new Map();
	let mpPayment = 91000000000;

	const shortCode = (/** @type {string} */ slug) => {
		const used = codesByEvent.get(slug) ?? new Set();
		codesByEvent.set(slug, used);
		for (;;) {
			const c = Array.from({ length: 6 }, () => pick(CODE_ALPHABET.split(''))).join('');
			if (!used.has(c)) {
				used.add(c);
				return c;
			}
		}
	};

	/**
	 * @param {DemoEvent} ev
	 * @param {{type?: TicketType, person?: Person, quantity?: number, method?: 'mercadopago'|'transferencia',
	 *   status: string, option?: string, amount?: number, code?: string, createdAt?: number,
	 *   expiresAt?: number, checkIn?: number | null, emailSent?: boolean, review?: 'late_payment'|'duplicate_payment',
	 *   refundedBy?: string | null}} o
	 */
	function order(ev, o) {
		const type = o.type ?? ev.tickets[0];
		const person = o.person ?? pick(persons);
		const quantity = o.quantity ?? 1;
		const gorra = !!type.gorra;
		const option = gorra
			? 'gorra'
			: (o.option ??
				(ev.kv
					? pick(['fondo', 'fondo', 'fondo', 'completo', 'solidaria', 'muy-solidaria', 'sugar'])
					: 'completo'));
		const unit = gorra
			? (o.amount ?? Math.max(type.gorra?.minimo ?? 0, pick([0, 1000, 2000, 2000, 3000, 5000])))
			: /** @type {number} */ (type.price);
		const discount = o.code && !gorra ? codeByName[o.code] : null;
		const p = price({
			unit,
			quantity,
			option,
			percent: gorra || !ev.kv ? null : FONDO_PERCENT,
			discount: discount
				? { code: discount.code, kind: discount.kind, value: discount.value }
				: null,
			method: o.method ?? pick(['mercadopago', 'mercadopago', 'transferencia'])
		});
		// Compras de 1 a 21 días antes del evento; en los eventos futuros, de los últimos 10 días.
		const createdAt =
			o.createdAt ??
			(() => {
				const back = Math.floor((1 + r() * 20) * DAY);
				return Math.min(now - HOUR, ev.offset > 0 ? now - Math.floor(back / 2) : ev.start - back);
			})();
		const status = o.status;
		const id = uuid();
		const issued = status === 'approved' || status === 'refunded';
		/** @type {Array<{name: string, pronouns: string}>} */
		const holders = [{ name: person.name, pronouns: person.pronouns }];
		while (holders.length < quantity) {
			const other = pick(persons);
			holders.push({ name: other.name, pronouns: other.pronouns });
		}
		const isMp = p.payment_method === 'mercadopago';
		const paidAt = createdAt + (isMp ? 5 * MIN : 9 * HOUR);
		const row = {
			id,
			event_slug: ev.slug,
			ticket_type: type.id,
			quantity,
			unit_price: unit,
			fondo_option: option,
			fondo_percent: gorra || !ev.kv ? null : FONDO_PERCENT,
			...p,
			buyer_name: person.name,
			buyer_pronouns: person.pronouns,
			buyer_email: person.email,
			buyer_dni: person.dni,
			holders: issued ? null : JSON.stringify(holders),
			status,
			mp_preference_id: isMp ? `demo-${hex(6)}` : null,
			mp_payment_id: isMp && (issued || status === 'rejected') ? String(mpPayment++) : null,
			confirmed_by:
				p.payment_method === 'transferencia' && (issued || status === 'cancelled') ? 'demo' : null,
			refunded_at: status === 'refunded' ? paidAt + 2 * DAY : null,
			refunded_by:
				status === 'refunded' ? (o.refundedBy === undefined ? 'demo' : o.refundedBy) : null,
			email_sent_at: issued && o.emailSent !== false ? paidAt + MIN : null,
			created_at: createdAt,
			updated_at: status === 'refunded' ? paidAt + 2 * DAY : issued ? paidAt : createdAt,
			expires_at:
				o.expiresAt ?? createdAt + (p.payment_method === 'transferencia' ? 48 * HOUR : 20 * MIN),
			client_hash: null,
			needs_review: o.review ?? null,
			review_detail: o.review ? String(mpPayment++) : null
		};
		orders.push(row);
		if (issued) {
			holders.forEach((h, i) => {
				const checked = status === 'approved' && o.checkIn != null && (i === 0 || r() < 0.8);
				tickets.push({
					// id y token los genera la base al azar (acorta mucho el SQL); el token tiene la
					// forma que exige isValidToken (43 caracteres de [A-Za-z0-9_-]).
					id: raw('lower(hex(randomblob(16)))'),
					order_id: id,
					event_slug: ev.slug,
					ticket_type: type.id,
					holder_name: h.name,
					holder_pronouns: h.pronouns,
					token: raw('substr(lower(hex(randomblob(22))), 1, 43)'),
					code: shortCode(ev.slug),
					checked_in_at: checked ? /** @type {number} */ (o.checkIn) + i * 2 * MIN : null,
					checked_in_by: checked ? 'demo' : null
				});
			});
			if (status === 'approved' && ev.start - 48 * HOUR > createdAt && ev.start - 48 * HOUR < now)
				reminderSends.push({ order_id: id, reminder_id: 'h48', sent_at: ev.start - 48 * HOUR });
			const nine = arInstant(new Date(ev.start + AR).toISOString().slice(0, 10), 0, '09:00');
			if (status === 'approved' && nine < now && nine > createdAt)
				reminderSends.push({ order_id: id, reminder_id: 'd0-0900', sent_at: nine });
			if (ev.online && ev.streamLink && ev.offset < 0 && status === 'approved')
				streamSends.push({
					order_id: id,
					link_hash: `demo-${hex(56)}`,
					sent_at: ev.start - 3 * HOUR
				});
		}
		return row;
	}

	/** Cuántas entradas ya tiene aprobadas/reservadas un tipo (para no pasar el cupo). */
	const taken = (/** @type {DemoEvent} */ ev, /** @type {TicketType} */ t) =>
		orders
			.filter(
				(o) =>
					o.event_slug === ev.slug &&
					o.ticket_type === t.id &&
					(o.status === 'approved' ||
						(['pending', 'awaiting_transfer'].includes(String(o.status)) &&
							Number(o.expires_at) > now))
			)
			.reduce((n, o) => n + Number(o.quantity), 0);

	/**
	 * Llena un evento hasta `fill` (0..1) de cada tipo con órdenes aprobadas.
	 * @param {DemoEvent} ev
	 * @param {number} fill
	 * @param {{checkIn?: boolean, regulars?: Person[]}} [opts]
	 */
	function fillApproved(ev, fill, { checkIn = false, regulars = [] } = {}) {
		for (const t of ev.tickets) {
			const target = Math.round(t.capacity * fill);
			let guard = 0;
			while (taken(ev, t) < target && guard++ < 200) {
				const left = target - taken(ev, t);
				const quantity = Math.min(left, pick([1, 1, 1, 2, 2, 3]));
				const person = regulars.length && r() < 0.6 ? pick(regulars) : pick(persons);
				const useCode =
					!t.gorra && r() < 0.15
						? 'DEMO20'
						: !t.gorra && !unusoUsed && r() < 0.05
							? 'UNUSO'
							: undefined;
				if (useCode === 'UNUSO') unusoUsed = true;
				order(ev, {
					type: t,
					person,
					quantity,
					status: 'approved',
					code: useCode,
					checkIn: checkIn ? ev.start + Math.floor(r() * 90) * MIN : null
				});
			}
		}
	}

	const regulars = persons.slice(0, 18);
	/** Órdenes que usa el registro de actividad inventado. */
	/** @type {{confirmedTransfer?: Record<string, unknown>, cancelledTransfer?: Record<string, unknown>}} */
	const story = {};
	for (const ev of evs) {
		if (ev.draft || ev.opensInDays || ev.tiered) continue;
		if (ev.offset < 0) {
			fillApproved(ev, ev.series === 'noche-latex' ? 0.5 : ev.online ? 0.2 : 0.5, {
				checkIn: !ev.online,
				regulars: ev.series === 'noche-latex' || ev.series === 'munch-martes' ? regulars : []
			});
			order(ev, { status: 'refunded' });
			order(ev, { status: 'expired', method: 'transferencia' });
			order(ev, { status: 'rejected', method: 'mercadopago' });
			if (ev.series === 'noche-latex') order(ev, { status: 'cancelled', method: 'transferencia' });
		} else if (ev.offset === 0) {
			// Hoy a la noche: gente que vuelve y gente que viene por primera vez a la serie.
			fillApproved(ev, 0.45, { regulars });
			const general = ev.tickets[0];
			const newcomers = persons.slice(50);
			// Algunos ingresos ya marcados (una prueba de puerta temprano).
			const earlyCheckIn = Math.min(now, ev.start) - 30 * MIN;
			for (const p of newcomers.slice(0, 3))
				order(ev, { type: general, person: p, status: 'approved', checkIn: earlyCheckIn });
			order(ev, {
				type: general,
				person: newcomers[3],
				status: 'approved',
				code: 'LATEX1000',
				method: 'mercadopago'
			});
			story.confirmedTransfer = order(ev, {
				type: general,
				person: newcomers[4],
				status: 'approved',
				code: 'LATEX1000',
				method: 'transferencia'
			});
			// Aprobada pero el mail no salió (email_sent_at NULL): para "reenviar el mail".
			order(ev, {
				type: general,
				person: newcomers[5],
				status: 'approved',
				emailSent: false,
				method: 'mercadopago'
			});
			// Para revisar: pago tardío y pago duplicado.
			order(ev, {
				type: general,
				person: newcomers[6],
				status: 'approved',
				review: 'late_payment',
				method: 'mercadopago'
			});
			order(ev, {
				type: general,
				person: newcomers[7],
				status: 'approved',
				review: 'duplicate_payment',
				method: 'mercadopago',
				quantity: 2
			});
			// Transferencias esperando: una por vencer en unas horas, otra con tiempo.
			order(ev, {
				type: general,
				person: newcomers[8],
				status: 'awaiting_transfer',
				method: 'transferencia',
				quantity: 2,
				createdAt: now - 46 * HOUR,
				expiresAt: soon
			});
			order(ev, {
				type: general,
				person: newcomers[9],
				status: 'awaiting_transfer',
				method: 'transferencia',
				createdAt: now - 3 * HOUR,
				expiresAt: now + 45 * HOUR
			});
			// Mercado Pago en curso (reserva corta) y estados terminales.
			order(ev, {
				type: general,
				person: newcomers[10],
				status: 'pending',
				method: 'mercadopago',
				createdAt: now - 5 * MIN,
				expiresAt: soon
			});
			order(ev, { type: general, person: newcomers[11], status: 'expired', method: 'mercadopago' });
			order(ev, {
				type: general,
				person: newcomers[12],
				status: 'refunded',
				method: 'mercadopago',
				refundedBy: null
			});
			order(ev, {
				type: general,
				person: newcomers[13],
				status: 'rejected',
				method: 'mercadopago'
			});
			story.cancelledTransfer = order(ev, {
				type: general,
				person: newcomers[0],
				status: 'cancelled',
				method: 'transferencia'
			});
		} else if (ev.status === 'agotadas') {
			fillApproved(ev, 1, { regulars });
		} else {
			fillApproved(ev, ev.online ? 0.15 : ev.series === 'munch-martes' ? 0.3 : 0.4);
			if (ev === nextWorkshop) {
				order(ev, { status: 'approved', code: 'CUERDAS10' });
				order(ev, {
					status: 'awaiting_transfer',
					method: 'transferencia',
					createdAt: now - 20 * HOUR,
					expiresAt: now + 28 * HOUR
				});
			}
			if (ev.online) order(ev, { type: ev.tickets[1], status: 'approved', amount: 0 });
		}
	}

	// Preventas (#134): «Preventa 1» llena (5) y 4 de «Preventa 2»; en la venta se ve «Preventa 2».
	// Van aparte (con `ticket_tier`, migración 0016), en la sección `orders_tiers`.
	/** @type {Record<string, unknown>[]} */
	const tierOrders = [];
	/** @type {Record<string, unknown>[]} */
	const tierTickets = [];
	for (const ev of evs.filter((e) => e.tiered)) {
		const general = ev.tickets[0];
		for (const [tier, quantity] of /** @type {[string, number][]} */ ([
			['preventa-1', 2],
			['preventa-1', 2],
			['preventa-1', 1],
			['preventa-2', 2],
			['preventa-2', 2]
		])) {
			const unit = general.tiers?.find((x) => x.id === tier)?.price ?? 0;
			const before = orders.length;
			const row = order(ev, {
				type: { id: general.id, name: general.name, price: unit, capacity: general.capacity },
				quantity,
				status: 'approved'
			});
			orders.splice(before, 1);
			tierOrders.push({ ...row, ticket_tier: tier });
			for (let i = tickets.length - 1; i >= 0; i--) {
				if (tickets[i].order_id === row.id) tierTickets.unshift(...tickets.splice(i, 1));
			}
		}
	}

	return {
		persons,
		events: evs,
		orders,
		tickets,
		tierOrders,
		tierTickets,
		/** Ids de los perfiles de prueba por dirección (los pone reloadDemoData). */
		profiles: /** @type {Map<string, number>} */ (new Map()),
		/** `subscriber_key` de cada mail de N3_SERIES_SUBSCRIBERS (los pone reloadDemoData). */
		seriesKeys: /** @type {Map<string, string>} */ (new Map()),
		reminderSends,
		streamSends,
		discountCodes,
		story,
		regulars,
		bundledSlugs,
		today,
		now
	};
}

/** @typedef {ReturnType<typeof buildData>} SeedData */

/* ------------------------------------------------------------------------------------------ */
/*  Secciones (una por tabla)                                                                  */
/* ------------------------------------------------------------------------------------------ */

/** Las órdenes de los eventos de prueba (y de nada más). */
const DEMO_ORDERS = "(SELECT id FROM orders WHERE event_slug LIKE 'demo-%')";

/**
 * Un texto de varias líneas como expresión SQL de una sola línea (así cada sentencia ocupa una
 * línea y se puede partir por líneas, ver chunkSql).
 * @param {string} text
 */
function sqlText(text) {
	if (!text.includes('\n')) return raw(sql(text));
	return raw(`replace(${sql(text.replaceAll('\n', '\\n'))}, '\\n', char(10))`);
}

/** @param {Record<string, unknown>} o */
const orderRef = (o) => `KV-${String(o.id).slice(0, 8).toUpperCase()}`;

/**
 * El registro de actividad inventado: lo que "hizo" el admin de prueba en los últimos días.
 * @param {SeedData} d
 */
export function auditEntries(d) {
	const tonight = d.events.find((e) => e.offset === 0);
	const nextParty = d.events.find((e) => e.series === 'noche-latex' && e.status === 'anunciado');
	const { confirmedTransfer: confirmed, cancelledTransfer: cancelled } = d.story;
	/** @type {Array<{at: number, action: string, target_type: string, target_id: string | null, summary: string}>} */
	const out = [];
	if (tonight)
		out.push({
			at: d.now - 3 * DAY,
			action: 'discount.create',
			target_type: 'discount',
			target_id: 'LATEX1000',
			summary: `Creó el código de descuento LATEX1000 para ${tonight.slug}`
		});
	if (nextParty)
		out.push({
			at: d.now - 26 * HOUR,
			action: 'event.publish',
			target_type: 'event',
			target_id: nextParty.slug,
			summary: `Publicó el evento ${nextParty.title}`
		});
	if (confirmed)
		out.push({
			at: Number(confirmed.updated_at),
			action: 'transfer.confirm',
			target_type: 'order',
			target_id: String(confirmed.id),
			summary: `Confirmó la transferencia ${orderRef(confirmed)} (${confirmed.quantity} ${confirmed.quantity === 1 ? 'entrada' : 'entradas'})`
		});
	if (cancelled)
		out.push({
			at: Number(cancelled.created_at) + 50 * HOUR,
			action: 'transfer.cancel',
			target_type: 'order',
			target_id: String(cancelled.id),
			summary: `Canceló la transferencia ${orderRef(cancelled)}`
		});
	out.push(
		{
			at: d.now - 5 * HOUR,
			action: 'person.note.add',
			target_type: 'person',
			target_id: null,
			summary: 'Agregó una nota a una persona'
		},
		{
			at: d.now - 2 * HOUR,
			action: 'settings.save',
			target_type: 'settings',
			target_id: 'ticket_settings',
			summary: 'Guardó los ajustes de venta'
		}
	);
	return out.filter((e) => e.at <= d.now).sort((a, b) => a.at - b.at);
}

/**
 * La fecha de hoy o la próxima de una serie de eventos de prueba (o `undefined`).
 * @param {SeedData} d
 * @param {string} series
 */
function nextOf(d, series) {
	return d.events
		.filter((e) => e.series === series && e.offset >= 0 && !e.draft)
		.sort((a, b) => a.offset - b.offset)[0];
}

/**
 * @typedef {object} Section
 * @prop {string} table
 * @prop {string[]} [requires] tablas que tienen que existir (por defecto, `table`)
 * @prop {boolean} [optional] la tabla viene de una migración que puede no estar: sin ella, la
 *   sección se saltea
 * @prop {string[]} reset cómo borrar SOLO lo del seed (o lo que cuelga de los eventos `demo-*`)
 * @prop {(d: SeedData) => string[]} rows los INSERT
 */

/**
 * Se aplican en orden: primero todos los reset, al revés (por las foreign keys: lo que depende
 * de las órdenes se borra antes), después los insert.
 * @type {Section[]}
 */
export const SECTIONS = [
	{
		table: 'demo_files',
		// La capa del modo demo (no es migración). Solo se borran los archivos de los eventos de
		// prueba (y sus imágenes); lo demás que se editó en la demo queda.
		reset: [
			DEMO_FILES_SQL.replace(/\s+/g, ' ') + ';',
			`DELETE FROM demo_files WHERE path LIKE ${sql(`${EVENTS_PATH}/demo-%`)} OR path LIKE ${sql(`${EVENTS_PATH}/media/demo-%`)};`
		],
		rows: (d) => {
			const current = new Set(d.events.map((e) => e.slug));
			const file = (/** @type {string} */ slug, /** @type {string | null} */ content) =>
				insert('demo_files', {
					path: `${EVENTS_PATH}/${slug}.md`,
					content: content === null ? null : sqlText(content),
					encoding: 'utf-8',
					deleted: content === null ? 1 : 0,
					author: SEED_BY,
					message:
						content === null
							? 'Datos de prueba: evento de otra fecha'
							: 'Datos de prueba (fechas relativas a hoy)'
				});
			return [
				...d.events.map((e) => file(e.slug, eventMarkdown(e))),
				// Los eventos de prueba de otra fecha que trae el deploy se tapan (si no, el panel
				// mostraría dos Noche Látex "de hoy").
				...d.bundledSlugs
					.filter((slug) => slug.startsWith('demo-') && !current.has(slug))
					.map((slug) => file(slug, null))
			];
		}
	},
	{
		table: 'ticket_settings',
		reset: [`DELETE FROM ticket_settings WHERE updated_by = ${sql(SEED_BY)};`],
		rows: (d) =>
			Object.entries({
				transfer_alias: 'demo.kinkyvibe (datos de prueba)',
				transfer_cbu: 'CBU de prueba: no transferir',
				transfer_holder: 'Admin de prueba (datos inventados)',
				transfer_bank: 'Banco Inventado',
				mp_fee_percent: '2',
				fondo_percent_override: '20'
			}).map(
				([key, value]) =>
					`INSERT OR IGNORE INTO ticket_settings (key, value, updated_at, updated_by) VALUES (${sql(key)}, ${sql(value)}, ${d.now}, ${sql(SEED_BY)});`
			)
	},
	{
		table: 'discount_codes',
		reset: [
			`DELETE FROM discount_codes WHERE created_by = ${sql(SEED_BY)} OR event_slug LIKE 'demo-%';`
		],
		rows: (d) =>
			d.discountCodes.map((c) =>
				insert('discount_codes', {
					...c,
					created_at: d.now - 60 * DAY,
					created_by: SEED_BY
				}).replace('INSERT INTO', 'INSERT OR IGNORE INTO')
			)
	},
	{
		table: 'event_ticket_settings',
		reset: ["DELETE FROM event_ticket_settings WHERE event_slug LIKE 'demo-%';"],
		rows: (d) =>
			d.events
				.filter((e) => e.streamLink)
				.map((e) =>
					insert('event_ticket_settings', {
						event_slug: e.slug,
						stream_link: e.streamLink,
						stream_link_updated_at: e.start - 2 * DAY,
						updated_by: 'demo'
					})
				)
	},
	{
		table: 'orders',
		reset: ["DELETE FROM orders WHERE event_slug LIKE 'demo-%';"],
		rows: (d) => insertMany('orders', d.orders)
	},
	{
		table: 'tickets',
		reset: ["DELETE FROM tickets WHERE event_slug LIKE 'demo-%';"],
		rows: (d) => insertMany('tickets', d.tickets)
	},
	{
		table: 'reminder_sends',
		reset: [`DELETE FROM reminder_sends WHERE order_id IN ${DEMO_ORDERS};`],
		// Con INSERT … SELECT por evento (mismas reglas que reminderSends, que queda para contar).
		rows: (d) =>
			d.events.flatMap((e) => {
				const nine = arInstant(new Date(e.start + AR).toISOString().slice(0, 10), 0, '09:00');
				return [
					['h48', e.start - 48 * HOUR],
					['d0-0900', nine]
				]
					.filter(([, at]) => Number(at) < d.now)
					.map(
						([id, at]) =>
							`INSERT INTO reminder_sends (order_id, reminder_id, sent_at) SELECT id, ${sql(id)}, ${at} FROM orders WHERE event_slug = ${sql(e.slug)} AND status = 'approved' AND created_at < ${at};`
					);
			})
	},
	{
		table: 'stream_link_sends',
		reset: [`DELETE FROM stream_link_sends WHERE order_id IN ${DEMO_ORDERS};`],
		rows: (d) =>
			d.events
				.filter((e) => e.online && e.streamLink && e.offset < 0)
				.map(
					(e) =>
						`INSERT INTO stream_link_sends (order_id, link_hash, sent_at) SELECT id, 'demo-' || lower(hex(randomblob(28))), ${e.start - 3 * HOUR} FROM orders WHERE event_slug = ${sql(e.slug)} AND status = 'approved';`
				)
	},
	// De acá en adelante, tablas de migraciones posteriores (panel de admin): si la base no las
	// tiene, la sección se saltea.
	{
		table: 'event_mail_sends',
		requires: ['event_mail_sends', 'event_mail_recipients'],
		optional: true,
		// Avisos mandados desde la demo a los eventos de prueba.
		reset: [
			"DELETE FROM event_mail_recipients WHERE send_id IN (SELECT id FROM event_mail_sends WHERE event_slug LIKE 'demo-%');",
			"DELETE FROM event_mail_sends WHERE event_slug LIKE 'demo-%';"
		],
		rows: () => []
	},
	{
		table: 'admin_audit',
		optional: true,
		// Lo inventado por el seed y lo que se hizo en la demo sobre eventos u órdenes de prueba
		// (antes de borrar las órdenes: la subconsulta las necesita).
		reset: [
			`DELETE FROM admin_audit WHERE detail = ${sql(SEED_DETAIL)} OR (target_type = 'event' AND target_id LIKE 'demo-%') OR (target_type = 'order' AND target_id IN ${DEMO_ORDERS});`
		],
		rows: (d) =>
			auditEntries(d).map((e) =>
				insert('admin_audit', {
					...e,
					actor_id: DEMO_ADMIN_ID,
					actor_login: DEMO_ADMIN_LOGIN,
					detail: SEED_DETAIL
				})
			)
	},
	{
		table: 'admin_last_seen',
		optional: true,
		// "Desde tu última visita": el admin de prueba "entró" por última vez hace 20 horas.
		reset: [`DELETE FROM admin_last_seen WHERE admin_id = ${DEMO_ADMIN_ID};`],
		rows: (d) => [
			insert('admin_last_seen', {
				admin_id: DEMO_ADMIN_ID,
				seen_at: d.now - 20 * HOUR,
				last_at: d.now - 20 * HOUR
			})
		]
	},
	{
		table: 'person_notes',
		optional: true,
		reset: [`DELETE FROM person_notes WHERE created_by = ${sql(SEED_BY)};`],
		rows: (d) => [
			insert('person_notes', {
				email: d.regulars[0].email,
				body: 'Viene siempre con su pareja; prefiere que le reciban en la puerta (nota de prueba).',
				created_at: d.now - 9 * DAY,
				created_by: SEED_BY
			}),
			insert('person_notes', {
				email: d.regulars[1].email,
				body: 'Se ofreció a ayudar con la puerta en la próxima Noche Látex (nota de prueba).',
				created_at: d.now - 5 * HOUR,
				created_by: SEED_BY
			})
		]
	},
	{
		table: 'email_templates',
		optional: true,
		// Una plantilla con texto propio, para que el editor muestre "texto propio".
		reset: [`DELETE FROM email_templates WHERE updated_by = ${sql(SEED_BY)};`],
		rows: (d) => [
			insert('email_templates', {
				id: 'reminder',
				subject: 'Recordatorio: {{evento}} {{cuando}}',
				heading: '¡{{evento}} {{cuando}}!',
				body: sqlText(
					'Hola {{nombre}}, te recordamos que tenés {{entradas}} ({{tipo}}).\n\n**Traé agua** y ganas de pasarla bien.'
				),
				updated_at: d.now - 4 * DAY,
				updated_by: SEED_BY
			}).replace('INSERT INTO', 'INSERT OR IGNORE INTO')
		]
	},
	// Noche 3 (rama de demo): cada sección se saltea si la base no tiene su migración.
	{
		// Preventas (#134, migración 0016: `orders.ticket_tier` y su índice). Lo viejo se borra
		// con las órdenes y entradas de los eventos `demo-*` (secciones de arriba).
		table: 'orders',
		requires: ['orders', 'tickets', 'orders_event_type_tier'],
		optional: true,
		reset: [],
		rows: (d) => [...insertMany('orders', d.tierOrders), ...insertMany('tickets', d.tierTickets)]
	},
	{
		table: 'feature_flags',
		optional: true,
		// Prende los interruptores de la Noche 3 en cada recarga (es lo que la demo quiere
		// mostrar); se pueden apagar a mano desde el panel hasta la próxima recarga.
		reset: [],
		rows: (d) =>
			N3_FLAGS.map(
				(key) =>
					`INSERT INTO feature_flags (key, enabled, updated_at, updated_by) VALUES (${sql(key)}, 1, ${d.now}, ${sql(SEED_BY)}) ON CONFLICT (key) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by;`
			)
	},
	{
		table: 'agenda_day_notes',
		optional: true,
		// Notas del día de la Agenda (#163) inventadas, en varios colores, alrededor de hoy.
		reset: [`DELETE FROM agenda_day_notes WHERE created_by = ${sql(SEED_BY)};`],
		rows: (d) => {
			/** @type {[number, string, string][]} */
			const list = [
				[0, 'Llegar 19 h a armar la puerta', 'violeta'],
				[3, 'Feriado', 'amarillo'],
				[3, 'No reservar el lugar: pintan el salón', 'rosa'],
				[8, 'Confirmado el DJ de la fiesta', 'verde'],
				[12, 'Ver si hay sonido prestado', 'gris']
			];
			return list.map(([offset, body, color]) => {
				const date = new Date(arInstant(d.today, offset, '12:00') + AR).toISOString().slice(0, 10);
				return insert('agenda_day_notes', {
					date,
					body,
					color,
					created_at: d.now,
					created_by: SEED_BY,
					updated_at: d.now,
					updated_by: SEED_BY
				});
			});
		}
	},
	{
		table: 'tips',
		optional: true,
		// Propinas (#133) inventadas: aprobadas, una reembolsada, una rechazada y una en curso.
		reset: [`DELETE FROM tips WHERE mp_preference_id = ${sql(SEED_BY)};`],
		rows: (d) => {
			const tonight = d.events.find((e) => e.offset === 0) ?? d.events[0];
			/** @type {[number, string, string, string, string | null, number][]} */
			const list = [
				[
					2000,
					'approved',
					'material',
					'6-tips-para-tops',
					'¡Gracias por la guía! (mensaje de prueba)',
					20
				],
				[5000, 'approved', 'material', 'BDSM-una-introduccion-amorosa', null, 9],
				[1000, 'approved', 'calendario', tonight.slug, 'Mensaje inventado para la demo ✨', 2],
				[1500, 'approved', 'material', '6-tips-para-tops', null, 1],
				[3000, 'refunded', 'material', 'BDSM-una-introduccion-amorosa', null, 15],
				[1000, 'rejected', 'material', '6-tips-para-tops', null, 0.2],
				[2000, 'pending', 'calendario', tonight.slug, null, 0.05]
			];
			return list.map(([amount, status, category, slug, message, daysAgo], i) => {
				const at = d.now - Math.round(daysAgo * DAY);
				const paid = status === 'approved' || status === 'refunded';
				return insert('tips', {
					id: `5eed${String(i + 1).padStart(4, '0')}-0000-4000-8000-00000000716${i}`,
					amount,
					status,
					post_category: category,
					post_slug: slug,
					message,
					mp_preference_id: SEED_BY,
					mp_payment_id: status === 'pending' ? null : String(990000000 + i),
					created_at: at,
					updated_at: status === 'refunded' ? at + DAY : at + 2 * MIN,
					approved_at: paid ? at + 2 * MIN : null
				});
			});
		}
	},
	{
		table: 'persona_roles',
		optional: true,
		reset: [`DELETE FROM persona_roles WHERE created_by = ${sql(SEED_BY)};`],
		rows: (d) => [
			`INSERT OR IGNORE INTO persona_roles (name, created_at, created_by) VALUES (${sql(N3_CUSTOM_ROLE)}, ${d.now - 10 * DAY}, ${sql(SEED_BY)});`
		]
	},
	{
		table: 'signup_fields',
		requires: ['signup_fields', 'event_signup_general', 'order_answers'],
		optional: true,
		// Preguntas de inscripción (#139): una general elegida por el próximo taller, una propia
		// del taller, y respuestas en dos de sus órdenes.
		reset: [
			`DELETE FROM order_answers WHERE order_id IN ${DEMO_ORDERS};`,
			"DELETE FROM event_signup_general WHERE event_slug LIKE 'demo-%';",
			`DELETE FROM signup_fields WHERE updated_by = ${sql(SEED_BY)};`
		],
		rows: (d) => {
			const taller = nextOf(d, 'taller-cuerdas-1');
			if (!taller) return [];
			const at = d.now - 20 * DAY;
			const answered = d.orders
				.filter((o) => o.event_slug === taller.slug && o.status === 'approved')
				.slice(0, 2);
			const values = [
				['Una amistad', 'Sin gluten'],
				['Instagram', '']
			];
			return [
				insert('signup_fields', {
					id: 910001,
					event_slug: null,
					label: '¿Cómo te enteraste?',
					kind: 'choice',
					required: 1,
					options: '["Instagram","Una amistad","Otro"]',
					position: 0,
					created_at: at,
					updated_at: at,
					updated_by: SEED_BY
				}),
				insert('signup_fields', {
					id: 910002,
					event_slug: taller.slug,
					label: '¿Alguna restricción alimentaria?',
					kind: 'text',
					required: 0,
					options: '[]',
					position: 0,
					created_at: at,
					updated_at: at,
					updated_by: SEED_BY
				}),
				insert('event_signup_general', { event_slug: taller.slug, field_id: 910001, position: 0 }),
				...answered.map((o, i) =>
					insert('order_answers', {
						order_id: o.id,
						answers: JSON.stringify([
							{ id: 910001, label: '¿Cómo te enteraste?', value: values[i][0] },
							...(values[i][1]
								? [{ id: 910002, label: '¿Alguna restricción alimentaria?', value: values[i][1] }]
								: [])
						]),
						created_at: Number(o.created_at)
					})
				)
			];
		}
	},
	{
		table: 'event_venues',
		optional: true,
		// "Sucede en" (#137): un lugar por nivel de privacidad, en la próxima fecha de cada serie
		// (la Noche Látex de hoy). Los perfiles los crea ./seedProfiles.js.
		reset: [`DELETE FROM event_venues WHERE created_by = ${sql(SEED_BY)};`],
		rows: (d) =>
			DEMO_VENUES.flatMap((v) => {
				const id = d.profiles.get(v.slug);
				const ev = nextOf(d, v.event);
				if (!id || !ev) return [];
				return [
					`INSERT OR IGNORE INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by) VALUES (${sql(ev.slug)}, ${id}, NULL, ${d.now - 7 * DAY}, ${sql(SEED_BY)}, ${d.now - 7 * DAY}, ${sql(SEED_BY)});`
				];
			})
	},
	{
		table: 'profile_claims',
		optional: true,
		// Un pedido «Es mi perfil» pendiente (#137), de una cuenta inventada.
		reset: [`DELETE FROM profile_claims WHERE account_id = ${sql(DEMO_ACCOUNTS.claimer.id)};`],
		rows: (d) => {
			const id = d.profiles.get('ficha-demo-sin-duene');
			if (!id) return [];
			return [
				insert('profile_claims', {
					profile_id: id,
					account_id: DEMO_ACCOUNTS.claimer.id,
					message: 'Soy yo (pedido de prueba)',
					status: 'pending',
					created_at: d.now - 6 * HOUR
				})
			];
		}
	},
	{
		table: 'series_subscriptions',
		optional: true,
		// "Avisame si se repite" (#141): suscripciones confirmadas a series reales del sitio.
		reset: ["DELETE FROM series_subscriptions WHERE email LIKE 'demo.aviso.%@example.invalid';"],
		rows: (d) =>
			N3_SERIES_SUBSCRIBERS.flatMap((x, i) => {
				const key = d.seriesKeys.get(x.email);
				if (!key) return [];
				const at = d.now - x.daysAgo * DAY;
				return [
					insert('series_subscriptions', {
						id: `5eed${String(i + 1).padStart(4, '0')}-0000-4000-8000-0000000005e${i}`,
						series_tag: x.tag,
						email: x.email,
						subscriber_key: key,
						created_at: at,
						confirmed_at: at + HOUR
					})
				];
			})
	}
];

/**
 * Qué secciones se aplican. `tables`: las tablas que tiene la base (sin eso, solo las que no son
 * opcionales).
 * @param {Set<string> | null} tables
 */
export function activeSections(tables) {
	return SECTIONS.filter((s) => {
		const needed = s.requires ?? [s.table];
		if (!tables) return !s.optional;
		const missing = needed.filter((t) => t !== 'demo_files' && !tables.has(t));
		if (missing.length && !s.optional)
			throw new Error(`Faltan tablas en la base (¿migraciones?): ${missing.join(', ')}`);
		return !missing.length;
	});
}

/**
 * Las sentencias del seed, en orden: primero borra los datos de prueba anteriores y después los
 * vuelve a insertar. Una sentencia por elemento, sin el `;` final.
 * @param {SeedData} data
 * @param {{tables?: Set<string> | null}} [opts]
 */
export function seedStatements(data, { tables = null } = {}) {
	const sections = activeSections(tables);
	const resets = [...sections].reverse().flatMap((s) => s.reset);
	const inserts = sections.flatMap((s) => s.rows(data));
	return [...resets, ...inserts].map((s) => s.trim().replace(/;$/, ''));
}

/**
 * El mismo seed como texto SQL (una sentencia por línea), para aplicarlo a mano.
 * @param {SeedData} data
 * @param {{tables?: Set<string> | null}} [opts]
 */
export function seedSql(data, opts) {
	const header = [
		`-- Datos de prueba del modo demo, generados por scripts/demo/seed.js.`,
		`-- Hoy (Argentina): ${data.today} · ahora: ${new Date(data.now).toISOString()}`,
		`-- SOLO para la base kinkyvibe-preview. Nunca para kinkyvibe (producción).`
	];
	return [...header, ...seedStatements(data, opts).map((s) => s + ';')].join('\n') + '\n';
}

/**
 * Parte el SQL en pedazos de a lo sumo `max` bytes, sin cortar sentencias (una por línea).
 * @param {string} text
 * @param {number} [max]
 */
export function chunkSql(text, max = 18000) {
	const out = [];
	let cur = '';
	for (const line of text.split('\n')) {
		if (!line.trim() || line.startsWith('--')) continue;
		if (cur && cur.length + line.length + 1 > max) {
			out.push(cur);
			cur = '';
		}
		cur += line + '\n';
	}
	if (cur) out.push(cur);
	return out;
}

/**
 * SHA-256 en hexadecimal (Web Crypto: anda en el Worker y en Node).
 * @param {string} text
 */
async function sha256Hex(text) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Borra los datos de prueba y los vuelve a cargar relativos a `now`, en un solo batch (atómico
 * en D1: si algo falla, quedan los de antes). Para la base de un preview, nunca producción.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{now?: number, bundledSlugs?: string[]}} [opts] `bundledSlugs`: ver buildData
 */
export async function reloadDemoData(db, { now = Date.now(), bundledSlugs = [] } = {}) {
	// Tablas e índices (un índice dice si está una migración que solo agrega columnas, ver la
	// sección de preventas).
	const { results } = await db
		.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index')")
		.all();
	const tables = new Set(/** @type {any[]} */ (results).map((r) => String(r.name)));
	const today = todayInArgentina(now);
	const data = buildData({ today, now, bundledSlugs });
	// Noche 3: los perfiles (con saveObject, antes del batch) y los hashes de las suscripciones.
	data.profiles = await ensureDemoProfiles(db, { now, tables });
	for (const x of N3_SERIES_SUBSCRIBERS) {
		data.seriesKeys.set(x.email, `e:${await sha256Hex(`cuentas:email:${x.email}`)}`);
	}
	const statements = seedStatements(data, { tables });
	await db.batch(statements.map((s) => db.prepare(s)));
	const counts = /** @type {Record<string, number>} */ (
		await db
			.prepare(
				`SELECT
				(SELECT COUNT(*) FROM orders WHERE event_slug LIKE 'demo-%') AS orders,
				(SELECT COUNT(*) FROM tickets WHERE event_slug LIKE 'demo-%') AS tickets,
				(SELECT COUNT(*) FROM tickets WHERE event_slug LIKE 'demo-%' AND checked_in_at IS NOT NULL) AS checkedIn,
				(SELECT COUNT(*) FROM orders WHERE event_slug LIKE 'demo-%' AND status = 'awaiting_transfer' AND expires_at > ?1) AS pendingTransfers`
			)
			.bind(now)
			.first()
	);
	const tonight = data.events.find((e) => e.offset === 0);
	return {
		today,
		now,
		events: data.events.length,
		orders: Number(counts?.orders ?? 0),
		tickets: Number(counts?.tickets ?? 0),
		checkedIn: Number(counts?.checkedIn ?? 0),
		pendingTransfers: Number(counts?.pendingTransfers ?? 0),
		tonight: tonight ? { slug: tonight.slug, title: tonight.title } : null,
		skipped: SECTIONS.filter((s) => !activeSections(tables).includes(s)).map((s) => s.table),
		statements: statements.length
	};
}
