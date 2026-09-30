import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { TRANSFER_HOLD_MS, getCounts, reserveOrder } from '$lib/server/tickets/orders.js';
import {
	EXPIRED_TRANSFER_VISIBLE_MS,
	getAllCounts,
	listTransferInbox,
	salesTotals,
	summarizeEvent
} from './sales.js';

vi.mock('$lib/server/tickets/events.js', () => ({
	getEventTickets: vi.fn(async (/** @type {string} */ slug) =>
		slug === 'fiesta-a' || slug === 'fiesta-b'
			? { title: slug, types: [{ id: 'general', name: 'General', price: 5000, capacity: 3 }] }
			: null
	)
}));

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

const NOW = Date.parse('2026-10-01T12:00:00Z');
const GENERAL = { id: 'general', price: 5000, capacity: 3 };

/**
 * @param {string} eventSlug
 * @param {{ quantity?: number, method?: 'mercadopago' | 'transferencia', now?: number,
 *   holdMs?: number, email?: string }} [o]
 */
async function reserve(eventSlug, o = {}) {
	const quantity = o.quantity ?? 1;
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: GENERAL,
			quantity,
			holders: Array.from({ length: quantity }, (_, i) => ({ name: `P ${i}`, pronouns: 'elle' })),
			buyer: { name: 'Persona', email: o.email ?? `p${Math.random()}@example.com`, dni: '' },
			method: o.method ?? 'mercadopago',
			now: o.now ?? NOW,
			holdMs: o.holdMs ?? TRANSFER_HOLD_MS
		})
	);
	expect(r.ok).toBe(true);
	return r.order;
}

/** @param {string} id */
async function approve(id) {
	await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?").bind(id).run();
}

describe('getAllCounts', () => {
	it('da lo mismo que getCounts evento por evento, en una sola consulta', async () => {
		const a1 = await reserve('fiesta-a', { quantity: 2 });
		await approve(a1.id);
		await reserve('fiesta-a'); // reservada vigente
		const b1 = await reserve('fiesta-b');
		await approve(b1.id);
		const all = await getAllCounts(t.db, NOW + 1000);
		for (const slug of ['fiesta-a', 'fiesta-b']) {
			expect(Object.fromEntries(all.get(slug) ?? [])).toEqual(
				Object.fromEntries(await getCounts(t.db, slug, NOW + 1000))
			);
		}
		expect(all.get('fiesta-a')?.get('general')).toMatchObject({ sold: 2, held: 1, revenue: 10000 });
	});
});

describe('summarizeEvent / salesTotals', () => {
	const config = /** @type {any} */ ({
		title: 'Fiesta',
		start: '2026-10-10T22:00:00-03:00',
		fondoEnabled: true,
		types: [
			{ id: 'general', name: 'General', price: 10000, fondo: 2000, capacity: 2, gorra: null },
			{
				id: 'gorra',
				name: 'Gorra',
				price: 0,
				fondo: 0,
				capacity: 10,
				gorra: { min: 0, suggested: 3000 }
			}
		]
	});
	const counts = new Map([
		[
			'general',
			{ sold: 3, held: 1, revenue: 24000, fondo: 6000, contribution: 1000, surcharge: 400 }
		]
	]);

	it('suma por tipo, marca sobrevendido y calcula el neto del fondo', () => {
		const e = summarizeEvent({ slug: 'fiesta', config }, counts, { now: NOW, review: 2 });
		expect(e.upcoming).toBe(true);
		expect(e.types[0]).toMatchObject({ sold: 3, over: true, price: 10000 });
		expect(e.types[1]).toMatchObject({ sold: 0, price: null, gorra: { min: 0, suggested: 3000 } });
		expect(e).toMatchObject({ sold: 3, held: 1, capacity: 12, revenue: 24000, fondoNet: -5000 });
		expect(salesTotals([e, e])).toMatchObject({ events: 2, sold: 6, revenue: 48000, review: 4 });
	});

	it('un tipo sin cupo (capacity null) nunca está sobrevendido y el evento queda sin cupo total', () => {
		const libre = {
			...config,
			types: [{ ...config.types[0], capacity: null }, config.types[1]]
		};
		const e = summarizeEvent({ slug: 'fiesta', config: libre }, counts, { now: NOW });
		expect(e.types[0]).toMatchObject({ sold: 3, capacity: null, over: false });
		expect(e.types[1]).toMatchObject({ capacity: 10, over: false });
		expect(e).toMatchObject({ sold: 3, capacity: null });
	});

	it('un evento que ya pasó no es próximo; uno sin fecha sí', () => {
		const past = summarizeEvent({ slug: 'x', config: { ...config, start: '2026-01-01' } }, counts, {
			now: NOW
		});
		expect(past.upcoming).toBe(false);
		const noDate = summarizeEvent({ slug: 'x', config: { ...config, start: undefined } }, counts);
		expect(noDate.upcoming).toBe(true);
	});
});

describe('listTransferInbox', () => {
	it('vigentes primero (la que vence antes arriba), después las vencidas de los últimos 7 días', async () => {
		const late = await reserve('fiesta-a', { method: 'transferencia', now: NOW });
		const early = await reserve('fiesta-b', { method: 'transferencia', now: NOW - 3600_000 });
		const expired = await reserve('fiesta-a', {
			method: 'transferencia',
			now: NOW - TRANSFER_HOLD_MS - 1000
		});
		// Muy vieja: no se muestra.
		await reserve('fiesta-a', {
			method: 'transferencia',
			now: NOW - TRANSFER_HOLD_MS - EXPIRED_TRANSFER_VISIBLE_MS - 1000
		});
		// Mercado Pago: nunca.
		await reserve('fiesta-a', { method: 'mercadopago' });
		const inbox = await listTransferInbox(t.db, { now: NOW });
		expect(inbox.pending.map((o) => o.id)).toEqual([early.id, late.id]);
		expect(inbox.expired.map((o) => o.id)).toEqual([expired.id]);
		const onlyB = await listTransferInbox(t.db, { now: NOW, eventSlug: 'fiesta-b' });
		expect(onlyB.pending.map((o) => o.id)).toEqual([early.id]);
		expect(onlyB.expired).toEqual([]);
	});
});

