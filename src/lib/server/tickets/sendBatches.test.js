/**
 * Envíos masivos en tandas (recordatorios y "Enviar el link a todes"): cada corrida manda como
 * mucho "de a cuántos", nada sale dos veces aunque el cron corra dos veces a la vez, y lo que
 * falla se reintenta hasta 3 veces y después queda para revisar. Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	DEFAULT_MAIL_BATCH_SIZE,
	MAX_MAIL_BATCH_SIZE,
	MIN_MAIL_BATCH_SIZE,
	mailBatchSize,
	parseMailBatchSize
} from './batchSize.js';
import { runMailQueueWith } from './mailQueue.js';
import { applyPayment, issueTicketsStatements, reserveOrder } from './orders.js';
import {
	DEFAULT_REMINDERS,
	failedReminderCounts,
	reminderId,
	retryFailedReminders,
	sendDueReminders
} from './reminders.js';
import { MAX_ATTEMPTS, STALE_CLAIM_MS } from './sendState.js';
import { getSalesSettings, saveSalesSettings, validateSalesSettings } from './settings.js';
import {
	failedStreamLinkCounts,
	pendingStreamLinkRequests,
	requestStreamLinkSend,
	sendStreamLinkBatch,
	setStreamLink,
	streamLinkRecipients
} from './stream.js';

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

const START = Date.parse('2026-12-12T21:00:00-03:00');
const H = 60 * 60 * 1000;
const SLUG = 'fiesta-grande';
const EVENT = { slug: SLUG, start: START, reminders: true, cancelled: false };
// Solo "48 h antes": una orden = un recordatorio.
const H48 = [DEFAULT_REMINDERS[0]];
const NOW = START - 47 * H;
const LINK = 'https://meet.example.com/sala-de-prueba';

/**
 * Una orden aprobada hecha con el flujo de compra de verdad (reserveOrder + applyPayment), una vez
 * por archivo: la plantilla de las órdenes de las pruebas. Ver `orders`.
 *
 * @type {Record<string, unknown>}
 */
let template;
beforeAll(async () => {
	await resetDB(t.db);
	const createdAt = START - 10 * 24 * H;
	const holders = [{ name: 'Persona plantilla', pronouns: 'elle' }];
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug: SLUG,
			type: { id: 'general', price: 1000, capacity: 500 },
			quantity: 1,
			holders,
			buyer: {
				name: 'Persona plantilla',
				pronouns: 'elle',
				email: 'plantilla@example.com',
				dni: '30111222'
			},
			now: createdAt
		})
	);
	const paid = /** @type {any} */ (
		await applyPayment(
			t.db,
			{
				id: 4999,
				status: 'approved',
				external_reference: r.order.id,
				transaction_amount: 1000,
				currency_id: 'ARS'
			},
			{ now: createdAt }
		)
	);
	expect(paid.order).toMatchObject({ status: 'approved', mp_payment_id: '4999' });
	expect(paid.tickets).toHaveLength(1);
	// applyPayment borra `holders` al emitir las entradas; la plantilla los conserva.
	template = { ...paid.order, holders: JSON.stringify(holders) };
});

/**
 * `n` órdenes aprobadas, compradas hace 10 días: copias de la plantilla (columnas y valores que
 * deja el flujo de compra de verdad) con sus entradas emitidas por `issueTicketsStatements`, en un
 * solo batch. Hacer cada compra con reserveOrder + applyPayment son ~10 consultas por orden contra
 * el D1 de miniflare; con la máquina cargada eso solo ya pasaba los 5 s del test.
 *
 * @param {number} n
 * @param {string} [slug]
 */
async function orders(n, slug = SLUG) {
	const out = [];
	/** @type {import('@cloudflare/workers-types').D1PreparedStatement[]} */
	const statements = [];
	for (let i = 0; i < n; i++) {
		const createdAt = START - 10 * 24 * H + i * 1000;
		/** @type {Record<string, unknown>} */
		const row = {
			...template,
			id: crypto.randomUUID(),
			event_slug: slug,
			buyer_name: `Persona ${i}`,
			buyer_email: `persona${i}@example.com`,
			holders: JSON.stringify([{ name: `Persona ${i}`, pronouns: 'elle' }]),
			created_at: createdAt,
			updated_at: createdAt,
			expires_at: createdAt + Number(template.expires_at) - Number(template.created_at),
			mp_payment_id: String(5000 + i + (slug === SLUG ? 0 : 1000))
		};
		const cols = Object.keys(row);
		statements.push(
			t.db
				.prepare(
					`INSERT INTO orders (${cols.join(', ')}) VALUES (${cols.map((_, j) => `?${j + 1}`).join(', ')})`
				)
				.bind(...cols.map((c) => row[c] ?? null)),
			...issueTicketsStatements(t.db, /** @type {any} */ (row))
		);
		out.push(row);
	}
	await t.db.batch(statements);
	return out;
}

