#!/usr/bin/env node
/**
 * Datos de prueba para la base de un deploy de preview (`kinkyvibe-preview`). SOLO rama
 * `claude/night-demo-data`: no es para mergear. Nunca aplicar a la base `kinkyvibe` (producción).
 *
 * Genera SQL idempotente (borra lo que generó antes y vuelve a insertar) con fechas relativas a
 * "hoy" en Argentina, y opcionalmente los .md de los eventos inventados (títulos con "(demo)",
 * slugs `demo-*`). Todo es inventado: nombres, emails @example.invalid, DNIs, pagos.
 *
 * Uso:
 *   node scripts/demo/seed.js [--today=2026-09-30] [--now=2026-09-30T12:00:00Z]
 *                             [--write-events] [--out=seed.sql] [--chunks=dir]
 *   --today         día de referencia (Argentina). Por defecto, hoy en Argentina.
 *   --now           instante para reservas "por vencer" e ingresos marcados. Por defecto, ahora.
 *   --write-events  reescribe src/lib/posts/calendario/demo-*.md para ese "hoy".
 *   --out           escribe el SQL en un archivo (si no, a stdout).
 *   --chunks        además, lo parte en archivos de ~18 KB (para la API/MCP de D1).
 *
 * Para agregar una tabla: sumar una sección a SECTIONS (reset = cómo borrar SOLO lo del seed,
 * rows = los INSERT). Ver scratchpad/night/status/demo.md para cómo aplicarlo.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FILES_SQL } from '../../src/lib/server/demo/overlay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVENTS_DIR = path.join(ROOT, 'src/lib/posts/calendario');
/** Quién "hizo" lo que inserta el seed: sirve para borrarlo en la próxima corrida. */
export const SEED_BY = 'seed-demo';
/** Marca en el frontmatter de los eventos que genera el seed. */
const EVENT_MARKER = '# generado por scripts/demo/seed.js (datos de prueba, no es un evento real)';

