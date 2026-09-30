import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from './orders.js';
import {
	claimStreamLinkSend,
	getStreamLink,
	normalizeStreamLink,
	sendStreamLinkToAll,
	setStreamLink,
	streamLinkRecipients
} from './stream.js';

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

const EVENT = 'taller-online';
const TYPE = { id: 'general', price: 5000, capacity: 50 };
const LINK = 'https://meet.example.com/abc-defg-hij';

/** Una orden aprobada (o pendiente, con `approve: false`). */
async function order(n = 1, approve = true) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: TYPE,
			quantity: 1,
			holders: [{ name: `Persona ${n}`, pronouns: 'elle' }],
			buyer: { name: `Persona ${n}`, pronouns: 'elle', email: `p${n}@example.com`, dni: '30111222' }
		})
	);
	if (approve) {
		await applyPayment(t.db, {
			id: 1000 + n,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: 5000,
			currency_id: 'ARS'
		});
	}
	return r.order;
}

describe('link de la transmisión', () => {
	it('valida el link: https, completo, o vacío para borrarlo', () => {
		expect(normalizeStreamLink(` ${LINK} `)).toEqual({ ok: true, link: LINK });
		expect(normalizeStreamLink('')).toEqual({ ok: true, link: null });
		for (const bad of [
			'meet.example.com/x',
			'http://meet.example.com/x',
			'javascript:alert(1)',
			'https://localhost/x',
			`https://a.com/${'x'.repeat(600)}`
		]) {
			expect(normalizeStreamLink(bad).ok).toBe(false);
		}
	});

	it('se guarda por evento y se puede cambiar', async () => {
		expect(await getStreamLink(t.db, EVENT)).toBeNull();
		await setStreamLink(t.db, { eventSlug: EVENT, link: LINK, by: 'admin', now: 5 });
		expect(await getStreamLink(t.db, EVENT)).toEqual({
			link: LINK,
			updatedAt: 5,
			updatedBy: 'admin'
		});
		await setStreamLink(t.db, { eventSlug: EVENT, link: null, by: 'admin' });
		expect(await getStreamLink(t.db, EVENT)).toBeNull();
	});

	it('"Enviar el link a todes" es idempotente por valor del link', async () => {
		await order(1);
		await order(2);
		await order(3, false); // pendiente: no recibe nada
		/** @type {string[]} */
		const sentTo = [];
		const send = async (/** @type {any} */ o) => {
			sentTo.push(o.buyer_email);
			return true;
		};
		expect(await streamLinkRecipients(t.db, EVENT, LINK)).toHaveLength(2);
		expect(await sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: LINK, send })).toEqual({
			sent: 2,
			failed: 0
		});
		expect(sentTo.sort()).toEqual(['p1@example.com', 'p2@example.com']);
		// Segundo click: nadie.
		expect(await streamLinkRecipients(t.db, EVENT, LINK)).toHaveLength(0);
		expect(await sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: LINK, send })).toEqual({
			sent: 0,
			failed: 0
		});
		expect(sentTo).toHaveLength(2);
		// Alguien compra después: solo esa persona.
		await order(4);
		await sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: LINK, send });
		expect(sentTo.slice(2)).toEqual(['p4@example.com']);
		// Link nuevo: a todes otra vez.
		const other = 'https://meet.example.com/nuevo';
		expect(await streamLinkRecipients(t.db, EVENT, other)).toHaveLength(3);
		expect((await sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: other, send })).sent).toBe(3);
	});

	it('si un envío falla, queda pendiente para el próximo intento', async () => {
		await order(1);
		await order(2);
		let fail = true;
		const send = async (/** @type {any} */ o) => !(fail && o.buyer_email === 'p2@example.com');
		expect(await sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: LINK, send })).toEqual({
			sent: 1,
			failed: 1
		});
		fail = false;
		expect(await sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: LINK, send })).toEqual({
			sent: 1,
			failed: 0
		});
	});

	it('si el mail de las entradas ya llevó el link, no se repite', async () => {
		const o = await order(1);
		expect(await claimStreamLinkSend(t.db, { orderId: o.id, link: LINK })).toBe(true);
		expect(await claimStreamLinkSend(t.db, { orderId: o.id, link: LINK })).toBe(false);
		expect(await streamLinkRecipients(t.db, EVENT, LINK)).toHaveLength(0);
	});

	it('dos admins a la vez: cada persona recibe un solo mail', async () => {
		await order(1);
		await order(2);
		let count = 0;
		const send = async () => {
			count++;
			return true;
		};
		await Promise.all([
			sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: LINK, send }),
			sendStreamLinkToAll(t.db, { eventSlug: EVENT, link: LINK, send })
		]);
		expect(count).toBe(2);
	});
});