/** Un `send` que anota a quién le mandó; falla para los emails de `failFor`. */
function recorder(failFor = new Set()) {
	/** @type {string[]} */
	const sent = [];
	const send = async (/** @type {any} */ o, /** @type {any} */ r) => {
		if (failFor.has(o.buyer_email)) return false;
		sent.push(r ? `${o.buyer_email}:${reminderId(r)}` : o.buyer_email);
		return true;
	};
	return { sent, send };
}

/** @param {string} table */
async function statuses(table) {
	const { results } = await t.db
		.prepare(`SELECT status, attempts FROM ${table} ORDER BY order_id`)
		.all();
	return results;
}

describe('"de a cuántos" (mail_batch_size)', () => {
	it('valida de 5 a 200, vacío = el de por defecto', () => {
		expect(DEFAULT_MAIL_BATCH_SIZE).toBe(40);
		expect(parseMailBatchSize('')).toBe('');
		expect(parseMailBatchSize(' 25 ')).toBe(25);
		expect(parseMailBatchSize(String(MIN_MAIL_BATCH_SIZE))).toBe(5);
		expect(parseMailBatchSize(String(MAX_MAIL_BATCH_SIZE))).toBe(200);
		for (const bad of ['4', '201', '0', '-5', '10.5', 'diez', '1e2']) {
			expect(parseMailBatchSize(bad)).toBeNull();
		}
		expect(mailBatchSize('')).toBe(40);
		expect(mailBatchSize(null)).toBe(40);
		expect(mailBatchSize('roto')).toBe(40);
		expect(mailBatchSize('75')).toBe(75);
	});

	it('se valida y se guarda con los demás ajustes de mails', async () => {
		const bad = /** @type {any} */ (validateSalesSettings({ mail_batch_size: '500' }));
		expect(bad.ok).toBe(false);
		expect(bad.errors.mail_batch_size).toMatch(/de 5 a 200/);
		const ok = /** @type {any} */ (validateSalesSettings({ mail_batch_size: '12' }));
		expect(ok).toEqual({ ok: true, value: { mail_batch_size: '12' } });
		await saveSalesSettings(t.db, ok.value, { by: 'admin-prueba' });
		expect((await getSalesSettings(t.db)).mail_batch_size).toBe('12');
		// Un formulario sin el campo no lo toca.
		const other = /** @type {any} */ (validateSalesSettings({ reply_to_email: 'r@example.com' }));
		expect(other.value).not.toHaveProperty('mail_batch_size');
		// Vacío: se borra (vuelve al de por defecto).
		await saveSalesSettings(t.db, { mail_batch_size: '' }, { by: 'admin-prueba' });
		expect(mailBatchSize((await getSalesSettings(t.db)).mail_batch_size)).toBe(40);
	});
});

