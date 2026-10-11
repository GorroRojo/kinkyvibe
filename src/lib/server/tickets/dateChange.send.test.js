/**
 * El aviso de cambio de fecha como de verdad sale (sendDateChangeEmails): asunto, la fecha nueva
 * y la de antes en hora argentina, el .ics con el MISMO UID y un SEQUENCE más alto que el del
 * mail de las entradas, el link a Google Calendar con la fecha nueva, el link de la transmisión
 * en un evento online, la clave de idempotencia por orden y versión, y que las compras
 * reembolsadas no lo reciben. Lo que se le manda a Resend se captura (no sale nada). D1 de
 * miniflare; eventos y persona inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { setStreamLink } from '$lib/server/tickets/stream.js';
import { recordDateChange, requestDateChangeSend } from '$lib/server/tickets/dateChange.js';
import { textOf } from '$lib/testing/html.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const STREAM = 'https://meet.example/sala-inventada';
const OLD = { start: '2099-11-14T22:00:00-03:00', end: '2099-11-15T03:00:00-03:00' };
const NEW = { start: '2099-11-21T21:00:00-03:00', end: '2099-11-22T02:00:00-03:00' };

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	// El evento ya guardado con la fecha nueva.
	const common = {
		start: '2099-11-21T21:00:00-03:00',
		end: '2099-11-22T02:00:00-03:00',
		status: 'abierto',
		payment_methods: ['mercadopago'],
		tickets: [{ id: 'general', name: 'General', price: 8000, capacity: 10 }]
	};
	/** @type {Record<string, Record<string, any>>} */
	const metas = {
		'evento-de-prueba': {
			...common,
			title: 'Evento de prueba',
			location: 'Calle Falsa 123',
			location_name: 'Lugar Inventado'
		},
		'evento-online-de-prueba': { ...common, title: 'Evento online de prueba', modalidad: 'online' }
	};
	return {
		isValidEventSlug: () => true,
		isTestEventSlug: () => false,
		getEventMeta: async (/** @type {string} */ slug) => metas[slug] ?? null,
		getEventTickets: async (/** @type {string} */ slug, /** @type {any} */ opts) =>
			metas[slug]?.tickets ? parseTicketConfig(metas[slug], opts) : null,
		listTicketedEvents: async () =>
			Object.entries(metas).map(([slug, meta]) => ({ slug, config: parseTicketConfig(meta, {}) }))
	};
});
vi.mock('$env/dynamic/private', () => ({ env: { RESEND_API_KEY: 're_inventada' } }));

const tickets = await import('./index.js');

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
/** @param {string} eventSlug @param {string} [email] */
async function order(eventSlug, email = 'p@example.com') {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email, dni: '30111222' }
		})
	);
	const { order: approved, tickets: list } = await applyPayment(t.db, {
		id: payment++,
		status: 'approved',
		external_reference: r.order.id,
		transaction_amount: 8000,
		currency_id: 'ARS'
	});
	return { order: /** @type {any} */ (approved), tickets: list };
}

function captureFetch() {
	/** @type {any[]} */
	const sent = [];
	/** @type {(string | null)[]} */
	const keys = [];
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			sent.push(JSON.parse(String(init.body)));
			keys.push(new Headers(init.headers).get('Idempotency-Key'));
			return new Response('{"id":"x"}', { status: 200 });
		}
	);
	return { sent, keys, fetch };
}

/** @param {string} b64 */
const fromBase64 = (b64) =>
	new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** El valor de una propiedad del .ics adjunto. @param {any} mail @param {string} name */
function icsProp(mail, name) {
	expect(mail.attachments).toHaveLength(1);
	const line = fromBase64(mail.attachments[0].content)
		.replace(/\r\n[ \t]/g, '')
		.split('\r\n')
		.find((l) => l.startsWith(`${name}:`));
	return line?.slice(name.length + 1);
}

/** El link «Agregar a Google Calendar» del texto plano. @param {any} mail */
function googleUrl(mail) {
	const prefix = 'Agregar a Google Calendar: ';
	const line = String(mail.text)
		.split('\n')
		.find((l) => l.startsWith(prefix));
	expect(line).toBeDefined();
	return new URL(/** @type {string} */ (line).slice(prefix.length));
}

/** Anota el cambio (después de las compras) y lo pide, como el botón. @param {string} slug */
async function changeDate(slug) {
	const change = /** @type {any} */ (
		await recordDateChange(t.db, {
			eventSlug: slug,
			before: OLD,
			after: NEW,
			by: 'admin',
			now: Date.now() + 1000
		})
	);
	await requestDateChangeSend(t.db, { eventSlug: slug, version: change.version, by: 'admin' });
	return change;
}

