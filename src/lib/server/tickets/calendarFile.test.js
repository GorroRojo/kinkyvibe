/**
 * El .ics adjunto al mail con las entradas: hora argentina pasada bien a UTC, UID estable (el de
 * los calendarios del sitio), título, lugar o «Online» (nunca el link de la transmisión) y el
 * adjunto en el mail armado y en lo que se le manda a Resend. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { ONLINE_ICS_NOTE, resendAttachment, ticketCalendarFile } from './calendarFile.js';
import { buildTicketEmail, sendWithResend } from './email.js';
import { fixtureOrder, fixtureTickets } from './email.fixtures.js';
import { textOf } from '$lib/testing/html.js';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';
import { fakeEvent } from '../series/fixtures.js';

const ORIGIN = 'https://kinkyvibe.example';
const STREAM = 'https://meet.example/sala-secreta-inventada';

/** Un evento presencial inventado: empieza a las 22:00 de Buenos Aires (01:00 UTC del día siguiente). */
const EVENT = {
	slug: 'evento-de-prueba',
	title: 'Evento de prueba',
	start: '2099-11-14T22:00:00-03:00',
	end: '2099-11-15T03:30:00-03:00',
	status: 'abierto',
	location: 'Calle Falsa 123',
	location_name: 'Lugar Inventado',
	origin: ORIGIN
};

/** Las líneas del .ics desplegadas (el formato corta las largas en 75 caracteres). */
const lines = (/** @type {string} */ ics) => ics.replace(/\r\n[ \t]/g, '').split('\r\n');

/**
 * El valor de una propiedad del VEVENT (sin parámetros), o `undefined`.
 * @param {string} ics @param {string} name
 */
function prop(ics, name) {
	const line = lines(ics).find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
	return line?.slice(line.indexOf(':') + 1);
}

/** El texto de una propiedad sin los escapes de RFC 5545. @param {string | undefined} v */
const unescape = (v) => v?.replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1');

/** @param {string} b64 */
const fromBase64 = (b64) =>
	new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

