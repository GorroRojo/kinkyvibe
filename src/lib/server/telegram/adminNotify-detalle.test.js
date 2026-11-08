/**
 * El detalle de «Cada venta» (decisión 0058): abajo de la línea de siempre, en un
 * `<blockquote expandable>`, los datos de la compra que Órdenes ya muestra en el panel. Datos
 * INVENTADOS (el repo es público).
 *
 * - lo que escribió quien compra (nombre, mail, respuestas, código) sale escapado;
 * - con y sin extras, código, Fondo y respuestas; los montos de MP (informados o estimados);
 * - nunca pasa de 4096: se cortan las respuestas con «…»;
 * - nunca el DNI, les titulares, el id del pago, la nota ni los tokens (aunque estén en la orden);
 * - el resto (a quién, una sola vez, sin sonido de noche) es lo de siempre (adminNotify.test.js).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { setAdminNotice } from './adminData.js';
import {
	TELEGRAM_TEXT_MAX,
	clipToFit,
	notifyOrder,
	saleDetail,
	saleDetailLines,
	saleNoticeWithDetail
} from './adminNotify.js';
import { formatARS } from '$lib/utils/money.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const HEAD = '🎟 Se vendió 1 General (Preventa 1) de <b>Fiesta inventada</b> · 3/50';
/** 8/1/2031 a las 15:00 de Argentina. */
const AFTERNOON = Date.parse('2031-01-08T15:00:00-03:00');
const ID = '1a2b3c4d-0000-4000-9000-000000000001';

const TYPE = /** @type {any} */ ({
	id: 'general',
	name: 'General',
	price: 10000,
	fondo: 1000,
	capacity: 50,
	tiers: [{ id: 'p1', name: 'Preventa 1', price: 8000, fondo: 800, quantity: 10, until: null }]
});

/** Una orden pagada con MP, con todo lo que no tiene que salir. @param {Record<string, unknown>} [o] */
const mpOrder = (o = {}) =>
	/** @type {any} */ ({
		id: ID,
		event_slug: 'fiesta-inventada',
		ticket_type: 'general',
		ticket_tier: 'p1',
		quantity: 1,
		unit_price: 8000,
		fondo_option: 'fondo',
		fondo_amount: 0,
		fondo_contribution: 0,
		subtotal: 8000,
		discount_code: null,
		discount_amount: 0,
		surcharge_amount: 170,
		total: 8170,
		extras_amount: 0,
		payment_method: 'mercadopago',
		buyer_name: 'Persona Inventada',
		buyer_pronouns: 'elle',
		buyer_email: 'persona@example.com',
		buyer_dni: '30111222',
		holders: '[{"name":"Titular Secreto","pronouns":""}]',
		mp_payment_id: 'pago-secreto',
		mp_fee_amount: null,
		client_hash: 'hash-secreto',
		admin_note: 'nota-secreta',
		created_at: AFTERNOON,
		...o
	});

const NEVER = [
	'30111222',
	'222',
	'Titular Secreto',
	'pago-secreto',
	'hash-secreto',
	'nota-secreta'
];

/** @param {string} text */
const blockOf = (text) => {
	const m = text.match(/\n<blockquote expandable>([\s\S]*)<\/blockquote>$/);
	return m ? m[1].split('\n') : null;
};