describe('recordatorios en tandas', () => {
	it('cada corrida manda como mucho `limit`; la siguiente sigue donde quedó', async () => {
		await orders(7);
		const { sent, send } = recorder();
		const run = () =>
			sendDueReminders(t.db, { events: [EVENT], reminders: H48, now: NOW, limit: 3, send });
		expect(await run()).toEqual({ sent: 3, failed: 0, remaining: 4 });
		expect(await run()).toEqual({ sent: 3, failed: 0, remaining: 1 });
		expect(await run()).toEqual({ sent: 1, failed: 0, remaining: 0 });
		expect(await run()).toEqual({ sent: 0, failed: 0, remaining: 0 });
		expect(sent).toHaveLength(7);
		expect(new Set(sent).size).toBe(7);
		expect((await statuses('reminder_sends')).every((r) => r.status === 'sent')).toBe(true);
	});

	it('dos corridas del cron a la vez: nadie recibe dos veces y entre las dos no pasan del límite cada una', async () => {
		await orders(9);
		const { sent, send } = recorder();
		const run = () =>
			sendDueReminders(t.db, { events: [EVENT], reminders: H48, now: NOW, limit: 4, send });
		const [a, b] = await Promise.all([run(), run()]);
		expect(a.sent).toBeLessThanOrEqual(4);
		expect(b.sent).toBeLessThanOrEqual(4);
		expect(new Set(sent).size).toBe(sent.length);
		// Más corridas duplicadas hasta terminar: cada orden, exactamente una vez.
		for (let i = 0; i < 4; i++) await Promise.all([run(), run()]);
		expect(sent).toHaveLength(9);
		expect(new Set(sent).size).toBe(9);
	});

	it('un envío que falla se reintenta en las próximas corridas, hasta 3 veces; después queda para revisar', async () => {
		await orders(3);
		const failFor = new Set(['persona1@example.com']);
		const { sent, send } = recorder(failFor);
		const run = (/** @type {number} */ now) =>
			sendDueReminders(t.db, { events: [EVENT], reminders: H48, now, limit: 10, send });
		expect(await run(NOW)).toEqual({ sent: 2, failed: 1, remaining: 0 });
		expect(await failedReminderCounts(t.db, [SLUG])).toEqual(new Map());
		expect(await run(NOW + 15 * 60_000)).toEqual({ sent: 0, failed: 1, remaining: 0 });
		expect(await run(NOW + 30 * 60_000)).toEqual({ sent: 0, failed: 1, remaining: 0 });
		expect(MAX_ATTEMPTS).toBe(3);
		// Tercer intento fallido: ya no se reintenta solo.
		expect(await run(NOW + 45 * 60_000)).toEqual({ sent: 0, failed: 0, remaining: 0 });
		expect(await failedReminderCounts(t.db, [SLUG, 'otro'])).toEqual(new Map([[SLUG, 1]]));
		expect(sent).toHaveLength(2);
		// "Reintentar" desde el panel: vuelve a la cola y, si ahora anda, sale.
		failFor.clear();
		expect(await retryFailedReminders(t.db, SLUG)).toBe(1);
		expect(await run(NOW + 60 * 60_000)).toEqual({ sent: 1, failed: 0, remaining: 0 });
		expect(sent).toHaveLength(3);
		expect(await failedReminderCounts(t.db, [SLUG])).toEqual(new Map());
	});

	it('un envío que tira error cuenta como fallido y no corta la tanda', async () => {
		await orders(3);
		/** @type {string[]} */
		const sent = [];
		const send = async (/** @type {any} */ o) => {
			if (o.buyer_email === 'persona0@example.com') throw new Error('Resend caído');
			sent.push(o.buyer_email);
			return true;
		};
		expect(
			await sendDueReminders(t.db, { events: [EVENT], reminders: H48, now: NOW, limit: 10, send })
		).toEqual({ sent: 2, failed: 1, remaining: 0 });
		expect(sent).toEqual(['persona1@example.com', 'persona2@example.com']);
	});

	it('una reserva colgada (el Worker se cortó a la mitad) se retoma después de 10 minutos', async () => {
		const [o] = await orders(1);
		await t.db
			.prepare(
				"INSERT INTO reminder_sends (order_id, reminder_id, sent_at, status, attempts) VALUES (?1, 'h48', ?2, 'sending', 1)"
			)
			.bind(o.id, NOW - 60_000)
			.run();
		const { sent, send } = recorder();
		const run = (/** @type {number} */ now) =>
			sendDueReminders(t.db, { events: [EVENT], reminders: H48, now, limit: 10, send });
		// Recién reservada: otra corrida no la toca.
		expect(await run(NOW)).toEqual({ sent: 0, failed: 0, remaining: 0 });
		expect(sent).toEqual([]);
		expect(await run(NOW + STALE_CLAIM_MS)).toEqual({ sent: 1, failed: 0, remaining: 0 });
		expect(sent).toEqual(['persona0@example.com:h48']);
		expect(await statuses('reminder_sends')).toEqual([{ status: 'sent', attempts: 2 }]);
	});

	it('una reserva colgada que ya usó todos sus intentos pasa a fallida', async () => {
		const [o] = await orders(1);
		await t.db
			.prepare(
				"INSERT INTO reminder_sends (order_id, reminder_id, sent_at, status, attempts) VALUES (?1, 'h48', ?2, 'sending', ?3)"
			)
			.bind(o.id, NOW - STALE_CLAIM_MS - 1, MAX_ATTEMPTS)
			.run();
		const { sent, send } = recorder();
		expect(
			await sendDueReminders(t.db, { events: [EVENT], reminders: H48, now: NOW, limit: 10, send })
		).toEqual({ sent: 0, failed: 0, remaining: 0 });
		expect(sent).toEqual([]);
		expect(await failedReminderCounts(t.db, [SLUG])).toEqual(new Map([[SLUG, 1]]));
	});

	it('los envíos que ya estaban antes de la migración cuentan como enviados', async () => {
		const [o] = await orders(1);
		await t.db
			.prepare("INSERT INTO reminder_sends (order_id, reminder_id, sent_at) VALUES (?1, 'h48', 1)")
			.bind(o.id)
			.run();
		expect(await statuses('reminder_sends')).toEqual([{ status: 'sent', attempts: 1 }]);
		const { sent, send } = recorder();
		await sendDueReminders(t.db, { events: [EVENT], reminders: H48, now: NOW, limit: 10, send });
		expect(sent).toEqual([]);
	});

	it('empieza por el evento más cercano', async () => {
		await orders(2, 'despues');
		await orders(2);
		const later = { ...EVENT, slug: 'despues', start: START + 2 * H };
		/** @type {string[]} */
		const slugs = [];
		const send = async (/** @type {any} */ o) => {
			slugs.push(o.event_slug);
			return true;
		};
		await sendDueReminders(t.db, {
			events: [later, EVENT],
			reminders: H48,
			now: NOW + 3 * H,
			limit: 3,
			send
		});
		expect(slugs).toEqual([SLUG, SLUG, 'despues']);
	});
});

