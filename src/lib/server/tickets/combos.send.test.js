/**
 * El bloque del código combo en el mail de las entradas: el texto (voseo, sin decir el mail),
 * que solo sale con el interruptor `combo_codigos` prendido y que sin códigos el mail queda igual
 * byte a byte. Con `sendOrderEmail` de verdad (lo que se le manda a Resend se captura, no sale
 * nada). D1 de miniflare; eventos y persona inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { buildTicketEmail, comboBlocks } from './email.js';
import { fixtureOrder, fixtureTickets } from './email.fixtures.js';
import { textOf } from '$lib/testing/html.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const common = {
		start: '2099-11-14T22:00:00-03:00',
		end: '2099-11-15T03:00:00-03:00',
		status: 'abierto',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'taller-de-prueba': { ...common, title: 'Taller <de> prueba', location: 'Calle Falsa 123' },
		'fiesta-de-prueba': { ...common, title: 'Fiesta de prueba', location: 'Calle Falsa 123' }
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async (/** @type {string} */ slug) => metas[slug] ?? null,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug]?.tickets ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () =>
			Object.entries(metas).map(([slug, meta]) => ({ slug, config: parseTicketConfig(meta, {}) }))
	};
});
const env = vi.hoisted(() => ({
	RESEND_API_KEY: 're_inventada',
	COMBO_CODIGOS_ENABLED: '1'
}));
vi.mock('$env/dynamic/private', () => ({ env }));

const tickets = await import('./index.js');
const { saveCombo } = await import('./combos.js');

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
	env.COMBO_CODIGOS_ENABLED = '1';
	await saveCombo(
		t.db,
		'taller-de-prueba',
		{ target_slug: 'fiesta-de-prueba', kind: 'percent', value: 30, ends_at: null },
		{ by: 'admin-de-prueba' }
	);
});

const ORIGIN = 'https://kv.example';

/** Una compra online aprobada del taller. */
async function order() {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'taller-de-prueba',
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email: 'p@example.com', dni: '30111222' }
		})
	);
	const { order: approved, tickets: list } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return { order: /** @type {any} */ (approved), tickets: list };
}

function captureFetch() {
	/** @type {any[]} */
	const sent = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			sent.push(JSON.parse(String(init.body)));
			return new Response('{"id":"x"}', { status: 200 });
		}
	);
	return { sent, fetch };
}

const ITEM = {
	code: 'COMBO-ABC234',
	discount: '30 % de descuento',
	targetTitle: 'Fiesta <de> prueba',
	targetUrl: `${ORIGIN}/calendario/fiesta-de-prueba/entradas`,
	until: 'sábado 14 de noviembre a las 22:00'
};

describe('comboBlocks', () => {
	it('sin códigos no agrega nada', () => {
		expect(comboBlocks('Taller', [])).toEqual({ html: '', text: [] });
		expect(comboBlocks('Taller', null)).toEqual({ html: '', text: [] });
	});

	it('dice qué descuento, en qué evento, el código y que es personal (sin el mail)', () => {
		const { html, text } = comboBlocks('Taller <de> prueba', [ITEM]);
		expect(textOf(html)).toContain(
			'Con tu entrada a Taller &lt;de&gt; prueba tenés 30 % de descuento en Fiesta &lt;de&gt; prueba: usá el código'
		);
		expect(html).toContain('COMBO-ABC234');
		expect(html).toContain('Taller &lt;de&gt; prueba');
		expect(html).not.toContain('<de>');
		expect(html).toContain(`href="${ITEM.targetUrl}"`);
		expect(textOf(html)).toContain(
			'Es personal: vale para una compra con este mismo email, hasta el sábado 14 de noviembre a las 22:00.'
		);
		expect(text.join('\n')).toContain('Usá el código COMBO-ABC234');
		expect(html).not.toContain('@');
	});

	it('el mail de las entradas lo lleva después de las entradas; sin códigos, igual que siempre', () => {
		const input = {
			order: fixtureOrder(),
			tickets: fixtureTickets(),
			event: { title: 'Taller de prueba', start: '2026-11-14T22:00:00-03:00' },
			typeName: 'General',
			origin: ORIGIN,
			contactEmail: 'contacto@example.com'
		};
		const plain = buildTicketEmail(input);
		expect(buildTicketEmail({ ...input, combos: [] })).toEqual(plain);
		const withCombo = buildTicketEmail({ ...input, combos: [ITEM] });
		expect(withCombo.html).toContain('data-kv-mail="combo"');
		expect(withCombo.html.indexOf('data-kv-mail="combo"')).toBeGreaterThan(
			withCombo.html.lastIndexOf('qr.gif')
		);
		expect(withCombo.text).toContain('Un descuento para otro evento');
	});
});

describe('sendOrderEmail con combos', () => {
	it('con el interruptor prendido, el mail lleva el código generado para esta compra', async () => {
		const o = await order();
		const { sent, fetch } = captureFetch();
		expect(await tickets.sendOrderEmail({ db: t.db, ...o, origin: ORIGIN, fetch })).toBe(true);
		const row = /** @type {any} */ (
			await t.db
				.prepare('SELECT code, buyer_email FROM discount_codes WHERE source_order_id = ?1')
				.bind(o.order.id)
				.first()
		);
		expect(row.buyer_email).toBe('p@example.com');
		expect(sent[0].html).toContain(row.code);
		expect(sent[0].text).toContain(
			'con tu entrada a Taller <de> prueba tenés 30 % de descuento en Fiesta de prueba'
		);
	});

	it('con el interruptor apagado, ni código ni bloque', async () => {
		env.COMBO_CODIGOS_ENABLED = '0';
		const o = await order();
		const { sent, fetch } = captureFetch();
		expect(await tickets.sendOrderEmail({ db: t.db, ...o, origin: ORIGIN, fetch })).toBe(true);
		expect(sent[0].html).not.toContain('data-kv-mail="combo"');
		expect(await t.db.prepare('SELECT COUNT(*) AS n FROM discount_codes').first('n')).toBe(0);
	});
});