describe('ticketCalendarFile (el .ics del evento)', () => {
	const file = /** @type {import('./calendarFile.js').CalendarFile} */ (ticketCalendarFile(EVENT));

	it('se llama <slug>.ics y es text/calendar', () => {
		expect(file.filename).toBe('evento-de-prueba.ics');
		expect(file.contentType.split(';')[0]).toBe('text/calendar');
		expect(file.content.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(lines(file.content).filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
		expect(prop(file.content, 'METHOD')).toBe('PUBLISH');
	});

	it('las 22:00 de Buenos Aires son la 01:00 UTC del día siguiente; el fin, también en UTC', () => {
		expect(prop(file.content, 'DTSTART')).toBe('20991115T010000Z');
		expect(prop(file.content, 'DTEND')).toBe('20991115T063000Z');
	});

	it('UID estable: el mismo que el evento en los calendarios del sitio', () => {
		expect(prop(file.content, 'UID')).toBe('evento-de-prueba@kinkyvibe.ar');
		const feed = buildIcsFeed([fakeEvent('evento-de-prueba', Date.parse(EVENT.start), ['Fiesta'])]);
		expect(prop(feed, 'UID')).toBe(prop(file.content, 'UID'));
	});

	it('título, link a la página del evento y lugar como lo dice el mail', () => {
		expect(unescape(prop(file.content, 'SUMMARY'))).toBe('Evento de prueba');
		const url = new URL(/** @type {string} */ (prop(file.content, 'URL')));
		expect(url.origin).toBe(ORIGIN);
		expect(url.pathname).toBe('/calendario/evento-de-prueba');
		expect(unescape(prop(file.content, 'LOCATION'))).toBe('Lugar Inventado · Calle Falsa 123');
		expect(prop(file.content, 'STATUS')).toBe('CONFIRMED');
	});

	it('sin fin: el fin es el inicio (como los calendarios del sitio); fin pasada la medianoche con la fecha del inicio, al día siguiente', () => {
		const sinFin = /** @type {any} */ (ticketCalendarFile({ ...EVENT, end: undefined }));
		expect(prop(sinFin.content, 'DTEND')).toBe('20991115T010000Z');
		const mismaFecha = /** @type {any} */ (
			ticketCalendarFile({ ...EVENT, end: '2099-11-14T03:00:00-03:00' })
		);
		expect(prop(mismaFecha.content, 'DTEND')).toBe('20991115T060000Z');
	});

	it('online: «Online» y la nota, nunca el link de la transmisión', () => {
		const online = /** @type {any} */ (
			ticketCalendarFile(/** @type {any} */ ({ ...EVENT, online: true, streamLink: STREAM }))
		);
		expect(prop(online.content, 'LOCATION')).toBe('Online');
		expect(unescape(prop(online.content, 'DESCRIPTION'))).toContain(ONLINE_ICS_NOTE);
		expect(online.content).not.toContain('meet.example');
		expect(online.content).not.toContain('sala-secreta');
	});

	it('sin fecha válida: sin archivo', () => {
		expect(ticketCalendarFile({ ...EVENT, start: undefined })).toBeNull();
		expect(ticketCalendarFile({ ...EVENT, start: 'a confirmar' })).toBeNull();
	});

	it('el adjunto para Resend: base64 del mismo .ics (con tildes)', () => {
		const withAccent = /** @type {any} */ (
			ticketCalendarFile({ ...EVENT, title: 'Fiesta de primavera ñandú' })
		);
		const att = resendAttachment(withAccent);
		expect(att.filename).toBe('evento-de-prueba.ics');
		expect(att.content_type).toBe(withAccent.contentType);
		expect(fromBase64(att.content)).toBe(withAccent.content);
	});
});

describe('el mail con las entradas', () => {
	const base = {
		order: fixtureOrder({ buyer_name: 'Persona Demo', event_slug: 'evento-de-prueba' }),
		tickets: fixtureTickets(),
		typeName: 'General',
		origin: ORIGIN,
		contactEmail: 'contacto@example.com'
	};
	const LINE = 'Agregalo a tu calendario: abrí el archivo evento-de-prueba.ics que va adjunto.';

	it('con el slug: lleva adjunto <slug>.ics y la línea «Agregalo a tu calendario»', () => {
		const mail = buildTicketEmail({ ...base, event: EVENT });
		expect(mail.attachments).toHaveLength(1);
		const [att] = /** @type {any[]} */ (mail.attachments);
		expect(att.filename).toBe('evento-de-prueba.ics');
		expect(prop(fromBase64(att.content), 'UID')).toBe('evento-de-prueba@kinkyvibe.ar');
		expect(textOf(mail.html)).toContain(LINE);
		expect(mail.text.split('\n')).toContain(LINE);
	});

	it('online con link: el link va en el mail (es de quien compró) pero no en el .ics', () => {
		const mail = buildTicketEmail({
			...base,
			event: { ...EVENT, online: true, streamLink: STREAM }
		});
		expect(mail.text).toContain(STREAM);
		const ics = fromBase64(/** @type {any[]} */ (mail.attachments)[0].content);
		expect(prop(ics, 'LOCATION')).toBe('Online');
		expect(ics).not.toContain('meet.example');
	});

	it('sin el slug (vistas previas, golden): sin adjunto ni línea', () => {
		const mail = buildTicketEmail({ ...base, event: { ...EVENT, slug: undefined } });
		expect(mail.attachments).toBeUndefined();
		expect(textOf(mail.html)).not.toContain('Agregalo a tu calendario');
		expect(mail.text).not.toContain('Agregalo a tu calendario');
	});

	it('evento cancelado: sin adjunto ni línea', () => {
		const mail = buildTicketEmail({ ...base, event: { ...EVENT, status: 'cancelado' } });
		expect(mail.attachments).toBeUndefined();
		expect(mail.text).not.toContain('Agregalo a tu calendario');
	});

	it('sendWithResend le pasa los adjuntos a Resend (y sin adjuntos no manda el campo)', async () => {
		/** @type {any[]} */
		const bodies = [];
		const fetch = /** @type {any} */ (
			async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
				bodies.push(JSON.parse(String(init.body)));
				return new Response('{"id":"x"}', { status: 200 });
			}
		);
		const common = { fetch, apiKey: 're_inventada', from: 'a@example.com', to: 'b@example.com' };
		const mail = buildTicketEmail({ ...base, event: EVENT });
		await sendWithResend({ ...common, message: mail });
		const { subject, html, text } = mail;
		await sendWithResend({ ...common, message: { subject, html, text } });
		expect(bodies[0].attachments).toEqual(mail.attachments);
		expect(bodies[1]).not.toHaveProperty('attachments');
	});
});
