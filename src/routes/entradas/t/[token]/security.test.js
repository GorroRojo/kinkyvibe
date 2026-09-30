/**
 * Quien tiene el link de una entrada (o el QR) NO puede marcarse el ingreso: el form action
 * `?/checkin` y el botón "Marcar ingreso" son solo para admins.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, getTicketByToken, reserveOrder } from '$lib/server/tickets/orders.js';
import { actions, load } from './+page.server.js';
import Page from './+page.svelte';

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

async function approvedTicket() {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: 'evento-de-prueba',
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: {
				name: 'Persona de Prueba',
				pronouns: 'elle',
				email: 'p@example.com',
				dni: '30111222'
			}
		})
	);
	const { tickets } = await applyPayment(t.db, {
		id: 1,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return tickets[0];
}

/** @param {string} token @param {Partial<App.Locals>} locals */
function event(token, locals) {
	return /** @type {any} */ ({
		params: { token },
		platform: t.platform,
		locals,
		url: new URL(`http://localhost/entradas/t/${token}`),
		request: new Request(`http://localhost/entradas/t/${token}?/checkin`, { method: 'POST' })
	});
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return /** @type {any} */ (e);
	}
	throw new Error('se esperaba que tirara (redirect)');
}

const PERSON = { login: 'alguien-con-la-entrada', name: null, avatar_url: '' };

describe('entrada: el check-in es solo para admins', () => {
	it('sin sesión: redirige a /login y la entrada sigue sin ingresar', async () => {
		const ticket = await approvedTicket();
		const e = await thrown(() => actions.checkin(event(ticket.token, {})));
		expect(e.status).toBe(303);
		expect(e.location).toMatch(/^\/login\?redirectTo=/);
		expect((await getTicketByToken(t.db, ticket.token))?.checked_in_at).toBeNull();
	});

	it('con sesión que no es admin: 403 (no marca nada)', async () => {
		const ticket = await approvedTicket();
		const e = await thrown(() =>
			actions.checkin(event(ticket.token, { user: /** @type {any} */ (PERSON), user_token: 'x' }))
		);
		expect(e.status).toBe(403);
		expect((await getTicketByToken(t.db, ticket.token))?.checked_in_at).toBeNull();
	});

	it('la página no muestra "Marcar ingreso" a quien no es admin', async () => {
		const ticket = await approvedTicket();
		for (const locals of [{}, { user: /** @type {any} */ (PERSON), user_token: 'x' }]) {
			const data = /** @type {any} */ (await load(event(ticket.token, locals)));
			expect(data.isAdmin).toBe(false);
			const { body } = render(Page, { props: { data, form: null } });
			expect(body).toContain('Persona de Prueba');
			expect(body).not.toContain('Marcar ingreso');
			expect(body).not.toContain('?/checkin');
		}
		// Y a une admin sí.
		const admin = /** @type {any} */ (
			await load(
				event(ticket.token, {
					user: /** @type {any} */ ({
						id: 4594048,
						login: 'GorroRojo',
						name: null,
						avatar_url: ''
					}),
					user_token: 'x'
				})
			)
		);
		expect(render(Page, { props: { data: admin, form: null } }).body).toContain('Marcar ingreso');
	});
});
