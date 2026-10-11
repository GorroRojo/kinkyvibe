/**
 * «Agregalo a tu calendario» en los mails que de verdad salen: el de las entradas
 * (sendOrderEmail) y los recordatorios (sendReminderEmails) llevan adjunto `<slug>.ics` y el link
 * a Google Calendar (con el link de la transmisión si ya está); el de los datos para transferir
 * (antes de que se acredite el pago) no lleva nada de eso ni el link de la transmisión. Lo que se
 * le manda a Resend se captura (no sale nada). D1 de miniflare; eventos y persona inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyPayment, reserveOrder } from '$lib/server/tickets/orders.js';
import { setStreamLink } from '$lib/server/tickets/stream.js';
import { textOf } from '$lib/testing/html.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

const STREAM = 'https://meet.example/sala-inventada';

vi.mock('$lib/server/tickets/events.js', async () => {
	const { parseTicketConfig } = await import('$lib/server/tickets/config.js');
	const common = {
		start: '2099-11-14T22:00:00-03:00',
		end: '2099-11-15T03:00:00-03:00',
		status: 'abierto',
		payment_methods: ['mercadopago', 'transferencia'],
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
		'evento-online-de-prueba': {
			...common,
			title: 'Evento online de prueba',
			modalidad: 'online'
		}
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
vi.mock('$env/dynamic/private', () => ({
	env: { RESEND_API_KEY: 're_inventada', TICKETS_TRANSFER_INFO: 'Alias: EJEMPLO.PRUEBA' }
}));

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

/**
 * @param {string} eventSlug
 * @param {'mercadopago' | 'transferencia'} [method]
 */