describe('el detalle: las líneas', () => {
	it('sin extras, código, Fondo ni respuestas; MP con la comisión estimada', () => {
		const text = saleNoticeWithDetail(HEAD, saleDetail(mpOrder(), TYPE));
		expect(text.split('\n')[0]).toBe(HEAD);
		expect(blockOf(text)).toEqual([
			'👤 Persona Inventada (elle)',
			'✉️ persona@example.com',
			'🧾 Orden KV-1A2B3C4D · 8/1/31 15:00',
			`🎟 1 × General (Preventa 1) · ${formatARS(8000)} c/u`,
			`💳 Pagó <b>${formatARS(8170)}</b> · Mercado Pago`,
			`Recargo MP: +${formatARS(170)}`,
			`Comisión de MP (estimada): ${formatARS(170)}`,
			`Neto estimado: <b>${formatARS(8000)}</b>`
		]);
		for (const s of NEVER) expect(text, s).not.toContain(s);
	});

	it('con extras, código, Fondo, aporte y la comisión que informó MP', () => {
		const order = mpOrder({
			quantity: 2,
			fondo_amount: 1600,
			discount_code: 'AMIGUES10',
			discount_amount: 1440,
			surcharge_amount: 400,
			total: 13360,
			extras_amount: 9000,
			mp_fee_amount: 1250
		});
		const lines = saleDetailLines(
			saleDetail(order, TYPE, {
				extras: [
					{ name: 'Trago', quantity: 2 },
					{ name: 'Remera', quantity: 1 }
				]
			})
		);
		expect(lines).toEqual([
			'👤 Persona Inventada (elle)',
			'✉️ persona@example.com',
			'🧾 Orden KV-1A2B3C4D · 8/1/31 15:00',
			`🎟 2 × General (Preventa 1) · ${formatARS(8000)} c/u`,
			`➕ Extras: 2 × Trago, 1 × Remera · +${formatARS(9000)}`,
			`🏷 Código AMIGUES10: −${formatARS(1440)}`,
			`💗 Fondo: −${formatARS(1600)}`,
			`💳 Pagó <b>${formatARS(22360)}</b> · Mercado Pago`,
			`Recargo MP: +${formatARS(400)}`,
			`Comisión de MP: ${formatARS(1250)}`,
			`Neto: <b>${formatARS(21110)}</b>`
		]);
		const solidaria = saleDetailLines(
			saleDetail(mpOrder({ fondo_option: 'solidaria', fondo_contribution: 800 }), TYPE)
		);
		expect(solidaria).toContain(`💗 Entrada solidaria (+10 %): aporte al fondo +${formatARS(800)}`);
	});

	it('una transferencia: sin recargo, comisión ni neto; sin pronombres, sin paréntesis', () => {
		const lines = saleDetailLines(
			saleDetail(
				mpOrder({
					payment_method: 'transferencia',
					surcharge_amount: 0,
					total: 8000,
					buyer_pronouns: null,
					ticket_tier: null
				}),
				TYPE
			)
		);
		expect(lines[0]).toBe('👤 Persona Inventada');
		expect(lines[3]).toBe(`🎟 1 × General · ${formatARS(8000)} c/u`);
		expect(lines.at(-1)).toBe(`💳 Pagó <b>${formatARS(8000)}</b> · Transferencia`);
		expect(lines.join('\n')).not.toMatch(/Recargo|Comisión|Neto/);
	});

	it('escapa todo lo que escribió quien compra', () => {
		const text = saleNoticeWithDetail(
			HEAD,
			saleDetail(
				mpOrder({
					buyer_name: '<b>Nombre</b> & <a href="x">',
					buyer_pronouns: '</blockquote>',
					buyer_email: 'a<b>@example.com',
					discount_code: '<i>',
					discount_amount: 100
				}),
				TYPE,
				{
					extras: [{ name: '<u>Trago</u>', quantity: 1 }],
					answers: [{ id: 1, label: '¿<s>Algo</s>?', value: '**no** </blockquote><b>' }]
				}
			)
		);
		const block = /** @type {string[]} */ (blockOf(text));
		expect(block[0]).toBe(
			'👤 &lt;b&gt;Nombre&lt;/b&gt; &amp; &lt;a href=&quot;x&quot;&gt; (&lt;/blockquote&gt;)'
		);
		expect(block[1]).toBe('✉️ a&lt;b&gt;@example.com');
		expect(text).toContain('Código &lt;i&gt;:');
		expect(text).toContain('Extras: 1 × &lt;u&gt;Trago&lt;/u&gt;');
		expect(block.at(-1)).toBe('• ¿&lt;s&gt;Algo&lt;/s&gt;?: **no** &lt;/blockquote&gt;&lt;b&gt;');
		// Un solo bloque, que cierra al final: nada de lo escrito abre ni cierra etiquetas.
		expect(text.match(/<blockquote/g)).toHaveLength(1);
		expect(text.match(/<\/blockquote>/g)).toHaveLength(1);
		expect(text.match(/<b>/g)).toHaveLength(3);
	});

	it('las respuestas, con la entrada en las de «una vez por entrada»', () => {
		const text = saleNoticeWithDetail(
			HEAD,
			saleDetail(mpOrder(), TYPE, {
				answers: [
					{ id: 1, label: '¿Cómo te enteraste?', value: 'Por amigues' },
					{ id: 2, label: '¿Restricción alimentaria?', value: 'Vegana', ticket: 2 }
				]
			})
		);
		expect(blockOf(text)?.slice(-3)).toEqual([
			'📝 Respuestas:',
			'• ¿Cómo te enteraste?: Por amigues',
			'• Entrada 2 · ¿Restricción alimentaria?: Vegana'
		]);
	});

	it('usa «Textos del bot» si se cambiaron', () => {
		const lines = saleDetailLines(saleDetail(mpOrder(), TYPE), {
			'admin.venta_mail': 'Mail: **{mail}**'
		});
		expect(lines[1]).toBe('Mail: <b>persona@example.com</b>');
	});
});

