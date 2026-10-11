/**
 * «Avisar a les compradores» (dateChange.js): qué cuenta como cambio de fecha, cuándo se ofrece
 * (solo si hay quien compró antes), a quiénes les llega (órdenes aprobadas; reembolsadas,
 * canceladas o sin pagar no), una sola vez por orden y versión, en tandas, y otra vez con un
 * cambio nuevo. D1 de miniflare; personas y eventos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from './orders.js';
import { calendarSequence } from '$lib/utils/icsFeed.js';
import {
	dateChangeOffer,
	dismissDateChange,
	getDateChange,
	pendingDateChangeRequests,
	recordDateChange,
	requestDateChangeSend,
	scheduleChanged,
	scheduleFromFile,
	sendDateChangeBatch
} from './dateChange.js';
import { runMailQueueWith } from './mailQueue.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const SLUG = 'fiesta-inventada';
const OLD = { start: '2099-11-14T22:00:00-03:00', end: '2099-11-15T03:00:00-03:00' };
const NEW = { start: '2099-11-21T22:00:00-03:00', end: '2099-11-22T03:00:00-03:00' };
const T0 = Date.parse('2099-10-01T12:00:00Z');
const MINUTE = 60_000;

describe('scheduleChanged', () => {
	it('compara instantes, no el texto', () => {
		expect(scheduleChanged(OLD, { ...OLD })).toBe(false);
		expect(
			scheduleChanged(OLD, { start: '2099-11-15T01:00:00Z', end: '2099-11-15T06:00:00Z' })
		).toBe(false);
	});

	it('otro inicio u otro fin es un cambio', () => {
		expect(scheduleChanged(OLD, NEW)).toBe(true);
		expect(scheduleChanged(OLD, { ...OLD, end: '2099-11-15T04:00:00-03:00' })).toBe(true);
		expect(scheduleChanged(OLD, { start: OLD.start, end: null })).toBe(true);
	});

	it('el fin pasada la medianoche con la fecha del inicio es el mismo fin (eventEnd)', () => {
		expect(scheduleChanged(OLD, { start: OLD.start, end: '2099-11-14T03:00:00-03:00' })).toBe(
			false
		);
	});

	it('sin fecha antes o después no hay nada que avisar', () => {
		expect(scheduleChanged({ start: null, end: null }, NEW)).toBe(false);
		expect(scheduleChanged(OLD, { start: 'cualquier cosa', end: null })).toBe(false);
		expect(scheduleChanged(null, NEW)).toBe(false);
	});

	it('lee el inicio y el fin del archivo del evento', () => {
		const raw = `---\ntitle: Fiesta\nstart: ${OLD.start}\nend: ${OLD.end}\n---\nTexto.\n`;
		expect(scheduleFromFile(raw)).toEqual(OLD);
		expect(scheduleFromFile('---\ntitle: Sin fecha\n---\n')).toEqual({ start: null, end: null });
		expect(scheduleFromFile('sin propiedades')).toBeNull();
	});
});

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

let payment = 1;
/**
 * Una compra de SLUG, aprobada salvo que se pida otra cosa.
 * @param {string} email
 * @param {{ now?: number, pay?: boolean }} [opts]
 */