async function order(eventSlug, method = 'mercadopago') {
	const r = /** @type {any} */ (
		await reserveOrder(t.db, {
			eventSlug,
			type: { id: 'general', price: 8000, capacity: 10 },
			quantity: 1,
			method,
			holders: [{ name: 'Persona Demo', pronouns: 'elle' }],
			buyer: { name: 'Persona Demo', pronouns: 'elle', email: 'p@example.com', dni: '30111222' }
		})
	);
	if (method === 'transferencia') return { order: r.order, tickets: [] };
	const { order: approved, tickets: list } = await applyPayment(t.db, {
		id: 1,
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
	const fetch = /** @type {any} */ (
		async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
			sent.push(JSON.parse(String(init.body)));
			return new Response('{"id":"x"}', { status: 200 });
		}
	);
	return { sent, fetch };
}

/** @param {string} b64 */
const fromBase64 = (b64) =>
	new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** Las líneas desplegadas del .ics adjunto. @param {any} mail */
function icsLines(mail) {
	expect(mail.attachments).toHaveLength(1);
	return fromBase64(mail.attachments[0].content)
		.replace(/\r\n[ \t]/g, '')
		.split('\r\n');
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

/** Un día y medio antes del evento: toca el recordatorio de «2 días antes». */
const NOW = Date.parse('2099-11-13T10:00:00-03:00');

describe('sendOrderEmail', () => {
	it('le manda a Resend el .ics del evento adjunto y el link a Google Calendar', async () => {
		const o = await order('evento-de-prueba');
		const { sent, fetch } = captureFetch();
		expect(
			await tickets.sendOrderEmail({ db: t.db, ...o, origin: 'https://kv.example', fetch })
		).toBe(true);
		expect(sent).toHaveLength(1);
		expect(sent[0].attachments[0].filename).toBe('evento-de-prueba.ics');
		const ics = icsLines(sent[0]);
		expect(ics).toContain('UID:evento-de-prueba@kinkyvibe.ar');
		expect(ics).toContain('DTSTART:20991115T010000Z');
		expect(ics).toContain('DTEND:20991115T060000Z');
		expect(sent[0].text).toContain('Agregalo a tu calendario');
		expect(googleUrl(sent[0]).searchParams.get('dates')).toBe('20991115T010000Z/20991115T060000Z');
	});
});

describe('sendReminderEmails', () => {
	it('presencial: el recordatorio lleva el .ics y el link a Google Calendar', async () => {
		await order('evento-de-prueba');
		const { sent, fetch } = captureFetch();
		await tickets.sendReminderEmails({ db: t.db, origin: 'https://kv.example', fetch, now: NOW });
		expect(sent.map((m) => m.subject)).toEqual(['Recordatorio: Evento de prueba se acerca']);
		const ics = icsLines(sent[0]);
		expect(ics).toContain('UID:evento-de-prueba@kinkyvibe.ar');
		expect(ics).toContain('DTSTART:20991115T010000Z');
		expect(ics).toContain('DTEND:20991115T060000Z');
		expect(ics).toContain('LOCATION:Lugar Inventado · Calle Falsa 123');
		expect(textOf(sent[0].html)).toContain(
			'Agregalo a tu calendario: abrí el archivo evento-de-prueba.ics que va adjunto.'
		);
		const google = googleUrl(sent[0]);
		expect(google.searchParams.get('location')).toBe('Lugar Inventado · Calle Falsa 123');
		// Sin el marcado para Gmail: es un recordatorio, no la confirmación de la compra.
		expect(sent[0].html.split('application/ld+json')).toHaveLength(1);
	});

	it('online con link: el link de la transmisión en el .ics y en Google Calendar', async () => {
		await setStreamLink(t.db, { eventSlug: 'evento-online-de-prueba', link: STREAM, by: 'admin' });
		await order('evento-online-de-prueba');
		const { sent, fetch } = captureFetch();
		await tickets.sendReminderEmails({ db: t.db, origin: 'https://kv.example', fetch, now: NOW });
		expect(sent).toHaveLength(1);
		const ics = icsLines(sent[0]);
		const location = /** @type {string} */ (ics.find((l) => l.startsWith('LOCATION:')));
		expect(new URL(location.slice('LOCATION:'.length)).href).toBe(STREAM);
		expect(googleUrl(sent[0]).searchParams.get('location')).toBe(STREAM);
		expect(sent[0].text.split('\n')).toContain(`Link de la transmisión: ${STREAM}`);
	});
});

describe('sendTransferEmail (antes de que se acredite el pago)', () => {
	it('sin .ics, sin link a Google Calendar y sin el link de la transmisión', async () => {
		await setStreamLink(t.db, { eventSlug: 'evento-online-de-prueba', link: STREAM, by: 'admin' });
		const o = await order('evento-online-de-prueba', 'transferencia');
		const { sent, fetch } = captureFetch();
		expect(
			await tickets.sendTransferEmail({
				db: t.db,
				order: o.order,
				origin: 'https://kv.example',
				fetch
			})
		).toBe(true);
		expect(sent).toHaveLength(1);
		expect(sent[0]).not.toHaveProperty('attachments');
		expect(sent[0].text).not.toContain('Google Calendar');
		expect(sent[0].text).not.toContain('Agregalo a tu calendario');
		expect(textOf(sent[0].html)).not.toContain('Google Calendar');
		expect(sent[0].text).not.toContain('sala-inventada');
		expect(sent[0].html).not.toContain('sala-inventada');
	});
});

/** El valor de una propiedad del .ics adjunto. @param {any} mail @param {string} name */
function icsProp(mail, name) {
	const line = icsLines(mail).find((l) => l.startsWith(`${name}:`));
	return line?.slice(name.length + 1);
}

describe('sendStreamLinkEmails («Enviar el link a todes»)', () => {
	const LINK_AT = Date.parse('2099-11-10T15:00:00-03:00');

	it('manda el .ics actualizado (link como lugar, SEQUENCE del link) y no repite el envío', async () => {
		const o = await order('evento-online-de-prueba');
		const first = captureFetch();
		await tickets.sendOrderEmail({
			db: t.db,
			...o,
			origin: 'https://kv.example',
			fetch: first.fetch
		});
		expect(icsProp(first.sent[0], 'LOCATION')).toBe('Online');
		await setStreamLink(t.db, {
			eventSlug: 'evento-online-de-prueba',
			link: STREAM,
			by: 'admin',
			now: LINK_AT
		});
		const { sent, fetch } = captureFetch();
		const r = await tickets.sendStreamLinkEmails({
			db: t.db,
			eventSlug: 'evento-online-de-prueba',
			link: STREAM,
			origin: 'https://kv.example',
			fetch,
			now: LINK_AT + 1000
		});
		expect(r.sent).toBe(1);
		expect(sent).toHaveLength(1);
		expect(sent[0].attachments[0].filename).toBe('evento-online-de-prueba.ics');
		expect(icsProp(sent[0], 'UID')).toBe('evento-online-de-prueba@kinkyvibe.ar');
		expect(new URL(/** @type {string} */ (icsProp(sent[0], 'LOCATION'))).href).toBe(STREAM);
		expect(icsProp(sent[0], 'SEQUENCE')).toBe(String(Math.floor(LINK_AT / 60_000)));
		// El link se cargó después de la compra: el archivo nuevo tiene un SEQUENCE más alto.
		expect(Number(icsProp(sent[0], 'SEQUENCE'))).toBeGreaterThan(
			Number(icsProp(first.sent[0], 'SEQUENCE'))
		);
		expect(googleUrl(sent[0]).searchParams.get('location')).toBe(STREAM);

		// Otra vez el mismo link: nadie lo recibe de nuevo (stream_link_sends, como siempre).
		const again = captureFetch();
		const r2 = await tickets.sendStreamLinkEmails({
			db: t.db,
			eventSlug: 'evento-online-de-prueba',
			link: STREAM,
			origin: 'https://kv.example',
			fetch: again.fetch,
			now: LINK_AT + 2000
		});
		expect(r2.sent).toBe(0);
		expect(again.sent).toHaveLength(0);
	});
});

describe('reintentos con la misma clave de Resend', () => {
	it('el mail de las entradas sale igual (mismo .ics) si se manda dos veces', async () => {
		const o = await order('evento-de-prueba');
		const { sent, fetch } = captureFetch();
		await tickets.sendOrderEmail({ db: t.db, ...o, origin: 'https://kv.example', fetch });
		await new Promise((r) => setTimeout(r, 1100));
		await tickets.sendOrderEmail({ db: t.db, ...o, origin: 'https://kv.example', fetch });
		expect(sent).toHaveLength(2);
		expect(sent[1].attachments).toEqual(sent[0].attachments);
		expect(icsProp(sent[0], 'SEQUENCE')).toBe(String(Math.floor(o.order.created_at / 60_000)));
	});
});