describe('el detalle: nunca pasa de 4096', () => {
	it('corta la respuesta que no entra con «…» y deja «…» si había más', () => {
		const long = 'palabra '.repeat(1000);
		const text = saleNoticeWithDetail(
			HEAD,
			saleDetail(mpOrder(), TYPE, {
				answers: [
					{ id: 1, label: 'Corta', value: 'sí' },
					{ id: 2, label: 'Larga', value: long },
					{ id: 3, label: 'Otra', value: 'no entra' }
				]
			})
		);
		expect(text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
		expect(text.length).toBeGreaterThan(TELEGRAM_TEXT_MAX - 20);
		const block = /** @type {string[]} */ (blockOf(text));
		expect(block.at(-3)).toBe('• Corta: sí');
		expect(block.at(-2)).toMatch(/^• Larga: palabra[a-z ]*[a-z]…$/);
		expect(block.at(-1)).toBe('…');
		expect(text).not.toContain('no entra');
	});

	it('mide lo escapado (no corta un «&amp;» por la mitad) y no parte emojis', () => {
		const text = saleNoticeWithDetail(
			HEAD,
			saleDetail(mpOrder(), TYPE, {
				answers: [{ id: 1, label: 'Signos', value: '&<🖤>'.repeat(2000) }]
			})
		);
		expect(text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_MAX);
		const last = /** @type {string[]} */ (blockOf(text)).at(-1) ?? '';
		expect(last).toMatch(/^• Signos: (&amp;&lt;🖤&gt;)+(&amp;(&lt;(🖤)?)?)?…$/);
		expect(last).not.toMatch(/\uD83D(?!\uDDA4)/);
	});

	it('con un tope chico: sin lugar para las respuestas, el detalle sin ellas; sin lugar para el detalle, solo el resumen', () => {
		const detail = saleDetail(mpOrder(), TYPE, {
			answers: [{ id: 1, label: 'Pregunta', value: 'respuesta' }]
		});
		const bare = saleNoticeWithDetail(HEAD, { ...detail, answers: [] });
		expect(saleNoticeWithDetail(HEAD, detail, null, bare.length + 5)).toBe(bare);
		expect(saleNoticeWithDetail(HEAD, detail, null, bare.length - 1)).toBe(HEAD);
	});

	it('clipToFit', () => {
		expect(clipToFit('hola mundo', (v) => v.length <= 6)).toBe('hola…');
		expect(clipToFit('hola', (v) => v.length <= 0)).toBeNull();
		expect(clipToFit('🖤🖤🖤', (v) => v.length <= 3)).toBe('🖤…');
	});
});

describe('notifyOrder: el detalle sale de la base', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});

	const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
	const CONFIG = /** @type {any} */ ({
		title: 'Fiesta inventada',
		start: '2031-01-10T23:00:00-03:00',
		types: [TYPE]
	});
	const config = async (/** @type {string} */ slug) =>
		slug === 'fiesta-inventada' ? CONFIG : null;

	beforeEach(async () => {
		await resetDB(t.db);
		await t.db
			.prepare(
				'INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at) VALUES (?1, ?2, ?3, ?4)'
			)
			.bind('5001', ADMIN.id, ADMIN.login, AFTERNOON - 86_400_000)
			.run();
		await setAdminNotice(t.db, ADMIN.id, 'cada_venta', true);
	});

	it('con extras, respuestas y la comisión que llegó después; sin DNI ni titulares', async () => {
		const o = mpOrder({ status: 'approved', extras_amount: 3000 });
		await t.db
			.prepare(
				`INSERT INTO orders (id, event_slug, ticket_type, ticket_tier, quantity, unit_price, subtotal,
					surcharge_amount, total, extras_amount, buyer_name, buyer_pronouns, buyer_email, buyer_dni,
					holders, status, payment_method, mp_payment_id, mp_fee_amount, client_hash, admin_note,
					created_at, updated_at, expires_at)
				VALUES (?1, 'fiesta-inventada', 'general', 'p1', 1, 8000, 8000, 170, 8170, 3000,
					'Persona Inventada', 'elle', 'persona@example.com', '30111222', ?2, 'approved',
					'mercadopago', 'pago-secreto', 400, 'hash-secreto', 'nota-secreta', ?3, ?3, ?4)`
			)
			.bind(o.id, o.holders, AFTERNOON, AFTERNOON + 86_400_000)
			.run();
		await t.db
			.prepare(
				`INSERT INTO order_extras (order_id, event_slug, extra_id, name, unit_price, quantity, created_at)
				VALUES (?1, 'fiesta-inventada', 'trago', 'Trago', 1500, 2, ?2)`
			)
			.bind(o.id, AFTERNOON)
			.run();
		await t.db
			.prepare('INSERT INTO order_answers (order_id, answers, created_at) VALUES (?1, ?2, ?3)')
			.bind(
				o.id,
				JSON.stringify([{ id: 7, label: '¿Cómo te enteraste?', value: 'Por <amigues>' }]),
				AFTERNOON
			)
			.run();
		/** @type {string[]} */
		const sent = [];
		const r = await notifyOrder({
			db: t.db,
			kind: 'cada_venta',
			// Lo que trae el flujo de compra puede no tener la comisión: se relee la orden.
			order: { ...o, mp_fee_amount: null, channel: 'online' },
			origin: 'https://ejemplo.test',
			send: async (_chat, m) => {
				sent.push(m.text);
				return 'sent';
			},
			now: AFTERNOON,
			config
		});
		expect(r).toEqual({ sent: 1, failed: 0, skipped: 0 });
		const block = /** @type {string[]} */ (blockOf(sent[0]));
		expect(sent[0].split('\n')[0]).toBe(
			'🎟 Se vendió 1 General (Preventa 1) de <b>Fiesta inventada</b> · 1/50'
		);
		expect(block).toEqual([
			'👤 Persona Inventada (elle)',
			'✉️ persona@example.com',
			'🧾 Orden KV-1A2B3C4D · 8/1/31 15:00',
			`🎟 1 × General (Preventa 1) · ${formatARS(8000)} c/u`,
			`➕ Extras: 2 × Trago · +${formatARS(3000)}`,
			`💳 Pagó <b>${formatARS(11170)}</b> · Mercado Pago`,
			`Recargo MP: +${formatARS(170)}`,
			`Comisión de MP: ${formatARS(400)}`,
			`Neto: <b>${formatARS(10770)}</b>`,
			'📝 Respuestas:',
			'• ¿Cómo te enteraste?: Por &lt;amigues&gt;'
		]);
		for (const s of NEVER) expect(sent[0], s).not.toContain(s);
	});
});
