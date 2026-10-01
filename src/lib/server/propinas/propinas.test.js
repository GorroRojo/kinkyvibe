/**
 * Propinas en D1: estados que cambia el webhook, preferencia de MP y números del panel.
 * Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { toCsv } from '$lib/admin/csv.js';
import {
	TIP_CSV_COLUMNS,
	TIP_RECHECK_LIMIT,
	applyTipPayment,
	buildTipPreference,
	createTip,
	getTip,
	isTipReference,
	listTips,
	recheckTip,
	tipIdFromReference,
	tipReference,
	tipStatusFromPayment,
	tipSummary
} from './index.js';

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

const NOW = Date.parse('2026-10-01T15:00:00Z');

/** @param {Partial<{ amount: number, slug: string, category: 'material' | 'calendario', message: string | null, now: number }>} [o] */
function newTip(o = {}) {
	return createTip(
		t.db,
		{
			amount: o.amount ?? 2000,
			message: o.message ?? null,
			category: o.category ?? 'material',
			slug: o.slug ?? 'guia-de-prueba'
		},
		{ now: o.now ?? NOW }
	);
}

/**
 * Un pago como lo devuelve la API de MP.
 * @param {{ id: string }} tip
 * @param {Partial<import('$lib/server/tickets/orders.js').MPPayment>} [o]
 */
function payment(tip, o = {}) {
	return {
		id: 111,
		status: 'approved',
		external_reference: tipReference(tip.id),
		transaction_amount: 2000,
		currency_id: 'ARS',
		...o
	};
}

describe('referencias', () => {
	it('`propina:<uuid>` se reconoce; las órdenes no', () => {
		const id = '11111111-1111-4111-8111-111111111111';
		expect(tipReference(id)).toBe(`propina:${id}`);
		expect(isTipReference(`propina:${id}`)).toBe(true);
		expect(tipIdFromReference(`propina:${id}`)).toBe(id);
		expect(isTipReference(id)).toBe(false);
		expect(tipIdFromReference('propina:no-es-uuid')).toBeNull();
		expect(tipIdFromReference(null)).toBeNull();
	});

	it('estados de MP → estado de la propina', () => {
		expect(tipStatusFromPayment('approved')).toBe('approved');
		expect(tipStatusFromPayment('rejected')).toBe('rejected');
		expect(tipStatusFromPayment('cancelled')).toBe('rejected');
		expect(tipStatusFromPayment('refunded')).toBe('refunded');
		expect(tipStatusFromPayment('charged_back')).toBe('refunded');
		expect(tipStatusFromPayment('in_process')).toBeNull();
		expect(tipStatusFromPayment('raro')).toBeNull();
	});
});

describe('buildTipPreference', () => {
	it('un ítem por el monto, sin datos de la persona, vuelve a /propinas/<id>/gracias', async () => {
		const tip = await newTip({ amount: 5000 });
		const p = buildTipPreference({ tip, postTitle: 'Guía de prueba', origin: 'https://kv.test' });
		expect(p.items).toEqual([
			{
				id: 'propina',
				title: 'Propina para KinkyVibe · Guía de prueba',
				quantity: 1,
				unit_price: 5000,
				currency_id: 'ARS'
			}
		]);
		expect(p).not.toHaveProperty('payer');
		expect(p).not.toHaveProperty('notification_url');
		expect(p.external_reference).toBe(`propina:${tip.id}`);
		const back = `https://kv.test/propinas/${tip.id}/gracias`;
		expect(p.back_urls).toEqual({ success: back, failure: back, pending: back });
		expect(p.binary_mode).toBe(true);
		expect(p.statement_descriptor).toBe('KINKYVIBE');
		expect(p.expiration_date_from).toBe('2026-10-01T12:00:00.000-03:00');
		expect(p.expiration_date_to).toBe('2026-10-02T12:00:00.000-03:00');
	});
});

