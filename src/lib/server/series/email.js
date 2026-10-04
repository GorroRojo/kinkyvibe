/**
 * Mails de "Avisame si se repite": el de confirmar (doble confirmación, sin cuenta) y el aviso de
 * una edición nueva. Los dos llevan el link para darse de baja.
 */
import { escapeHtml } from '$lib/server/tickets/email.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import { argDateTimeLong } from '$lib/utils/dates.js';
import { expiresInText } from '$lib/utils/expiry.js';

/** @typedef {{ subject: string, html: string, text: string }} Message */

const SMALL = 'font-size:14px;color:#625b68';

/** @param {string} start */
export function editionDate(start) {
	const d = new Date(start);
	if (Number.isNaN(d.getTime())) return '';
	return argDateTimeLong(d);
}

/**
 * `expiresAt`: cuándo vence el link. En el mail va con la hora de Argentina (no sabemos la zona de
 * quien lo lee; src/lib/utils/expiry.js).
 * `origin`: del sitio, para el logo (sin él, SITE_URL o el de producción).
 * @param {{ seriesName: string, confirmUrl: string, unsubscribeUrl: string, expiresAt: number,
 *   now: number, origin?: string }} input
 * @returns {Message}
 */
export function buildSeriesConfirmEmail({
	seriesName,
	confirmUrl,
	unsubscribeUrl,
	expiresAt,
	now,
	origin
}) {
	const vence = expiresInText(expiresAt, now, { lowercase: true });
	const subject = `Confirmá el aviso de ${seriesName}`;
	const text = [
		'Hola:',
		'',
		`Pediste que te avisemos por mail cuando haya una nueva edición de ${seriesName}.`,
		'',
		`Para confirmarlo, entrá a este link: ${confirmUrl}`,
		`El link ${vence}.`,
		'',
		'Si no lo pediste vos, ignorá este mail: sin confirmar no te llega nada.',
		`Para borrar el pedido ahora: ${unsubscribeUrl}`
	].join('\n');
	const html = mailLayout({
		origin,
		label: 'Avisos de series',
		titleHtml: 'Confirmá el aviso',
		contentHtml: `<p>Hola:</p>
		<p>Pediste que te avisemos por mail cuando haya una nueva edición de <strong>${escapeHtml(seriesName)}</strong>.</p>`,
		button: { href: confirmUrl, label: 'Confirmar el aviso' },
		helpHtml: `El link ${escapeHtml(vence)}. Si no lo pediste vos, ignorá este mail: sin confirmar no te llega nada.`,
		whyHtml: `Te llega porque alguien pidió avisos de ${escapeHtml(seriesName)} con este mail.`,
		unsubscribeHtml: `<a href="${escapeHtml(unsubscribeUrl)}" style="${MAIL_STYLES.link}">Borrar el pedido ahora</a>`
	});
	return { subject, html, text };
}

/**
 * @param {{ seriesName: string, title: string, start: string, eventUrl: string,
 *   unsubscribeUrl: string, origin?: string }} input
 * @returns {Message}
 */
export function buildNewEditionEmail({
	seriesName,
	title,
	start,
	eventUrl,
	unsubscribeUrl,
	origin
}) {
	const when = editionDate(start);
	const subject = `Hay nueva edición de ${seriesName}`;
	const text = [
		'Hola:',
		'',
		`Se anunció una nueva edición de ${seriesName}:`,
		'',
		`${title}${when ? ` · ${when}` : ''}`,
		eventUrl,
		'',
		'Te llega porque pediste que te avisemos si se repetía.',
		`Para no recibir más avisos de ${seriesName}: ${unsubscribeUrl}`
	].join('\n');
	const html = mailLayout({
		origin,
		label: 'Avisos de series',
		titleHtml: `Hay nueva edición de ${escapeHtml(seriesName)}`,
		contentHtml: `<p>Hola:</p>
		<p>Se anunció una nueva edición de <strong>${escapeHtml(seriesName)}</strong>:</p>
		<p style="font-size:18px;margin:16px 0"><a href="${escapeHtml(eventUrl)}" style="${MAIL_STYLES.link}"><strong>${escapeHtml(title)}</strong></a>${when ? `<br><span style="${SMALL}">${escapeHtml(when)}</span>` : ''}</p>`,
		button: { href: eventUrl, label: 'Ver el evento' },
		whyHtml: 'Te llega porque pediste que te avisemos si se repetía.',
		unsubscribeHtml: `<a href="${escapeHtml(unsubscribeUrl)}" style="${MAIL_STYLES.link}">No quiero más avisos de ${escapeHtml(seriesName)}</a>`
	});
	return { subject, html, text };
}
