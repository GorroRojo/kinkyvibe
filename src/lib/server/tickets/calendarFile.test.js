/**
 * «Agregalo a tu calendario» en el mail con las entradas: el .ics adjunto (hora argentina pasada
 * bien a UTC, UID estable, título, lugar, «Online» o el link de la transmisión), el link a Google
 * Calendar, el marcado `EventReservation` para Gmail y el adjunto en lo que se le manda a Resend.
 * Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import {
	ICS_CONTENT_TYPE,
	ONLINE_ICS_NOTE,
	STREAM_CHANGE_NOTE,
	calendarStamp,
	eventReservationScript,
	googleCalendarUrl,
	resendAttachment,
	ticketCalendarFile
} from './calendarFile.js';
import { buildStreamLinkEmail, buildTicketEmail, sendWithResend } from './email.js';
import { fixtureOrder, fixtureTickets } from './email.fixtures.js';
import { textOf } from '$lib/testing/html.js';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';
import { fakeEvent } from '../series/fixtures.js';

const ORIGIN = 'https://kinkyvibe.example';
const STREAM = 'https://meet.example/sala-inventada';
const PAGE = `${ORIGIN}/calendario/evento-de-prueba`;

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
const ONLINE = { ...EVENT, online: true, streamLink: null };
const ONLINE_LINK = { ...EVENT, online: true, streamLink: STREAM };

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

/** @param {any} ev */
const icsOf = (ev) =>
	/** @type {import('./calendarFile.js').CalendarFile} */ (ticketCalendarFile(ev)).content;

/** @param {any} ev */
const googleOf = (ev) => new URL(/** @type {string} */ (googleCalendarUrl(ev)));

/**
 * El JSON-LD que va adentro de `<script type="application/ld+json">…</script>`, leído con
 * `split` (sin expresiones regulares sobre HTML) y `JSON.parse`.
 * @param {string} html
 */
function jsonLdOf(html) {
	const parts = html.split('<script type="application/ld+json">');
	expect(parts).toHaveLength(2);
	return JSON.parse(parts[1].split('</script>')[0]);
}