/* ------------------------------------------------------------------------------------------ */
/*  Utilidades                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** PRNG determinístico (mulberry32): mismas personas y montos en cada corrida. */
function rng(seed) {
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
function todayInArgentina(now) {
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
function arIso(ms) {
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
			authors: ['Nudos Imaginarios (demo)'],
			status: 'abierto',
			location: 'Pasaje Ficticio 42, Ciudad de Buenos Aires',
			locationName: 'Espacio de Ensayo',
			tickets: [
				{ id: 'general', name: 'General', price: 15000 + (level - 1) * 3000, capacity: 12 },
				{ id: 'anticipada', name: 'Anticipada', price: 12000, capacity: 6, closeDaysBefore: 5 }
			],
			body: 'Taller **inventado** para probar el panel. No existe: no vengas 🙂',
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
				{ id: 'gorra', name: 'A la gorra', gorra: { minimo: 1000, sugerido: 4000 }, capacity: 80 },
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
	lines.push('tickets:');
	for (const t of e.tickets) {
		lines.push(`  - id: ${t.id}`, `    name: ${t.name}`);
		if (t.gorra)
			lines.push(`    a_la_gorra: { minimo: ${t.gorra.minimo}, sugerido: ${t.gorra.sugerido} }`);
		else lines.push(`    price: ${t.price}`);
		lines.push(`    capacity: ${t.capacity}`);
		if (t.closeDaysBefore) lines.push(`    close: ${arIso(e.start - t.closeDaysBefore * DAY)}`);
	}
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
 * @param {{today: string, now: number}} opts
 */
export function buildData({ today, now }) {
	const r = rng(20260930);
	const pick = (/** @type {any[]} */ a) => a[Math.floor(r() * a.length)];
	const hex = (/** @type {number} */ n) =>
		Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
	const uuid = () =>
		`${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;

	const persons = people();
	const evs = events(today);
	const FONDO_PERCENT = 20;
	/** "Por vencer": dentro de unas horas desde que se prueba, y siempre en el futuro. */
	const soon = Math.max(now + 2 * HOUR, arInstant(today, 0, '13:00'));

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
		const createdAt =
			o.createdAt ?? Math.min(now - HOUR, ev.start - Math.floor((1 + r() * 20) * DAY));
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
	for (const ev of evs) {
		if (ev.draft || ev.opensInDays) continue;
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
			order(ev, {
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
			order(ev, {
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

	return {
		persons,
		events: evs,
		orders,
		tickets,
		reminderSends,
		streamSends,
		discountCodes,
		today,
		now
	};
}

/* ------------------------------------------------------------------------------------------ */
/*  Secciones (una por tabla)                                                                  */
/* ------------------------------------------------------------------------------------------ */

const DEMO_ORDERS = "(SELECT id FROM orders WHERE event_slug LIKE 'demo-%')";

/**
 * Cada sección: `reset` borra SOLO lo que puso el seed; `rows` inserta. Se aplican en orden
 * (primero todos los reset, al revés, por las foreign keys; después los insert).
 * @type {Array<{table: string, reset: string[], rows: (d: ReturnType<typeof buildData>) => string[]}>}
 */
export const SECTIONS = [
	{
		table: 'demo_files',
		// La capa del modo demo (no es migración). No se vacía: guarda lo que se editó en la demo.
		reset: [DEMO_FILES_SQL.replace(/\s+/g, ' ') + ';'],
		rows: () => []
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
					`INSERT OR REPLACE INTO ticket_settings (key, value, updated_at, updated_by) VALUES (${sql(key)}, ${sql(value)}, ${d.now}, ${sql(SEED_BY)});`
			)
	},
	{
		table: 'discount_codes',
		reset: [`DELETE FROM discount_codes WHERE created_by = ${sql(SEED_BY)};`],
		rows: (d) =>
			d.discountCodes.map((c) =>
				insert('discount_codes', {
					...c,
					created_at: d.now - 60 * DAY,
					created_by: SEED_BY
				}).replace('INSERT INTO', 'INSERT OR REPLACE INTO')
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
	}
];

/** @param {ReturnType<typeof buildData>} data */
export function seedSql(data) {
	const header = [
		`-- Datos de prueba del modo demo, generados por scripts/demo/seed.js.`,
		`-- Hoy (Argentina): ${data.today} · ahora: ${new Date(data.now).toISOString()}`,
		`-- SOLO para la base kinkyvibe-preview. Nunca para kinkyvibe (producción).`
	];
	const resets = [...SECTIONS].reverse().flatMap((s) => s.reset);
	const inserts = SECTIONS.flatMap((s) => [`-- ${s.table}`, ...s.rows(data)]);
	return [...header, '-- reset', ...resets, ...inserts].join('\n') + '\n';
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

/** Reescribe los .md de los eventos del seed (borra los de corridas anteriores). */
function writeEvents(/** @type {DemoEvent[]} */ evs) {
	for (const f of readdirSync(EVENTS_DIR)) {
		if (!f.startsWith('demo-') || !f.endsWith('.md')) continue;
		const full = path.join(EVENTS_DIR, f);
		if (readFileSync(full, 'utf8').includes(EVENT_MARKER)) rmSync(full);
	}
	for (const e of evs) writeFileSync(path.join(EVENTS_DIR, `${e.slug}.md`), eventMarkdown(e));
}

function main() {
	const args = Object.fromEntries(
		process.argv.slice(2).map((a) => {
			const [k, ...v] = a.replace(/^--/, '').split('=');
			return [k, v.length ? v.join('=') : true];
		})
	);
	const now = args.now ? Date.parse(String(args.now)) : Date.now();
	if (!Number.isFinite(now)) throw new Error('--now inválido');
	const today = typeof args.today === 'string' ? args.today : todayInArgentina(now);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('--today tiene que ser YYYY-MM-DD');
	const data = buildData({ today, now });
	if (args['write-events']) writeEvents(data.events);
	const text = seedSql(data);
	if (typeof args.out === 'string') writeFileSync(args.out, text);
	else if (!args.chunks) process.stdout.write(text);
	if (typeof args.chunks === 'string') {
		rmSync(args.chunks, { recursive: true, force: true });
		mkdirSync(args.chunks, { recursive: true });
		chunkSql(text).forEach((c, i) =>
			writeFileSync(path.join(args.chunks, `${String(i + 1).padStart(2, '0')}.sql`), c)
		);
	}
	const count = (/** @type {string} */ s) => data.orders.filter((o) => o.status === s).length;
	console.error(
		`seed demo: hoy ${today} · ${data.events.length} eventos · ${data.orders.length} órdenes ` +
			`(${[
				'approved',
				'awaiting_transfer',
				'pending',
				'refunded',
				'expired',
				'rejected',
				'cancelled'
			]
				.map((s) => `${s} ${count(s)}`)
				.join(', ')}) · ${data.tickets.length} entradas ` +
			`(${data.tickets.filter((t) => t.checked_in_at).length} con ingreso) · ` +
			`${data.discountCodes.length} códigos · ${data.reminderSends.length} recordatorios`
	);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
