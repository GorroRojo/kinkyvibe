/**
 * "Mail a compradores": la acción solo la usan admins, valida el texto y es idempotente por envío
 * (mandar el mismo formulario dos veces no le escribe dos veces a nadie).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { actions } from './+page.server.js';

// Evento de prueba del repo que vende entradas (solo en dev/tests, nunca en el sitio publicado).
const EVENT = 'prueba-entradas-2026-12';
const SEND_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ADMIN = { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' };

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

let payment = 1;
/** @param {string} email */
async function approvedOrder(email) {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: { id: 'general', price: 10000, capacity: 30 },
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: 'elle' }],
			buyer: { name: 'Persona de Prueba', pronouns: 'elle', email, dni: '30111222' }
		})
	);
	await applyPayment(t.db, {
		id: payment++,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 10000,
		currency_id: 'ARS'
	});
}

/**
 * @param {{ user?: any, form?: Record<string, string> }} [opts]
 */
function event({ user = ADMIN, form = {} } = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries({
		sendId: SEND_ID,
		subject: 'Cambio de lugar',
		body: 'Nos mudamos a la sala de al lado.',
		...form
	}))
		body.set(k, v);
	const url = new URL(`https://kinkyvibe.ar/admin/eventos/${EVENT}/mail`);
	return /** @type {any} */ ({
		locals: user ? { user, user_token: 't' } : {},
		url,
		params: { slug: EVENT },
		platform: t.platform,
		request: new Request(url.href + '?/send', { method: 'POST', body }),
		fetch: vi.fn(async () => new Response('{}'))
	});
}

/** @param {() => Promise<any>} fn */
async function thrown(fn) {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('no tiró');
}

describe('acción send de Mail a compradores', () => {
	it('sin sesión: al login; sin ser admin: 403. No manda nada', async () => {
		await approvedOrder('a@example.com');
		const anon = await thrown(() => actions.send(event({ user: null })));
		expect(isRedirect(anon)).toBe(true);
		const notAdmin = await thrown(() =>
			actions.send(event({ user: { id: 1, login: 'otra', name: null, avatar_url: '' } }))
		);
		expect(isHttpError(notAdmin) && notAdmin.status).toBe(403);
		const sends = await t.db.prepare('SELECT COUNT(*) AS n FROM event_mail_sends').first();
		expect(sends?.n).toBe(0);
	});

	it('valida asunto, mensaje e id del envío', async () => {
		const empty = /** @type {any} */ (
			await actions.send(event({ form: { subject: '', body: '' } }))
		);
		expect(empty.status).toBe(400);
		expect(Object.keys(empty.data.mail.errors).sort()).toEqual(['body', 'subject']);
		const badId = /** @type {any} */ (await actions.send(event({ form: { sendId: 'x' } })));
		expect(badId.status).toBe(400);
	});

	it('manda una vez a cada persona, y repetir el mismo envío no manda de nuevo', async () => {
		await approvedOrder('a@example.com');
		await approvedOrder('b@example.com');
		const first = /** @type {any} */ (await actions.send(event()));
		expect(first.mail).toMatchObject({ done: true, sent: 2, failed: 0 });
		expect(first.mail.progress).toMatchObject({ total: 2, sent: 2, pending: 0 });
		const again = /** @type {any} */ (await actions.send(event()));
		expect(again.mail).toMatchObject({ done: true, sent: 0 });
		// Registro de actividad: el inicio y el final, una vez cada uno.
		const { results } = await t.db
			.prepare('SELECT action FROM admin_audit WHERE target_id = ?1 ORDER BY id')
			.bind(EVENT)
			.all();
		expect(results.map((r) => r.action)).toEqual(['event.mail', 'event.mail.done']);
	});

	it('el mismo id con otro texto se rechaza (409)', async () => {
		await approvedOrder('a@example.com');
		await actions.send(event());
		const other = /** @type {any} */ (
			await actions.send(event({ form: { subject: 'Otro asunto distinto' } }))
		);
		expect(other.status).toBe(409);
	});
});
