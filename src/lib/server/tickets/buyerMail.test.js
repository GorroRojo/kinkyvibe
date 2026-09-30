import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from './orders.js';
import {
	BODY_MAX,
	STALE_CLAIM_MS,
	buildBuyerMail,
	buyerMailAudience,
	buyerMailProgress,
	claimBuyerMailRecipient,
	isValidSendId,
	listBuyerMails,
	sendBuyerMailBatch,
	startBuyerMail,
	validateBuyerMail
} from './buyerMail.js';

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

const EVENT = 'fiesta-de-prueba';
const TYPE = { id: 'general', price: 5000, capacity: 50 };
const SEND_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

let payment = 1;
/**
 * Una orden del evento (aprobada salvo `approve: false`).
 * @param {string} email
 * @param {{ approve?: boolean, name?: string, event?: string }} [opts]
 */
async function order(email, { approve = true, name = 'Persona de Prueba', event = EVENT } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: event,
			type: TYPE,
			quantity: 1,
			holders: [{ name, pronouns: 'elle' }],
			buyer: { name, pronouns: 'elle', email, dni: '30111222' }
		})
	);
	if (approve) {
		await applyPayment(t.db, {
			id: payment++,
			status: 'approved',
			external_reference: r.order.id,
			transaction_amount: 5000,
			currency_id: 'ARS'
		});
	}
	return r.order;
}

/** @param {Partial<Parameters<typeof startBuyerMail>[1]>} [over] */
async function start(over = {}) {
	const r = await startBuyerMail(t.db, {
		id: SEND_ID,
		eventSlug: EVENT,
		subject: 'Cambio de lugar',
		body: 'Nos mudamos a la sala de al lado.',
		by: 'admin',
		now: 1000,
		...over
	});
	if ('mismatch' in r) throw new Error('mismatch');
	return r;
}

describe('validateBuyerMail', () => {
	it('normaliza y acepta un aviso normal', () => {
		expect(
			validateBuyerMail({
				subject: '  Cambio \n de lugar ',
				body: 'Hola\r\n\r\n\r\n\r\nchau todes'
			})
		).toEqual({ ok: true, value: { subject: 'Cambio de lugar', body: 'Hola\n\nchau todes' } });
	});

	it('rechaza asunto o texto vacíos o demasiado largos', () => {
		const r = validateBuyerMail({ subject: '', body: 'x' });
		expect(r.ok).toBe(false);
		expect(r.ok === false && Object.keys(r.errors).sort()).toEqual(['body', 'subject']);
		const long = validateBuyerMail({ subject: 'x'.repeat(151), body: 'y'.repeat(BODY_MAX + 1) });
		expect(long.ok === false && long.errors).toEqual({
			subject: 'Máximo 150 caracteres.',
			body: `Máximo ${BODY_MAX} caracteres.`
		});
	});
});

describe('isValidSendId', () => {
	it('solo ids con forma de UUID (o parecida)', () => {
		expect(isValidSendId(SEND_ID)).toBe(true);
		for (const bad of ['', 'corto', 'a'.repeat(65), "x'; DROP TABLE orders;--xxxxxxx", null]) {
			expect(isValidSendId(bad)).toBe(false);
		}
	});
});

describe('buildBuyerMail', () => {
	it('escapa el HTML del texto y del nombre, y conserva párrafos', () => {
		const m = buildBuyerMail({
			subject: 'Aviso <b>importante</b>',
			body: 'Primera línea\nsegunda <script>x</script>\n\nOtro párrafo',
			buyerName: 'Ana <img>',
			event: { title: 'Fiesta', start: '2026-12-12T21:00-03:00' },
			contactEmail: 'contacto@example.com'
		});
		expect(m.subject).toBe('Aviso <b>importante</b> · Fiesta');
		expect(m.html).not.toContain('<script>');
		expect(m.html).toContain('&lt;script&gt;');
		expect(m.html).toContain('Ana &lt;img&gt;');
		expect(m.html).toContain('Primera línea<br>segunda');
		expect(m.html.match(/<p>/g)?.length).toBeGreaterThanOrEqual(3);
		expect(m.text).toContain('Otro párrafo');
	});

	it('no repite el nombre del evento si ya está en el asunto', () => {
		const m = buildBuyerMail({
			subject: 'Fiesta: cambio de horario',
			body: 'Empieza una hora más tarde.',
			buyerName: 'Ana',
			event: { title: 'Fiesta' },
			contactEmail: 'c@example.com'
		});
		expect(m.subject).toBe('Fiesta: cambio de horario');
	});
});

