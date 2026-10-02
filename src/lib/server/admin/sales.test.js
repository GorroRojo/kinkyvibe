import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { TRANSFER_HOLD_MS, getCounts, getOrder, reserveOrder } from '$lib/server/tickets/orders.js';
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
		expect(inbox.rejected).toEqual([]);
	});

	it('las rechazadas de los últimos 7 días van aparte (y no en las vencidas)', async () => {
		const rejected = await reserve('fiesta-a', { method: 'transferencia' });
		const old = await reserve('fiesta-b', { method: 'transferencia' });
		const cancel = (/** @type {string} */ id, /** @type {number} */ at) =>
			t.db
				.prepare("UPDATE orders SET status = 'cancelled', updated_at = ?2 WHERE id = ?1")
				.bind(id, at)
				.run();
		await cancel(rejected.id, NOW);
		await cancel(old.id, NOW - EXPIRED_TRANSFER_VISIBLE_MS - 1000);
		const inbox = await listTransferInbox(t.db, { now: NOW + 1000 });
		expect(inbox.rejected.map((o) => o.id)).toEqual([rejected.id]);
		expect(inbox.pending).toEqual([]);
		expect(inbox.expired).toEqual([]);
	});
});

describe('confirmar y cancelar desde la bandeja', async () => {
	const { cancelTransferFromPanel, confirmTransferFromPanel, reopenTransferFromPanel } =
		await import('./transfers.js');
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

	describe('deshacer rechazo', () => {
		const HOLD = 48 * 3600_000;
		/** @param {string} id @param {number} [at] */
		const reject = (id, at = NOW + 1000) =>
			cancelTransferFromPanel({ db: t.db, locals, by: 'admin-prueba', orderId: id, now: at });

		it('con lugar: vuelve a esperar comprobante con la reserva renovada y queda en el registro', async () => {
			const o = await reserve('fiesta-a', { method: 'transferencia', quantity: 2 });
			await reject(o.id);
			const later = NOW + 5 * 24 * 3600_000; // la reserva original ya venció
			const r = await reopenTransferFromPanel({
				db: t.db,
				locals,
				by: 'admin-prueba',
				orderId: o.id,
				holdMs: HOLD,
				now: later
			});
			expect(r).toMatchObject({ ok: true, slug: 'fiesta-a' });
			expect(r.order).toMatchObject({
				status: 'awaiting_transfer',
				expires_at: later + HOLD,
				confirmed_by: null
			});
			// Vuelve a ocupar su lugar y aparece en la bandeja.
			expect((await getCounts(t.db, 'fiesta-a', later)).get('general')?.held).toBe(2);
			const inbox = await listTransferInbox(t.db, { now: later + 1 });
			expect(inbox.pending.map((x) => x.id)).toEqual([o.id]);
			expect(inbox.rejected).toEqual([]);
			expect(await audit()).toEqual([
				{ action: 'transfer.cancel', target_id: o.id },
				{ action: 'transfer.reopen', target_id: o.id }
			]);
			// Un segundo click no hace nada nuevo.
			const again = await reopenTransferFromPanel({
				db: t.db,
				locals,
				by: 'admin-prueba',
				orderId: o.id,
				holdMs: HOLD,
				now: later + 5
			});
			expect(again).toMatchObject({ ok: true });
			expect(again.message).toMatch(/ya estaba esperando/);
			expect(await audit()).toHaveLength(2);
		});

		it('sin lugar: no la reabre y explica por qué; con la clave del aviso sí, y lo anota', async () => {
			const o = await reserve('fiesta-a', { method: 'transferencia', quantity: 2 });
			await reject(o.id);
			// Mientras estuvo rechazada se vendieron 2 de los 3 lugares.
			await approve((await reserve('fiesta-a', { quantity: 2, now: NOW + 2000 })).id);
			const base = {
				db: t.db,
				locals,
				by: 'admin-prueba',
				orderId: o.id,
				holdMs: HOLD,
				now: NOW + 3000
			};
			const first = await reopenTransferFromPanel(base);
			expect(first).toMatchObject({ ok: false, status: 409 });
			expect(first.message).toMatch(/No hay lugar/);
			expect(first.needsConfirmation?.limits).toEqual([
				expect.objectContaining({ kind: 'capacity', capacity: 3, before: 2, after: 4, over: 1 })
			]);
			expect((await getOrder(t.db, o.id))?.status).toBe('cancelled');
			expect((await reopenTransferFromPanel({ ...base, override: 'si' })).status).toBe(409);
			expect(await audit()).toEqual([{ action: 'transfer.cancel', target_id: o.id }]);

			const r = await reopenTransferFromPanel({ ...base, override: first.needsConfirmation?.key });
			expect(r).toMatchObject({ ok: true });
			expect((await getOrder(t.db, o.id))?.status).toBe('awaiting_transfer');
			expect(await audit()).toEqual([
				{ action: 'transfer.cancel', target_id: o.id },
				{ action: 'transfer.reopen', target_id: o.id },
				{ action: 'tickets.override', target_id: o.id }
			]);
		});

		/** Un código inventado de `maxUses` usos, puesto en la orden `id`. */
		async function withCode(/** @type {string} */ id, /** @type {number} */ maxUses) {
			await t.db
				.prepare(
					`INSERT INTO discount_codes (code, kind, value, max_uses, created_at, created_by)
					VALUES ('PRUEBA', 'percent', 10, ?1, 0, 'admin-prueba')
					ON CONFLICT (code) DO NOTHING`
				)
				.bind(maxUses)
				.run();
			await t.db.prepare("UPDATE orders SET discount_code = 'PRUEBA' WHERE id = ?").bind(id).run();
		}

		it('con código sin usos libres: no la reabre; con la clave del aviso sí, y lo anota', async () => {
			const o = await reserve('fiesta-a', { method: 'transferencia' });
			await withCode(o.id, 1);
			await reject(o.id);
			// Mientras estuvo rechazada, otra compra usó el único uso del código.
			const other = await reserve('fiesta-a', { now: NOW + 2000 });
			await withCode(other.id, 1);
			await approve(other.id);
			const base = {
				db: t.db,
				locals,
				by: 'admin-prueba',
				orderId: o.id,
				holdMs: HOLD,
				now: NOW + 3000
			};
			const first = await reopenTransferFromPanel(base);
			expect(first).toMatchObject({ ok: false, status: 409 });
			expect(first.message).toMatch(/con su código/);
			expect(first.needsConfirmation?.limits).toEqual([
				expect.objectContaining({ kind: 'discount_uses', maxUses: 1, before: 1, after: 2 })
			]);
			expect((await getOrder(t.db, o.id))?.status).toBe('cancelled');
			expect(await audit()).toEqual([{ action: 'transfer.cancel', target_id: o.id }]);

			const r = await reopenTransferFromPanel({ ...base, override: first.needsConfirmation?.key });
			expect(r).toMatchObject({ ok: true });
			expect((await getOrder(t.db, o.id))?.status).toBe('awaiting_transfer');
			expect(await audit()).toEqual([
				{ action: 'transfer.cancel', target_id: o.id },
				{ action: 'transfer.reopen', target_id: o.id },
				{ action: 'tickets.override', target_id: o.id }
			]);
			const { results } = await t.db
				.prepare("SELECT summary FROM admin_audit WHERE action = 'tickets.override'")
				.all();
			expect(String(results[0].summary)).toMatch(/usos del código PRUEBA \+1 \(2 \/ 1\)/);
		});

		it('la sentencia también frena el código sin usos libres (si se usó entre el control y el cambio)', async () => {
			const { reopenTransfer } = await import('$lib/server/tickets/orders.js');
			const o = await reserve('fiesta-a', { method: 'transferencia' });
			await withCode(o.id, 1);
			await reject(o.id);
			const other = await reserve('fiesta-a', { now: NOW + 2000 });
			await withCode(other.id, 1);
			await approve(other.id);
			const input = {
				orderId: o.id,
				eventSlug: 'fiesta-a',
				capacity: 3,
				by: 'admin-prueba',
				holdMs: HOLD,
				now: NOW + 3000
			};
			expect((await reopenTransfer(t.db, input)).result).toBe('no-capacity');
			expect((await reopenTransfer(t.db, { ...input, override: true })).result).toBe('reopened');
		});

		it('con código y usos libres, o sin código, como siempre', async () => {
			const o = await reserve('fiesta-a', { method: 'transferencia' });
			await withCode(o.id, 2);
			await reject(o.id);
			const other = await reserve('fiesta-a', { now: NOW + 2000 });
			await withCode(other.id, 2);
			await approve(other.id);
			const base = { db: t.db, locals, by: 'admin-prueba', holdMs: HOLD, now: NOW + 3000 };
			expect(await reopenTransferFromPanel({ ...base, orderId: o.id })).toMatchObject({ ok: true });
			const plain = await reserve('fiesta-a', { method: 'transferencia', now: NOW + 4000 });
			await reject(plain.id, NOW + 4500);
			expect(
				await reopenTransferFromPanel({ ...base, orderId: plain.id, now: NOW + 5000 })
			).toMatchObject({ ok: true });
			expect((await audit()).map((a) => a.action)).not.toContain('tickets.override');
		});

		it('solo transferencias rechazadas, y del evento pedido', async () => {
			const pending = await reserve('fiesta-a', { method: 'transferencia' });
			const base = { db: t.db, locals, by: 'x', holdMs: HOLD, now: NOW + 1000 };
			expect(await reopenTransferFromPanel({ ...base, orderId: pending.id })).toMatchObject({
				ok: true // ya estaba esperando: nada que hacer
			});
			const approved = await reserve('fiesta-a', { method: 'transferencia' });
			await approve(approved.id);
			expect(await reopenTransferFromPanel({ ...base, orderId: approved.id })).toMatchObject({
				ok: false,
				status: 409
			});
			const mp = await reserve('fiesta-a');
			expect(await reopenTransferFromPanel({ ...base, orderId: mp.id })).toMatchObject({
				status: 404
			});
			const other = await reserve('fiesta-b', { method: 'transferencia' });
			await reject(other.id);
			expect(
				await reopenTransferFromPanel({ ...base, orderId: other.id, eventSlug: 'fiesta-a' })
			).toMatchObject({ status: 404 });
			expect((await getOrder(t.db, other.id))?.status).toBe('cancelled');
			expect((await audit()).map((a) => a.action)).toEqual(['transfer.cancel']);
		});
	});
});
