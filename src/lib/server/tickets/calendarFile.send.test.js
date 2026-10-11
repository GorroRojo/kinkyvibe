/**
 * El mail con las entradas que de verdad sale (sendOrderEmail) lleva adjunto `<slug>.ics` con la
 * fecha y el fin del evento. Lo que se le manda a Resend se captura (no sale nada). D1 de
 * miniflare; evento y persona inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'evento-de-prueba': {
			title: 'Evento de prueba',
			start: '2099-11-14T22:00:00-03:00',
			end: '2099-11-15T03:00:00-03:00',
			status: 'abierto',
			location: 'Calle Falsa 123',
			location_name: 'Lugar Inventado',
			payment_methods: ['mercadopago'],
			tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
		}
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async (/** @type {string} */ slug) => metas[slug] ?? null,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug]?.tickets ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () => []
	};
});
vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_inventada' } }));

const tickets = await import('./index.js');

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

async function approvedOrder() {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'evento-de-prueba',
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			method: 'mercadopago',
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email: 'p@example.com', dni: '30111222' }
		})
	);
	const { order, tickets: list } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return { order: /** @type {any} */ (order), tickets: list };
}

/** @param {string} b64 */
const fromBase64 = (b64) =>
	new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

describe('sendOrderEmail', () => {
	it('le manda a Resend el .ics del evento adjunto', async () => {
		const o = await approvedOrder();
		/** @type {any[]} */
		const sent = [];
		const fetch = /** @type {any} */ (
			async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
				sent.push(JSON.parse(String(init.body)));
				return new Response('{"id":"x"}', { status: 200 });
			}
		);
		expect(
			await tickets.sendOrderEmail({ db: t.db, ...o, origin: 'https://kv.example', fetch })
		).toBe(true);
		expect(sent).toHaveLength(1);
		expect(sent[0].attachments).toHaveLength(1);
		const [att] = sent[0].attachments;
		expect(att.filename).toBe('evento-de-prueba.ics');
		const ics = fromBase64(att.content)
			.replace(/\r\n[ \t]/g, '')
			.split('\r\n');
		expect(ics).toContain('UID:evento-de-prueba@kinkyvibe.ar');
		expect(ics).toContain('DTSTART:20991115T010000Z');
		expect(ics).toContain('DTEND:20991115T060000Z');
		expect(sent[0].text).toContain('Agregalo a tu calendario');
	});
});