describe('applyTipPayment (estados que cambia el webhook)', () => {
	it('se crea pendiente y un pago aprobado la aprueba (una sola vez)', async () => {
		const tip = await newTip({ message: 'Gracias por la guía' });
		expect(tip).toMatchObject({ status: 'pending', amount: 2000, message: 'Gracias por la guía' });
		const first = await applyTipPayment(t.db, payment(tip), { now: NOW + 1000 });
		expect(first).toMatchObject({ outcome: 'updated', newlyApproved: true });
		expect(first.tip).toMatchObject({
			status: 'approved',
			mp_payment_id: '111',
			approved_at: NOW + 1000
		});
		const again = await applyTipPayment(t.db, payment(tip), { now: NOW + 2000 });
		expect(again).toMatchObject({ outcome: 'unchanged', newlyApproved: false });
		expect((await getTip(t.db, tip.id))?.approved_at).toBe(NOW + 1000);
	});

	it('rechazado → aprobado (otro intento) → reembolsado por el mismo pago; reembolsada es final', async () => {
		const tip = await newTip();
		expect(
			(await applyTipPayment(t.db, payment(tip, { id: 1, status: 'rejected' }))).tip?.status
		).toBe('rejected');
		expect(
			(await applyTipPayment(t.db, payment(tip, { id: 2, status: 'approved' }))).tip?.status
		).toBe('approved');
		// Un reembolso de OTRO pago no toca una propina aprobada.
		expect((await applyTipPayment(t.db, payment(tip, { id: 1, status: 'refunded' }))).outcome).toBe(
			'unchanged'
		);
		expect(
			(await applyTipPayment(t.db, payment(tip, { id: 2, status: 'refunded' }))).tip?.status
		).toBe('refunded');
		const after = await applyTipPayment(t.db, payment(tip, { id: 3, status: 'approved' }));
		expect(after).toMatchObject({ outcome: 'unchanged' });
		expect(after.tip?.status).toBe('refunded');
	});

	it('cancelado = rechazado; pendiente no cambia nada', async () => {
		const tip = await newTip();
		expect((await applyTipPayment(t.db, payment(tip, { status: 'in_process' }))).outcome).toBe(
			'unchanged'
		);
		expect((await applyTipPayment(t.db, payment(tip, { status: 'cancelled' }))).tip?.status).toBe(
			'rejected'
		);
	});

	it('otro monto u otra moneda: no se aplica', async () => {
		const tip = await newTip();
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect((await applyTipPayment(t.db, payment(tip, { transaction_amount: 20 }))).outcome).toBe(
			'mismatch'
		);
		expect((await applyTipPayment(t.db, payment(tip, { currency_id: 'USD' }))).outcome).toBe(
			'mismatch'
		);
		spy.mockRestore();
		expect((await getTip(t.db, tip.id))?.status).toBe('pending');
	});

	it('propina desconocida', async () => {
		const res = await applyTipPayment(t.db, {
			id: 9,
			status: 'approved',
			external_reference: 'propina:22222222-2222-4222-8222-222222222222',
			transaction_amount: 2000,
			currency_id: 'ARS'
		});
		expect(res.outcome).toBe('unknown-tip');
	});
});

describe('recheckTip (página de gracias)', () => {
	it('si sigue pendiente le pregunta a MP por la referencia y aplica el pago', async () => {
		const tip = await newTip();
		const findPaymentByOrder = vi.fn(async () => payment(tip));
		const gateway = /** @type {any} */ ({ findPaymentByOrder });
		const res = await recheckTip({ db: t.db, gateway, tip, now: NOW });
		expect(findPaymentByOrder).toHaveBeenCalledWith(`propina:${tip.id}`);
		expect(res.status).toBe('approved');
		// Ya aprobada: no vuelve a preguntar.
		await recheckTip({ db: t.db, gateway, tip: res, now: NOW });
		expect(findPaymentByOrder).toHaveBeenCalledTimes(1);
	});

	it(`a lo sumo ${TIP_RECHECK_LIMIT.limit} consultas por ventana`, async () => {
		const tip = await newTip();
		const findPaymentByOrder = vi.fn(async () => null);
		const gateway = /** @type {any} */ ({ findPaymentByOrder });
		for (let i = 0; i < TIP_RECHECK_LIMIT.limit + 3; i++) {
			await recheckTip({ db: t.db, gateway, tip, now: NOW });
		}
		expect(findPaymentByOrder).toHaveBeenCalledTimes(TIP_RECHECK_LIMIT.limit);
	});
});