describe('confirmar y cancelar desde la bandeja', async () => {
	const { cancelTransferFromPanel, confirmTransferFromPanel } = await import('./transfers.js');
	const locals = /** @type {any} */ ({ user: { id: 1, login: 'admin-prueba' } });

	async function audit() {
		const { results } = await t.db.prepare('SELECT action, target_id FROM admin_audit').all();
		return results;
	}

	it('confirma (una sola vez), emite las entradas, avisa por mail y queda en el registro', async () => {
		const o = await reserve('fiesta-a', { method: 'transferencia', quantity: 2 });
		const sendMail = vi.fn(async () => {});
		const r = await confirmTransferFromPanel({
			db: t.db,
			locals,
			by: 'admin-prueba',
			orderId: o.id,
			sendMail,
			now: NOW + 1000
		});
		expect(r).toMatchObject({ ok: true, slug: 'fiesta-a' });
		expect(r.tickets).toHaveLength(2);
		expect(sendMail).toHaveBeenCalledTimes(1);
		const again = await confirmTransferFromPanel({
			db: t.db,
			locals,
			by: 'admin-prueba',
			orderId: o.id,
			sendMail,
			now: NOW + 2000
		});
		expect(again.ok).toBe(true);
		expect(again.message).toMatch(/ya estaba confirmada/);
		expect(sendMail).toHaveBeenCalledTimes(1);
		expect(await audit()).toEqual([{ action: 'transfer.confirm', target_id: o.id }]);
	});

	it('vencida y sin cupo: pide confirmar con cuánto se pasa; con la clave confirma y lo anota', async () => {
		const late = await reserve('fiesta-a', { method: 'transferencia', quantity: 2 });
		const after = NOW + TRANSFER_HOLD_MS + 1;
		// Mientras tanto se ocuparon los 3 lugares.
		await approve((await reserve('fiesta-a', { quantity: 3, now: after })).id);
		const sendMail = vi.fn(async () => {});
		const base = { db: t.db, locals, by: 'admin-prueba', orderId: late.id, sendMail, now: after };
		const first = await confirmTransferFromPanel(base);
		expect(first).toMatchObject({ ok: false, status: 409 });
		expect(first.needsConfirmation?.limits).toEqual([
			expect.objectContaining({ kind: 'capacity', capacity: 3, before: 3, after: 5, over: 2 })
		]);
		expect(first.needsConfirmation?.limits[0].message).toContain('quedarían 5 / 3');
		// Un "sí" cualquiera no alcanza.
		expect((await confirmTransferFromPanel({ ...base, override: 'si' })).status).toBe(409);
		expect(sendMail).not.toHaveBeenCalled();
		expect(await audit()).toEqual([]);

		const r = await confirmTransferFromPanel({
			...base,
			override: first.needsConfirmation?.key
		});
		expect(r).toMatchObject({ ok: true, slug: 'fiesta-a' });
		expect(r.tickets).toHaveLength(2);
		expect(sendMail).toHaveBeenCalledTimes(1);
		expect((await getCounts(t.db, 'fiesta-a', after)).get('general')?.sold).toBe(5);
		expect(await audit()).toEqual([
			{ action: 'transfer.confirm', target_id: late.id },
			{ action: 'tickets.override', target_id: late.id }
		]);
		const row = await t.db
			.prepare("SELECT summary FROM admin_audit WHERE action = 'tickets.override'")
			.first();
		expect(row?.summary).toBe(
			'Pasó límites de entradas (confirmación de transferencia): cupo de «General» +2 (5 / 3)'
		);
	});

	it('vencida con cupo: se confirma sin preguntar (como antes)', async () => {
		const late = await reserve('fiesta-b', { method: 'transferencia', quantity: 1 });
		const r = await confirmTransferFromPanel({
			db: t.db,
			locals,
			by: 'admin-prueba',
			orderId: late.id,
			now: NOW + TRANSFER_HOLD_MS + 1
		});
		expect(r).toMatchObject({ ok: true });
		expect(r.needsConfirmation).toBeUndefined();
		expect(await audit()).toEqual([{ action: 'transfer.confirm', target_id: late.id }]);
	});

	it('cancela; una orden de Mercado Pago o inexistente no', async () => {
		const o = await reserve('fiesta-b', { method: 'transferencia' });
		const r = await cancelTransferFromPanel({ db: t.db, locals, by: 'x', orderId: o.id });
		expect(r.ok).toBe(true);
		const again = await cancelTransferFromPanel({ db: t.db, locals, by: 'x', orderId: o.id });
		expect(again).toMatchObject({ ok: false, status: 409 });
		const mp = await reserve('fiesta-b');
		expect(
			await cancelTransferFromPanel({ db: t.db, locals, by: 'x', orderId: mp.id })
		).toMatchObject({ ok: false, status: 404 });
		expect(
			await confirmTransferFromPanel({ db: t.db, locals, by: 'x', orderId: 'no-es-un-id' })
		).toMatchObject({ ok: false, status: 404 });
		expect(await audit()).toEqual([{ action: 'transfer.cancel', target_id: o.id }]);
	});
});
