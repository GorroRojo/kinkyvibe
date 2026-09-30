import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import {
	capacityLimit,
	checkOverride,
	closedLimit,
	limitMessage,
	logOverride,
	maxPerPurchaseLimit,
	noDoorLimit,
	overrideKey,
	readOverride
} from './overrides.js';

const GENERAL = { id: 'general', name: 'General', capacity: 50 };

describe('límites', () => {
	it('cupo: nada si entra o si el tipo no tiene cupo; si no, cuánto se pasa', () => {
		expect(capacityLimit(GENERAL, 48, 2)).toBeNull();
		expect(capacityLimit({ ...GENERAL, capacity: null }, 500, 10)).toBeNull();
		expect(capacityLimit(GENERAL, 49, 3)).toEqual({
			kind: 'capacity',
			type: 'general',
			typeName: 'General',
			capacity: 50,
			before: 49,
			after: 52,
			over: 2
		});
		// Cupo 0 (tipo cerrado a mano): cualquier entrada se pasa.
		expect(capacityLimit({ ...GENERAL, capacity: 0 }, 0, 1)).toMatchObject({ over: 1 });
	});

	it('máximo por compra, venta cerrada y solo anticipadas', () => {
		expect(maxPerPurchaseLimit(10, 10)).toBeNull();
		expect(maxPerPurchaseLimit(12, 10)).toEqual({
			kind: 'max_per_purchase',
			max: 10,
			quantity: 12,
			over: 2
		});
		expect(closedLimit({ open: true })).toBeNull();
		// "Todavía no abrió" no es un límite (invitaciones antes de abrir la venta).
		expect(closedLimit({ open: false, reason: 'notyet' })).toBeNull();
		expect(closedLimit({ open: false, reason: 'closed' })).toEqual({
			kind: 'closed',
			reason: 'closed'
		});
		expect(closedLimit({ open: true }, { name: 'Anticipada' })).toEqual({
			kind: 'closed',
			reason: 'type_closed',
			typeName: 'Anticipada'
		});
		expect(closedLimit({ open: false, reason: 'cancelled' })).toMatchObject({
			reason: 'cancelled'
		});
		expect(closedLimit({ open: false, reason: 'soldout' })).toMatchObject({ reason: 'soldout' });
		expect(noDoorLimit({ door: { on: false } })).toEqual({ kind: 'no_door' });
		expect(noDoorLimit({ door: { on: true } })).toBeNull();
		expect(noDoorLimit({ door: null })).toBeNull();
		expect(noDoorLimit(null)).toBeNull();
	});

	it('mensajes en castellano con cuánto se pasa', () => {
		expect(limitMessage(/** @type {any} */ (capacityLimit(GENERAL, 50, 2)))).toBe(
			'El cupo de «General» ya está completo (50 / 50): quedarían 52 / 50, 2 entradas de más.'
		);
		expect(limitMessage(/** @type {any} */ (capacityLimit(GENERAL, 49, 2)))).toBe(
			'Se pasa del cupo de «General»: quedarían 51 / 50, 1 entrada de más.'
		);
		expect(limitMessage(/** @type {any} */ (maxPerPurchaseLimit(12, 10)))).toContain(
			'el máximo por compra es 10'
		);
		expect(limitMessage({ kind: 'no_door' })).toBe(
			'Este evento es solo anticipadas: no tiene entradas en la puerta.'
		);
	});
});

describe('confirmación', () => {
	const over = capacityLimit(GENERAL, 50, 2);
	const max = maxPerPurchaseLimit(12, 10);

	it('sin límites pasados sigue sin override', () => {
		expect(checkOverride([null, null], '')).toEqual({ ok: true, override: false, limits: [] });
	});

	it('con límites y sin confirmación pide confirmar, con la lista y la clave', () => {
		const r = checkOverride([over, null, max], '');
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.needsConfirmation.key).toBe(overrideKey(/** @type {any} */ ([max, over])));
		expect(r.needsConfirmation.limits.map((l) => l.kind)).toEqual(['capacity', 'max_per_purchase']);
		expect(r.needsConfirmation.limits[0].message).toContain('52 / 50');
	});

	it('con la clave exacta sigue con override; con otra (algo cambió) vuelve a preguntar', () => {
		const key = overrideKey(/** @type {any} */ ([over, max]));
		expect(checkOverride([over, max], key)).toMatchObject({ ok: true, override: true });
		// Se vendió otra entrada entre el diálogo y la confirmación: 53 / 50.
		const worse = capacityLimit(GENERAL, 51, 2);
		expect(checkOverride([worse, max], key).ok).toBe(false);
		// Un "sí" cualquiera no alcanza.
		expect(checkOverride([over], '1').ok).toBe(false);
		expect(checkOverride([over], 'true').ok).toBe(false);
	});

	it('readOverride lee el campo del formulario (vacío si no está)', () => {
		const f = new FormData();
		expect(readOverride(f)).toBe('');
		f.set('override', 'capacity:general:52/50');
		expect(readOverride(f)).toBe('capacity:general:52/50');
	});
});

describe('logOverride', () => {
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

	it('anota qué límite y por cuánto', async () => {
		const limits = /** @type {any[]} */ ([capacityLimit(GENERAL, 50, 2), { kind: 'no_door' }]);
		const ok = await logOverride(
			t.db,
			{ user: { id: 1, login: 'admin-de-prueba' } },
			{ event: 'fiesta-de-prueba', what: 'venta en la puerta', orderId: 'ord-1', limits }
		);
		expect(ok).toBe(true);
		const [e] = await listAudit(t.db);
		expect(e).toMatchObject({
			action: 'tickets.override',
			targetType: 'order',
			targetId: 'ord-1',
			actorLogin: 'admin-de-prueba',
			summary:
				'Pasó límites de entradas (venta en la puerta): cupo de «General» +2 (52 / 50); evento solo anticipadas'
		});
		expect(/** @type {any} */ (e.detail).overrides[0]).toMatchObject({
			kind: 'capacity',
			capacity: 50,
			after: 52,
			over: 2
		});
	});

	it('sin límites no anota nada', async () => {
		expect(await logOverride(t.db, null, { event: 'x', what: 'y', limits: [] })).toBe(false);
		expect(await listAudit(t.db)).toEqual([]);
	});
});
