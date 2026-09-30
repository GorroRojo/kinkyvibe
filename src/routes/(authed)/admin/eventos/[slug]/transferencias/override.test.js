/**
 * Ficha del evento, pestaña Transferencias: confirmar una transferencia que llegó tarde cuando ya no hay cupo
 * solo lo puede hacer une admin, y solo después de confirmar en el diálogo (la clave de
 * exactamente ese límite). Queda en el registro de actividad.
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
import { TRANSFER_HOLD_MS, getCounts, getOrder, reserveOrder } from '$lib/server/tickets/orders.js';
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

/** Una transferencia de 2 que venció y, mientras tanto, se vendieron los 2 lugares. */
async function lateTransfer() {
	const long = Date.now() - TRANSFER_HOLD_MS - 60_000;
	/** @param {string} method @param {number} now */
	const reserve = async (method, now) =>
		/** @type {any} */ (
			await reserveOrder(t.db, {
				eventSlug: SLUG,
				type: { id: 'general', price: 5000, capacity: 2 },
				quantity: 2,
				holders: [
					{ name: 'Persona Uno', pronouns: 'elle' },
					{ name: 'Persona Dos', pronouns: 'elle' }
				],
				buyer: { name: 'Persona Uno', email: `p${now}@example.com`, dni: '30111222' },
				method: /** @type {any} */ (method),
				holdMs: TRANSFER_HOLD_MS,
				now
			})
		).order;
	const late = await reserve('transferencia', long);
	const other = await reserve('mercadopago', Date.now());
	await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?").bind(other.id).run();
	return late;
}

/** @param {Record<string, string>} fields @param {any} locals */
async function confirm(fields, locals) {
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
		return /** @type {any} */ (await actions.confirm(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

describe('confirmar una transferencia que pasa el cupo', () => {
	it('no admin: no, ni mandando override', async () => {
		const late = await lateTransfer();
		expect(await confirm({ order: late.id, override: 'capacity:general:4/2' }, notAdmin)).toEqual({
			thrown: 403
		});
		expect((await getOrder(t.db, late.id))?.status).not.toBe('approved');
	});

	it('admin sin confirmar: 409 con cuánto se pasa; con la clave confirma y queda anotado', async () => {
		const late = await lateTransfer();
		const first = await confirm({ order: late.id }, admin);
		expect(first.status).toBe(409);
		const nc = first.data.transfer.needsConfirmation;
		expect(nc.limits[0]).toMatchObject({ kind: 'capacity', capacity: 2, after: 4, over: 2 });
		expect((await getOrder(t.db, late.id))?.status).not.toBe('approved');

		const ok = await confirm({ order: late.id, override: nc.key }, admin);
		expect(ok.transfer).toMatchObject({ ok: true });
		expect((await getOrder(t.db, late.id))?.status).toBe('approved');
		expect((await getCounts(t.db, SLUG)).get('general')?.sold).toBe(4);
		const entries = await listAudit(t.db);
		expect(entries.map((e) => e.action).sort()).toEqual(['tickets.override', 'transfer.confirm']);
		expect(entries.find((e) => e.action === 'tickets.override')?.actorLogin).toBe(ADMINS[0].login);
	});
});