describe('envíos', () => {
	it('el mismo id es el mismo envío; con otro texto es un error', async () => {
		const first = await start();
		expect(first.created).toBe(true);
		const again = await start();
		expect(again.created).toBe(false);
		expect(again.send.id).toBe(SEND_ID);
		expect(
			await startBuyerMail(t.db, {
				id: SEND_ID,
				eventSlug: EVENT,
				subject: 'Otro asunto',
				body: 'Nos mudamos a la sala de al lado.',
				by: 'admin'
			})
		).toEqual({ mismatch: true });
		expect(
			await startBuyerMail(t.db, {
				id: SEND_ID,
				eventSlug: 'otro-evento',
				subject: 'Cambio de lugar',
				body: 'Nos mudamos a la sala de al lado.',
				by: 'admin'
			})
		).toEqual({ mismatch: true });
	});

	it('audiencia: una persona por email (sin importar mayúsculas), solo órdenes aprobadas del evento', async () => {
		await order('ana@example.com', { name: 'Ana vieja' });
		await order('ANA@example.com', { name: 'Ana' });
		await order('bea@example.com');
		await order('pendiente@example.com', { approve: false });
		await order('otra@example.com', { event: 'otro-evento' });
		const audience = await buyerMailAudience(t.db, EVENT);
		expect(audience.map((a) => a.email)).toEqual(['ana@example.com', 'bea@example.com']);
		// El nombre de la orden más nueva.
		expect(audience[0].name).toBe('Ana');
	});

	it('manda en tandas, a cada persona una sola vez, y se puede retomar', async () => {
		for (let i = 0; i < 5; i++) await order(`p${i}@example.com`);
		const { send } = await start();
		/** @type {string[]} */
		const got = [];
		const deliver = async (/** @type {{ email: string }} */ r) => {
			got.push(r.email);
			return true;
		};
		const first = await sendBuyerMailBatch(t.db, { send, deliver, limit: 2, now: 2000 });
		expect(first.sent).toBe(2);
		expect(first.progress).toEqual({ total: 5, sent: 2, failed: 0, pending: 3 });
		const second = await sendBuyerMailBatch(t.db, { send, deliver, limit: 2, now: 3000 });
		expect(second.progress.pending).toBe(1);
		const third = await sendBuyerMailBatch(t.db, { send, deliver, limit: 2, now: 4000 });
		expect(third.sent).toBe(1);
		expect(third.progress).toEqual({ total: 5, sent: 5, failed: 0, pending: 0 });
		// Otra tanda (doble click, otra pestaña): no manda nada de nuevo.
		const again = await sendBuyerMailBatch(t.db, { send, deliver, limit: 20, now: 5000 });
		expect(again.sent).toBe(0);
		expect(got).toHaveLength(5);
		expect(new Set(got).size).toBe(5);
		const [listed] = await listBuyerMails(t.db, EVENT);
		expect(listed).toMatchObject({ id: SEND_ID, sent: 5, failed: 0, finished_at: 4000 });
	});

	it('si un mail falla, la próxima tanda lo reintenta', async () => {
		await order('falla@example.com');
		await order('anda@example.com');
		const { send } = await start();
		let fail = true;
		const deliver = async (/** @type {{ email: string }} */ r) =>
			!(fail && r.email === 'falla@example.com');
		const first = await sendBuyerMailBatch(t.db, { send, deliver, now: 2000 });
		expect(first).toMatchObject({ sent: 1, failed: 1 });
		expect(first.progress).toMatchObject({ sent: 1, failed: 1, pending: 1 });
		fail = false;
		const second = await sendBuyerMailBatch(t.db, { send, deliver, now: 3000 });
		expect(second).toMatchObject({ sent: 1, failed: 0 });
		expect(second.progress.pending).toBe(0);
	});

	it('un error al mandar cuenta como fallido (no rompe la tanda)', async () => {
		await order('a@example.com');
		await order('b@example.com');
		const { send } = await start();
		const r = await sendBuyerMailBatch(t.db, {
			send,
			deliver: async (x) => {
				if (x.email === 'a@example.com') throw new Error('Resend caído');
				return true;
			},
			now: 2000
		});
		expect(r).toMatchObject({ sent: 1, failed: 1 });
	});

	it('el reclamo es atómico: dos tandas a la vez no le mandan dos veces a la misma persona', async () => {
		expect(
			await claimBuyerMailRecipient(t.db, { sendId: SEND_ID, email: 'x@example.com', now: 10 })
		).toBe(true);
		expect(
			await claimBuyerMailRecipient(t.db, { sendId: SEND_ID, email: 'x@example.com', now: 11 })
		).toBe(false);
		// Un reclamo colgado (el Worker se cortó) se puede retomar después de un rato.
		expect(
			await claimBuyerMailRecipient(t.db, {
				sendId: SEND_ID,
				email: 'x@example.com',
				now: 10 + STALE_CLAIM_MS + 1
			})
		).toBe(true);
	});

	it('las compras nuevas después de empezar también reciben el aviso', async () => {
		await order('primera@example.com');
		const { send } = await start();
		const deliver = async () => true;
		expect((await sendBuyerMailBatch(t.db, { send, deliver, now: 2000 })).progress.pending).toBe(0);
		await order('nueva@example.com');
		expect((await buyerMailProgress(t.db, send)).pending).toBe(1);
		const r = await sendBuyerMailBatch(t.db, { send, deliver, now: 3000 });
		expect(r.sent).toBe(1);
	});
});
