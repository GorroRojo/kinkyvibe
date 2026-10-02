/**
 * Ficha del evento, pestaña Transferencias: "Deshacer rechazo" de una transferencia cancelada. Solo admins; solo si
 * todavía hay lugar en su tipo (si no, el aviso para pasar el límite); queda en el registro.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/tickets/events.js', async (importOriginal) => ({
	.../** @type {any} */ (await importOriginal()),
	getEventTickets: async () => ({
		title: 'Fiesta de prueba',
		types: [{ id: 'general', name: 'General', price: 5000, capacity: 2 }]
	})
}));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { TRANSFER_HOLD_MS, getOrder, reserveOrder } from '$lib/server/tickets/orders.js';
import { actions } from './+page.server.js';

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

const SLUG = 'fiesta-de-prueba';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/** @param {'transferencia' | 'mercadopago'} method */
async function reserve(method) {
	return /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 5000, capacity: 2 },
			quantity: 2,
			holders: [
				{ name: 'Persona Uno', pronouns: 'elle' },
				{ name: 'Persona Dos', pronouns: 'elle' }
			],
			buyer: { name: 'Persona Uno', email: `p${Math.random()}@example.com`, dni: '30111222' },
			method,
			holdMs: TRANSFER_HOLD_MS
		})
	).order;
}

/** Una transferencia de 2 rechazada desde el panel. */
async function rejected() {
	const o = await reserve('transferencia');
	await t.db
		.prepare("UPDATE orders SET status = 'cancelled', confirmed_by = 'admin-prueba' WHERE id = ?")
		.bind(o.id)
		.run();
	return o;
}

/**
 * @param {'reopen'} name
 * @param {Record<string, string>} fields
 * @param {any} locals
 */
async function act(name, fields, locals) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { slug: SLUG },
		locals,
		platform: t.platform,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost/admin/eventos/${SLUG}/transferencias`),
		fetch: async () => new Response('{}', { status: 503 })
	};
	try {
		return /** @type {any} */ (await /** @type {any} */ (actions)[name](event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

describe('deshacer el rechazo de una transferencia', () => {
	it('no admin: 403, ni mandando override', async () => {
		const o = await rejected();
		expect(
			await act('reopen', { order: o.id, override: 'capacity:general:2/2' }, notAdmin)
		).toEqual({ thrown: 403 });
		expect((await getOrder(t.db, o.id))?.status).toBe('cancelled');
		expect(await listAudit(t.db)).toEqual([]);
	});

	it('con lugar: vuelve a esperar comprobante con la reserva renovada y queda en el registro', async () => {
		const o = await rejected();
		const before = Date.now();
		const r = await act('reopen', { order: o.id }, admin);
		expect(r.transfer).toMatchObject({ ok: true });
		const fresh = await getOrder(t.db, o.id);
		expect(fresh?.status).toBe('awaiting_transfer');
		expect(fresh?.expires_at).toBeGreaterThanOrEqual(before + TRANSFER_HOLD_MS);
		const entries = await listAudit(t.db);
		expect(entries.map((e) => e.action)).toEqual(['transfer.reopen']);
		expect(entries[0].actorLogin).toBe(ADMINS[0].login);
	});

	it('sin lugar: no la reabre, explica por qué y ofrece pasar el límite', async () => {
		const o = await rejected();
		const other = await reserve('mercadopago');
		await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?").bind(other.id).run();
		const first = await act('reopen', { order: o.id }, admin);
		expect(first.status).toBe(409);
		expect(first.data.transfer.message).toMatch(/No hay lugar/);
		expect(first.data.transfer.action).toBe('reopen');
		const nc = first.data.transfer.needsConfirmation;
		expect(nc.limits[0]).toMatchObject({ kind: 'capacity', capacity: 2, after: 4, over: 2 });
		expect((await getOrder(t.db, o.id))?.status).toBe('cancelled');
		expect(await listAudit(t.db)).toEqual([]);

		const ok = await act('reopen', { order: o.id, override: nc.key }, admin);
		expect(ok.transfer).toMatchObject({ ok: true });
		expect((await getOrder(t.db, o.id))?.status).toBe('awaiting_transfer');
		expect((await listAudit(t.db)).map((e) => e.action).sort()).toEqual([
			'tickets.override',
			'transfer.reopen'
		]);
	});
});
