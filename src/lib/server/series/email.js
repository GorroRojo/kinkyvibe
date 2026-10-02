/**
 * Mails de "Avisame si se repite": el de confirmar (doble confirmación, sin cuenta) y el aviso de
 * una edición nueva. Los dos llevan el link para darse de baja.
 */
import { escapeHtml } from '$lib/server/tickets/email.js';
import { TIMEZONE } from '$lib/utils/dates.js';
import { expiresInText } from '$lib/utils/expiry.js';

/** @typedef {{ subject: string, html: string, text: string }} Message */

const WRAP = 'font-family:sans-serif;font-size:16px;color:#222;max-width:32rem';
const SMALL = 'font-size:13px;color:#555';

/** @param {string} start */
export function editionDate(start) {
	const d = new Date(start);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short', timeZone: TIMEZONE });
}

/**
 * `expiresAt`: cuándo vence el link. En el mail va con la hora de Argentina (no sabemos la zona de
 * quien lo lee; src/lib/utils/expiry.js).
 * @param {{ seriesName: string, confirmUrl: string, unsubscribeUrl: string, expiresAt: number, now: number }} input
 * @returns {Message}
 */
export function buildSeriesConfirmEmail({
	seriesName,
	confirmUrl,
	unsubscribeUrl,
	expiresAt,
	now
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
	const html = `<div style="${WRAP}">
		<p>Hola:</p>
		<p>Pediste que te avisemos por mail cuando haya una nueva edición de <strong>${escapeHtml(seriesName)}</strong>.</p>
		<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#e0338f;color:#fff;text-decoration:none;font-weight:bold">Confirmar el aviso</a></p>
		<p style="${SMALL}">El link ${escapeHtml(vence)}.</p>
		<p style="${SMALL}">Si no lo pediste vos, ignorá este mail: sin confirmar no te llega nada. También podés <a href="${escapeHtml(unsubscribeUrl)}">borrar el pedido ahora</a>.</p>
	</div>`;
	return { subject, html, text };
}

/**
 * @param {{ seriesName: string, title: string, start: string, eventUrl: string, unsubscribeUrl: string }} input
 * @returns {Message}
 */
export function buildNewEditionEmail({ seriesName, title, start, eventUrl, unsubscribeUrl }) {
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
	const html = `<div style="${WRAP}">
		<p>Hola:</p>
		<p>Se anunció una nueva edición de <strong>${escapeHtml(seriesName)}</strong>:</p>
		<p style="font-size:18px;margin:16px 0"><a href="${escapeHtml(eventUrl)}"><strong>${escapeHtml(title)}</strong></a>${when ? `<br><span style="${SMALL}">${escapeHtml(when)}</span>` : ''}</p>
		<p style="${SMALL}">Te llega porque pediste que te avisemos si se repetía. <a href="${escapeHtml(unsubscribeUrl)}">No quiero más avisos de ${escapeHtml(seriesName)}</a>.</p>
	</div>`;
	return { subject, html, text };
}
