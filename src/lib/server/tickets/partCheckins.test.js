/**
 * Ingreso por parte en los talleres (./partCheckins.js): con la entrada del taller, cada parte
 * marca su ingreso aparte (sin tocar el de la parte 1, `tickets.checked_in_at`), una vez por
 * parte. Personas y compras inventadas; D1 de miniflare.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { sellAtDoor, ticketWithBuyer } from './door.js';
import { checkIn } from './orders.js';
import {
	applyQueuedPartCheckIns,
	checkInPart,
	overlayPartCheckins,
	partDoorCounts,
	undoPartCheckIn
} from './partCheckins.js';

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

const TALLER = 'taller-de-prueba';
const PARTE = 'taller-de-prueba-parte-2';
const NOW = Date.parse('2026-10-09T23:00:00Z');
const GENERAL = {
	id: 'general',
	name: 'General',
	price: 8000,
	fondo: 0,
	capacity: 10,
	gorra: null
};

/** Entradas del taller sin ingresar (la venta en la puerta las marca: se desmarcan). */
async function tickets(quantity = 2, eventSlug = TALLER) {
	const r = await sellAtDoor(t.db, {
		eventSlug,
		type: GENERAL,
		quantity,
		holders: Array.from({ length: quantity }, (_, i) => ({
			name: `Persona ${i + 1}`,
			pronouns: ''
		})),
		buyer: { name: 'Persona 1', email: 'prueba@example.com', dni: null },
		method: 'efectivo',
		by: 'admin-de-prueba',
		now: NOW
	});
	if (!r.ok) throw new Error('no se pudo vender');
	await t.db.prepare('UPDATE tickets SET checked_in_at = NULL, checked_in_by = NULL').run();
	return r.tickets;
}

describe('ingreso por parte', () => {
	it('marca la parte una vez, sin tocar el ingreso del taller', async () => {
		const [a] = await tickets();
		const first = await checkInPart(t.db, {
			token: a.token,
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'puerta-1',
			now: NOW
		});
		expect(first.result).toBe('ok');
		expect(first.ticket).toMatchObject({ checked_in_at: NOW, checked_in_by: 'puerta-1' });
		const again = await checkInPart(t.db, {
			token: a.token,
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'puerta-2',
			now: NOW + 1000
		});
		expect(again.result).toBe('already');
		// Sigue el primero.
		expect(again.ticket).toMatchObject({ checked_in_at: NOW, checked_in_by: 'puerta-1' });
		// La parte 1 (el taller) no se marcó: se puede marcar aparte, por el camino de siempre.
		const row = await t.db
			.prepare('SELECT checked_in_at FROM tickets WHERE id = ?1')
			.bind(a.id)
			.first();
		expect(row?.checked_in_at).toBeNull();
		expect(
			(await checkIn(t.db, { token: a.token, eventSlug: TALLER, by: 'puerta-1' })).result
		).toBe('ok');
		// Otra parte es otro ingreso.
		const other = await checkInPart(t.db, {
			token: a.token,
			ticketSlug: TALLER,
			partSlug: `${TALLER}-parte-3`,
			by: 'puerta-1',
			now: NOW
		});
		expect(other.result).toBe('ok');
	});

	it('entrada de otro evento, anulada o inválida', async () => {
		const [ajena] = await tickets(1, 'otro-evento');
		const wrong = await checkInPart(t.db, {
			token: ajena.token,
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'puerta-1'
		});
		expect(wrong.result).toBe('wrong-event');
		const [a] = await tickets(1);
		await t.db
			.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?1")
			.bind(a.order_id)
			.run();
		const voided = await checkInPart(t.db, {
			token: a.token,
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'puerta-1'
		});
		expect(voided.result).toBe('void');
		expect(
			(await checkInPart(t.db, { token: 'nada', ticketSlug: TALLER, partSlug: PARTE, by: 'x' }))
				.result
		).toBe('invalid');
		const { results } = await t.db.prepare('SELECT * FROM ticket_part_checkins').all();
		expect(results).toEqual([]);
	});

	it('contadores, deshacer y lo que muestran lista, buscador y compra', async () => {
		const [a, b] = await tickets();
		await checkInPart(t.db, {
			token: a.token,
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'p',
			now: NOW
		});
		expect(await partDoorCounts(t.db, TALLER, PARTE)).toEqual({
			total: 2,
			inside: 1,
			byType: { general: { total: 2, inside: 1 } }
		});
		const rows = await overlayPartCheckins(
			t.db,
			PARTE,
			[
				{ ticketId: a.id, at: 123, by: 'parte-1' },
				{ ticketId: b.id, at: 456, by: 'parte-1' }
			],
			{ id: 'ticketId', at: 'at', by: 'by' }
		);
		expect(rows).toEqual([
			{ ticketId: a.id, at: NOW, by: 'p' },
			{ ticketId: b.id, at: null, by: null }
		]);
		// Deshacer solo desde el taller de la entrada.
		expect(
			await undoPartCheckIn(t.db, { ticketId: a.id, ticketSlug: 'otro', partSlug: PARTE })
		).toBe(false);
		expect(
			await undoPartCheckIn(t.db, { ticketId: a.id, ticketSlug: TALLER, partSlug: PARTE })
		).toBe(true);
		expect((await partDoorCounts(t.db, TALLER, PARTE)).inside).toBe(0);
		// El ingreso de la parte 1 sigue intacto.
		expect((await ticketWithBuyer(t.db, { id: a.id }))?.checked_in_at).toBeNull();
	});

	it('sin conexión: ok, duplicado (mismo celu) y conflicto (otre antes)', async () => {
		const [a, b] = await tickets();
		const resolve = async (/** @type {string} */ raw) => raw;
		const first = await applyQueuedPartCheckIns(t.db, {
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'celu-1',
			now: NOW,
			resolve,
			items: [
				{ id: '1', token: a.token, at: NOW - 60_000 },
				{ id: '2', token: 'nada', at: NOW }
			]
		});
		expect(first.map((r) => r.result)).toEqual(['ok', 'invalid']);
		await checkInPart(t.db, {
			token: b.token,
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'celu-2',
			now: NOW
		});
		const second = await applyQueuedPartCheckIns(t.db, {
			ticketSlug: TALLER,
			partSlug: PARTE,
			by: 'celu-1',
			now: NOW,
			resolve,
			items: [
				{ id: '1', token: a.token, at: NOW - 60_000 },
				{ id: '3', token: b.token, at: NOW - 30_000 }
			]
		});
		expect(second).toEqual([
			{ id: '1', result: 'duplicate', holder: 'Persona 1', at: NOW - 60_000, by: 'celu-1' },
			{ id: '3', result: 'conflict', holder: 'Persona 2', at: NOW, by: 'celu-2' }
		]);
	});
});