describe('datos de demo (scripts/demo/n3-propinas.sql)', () => {
	it('se cargan sobre la base migrada y se ven en el resumen', async () => {
		const { readFile } = await import('node:fs/promises');
		const { unstable_splitSqlQuery } = await import('wrangler');
		const sql = await readFile('scripts/demo/n3-propinas.sql', 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		await t.db.batch(statements.map((s) => t.db.prepare(s)));
		const s = await tipSummary(t.db);
		expect(s.count).toBe(4);
		expect(s.total).toBe(9500);
		expect(s.counts).toEqual({ pending: 1, rejected: 1, refunded: 1 });
	});
});

describe('panel: resumen, lista y CSV', () => {
	async function seed() {
		const DAY = 24 * 60 * 60 * 1000;
		const a = await newTip({ amount: 1000, slug: 'guia-a', now: NOW });
		const b = await newTip({ amount: 5000, slug: 'guia-a', now: NOW + DAY });
		const c = await newTip({ amount: 2000, slug: 'fiesta', category: 'calendario', now: NOW });
		const d = await newTip({ amount: 3000, slug: 'guia-b', message: '=HYPERLINK("x")' });
		await newTip({ amount: 700, slug: 'guia-b' }); // queda pendiente
		// 31/10 23:30 en Argentina (en UTC ya sería noviembre): cuenta en octubre.
		await applyTipPayment(t.db, payment(a, { id: 1, transaction_amount: 1000 }), {
			now: Date.parse('2026-11-01T02:30:00Z')
		});
		await applyTipPayment(t.db, payment(b, { id: 2, transaction_amount: 5000 }), {
			now: Date.parse('2026-11-01T03:30:00Z')
		});
		await applyTipPayment(t.db, payment(c, { id: 3, transaction_amount: 2000 }), { now: NOW });
		await applyTipPayment(t.db, payment(d, { id: 4, transaction_amount: 3000 }), { now: NOW });
		await applyTipPayment(
			t.db,
			payment(d, { id: 4, status: 'refunded', transaction_amount: 3000 }),
			{ now: NOW + 5 }
		);
		return { a, b, c, d };
	}

	it('total, por mes (hora de Argentina) y por publicación: solo aprobadas', async () => {
		await seed();
		const s = await tipSummary(t.db);
		expect(s.total).toBe(8000);
		expect(s.count).toBe(3);
		expect(s.counts).toEqual({ pending: 1, rejected: 0, refunded: 1 });
		expect(s.byMonth).toEqual([
			{ month: '2026-11', count: 1, total: 5000 },
			{ month: '2026-10', count: 2, total: 3000 }
		]);
		expect(s.byPost).toEqual([
			{ category: 'material', slug: 'guia-a', count: 2, total: 6000 },
			{ category: 'calendario', slug: 'fiesta', count: 1, total: 2000 }
		]);
	});

	it('la lista deja afuera las pendientes; el CSV las trae, con estado y sin fórmulas', async () => {
		const { d } = await seed();
		const list = await listTips(t.db);
		expect(list).toHaveLength(4);
		expect(list.every((x) => x.status !== 'pending')).toBe(true);
		const all = await listTips(t.db, { includePending: true });
		expect(all).toHaveLength(5);
		const csv = toCsv(all, TIP_CSV_COLUMNS);
		const lines = csv.replace('﻿', '').trim().split('\r\n');
		expect(lines[0]).toBe('id,fecha,aprobada,estado,monto,categoria,publicacion,mensaje,pago_mp');
		expect(lines).toHaveLength(6);
		const row = lines.find((l) => l.startsWith(d.id));
		expect(row).toContain(',Reembolsada,3000,material,guia-b,');
		// El mensaje lo escribe la persona: no se ejecuta como fórmula en la planilla.
		expect(row).toContain(`"'=HYPERLINK(""x"")"`);
		expect(lines.some((l) => l.includes(',Pendiente,700,'))).toBe(true);
	});
});
