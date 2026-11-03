/**
 * La pausa de emergencia de los mails (`MAILS_PAUSED`, $lib/server/emergencia.js) en la pestaña
 * Mails de la ficha del evento: «Mail a compradores» no empieza ni sigue ningún envío (el texto y
 * el avance vuelven al formulario, y después de la pausa sigue el mismo envío sin repetirle a
 * nadie), y «Avisar a les compradores» deja el envío pedido sin mandar (lo sigue el cron después).
 * D1 de miniflare; personas inventadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const envVars = vi.hoisted(() => /** @type {Record<string, string>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env: envVars }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { runImport } from '$lib/server/contenido/importer.js';
import { seedFiles } from '$lib/server/semilla/testing.js';
import { setContentDB } from '$lib/server/contenido/repo.js';
import { dateChangeOffer, recordDateChange } from '$lib/server/tickets/dateChange.js';
import { PAUSED_REQUESTED_MESSAGE } from '$lib/server/admin/eventActions.js';
import { actions } from './+page.server.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

// Evento de prueba de la semilla que vende entradas (solo en dev/tests, nunca en el sitio publicado).
const EVENT = 'prueba-entradas-2026-12';
const SEND_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const ADMIN = { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' };
const NOW = Date.parse('2026-10-01T12:00Z');

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
const source = (() => {
	const f = seedFiles('calendario').find((x) => x.legacySlug === EVENT);
	if (!f) throw new Error(`La semilla no tiene ${EVENT}`);
	return { raw: f.raw, meta: f.meta ?? {} };
})();

beforeEach(async () => {
	await resetDB(t.db);
	setContentDB(t.db);
	await runImport(t.db, 'calendario', [{ legacySlug: EVENT, ...source }], { actor: 'prueba' });
	for (const k of Object.keys(envVars)) delete envVars[k];
	for (const level of /** @type {const} */ (['log', 'warn'])) {
		const spy = vi.spyOn(console, level).mockImplementation(() => {});
		onTestFinished(() => spy.mockRestore());
	}
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
 * @param {string} name la acción
 * @param {Record<string, string>} form
 */
function event(name, form) {
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.set(k, v);
	const url = new URL(`https://kinkyvibe.ar/admin/eventos/${EVENT}/mail`);
	return /** @type {any} */ ({
		locals: { user: ADMIN, user_token: 't' },
		url,
		params: { slug: EVENT },
		platform: t.platform,
		request: new Request(`${url.href}?/${name}`, { method: 'POST', body }),
		fetch: vi.fn(async () => new Response('{}'))
	});
}

const mailForm = {
	sendId: SEND_ID,
	subject: 'Cambio de lugar',
	body: 'Nos mudamos a la sala de al lado.'
};

/** @param {string} table */
const count = async (table) =>
	Number((await t.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first())?.n ?? 0);

describe('«Mail a compradores» con MAILS_PAUSED', () => {
	it('no empieza el envío: 503, el texto vuelve al formulario y nada sale', async () => {
		await approvedOrder('a@example.com');
		envVars.MAILS_PAUSED = '1';
		const r = /** @type {any} */ (await actions.send(event('send', mailForm)));
		expect(r.status).toBe(503);
		expect(r.data.mail.ok).toBe(false);
		expect(r.data.mail.message).toContain('MAILS_PAUSED');
		expect(r.data.mail.values).toEqual({ subject: mailForm.subject, body: mailForm.body });
		expect(r.data.mail.progress).toBeUndefined();
		expect(await count('event_mail_sends')).toBe(0);
		expect(await count('event_mail_recipients')).toBe(0);

		delete envVars.MAILS_PAUSED;
		const after = /** @type {any} */ (await actions.send(event('send', mailForm)));
		expect(after.mail).toMatchObject({ done: true, sent: 1 });
	});

	it('un envío empezado no sigue en la pausa; después sigue sin repetirle a nadie', async () => {
		await approvedOrder('a@example.com');
		const first = /** @type {any} */ (await actions.send(event('send', mailForm)));
		expect(first.mail).toMatchObject({ done: true, sent: 1 });
		await approvedOrder('b@example.com');

		envVars.MAILS_PAUSED = 'Se mandó mal un aviso';
		const paused = /** @type {any} */ (await actions.send(event('send', mailForm)));
		expect(paused.status).toBe(503);
		expect(paused.data.mail).toMatchObject({
			id: SEND_ID,
			done: false,
			progress: { total: 2, sent: 1, pending: 1 }
		});
		expect(await count('event_mail_recipients')).toBe(1);

		delete envVars.MAILS_PAUSED;
		const after = /** @type {any} */ (await actions.send(event('send', mailForm)));
		expect(after.mail).toMatchObject({ done: true, sent: 1 });
		expect(after.mail.progress).toMatchObject({ total: 2, sent: 2, pending: 0 });
	});
});

describe('«Avisar a les compradores» con MAILS_PAUSED', () => {
	it('queda pedido sin mandar; sin la pausa, sale', async () => {
		await approvedOrder('a@example.com');
		await approvedOrder('b@example.com');
		const c = /** @type {any} */ (
			await recordDateChange(t.db, {
				eventSlug: EVENT,
				before: { start: '2026-12-05T21:00-03:00', end: '2026-12-06T02:00-03:00' },
				after: { start: '2026-12-12T21:00-03:00', end: '2026-12-13T02:00-03:00' },
				by: 'admin',
				now: Date.now() + 1000
			})
		);
		envVars.MAILS_PAUSED = '1';
		const r = /** @type {any} */ (
			await actions.dateChangeSend(event('dateChangeSend', { version: String(c.version) }))
		);
		expect(r.status).toBe(503);
		expect(r.data.dateChange).toEqual({ ok: false, message: PAUSED_REQUESTED_MESSAGE });
		expect(await count('date_change_sends')).toBe(0);
		// Quedó pedido: el cron lo manda cuando se saca la pausa.
		expect(await dateChangeOffer(t.db, EVENT, { now: NOW })).toMatchObject({ requested: true });

		delete envVars.MAILS_PAUSED;
		const after = /** @type {any} */ (
			await actions.dateChangeSend(event('dateChangeSend', { version: String(c.version) }))
		);
		expect(after.dateChange.message).toBe('Aviso enviado a 2 personas.');
		expect(await count('date_change_sends')).toBe(2);
	});
});