describe('"Enviar el link a todes" en tandas', () => {
	it('el botón manda la primera tanda y el cron sigue hasta terminar', async () => {
		await orders(5);
		await setStreamLink(t.db, { eventSlug: SLUG, link: LINK, by: 'admin-prueba' });
		const { sent, send } = recorder();
		await requestStreamLinkSend(t.db, { eventSlug: SLUG, link: LINK });
		expect(
			await sendStreamLinkBatch(t.db, { eventSlug: SLUG, link: LINK, send, limit: 2 })
		).toEqual({ sent: 2, failed: 0, remaining: 3, gaveUp: 0 });
		expect(await pendingStreamLinkRequests(t.db)).toEqual([{ eventSlug: SLUG, link: LINK }]);
		expect(
			await sendStreamLinkBatch(t.db, { eventSlug: SLUG, link: LINK, send, limit: 2 })
		).toEqual({ sent: 2, failed: 0, remaining: 1, gaveUp: 0 });
		expect(
			await sendStreamLinkBatch(t.db, { eventSlug: SLUG, link: LINK, send, limit: 2 })
		).toEqual({ sent: 1, failed: 0, remaining: 0, gaveUp: 0 });
		// Terminado: el cron ya no lo mira.
		expect(await pendingStreamLinkRequests(t.db)).toEqual([]);
		expect(new Set(sent).size).toBe(5);
		expect(sent).toHaveLength(5);
	});

	it('si el link cambia, el pedido viejo no sigue', async () => {
		await orders(3);
		await setStreamLink(t.db, { eventSlug: SLUG, link: LINK, by: 'admin-prueba' });
		await requestStreamLinkSend(t.db, { eventSlug: SLUG, link: LINK });
		await setStreamLink(t.db, {
			eventSlug: SLUG,
			link: 'https://meet.example.com/otra-sala',
			by: 'admin-prueba'
		});
		expect(await pendingStreamLinkRequests(t.db)).toEqual([]);
	});

	it('quien falló todos los intentos queda para revisar y el botón lo reintenta', async () => {
		await orders(2);
		await setStreamLink(t.db, { eventSlug: SLUG, link: LINK, by: 'admin-prueba' });
		const failFor = new Set(['persona0@example.com']);
		const { sent, send } = recorder(failFor);
		await requestStreamLinkSend(t.db, { eventSlug: SLUG, link: LINK });
		const batch = () => sendStreamLinkBatch(t.db, { eventSlug: SLUG, link: LINK, send, limit: 10 });
		expect(await batch()).toEqual({ sent: 1, failed: 1, remaining: 1, gaveUp: 0 });
		expect(await batch()).toEqual({ sent: 0, failed: 1, remaining: 1, gaveUp: 0 });
		expect(await batch()).toEqual({ sent: 0, failed: 1, remaining: 0, gaveUp: 1 });
		// Sin nadie más en la cola, el pedido se da por terminado (el cron no insiste).
		expect(await pendingStreamLinkRequests(t.db)).toEqual([]);
		expect(await failedStreamLinkCounts(t.db, [SLUG])).toEqual(new Map([[SLUG, 1]]));
		// El botón del evento sigue contándola (y la reintenta).
		expect(await streamLinkRecipients(t.db, SLUG, LINK)).toHaveLength(0);
		expect(await streamLinkRecipients(t.db, SLUG, LINK, { includeFailed: true })).toHaveLength(1);
		failFor.clear();
		await requestStreamLinkSend(t.db, { eventSlug: SLUG, link: LINK });
		expect(await batch()).toEqual({ sent: 1, failed: 0, remaining: 0, gaveUp: 0 });
		expect(sent).toEqual(['persona1@example.com', 'persona0@example.com']);
		expect(await failedStreamLinkCounts(t.db, [SLUG])).toEqual(new Map());
	});
});

