/**
 * `/entradas/<orden>/confirmar?k=…`: los links «Confirmar mi reserva» de los mails ya mandados
 * siguen andando (decisión 0031). Muestran hasta cuándo está guardada la reserva y no cambian
 * nada: ni al abrirlos ni si una pestaña vieja manda el formulario. Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { getOrder, reserveOrder } from '$lib/server/tickets/orders.js';
import { confirmToken } from '$lib/server/tickets/safeguards.js';
import { actions, load } from './+page.server.js';

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

/** Una reserva por transferencia de una orden «vieja»: 2 h, como las del paso de confirmar. */
async function oldOrder(holdMs = 2 * 60 * 60 * 1000) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'fiesta-de-prueba',
			type: { id: 'general', price: 5000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona Prueba', pronouns: 'elle' }],
			buyer: { name: 'Persona Prueba', email: 'prueba@example.com', dni: '30111222' },
			method: 'transferencia',
			holdMs
		})
	);
	return r.order;
}

/** @param {string} id @param {string} k */
async function open(id, k) {
	return /** @type {any} */ (
		await load(
			/** @type {any} */ ({
				params: { order: id },
				url: new URL(`http://localhost/entradas/${id}/confirmar?k=${encodeURIComponent(k)}`),
				platform: t.platform
			})
		)
	);
}

describe('/entradas/[order]/confirmar', () => {
	it('un link de un mail viejo muestra hasta cuándo está guardada, sin tocar la reserva', async () => {
		const o = await oldOrder();
		const page = await open(o.id, await confirmToken(t.db, o.id));
		expect(page.order).toEqual({ id: o.id, state: 'held', expiresAt: o.expires_at });
		// La reserva queda igual (no se extiende ni se reescribe).
		expect(await getOrder(t.db, o.id)).toEqual(o);
	});

	it('el formulario de una pestaña vieja no cambia nada', async () => {
		const o = await oldOrder();
		const body = new FormData();
		body.set('k', await confirmToken(t.db, o.id));
		const r = /** @type {any} */ (
			await actions.default(
				/** @type {any} */ ({
					params: { order: o.id },
					request: new Request('http://localhost/x', { method: 'POST', body }),
					platform: t.platform
				})
			)
		);
		expect(r.order).toEqual({ id: o.id, state: 'held', expiresAt: o.expires_at });
		expect(await getOrder(t.db, o.id)).toEqual(o);
	});

	it('vencida: lo dice, sin error', async () => {
		const o = await oldOrder(1);
		await new Promise((resolve) => setTimeout(resolve, 5));
		const page = await open(o.id, await confirmToken(t.db, o.id));
		expect(page.order.state).toBe('expired');
	});

	it('ya pagada: lo dice', async () => {
		const o = await oldOrder();
		await t.db.prepare("UPDATE orders SET status = 'approved' WHERE id = ?1").bind(o.id).run();
		const page = await open(o.id, await confirmToken(t.db, o.id));
		expect(page.order.state).toBe('paid');
	});

	it('un link adulterado (otra firma) sigue sin servir', async () => {
		const o = await oldOrder();
		await expect(open(o.id, 'firma-inventada')).rejects.toMatchObject({ status: 404 });
	});
});