describe('ticketCalendarFile (el .ics del evento)', () => {
	const ics = icsOf(EVENT);

	it('se llama <slug>.ics y es text/calendar de publicación', () => {
		const file = /** @type {any} */ (ticketCalendarFile(EVENT));
		expect(file.filename).toBe('evento-de-prueba.ics');
		expect(file.contentType).toBe('text/calendar; method=PUBLISH; charset=UTF-8');
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(lines(ics).filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
		expect(prop(ics, 'METHOD')).toBe('PUBLISH');
		// Publicación, no invitación: sin ATTENDEE (que haría mostrar botones de RSVP).
		expect(prop(ics, 'ATTENDEE')).toBeUndefined();
	});

	it('las 22:00 de Buenos Aires son la 01:00 UTC del día siguiente; el fin, también en UTC', () => {
		expect(prop(ics, 'DTSTART')).toBe('20991115T010000Z');
		expect(prop(ics, 'DTEND')).toBe('20991115T063000Z');
	});

	it('UID estable: el mismo que el evento en los calendarios del sitio', () => {
		expect(prop(ics, 'UID')).toBe('evento-de-prueba@kinkyvibe.ar');
		const feed = buildIcsFeed([fakeEvent('evento-de-prueba', Date.parse(EVENT.start), ['Fiesta'])]);
		expect(prop(feed, 'UID')).toBe(prop(ics, 'UID'));
	});

	it('título, link a la página del evento y lugar como lo dice el mail', () => {
		expect(unescape(prop(ics, 'SUMMARY'))).toBe('Evento de prueba');
		expect(new URL(/** @type {string} */ (prop(ics, 'URL'))).href).toBe(PAGE);
		expect(unescape(prop(ics, 'LOCATION'))).toBe('Lugar Inventado · Calle Falsa 123');
		expect(unescape(prop(ics, 'DESCRIPTION'))).toBe(PAGE);
		expect(prop(ics, 'STATUS')).toBe('CONFIRMED');
	});

	it('sin fin: el fin es el inicio; fin pasada la medianoche con la fecha del inicio, al día siguiente', () => {
		expect(prop(icsOf({ ...EVENT, end: undefined }), 'DTEND')).toBe('20991115T010000Z');
		expect(prop(icsOf({ ...EVENT, end: '2099-11-14T03:00:00-03:00' }), 'DTEND')).toBe(
			'20991115T060000Z'
		);
	});

	it('online sin link todavía: «Online» y que el link llega por mail', () => {
		const online = icsOf(ONLINE);
		expect(prop(online, 'LOCATION')).toBe('Online');
		expect(unescape(prop(online, 'DESCRIPTION'))).toBe(`${ONLINE_ICS_NOTE}\n\n${PAGE}`);
	});

	it('online con link: el link como lugar y en la descripción, con el aviso y la página', () => {
		const online = icsOf(ONLINE_LINK);
		expect(new URL(/** @type {string} */ (unescape(prop(online, 'LOCATION')))).href).toBe(STREAM);
		expect(unescape(prop(online, 'DESCRIPTION'))?.split('\n')).toEqual([
			`Link de la transmisión: ${STREAM}`,
			STREAM_CHANGE_NOTE,
			'',
			PAGE
		]);
		expect(new URL(/** @type {string} */ (prop(online, 'URL'))).href).toBe(PAGE);
	});

	it('sin fecha válida: sin archivo, sin link de Google y sin marcado', () => {
		for (const start of [undefined, 'a confirmar']) {
			const ev = { ...EVENT, start };
			expect(ticketCalendarFile(ev)).toBeNull();
			expect(googleCalendarUrl(ev)).toBeNull();
			expect(eventReservationScript({ orderId: 'o', buyerName: 'P', event: ev })).toBeNull();
		}
	});

	it('el adjunto para Resend: base64 del mismo .ics (con tildes) y content_type explícito', () => {
		const withAccent = /** @type {any} */ (
			ticketCalendarFile({ ...EVENT, title: 'Fiesta de primavera ñandú' })
		);
		const att = resendAttachment(withAccent);
		expect(att.filename).toBe('evento-de-prueba.ics');
		expect(att.content_type).toBe(ICS_CONTENT_TYPE);
		expect(fromBase64(att.content)).toBe(withAccent.content);
	});
});

describe('googleCalendarUrl', () => {
	it('presencial: las mismas horas UTC que el .ics, la página y el lugar', () => {
		const url = googleOf(EVENT);
		expect(url.origin).toBe('https://calendar.google.com');
		expect(url.pathname).toBe('/calendar/render');
		expect(url.searchParams.get('action')).toBe('TEMPLATE');
		expect(url.searchParams.get('text')).toBe('Evento de prueba');
		expect(url.searchParams.get('dates')).toBe('20991115T010000Z/20991115T063000Z');
		expect(url.searchParams.get('details')).toBe(PAGE);
		expect(url.searchParams.get('location')).toBe('Lugar Inventado · Calle Falsa 123');
	});

	it('online sin link: «Online» y la nota con la página', () => {
		const url = googleOf(ONLINE);
		expect(url.searchParams.get('location')).toBe('Online');
		expect(url.searchParams.get('details')).toBe(`${ONLINE_ICS_NOTE}\n\n${PAGE}`);
	});

	it('online con link: el link como lugar y en los detalles, con el aviso y la página', () => {
		const url = googleOf(ONLINE_LINK);
		expect(url.searchParams.get('location')).toBe(STREAM);
		expect(url.searchParams.get('details')).toBe(
			`Link de la transmisión: ${STREAM}\n${STREAM_CHANGE_NOTE}\n\n${PAGE}`
		);
	});

	it('un título con & y # no rompe los parámetros', () => {
		const url = googleOf({ ...EVENT, title: 'Fiesta & taller #2' });
		expect(url.searchParams.get('text')).toBe('Fiesta & taller #2');
		expect(url.searchParams.get('action')).toBe('TEMPLATE');
	});
});

describe('eventReservationScript (marcado para Gmail)', () => {
	/** @param {any} event @param {string} [buyerName] */
	const ld = (event, buyerName = 'Persona Demo') =>
		jsonLdOf(
			/** @type {string} */ (eventReservationScript({ orderId: 'orden-1', buyerName, event }))
		);

	it('EventReservation con número, estado, solo el nombre y el evento en hora argentina', () => {
		const data = ld(EVENT);
		expect(data['@context']).toBe('http://schema.org');
		expect(data['@type']).toBe('EventReservation');
		expect(data.reservationNumber).toBe('orden-1');
		expect(data.reservationStatus).toBe('http://schema.org/Confirmed');
		expect(data.underName).toEqual({ '@type': 'Person', name: 'Persona Demo' });
		const ev = data.reservationFor;
		expect(ev['@type']).toBe('Event');
		expect(ev.name).toBe('Evento de prueba');
		expect(ev.startDate).toBe('2099-11-14T22:00:00-03:00');
		expect(ev.endDate).toBe('2099-11-15T03:30:00-03:00');
		expect(new URL(ev.url).href).toBe(PAGE);
		expect(ev.location).toEqual({
			'@type': 'Place',
			name: 'Lugar Inventado',
			address: { '@type': 'PostalAddress', streetAddress: 'Calle Falsa 123', addressCountry: 'AR' }
		});
	});

	it('online: VirtualLocation con la página sin link, con el link de la transmisión si ya está', () => {
		expect(ld(ONLINE).reservationFor.location).toEqual({ '@type': 'VirtualLocation', url: PAGE });
		expect(ld(ONLINE_LINK).reservationFor.location).toEqual({
			'@type': 'VirtualLocation',
			url: STREAM
		});
	});

	it('un </script> en un texto no cierra el script (el < sale escapado)', () => {
		const evil = 'Persona </script><img src=x onerror=alert(1)>';
		const script = /** @type {string} */ (
			eventReservationScript({
				orderId: 'orden-1',
				buyerName: evil,
				event: { ...EVENT, title: '<b>Evento</b>' }
			})
		);
		expect(script.split('</script>')).toHaveLength(2);
		expect(script.split('<')).toHaveLength(3); // solo <script> y </script>
		const data = jsonLdOf(script);
		expect(data.underName.name).toBe(evil);
		expect(data.reservationFor.name).toBe('<b>Evento</b>');
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

	/** El href del link «Agregar a Google Calendar» del HTML (con split, sin regex). @param {string} html */
	function googleHref(html) {
		const before = html.split('>Agregar a Google Calendar</a>');
		expect(before).toHaveLength(2);
		const tag = before[0].slice(before[0].lastIndexOf('<a '));
		const href = tag.split('href="')[1].split('"')[0].replaceAll('&amp;', '&');
		return new URL(href);
	}

	it('con el slug: .ics adjunto, la línea, el link a Google y el marcado en el <head>', () => {
		const mail = buildTicketEmail({ ...base, event: EVENT });
		expect(mail.attachments).toHaveLength(1);
		const [att] = /** @type {any[]} */ (mail.attachments);
		expect(att.filename).toBe('evento-de-prueba.ics');
		expect(att.content_type).toBe(ICS_CONTENT_TYPE);
		expect(prop(fromBase64(att.content), 'UID')).toBe('evento-de-prueba@kinkyvibe.ar');
		expect(textOf(mail.html)).toContain(LINE);
		expect(textOf(mail.html)).toContain('Agregar a Google Calendar');
		const google = googleHref(mail.html);
		expect(google.href).toBe(/** @type {string} */ (googleCalendarUrl(EVENT)));
		const textLines = mail.text.split('\n');
		expect(textLines).toContain(LINE);
		const googleLine = textLines.find((l) => l.startsWith('Agregar a Google Calendar: '));
		expect(
			new URL(/** @type {string} */ (googleLine).slice('Agregar a Google Calendar: '.length)).href
		).toBe(google.href);
		const head = mail.html.split('</head>')[0];
		const data = jsonLdOf(head);
		expect(data.reservationNumber).toBe(base.order.id);
		expect(data.underName.name).toBe('Persona Demo');
	});

	it('el marcado no lleva el mail ni el DNI de quien compró', () => {
		const mail = buildTicketEmail({ ...base, event: EVENT });
		const json = JSON.stringify(jsonLdOf(mail.html));
		expect(json).not.toContain(base.order.buyer_email);
		expect(json).not.toContain(base.order.buyer_dni);
	});

	it('online con link: el link en el mail, en el .ics, en Google y en el marcado', () => {
		const mail = buildTicketEmail({ ...base, event: ONLINE_LINK });
		expect(mail.text).toContain(STREAM);
		const ics = fromBase64(/** @type {any[]} */ (mail.attachments)[0].content);
		expect(unescape(prop(ics, 'LOCATION'))).toBe(STREAM);
		expect(googleHref(mail.html).searchParams.get('location')).toBe(STREAM);
		expect(jsonLdOf(mail.html).reservationFor.location.url).toBe(STREAM);
	});

	it('sin el slug (vistas previas, golden): sin adjunto, línea, link ni marcado', () => {
		const mail = buildTicketEmail({ ...base, event: { ...EVENT, slug: undefined } });
		expect(mail.attachments).toBeUndefined();
		expect(textOf(mail.html)).not.toContain('Agregalo a tu calendario');
		expect(textOf(mail.html)).not.toContain('Google Calendar');
		expect(mail.html.split('application/ld+json')).toHaveLength(1);
		expect(mail.text).not.toContain('Agregalo a tu calendario');
	});

	it('evento cancelado: sin adjunto, línea, link ni marcado', () => {
		const mail = buildTicketEmail({ ...base, event: { ...EVENT, status: 'cancelado' } });
		expect(mail.attachments).toBeUndefined();
		expect(mail.text).not.toContain('Agregalo a tu calendario');
		expect(mail.text).not.toContain('Google Calendar');
		expect(mail.html.split('application/ld+json')).toHaveLength(1);
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
		expect(bodies[0].attachments[0].content_type).toBe(ICS_CONTENT_TYPE);
		expect(bodies[1]).not.toHaveProperty('attachments');
	});

	it('sendWithResend marca todos los mails en castellano (Content-Language: es)', async () => {
		/** @type {any[]} */
		const bodies = [];
		const fetch = /** @type {any} */ (
			async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
				bodies.push(JSON.parse(String(init.body)));
				return new Response('{"id":"x"}', { status: 200 });
			}
		);
		const { subject, html, text } = buildTicketEmail({ ...base, event: EVENT });
		await sendWithResend({
			fetch,
			apiKey: 're_inventada',
			from: 'a@example.com',
			to: 'b@example.com',
			message: { subject, html, text }
		});
		expect(bodies[0].headers).toEqual({ 'Content-Language': 'es' });
		// Las cabeceras de un mail en particular (baja en un clic) se suman a esas.
		const oneClick = {
			'List-Unsubscribe': '<https://kinkyvibe.example/avisos/sigo/x.firma>',
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
		};
		await sendWithResend({
			fetch,
			apiKey: 're_inventada',
			from: 'a@example.com',
			to: 'b@example.com',
			message: { subject, html, text, headers: oneClick }
		});
		expect(bodies[1].headers).toEqual({ 'Content-Language': 'es', ...oneClick });
	});
});

describe('SEQUENCE (un archivo posterior reemplaza al anterior)', () => {
	const STAMP = Date.parse('2099-11-01T12:34:56Z');

	it('stamp → DTSTAMP y SEQUENCE en minutos desde 1970', () => {
		const ics = icsOf({ ...EVENT, stamp: STAMP });
		expect(prop(ics, 'DTSTAMP')).toBe('20991101T123456Z');
		expect(prop(ics, 'SEQUENCE')).toBe(String(Math.floor(STAMP / 60_000)));
	});

	it('el mismo stamp da el mismo archivo, byte a byte (los reintentos con la misma clave de Resend)', () => {
		expect(icsOf({ ...EVENT, stamp: STAMP })).toBe(icsOf({ ...EVENT, stamp: STAMP }));
	});

	it('un stamp posterior da un SEQUENCE más alto', () => {
		const before = Number(prop(icsOf({ ...EVENT, stamp: STAMP }), 'SEQUENCE'));
		const after = Number(prop(icsOf({ ...EVENT, stamp: STAMP + 60_000 }), 'SEQUENCE'));
		expect(after).toBeGreaterThan(before);
	});

	it('calendarStamp: lo más nuevo entre la compra y el link; «Reenviar» (now), ahora', () => {
		expect(calendarStamp({ orderCreatedAt: 1000, linkUpdatedAt: 5000 })).toBe(5000);
		expect(calendarStamp({ orderCreatedAt: 9000, linkUpdatedAt: 5000 })).toBe(9000);
		expect(calendarStamp({ orderCreatedAt: 9000, linkUpdatedAt: null })).toBe(9000);
		expect(calendarStamp({ orderCreatedAt: 9000, linkUpdatedAt: 5000, now: 20000 })).toBe(20000);
	});
});

describe('el mail «Link de la transmisión»', () => {
	const base = {
		order: fixtureOrder({ buyer_name: 'Persona Demo', event_slug: 'evento-de-prueba' }),
		tickets: fixtureTickets(),
		link: STREAM,
		origin: ORIGIN,
		contactEmail: 'contacto@example.com'
	};

	it('con el slug: el .ics actualizado con el link como lugar y el link a Google Calendar', () => {
		const mail = buildStreamLinkEmail({ ...base, event: { ...EVENT, stamp: 120_000 } });
		const [att] = /** @type {any[]} */ (mail.attachments);
		expect(att.filename).toBe('evento-de-prueba.ics');
		const ics = fromBase64(att.content);
		expect(new URL(/** @type {string} */ (unescape(prop(ics, 'LOCATION')))).href).toBe(STREAM);
		expect(prop(ics, 'UID')).toBe('evento-de-prueba@kinkyvibe.ar');
		expect(prop(ics, 'SEQUENCE')).toBe('2');
		expect(textOf(mail.html)).toContain(
			'Agregalo a tu calendario: abrí el archivo evento-de-prueba.ics que va adjunto.'
		);
		const prefix = 'Agregar a Google Calendar: ';
		const line = /** @type {string} */ (mail.text.split('\n').find((l) => l.startsWith(prefix)));
		expect(new URL(line.slice(prefix.length)).searchParams.get('location')).toBe(STREAM);
		// Sin el marcado para Gmail (va solo en la confirmación de la compra).
		expect(mail.html.split('application/ld+json')).toHaveLength(1);
	});

	it('sin el slug (vistas previas, golden): sin adjunto ni link', () => {
		const mail = buildStreamLinkEmail({ ...base, event: { ...EVENT, slug: undefined } });
		expect(mail.attachments).toBeUndefined();
		expect(mail.text).not.toContain('Google Calendar');
	});
});