async function order(email, { now = T0, pay = true } = {}) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 8000, capacity: 100 },
			quantity: 1,
			now,
			holders: [{ name: 'Persona Inventada', pronouns: 'elle' }],
			buyer: { name: 'Persona Inventada', pronouns: 'elle', email, dni: '30111222' }
		})
	);
	if (!pay) return r.order;
	const { order: approved } = await applyPayment(t.db, {
		id: payment++,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return /** @type {any} */ (approved);
}

/** @param {string} id @param {string} status */
const setStatus = (id, status) =>
	t.db.prepare('UPDATE orders SET status = ?2 WHERE id = ?1').bind(id, status).run();

const change = (now = T0 + 60 * MINUTE) =>
	recordDateChange(t.db, { eventSlug: SLUG, before: OLD, after: NEW, by: 'admin', now });

describe('recordDateChange', () => {
	it('sin cambio no anota nada', async () => {
		expect(
			await recordDateChange(t.db, { eventSlug: SLUG, before: OLD, after: OLD, by: 'admin' })
		).toBeNull();
		expect(await getDateChange(t.db, SLUG)).toBeNull();
	});

	it('anota la fecha de antes y la nueva, con una versión del minuto siguiente', async () => {
		const now = T0 + 60 * MINUTE + 12_345;
		const c = /** @type {any} */ (await change(now));
		expect(c).toMatchObject({
			old_start: OLD.start,
			old_end: OLD.end,
			new_start: NEW.start,
			new_end: NEW.end,
			changed_at: now,
			changed_by: 'admin'
		});
		expect(c.version % MINUTE).toBe(0);
		expect(calendarSequence(c.version)).toBe(calendarSequence(now) + 1);
	});

	it('dos cambios sin avisar: «antes» sigue siendo la fecha original; volver a ella lo borra', async () => {
		await change(T0);
		const third = { start: '2099-11-28T22:00:00-03:00', end: null };
		const c = /** @type {any} */ (
			await recordDateChange(t.db, {
				eventSlug: SLUG,
				before: NEW,
				after: third,
				by: 'admin',
				now: T0 + 5 * MINUTE
			})
		);
		expect(c).toMatchObject({ old_start: OLD.start, new_start: third.start });
		expect(
			await recordDateChange(t.db, {
				eventSlug: SLUG,
				before: third,
				after: OLD,
				by: 'admin',
				now: T0 + 6 * MINUTE
			})
		).toBeNull();
		expect(await getDateChange(t.db, SLUG)).toBeNull();
	});

	it('después de avisar, un cambio nuevo parte de la fecha avisada y tiene otra versión', async () => {
		await order('a@example.com');
		const first = /** @type {any} */ (await change());
		await requestDateChangeSend(t.db, { eventSlug: SLUG, version: first.version, by: 'admin' });
		const third = { start: '2099-11-28T22:00:00-03:00', end: null };
		const second = /** @type {any} */ (
			await recordDateChange(t.db, {
				eventSlug: SLUG,
				before: NEW,
				after: third,
				by: 'admin',
				// En el mismo minuto: igual la versión crece.
				now: T0 + 60 * MINUTE + 1
			})
		);
		expect(second).toMatchObject({ old_start: NEW.start, new_start: third.start });
		expect(second.version).toBeGreaterThan(first.version);
		expect(second.send_requested_at).toBeNull();
	});
});

describe('dateChangeOffer: solo si hay quien compró antes', () => {
	it('sin compras no se ofrece', async () => {
		await change();
		expect(await dateChangeOffer(t.db, SLUG, { now: T0 })).toBeNull();
	});

	it('cuenta personas (no compras) aprobadas de antes del cambio', async () => {
		await order('a@example.com');
		await order('A@Example.com');
		await order('b@example.com');
		const c = await change();
		const offer = await dateChangeOffer(t.db, SLUG, { now: T0 });
		expect(offer).toMatchObject({ people: 2, orders: 3, notified: 0, notice: true });
		expect(offer?.version).toBe(c?.version);
	});

	it('reembolsadas, canceladas, sin pagar y compras de después del cambio no cuentan', async () => {
		const refunded = await order('r@example.com');
		await setStatus(refunded.id, 'refunded');
		const cancelled = await order('c@example.com');
		await setStatus(cancelled.id, 'cancelled');
		await order('p@example.com', { pay: false });
		await order('despues@example.com', { now: T0 + 2 * 60 * MINUTE });
		await change();
		expect(await dateChangeOffer(t.db, SLUG, { now: T0 })).toBeNull();
	});

	it('sin aviso arriba después de «Avisar», de «No hace falta», con el evento terminado o cancelado', async () => {
		await order('a@example.com');
		const c = /** @type {any} */ (await change());
		expect(await dateChangeOffer(t.db, SLUG, { cancelled: true })).toBeNull();
		const past = Date.parse('2099-12-01T00:00:00Z');
		expect(await dateChangeOffer(t.db, SLUG, { now: past })).toMatchObject({
			over: true,
			notice: false
		});
		await dismissDateChange(t.db, { eventSlug: SLUG, version: c.version });
		expect(await dateChangeOffer(t.db, SLUG, { now: T0 })).toMatchObject({
			dismissed: true,
			notice: false,
			people: 1
		});
	});
});

describe('sendDateChangeBatch', () => {
	/** @param {number} n */
	async function buyers(n) {
		for (let i = 0; i < n; i++) await order(`persona${i}@example.com`, { now: T0 + i });
	}

	it('en tandas, sin repetir; quien ya lo recibió no lo recibe de nuevo', async () => {
		await buyers(5);
		const c = /** @type {any} */ (await change());
		await requestDateChangeSend(t.db, { eventSlug: SLUG, version: c.version, by: 'admin' });
		/** @type {string[]} */
		const got = [];
		const send = async (/** @type {any} */ o) => {
			got.push(o.id);
			return true;
		};
		const now = T0 + 61 * MINUTE;
		expect(await sendDateChangeBatch(t.db, { change: c, send, limit: 2, now })).toMatchObject({
			sent: 2,
			remaining: 3
		});
		expect(await sendDateChangeBatch(t.db, { change: c, send, limit: 2, now })).toMatchObject({
			sent: 2,
			remaining: 1
		});
		expect((await pendingDateChangeRequests(t.db)).map((r) => r.event_slug)).toEqual([SLUG]);
		expect(await sendDateChangeBatch(t.db, { change: c, send, limit: 2, now })).toMatchObject({
			sent: 1,
			remaining: 0
		});
		expect(new Set(got).size).toBe(5);
		expect(got).toHaveLength(5);
		// Terminado: el cron ya no lo mira, y otro toque no manda nada.
		expect(await pendingDateChangeRequests(t.db)).toEqual([]);
		expect(await sendDateChangeBatch(t.db, { change: c, send, now })).toMatchObject({
			sent: 0,
			remaining: 0
		});
		expect(got).toHaveLength(5);
		expect(await dateChangeOffer(t.db, SLUG, { now: T0 })).toMatchObject({
			people: 0,
			notified: 5,
			notice: false
		});
	});

	it('dos tandas a la vez no le mandan dos veces a nadie', async () => {
		await buyers(3);
		const c = /** @type {any} */ (await change());
		/** @type {string[]} */
		const got = [];
		const send = async (/** @type {any} */ o) => {
			got.push(o.id);
			return true;
		};
		await Promise.all([
			sendDateChangeBatch(t.db, { change: c, send }),
			sendDateChangeBatch(t.db, { change: c, send })
		]);
		expect(got.sort()).toEqual([...new Set(got)].sort());
		expect(got).toHaveLength(3);
	});

	it('un cambio nuevo (otra versión) se manda otra vez', async () => {
		await buyers(2);
		const first = /** @type {any} */ (await change());
		const send = vi.fn(async () => true);
		await requestDateChangeSend(t.db, { eventSlug: SLUG, version: first.version, by: 'admin' });
		await sendDateChangeBatch(t.db, { change: first, send });
		expect(send).toHaveBeenCalledTimes(2);
		const second = /** @type {any} */ (
			await recordDateChange(t.db, {
				eventSlug: SLUG,
				before: NEW,
				after: { start: '2099-11-28T22:00:00-03:00', end: null },
				by: 'admin',
				now: T0 + 90 * MINUTE
			})
		);
		await sendDateChangeBatch(t.db, { change: second, send });
		expect(send).toHaveBeenCalledTimes(4);
	});

	it('si falla, se reintenta en la próxima tanda; después de 3 intentos queda para el botón', async () => {
		await buyers(1);
		const c = /** @type {any} */ (await change());
		const fail = vi.fn(async () => false);
		for (let i = 0; i < 3; i++) await sendDateChangeBatch(t.db, { change: c, send: fail });
		expect(fail).toHaveBeenCalledTimes(3);
		expect(await sendDateChangeBatch(t.db, { change: c, send: fail })).toMatchObject({
			sent: 0,
			remaining: 0,
			gaveUp: 1
		});
		expect(fail).toHaveBeenCalledTimes(3);
		// «Avisar» de nuevo lo vuelve a la cola.
		await requestDateChangeSend(t.db, { eventSlug: SLUG, version: c.version, by: 'admin' });
		const ok = vi.fn(async () => true);
		expect(await sendDateChangeBatch(t.db, { change: c, send: ok })).toMatchObject({ sent: 1 });
	});

	it('el cron sigue con lo pedido, después de los recordatorios y los links', async () => {
		await buyers(3);
		const c = /** @type {any} */ (await change());
		await requestDateChangeSend(t.db, { eventSlug: SLUG, version: c.version, by: 'admin' });
		const none = async () => ({ sent: 0, failed: 0, remaining: 0 });
		/** @type {number[]} */
		const limits = [];
		const r = await runMailQueueWith(t.db, {
			limit: 2,
			sendReminders: async () => ({ sent: 1, failed: 0, remaining: 0 }),
			sendStreamLink: none,
			sendDateChange: async ({ change: ch, limit }) => {
				limits.push(limit);
				return sendDateChangeBatch(t.db, { change: ch, limit, send: async () => true });
			}
		});
		expect(limits).toEqual([1]);
		expect(r.dateChanges).toMatchObject({ sent: 1, remaining: 2 });
	});
});