describe('sendDateChangeEmails', () => {
	it('presencial: la fecha nueva, la de antes y el .ics con el mismo UID y un SEQUENCE más alto', async () => {
		const o = await order('evento-de-prueba');
		const first = captureFetch();
		await tickets.sendOrderEmail({
			db: t.db,
			...o,
			origin: 'https://kv.example',
			fetch: first.fetch
		});
		const change = await changeDate('evento-de-prueba');
		const { sent, keys, fetch } = captureFetch();
		const r = await tickets.sendDateChangeEmails({
			db: t.db,
			change,
			origin: 'https://kv.example',
			fetch
		});
		expect(r).toMatchObject({ sent: 1, failed: 0, remaining: 0 });
		expect(sent).toHaveLength(1);
		const mail = sent[0];
		expect(mail.to).toEqual(['p@example.com']);
		expect(mail.subject).toBe('Cambió la fecha: Evento de prueba');
		expect(keys[0]).toBe(`datechange-${o.order.id}-${change.version}`);

		const lines = mail.text.split('\n');
		expect(lines).toContain('Fecha nueva: sábado 21 de noviembre de 2099, 21:00 a 02:00');
		expect(lines).toContain('Antes era: sábado 14 de noviembre de 2099, 22:00 a 03:00');
		expect(lines).toContain('Lugar Inventado · Calle Falsa 123');
		const text = textOf(mail.html);
		expect(text).toContain('Fecha nueva');
		expect(text).toContain('sábado 21 de noviembre de 2099, 21:00 a 02:00');
		expect(text).toContain('Antes era: sábado 14 de noviembre de 2099, 22:00 a 03:00');
		expect(text).toContain('Ver mis entradas');

		// El .ics: mismo UID que el de las entradas, la fecha nueva y un SEQUENCE más alto.
		expect(mail.attachments[0].filename).toBe('evento-de-prueba.ics');
		expect(icsProp(mail, 'UID')).toBe(icsProp(first.sent[0], 'UID'));
		expect(icsProp(mail, 'UID')).toBe('evento-de-prueba@kinkyvibe.ar');
		expect(icsProp(mail, 'DTSTART')).toBe('20991122T000000Z');
		expect(icsProp(mail, 'DTEND')).toBe('20991122T050000Z');
		expect(icsProp(mail, 'SEQUENCE')).toBe(String(Math.floor(change.version / 60_000)));
		expect(Number(icsProp(mail, 'SEQUENCE'))).toBeGreaterThan(
			Number(icsProp(first.sent[0], 'SEQUENCE'))
		);
		const google = googleUrl(mail);
		expect(google.origin).toBe('https://calendar.google.com');
		expect(google.searchParams.get('dates')).toBe('20991122T000000Z/20991122T050000Z');
	});

	it('una compra reembolsada o cancelada no lo recibe; tocar dos veces no manda dos veces', async () => {
		const ok = await order('evento-de-prueba', 'si@example.com');
		const refunded = await order('evento-de-prueba', 'reembolso@example.com');
		const cancelled = await order('evento-de-prueba', 'cancelada@example.com');
		await t.db
			.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?1")
			.bind(refunded.order.id)
			.run();
		await t.db
			.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?1")
			.bind(cancelled.order.id)
			.run();
		const change = await changeDate('evento-de-prueba');
		const { sent, fetch } = captureFetch();
		await tickets.sendDateChangeEmails({ db: t.db, change, origin: 'https://kv.example', fetch });
		expect(sent.map((m) => m.to[0])).toEqual([ok.order.buyer_email]);
		await tickets.sendDateChangeEmails({ db: t.db, change, origin: 'https://kv.example', fetch });
		expect(sent).toHaveLength(1);
	});

	it('online con link: el link de la transmisión en el mail, en el botón y en el .ics', async () => {
		await setStreamLink(t.db, { eventSlug: 'evento-online-de-prueba', link: STREAM, by: 'admin' });
		await order('evento-online-de-prueba');
		const change = await changeDate('evento-online-de-prueba');
		const { sent, fetch } = captureFetch();
		await tickets.sendDateChangeEmails({ db: t.db, change, origin: 'https://kv.example', fetch });
		expect(sent).toHaveLength(1);
		const lines = sent[0].text.split('\n');
		expect(lines).toContain(`Link de la transmisión: ${STREAM}`);
		expect(lines).toContain('Online');
		expect(textOf(sent[0].html)).toContain('Entrar a la transmisión');
		expect(new URL(/** @type {string} */ (icsProp(sent[0], 'LOCATION'))).href).toBe(STREAM);
	});

	it('online sin link todavía: ni recuadro ni botón a la transmisión', async () => {
		await order('evento-online-de-prueba');
		const change = await changeDate('evento-online-de-prueba');
		const { sent, fetch } = captureFetch();
		await tickets.sendDateChangeEmails({ db: t.db, change, origin: 'https://kv.example', fetch });
		expect(sent[0].text).not.toContain('Link de la transmisión');
		expect(textOf(sent[0].html)).toContain('Ver mis entradas');
	});

	it('un recordatorio después del cambio no vuelve a un SEQUENCE más bajo', async () => {
		await order('evento-de-prueba');
		const change = await changeDate('evento-de-prueba');
		const { sent, fetch } = captureFetch();
		// Un día y medio antes de la fecha nueva: toca el recordatorio de «2 días antes».
		await tickets.sendReminderEmails({
			db: t.db,
			origin: 'https://kv.example',
			fetch,
			now: Date.parse('2099-11-20T10:00:00-03:00')
		});
		expect(sent).toHaveLength(1);
		expect(icsProp(sent[0], 'SEQUENCE')).toBe(String(Math.floor(change.version / 60_000)));
	});
});