describe('corrida del cron (runMailQueueWith)', () => {
	/**
	 * La corrida con los envíos de verdad de reminders.js / stream.js y `send` de prueba.
	 *
	 * @param {(o: any, r?: any) => Promise<boolean>} send
	 * @param {number} [limit]
	 */
	const run = (send, limit) =>
		runMailQueueWith(t.db, {
			limit,
			sendReminders: (limit) =>
				sendDueReminders(t.db, { events: [EVENT], reminders: H48, now: NOW, limit, send }),
			sendStreamLink: ({ eventSlug, link, limit }) =>
				sendStreamLinkBatch(t.db, { eventSlug, link, limit, send: (o) => send(o) })
		});

	it('usa el "de a cuántos" guardado y reparte la tanda: primero recordatorios, después el link', async () => {
		await orders(4);
		await orders(4, 'taller-online');
		await setStreamLink(t.db, { eventSlug: 'taller-online', link: LINK, by: 'admin-prueba' });
		await requestStreamLinkSend(t.db, { eventSlug: 'taller-online', link: LINK });
		await saveSalesSettings(t.db, { mail_batch_size: '5' }, { by: 'admin-prueba' });
		const { sent, send } = recorder();
		const first = await run(send);
		expect(first).toEqual({
			limit: 5,
			reminders: { sent: 4, failed: 0, remaining: 0 },
			streamLinks: { sent: 1, failed: 0, remaining: 3, waitingEvents: 0 }
		});
		const second = await run(send);
		expect(second).toEqual({
			limit: 5,
			reminders: { sent: 0, failed: 0, remaining: 0 },
			streamLinks: { sent: 3, failed: 0, remaining: 0, waitingEvents: 0 }
		});
		expect(sent).toHaveLength(8);
		expect(new Set(sent).size).toBe(8);
	});

	it('sin nada guardado usa 40; si los recordatorios gastan la tanda, el link espera', async () => {
		await orders(3);
		await setStreamLink(t.db, { eventSlug: SLUG, link: LINK, by: 'admin-prueba' });
		await requestStreamLinkSend(t.db, { eventSlug: SLUG, link: LINK });
		const { send } = recorder();
		expect((await run(send)).limit).toBe(40);
		await resetDB(t.db);
		await orders(3);
		await setStreamLink(t.db, { eventSlug: SLUG, link: LINK, by: 'admin-prueba' });
		await requestStreamLinkSend(t.db, { eventSlug: SLUG, link: LINK });
		expect(await run(send, 3)).toEqual({
			limit: 3,
			reminders: { sent: 3, failed: 0, remaining: 0 },
			streamLinks: { sent: 0, failed: 0, remaining: 0, waitingEvents: 1 }
		});
	});
});
