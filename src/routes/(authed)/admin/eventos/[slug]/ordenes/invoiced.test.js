/**
 * Órdenes → casilla «Facturada» (acción `invoiced` de eventActions.js) y la misma acción en
 * Ventas › Compras para facturar: solo admins, en la pestaña solo órdenes de este evento; marca,
 * desmarca y deja registro. D1 de miniflare; evento y personas inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { actions } from './+page.server.js';
import { actions as globalActions, load } from '../../../ventas/facturar/+page.server.js';

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

const SLUG = 'evento-de-prueba';
const admin = { user: { id: ADMINS[0].id, login: ADMINS[0].login }, user_token: 'prueba' };
const notAdmin = { user: { id: 1, login: 'persona-de-prueba' }, user_token: 'prueba' };

/** @param {string} id @param {string} [slug] @param {number} [total] */
async function order(id, slug = SLUG, total = 10000) {
	await t.db
		.prepare(
			`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, fondo_option,
				fondo_amount, fondo_contribution, subtotal, total, buyer_name, buyer_email, status,
				payment_method, channel, created_at, updated_at, expires_at)
			VALUES (?1, ?2, 'general', 1, ?3, 'solidaria', 0, 0, ?3, ?3, 'Persona Inventada',
				'persona@example.com', 'approved', ?4, ?5, 1, 1, 2)`
		)
		.bind(id, slug, total, total ? 'mercadopago' : 'gratis', total ? 'online' : 'manual')
		.run();
}

/**
 * Llama a la acción como SvelteKit; si tira (redirect / error), devuelve `{ thrown }`.
 * @param {any} action
 * @param {Record<string, string>} fields
 * @param {any} [locals]
 */
async function call(action, fields, locals = admin) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	/** @type {any} */
	const event = {
		params: { slug: SLUG },
		platform: t.platform,
		locals,
		request: new Request('http://localhost/x', { method: 'POST', body }),
		url: new URL(`http://localhost/admin/eventos/${SLUG}/ordenes`)
	};
	try {
		return /** @type {any} */ (await action(event));
	} catch (e) {
		return { thrown: /** @type {any} */ (e).status };
	}
}

const invoicedAt = async (/** @type {string} */ id) =>
	(await t.db
		.prepare('SELECT invoiced_at, invoiced_by FROM orders WHERE id = ?1')
		.bind(id)
		.first()) ?? null;

describe('Órdenes: casilla «Facturada»', () => {
	it('marca con el login de le admin y desmarca', async () => {
		await order('o1');
		const on = await call(actions.invoiced, { order: 'o1', invoiced: '1' });
		expect(on.invoiced).toMatchObject({ ok: true, invoicedBy: ADMINS[0].login });
		expect(on.invoiced.invoicedAt).toEqual(expect.any(Number));
		expect(await invoicedAt('o1')).toMatchObject({ invoiced_by: ADMINS[0].login });

		// Casilla sin tildar: el campo no viaja.
		const off = await call(actions.invoiced, { order: 'o1' });
		expect(off.invoiced).toMatchObject({ ok: true, invoicedAt: null, invoicedBy: null });
		expect(await invoicedAt('o1')).toEqual({ invoiced_at: null, invoiced_by: null });

		const log = (await listAudit(t.db)).map((e) => e.action).sort();
		expect(log).toEqual(['order.invoiced', 'order.uninvoiced']);
	});

	it('solo admins', async () => {
		await order('o1');
		const r = await call(actions.invoiced, { order: 'o1', invoiced: '1' }, notAdmin);
		expect(r.thrown).toBeGreaterThanOrEqual(300);
		expect(await invoicedAt('o1')).toMatchObject({ invoiced_at: null });
		const g = await call(globalActions.invoiced, { order: 'o1', invoiced: '1' }, notAdmin);
		expect(g.thrown).toBeGreaterThanOrEqual(300);
		expect(await invoicedAt('o1')).toMatchObject({ invoiced_at: null });
	});

	it('una orden de otro evento no se toca desde esta pestaña', async () => {
		await order('o1', 'otro-evento');
		const r = await call(actions.invoiced, { order: 'o1', invoiced: '1' });
		expect(r.status).toBe(404);
		expect(await invoicedAt('o1')).toMatchObject({ invoiced_at: null });
	});

	it('una cortesía ($ 0) no se puede marcar', async () => {
		await order('gratis', SLUG, 0);
		const r = await call(actions.invoiced, { order: 'gratis', invoiced: '1' });
		expect(r.status).toBe(400);
		expect(r.data.invoiced.message).toBe('Esa orden no tiene un pago para facturar.');
	});
});

describe('Compras para facturar', () => {
	it('lista las de todos los eventos y marca cualquiera', async () => {
		await order('a');
		await order('b', 'otro-evento');
		const page = /** @type {any} */ (
			await load(
				/** @type {any} */ ({
					locals: admin,
					url: new URL('http://localhost/admin/ventas/facturar'),
					platform: t.platform,
					setHeaders: () => {}
				})
			)
		);
		expect(page.total).toBe(2);
		expect(page.groups).toHaveLength(1);
		expect(page.groups[0].orders.map((/** @type {any} */ o) => o.id)).toEqual(['a', 'b']);

		const r = await call(globalActions.invoiced, { order: 'b', invoiced: '1' });
		expect(r.invoiced.ok).toBe(true);
		expect(await invoicedAt('b')).toMatchObject({ invoiced_by: ADMINS[0].login });
	});
});
