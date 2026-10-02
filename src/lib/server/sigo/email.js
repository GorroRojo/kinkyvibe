/**
 * Los mails de «Lo que sigo»: «se anunció algo nuevo» y «recordatorio el día antes». Los dos
 * dicen por qué llegan (qué sigue la persona) y llevan el link para apagar todos estos mails y el
 * de Mi rincón → Lo que sigo. Nunca nada de otras cuentas.
 */
import { escapeHtml } from '$lib/server/tickets/email.js';
import { editionDate } from '$lib/server/series/email.js';

/** @typedef {{ subject: string, html: string, text: string }} Message */

const WRAP = 'font-family:sans-serif;font-size:16px;color:#222;max-width:32rem';
const SMALL = 'font-size:13px;color:#555';

/**
 * @param {{ kind: 'nuevo' | 'recordatorio', title: string, start: string, eventUrl: string,
 *   reasons: readonly string[], manageUrl: string, stopUrl: string }} input
 * @returns {Message}
 */
export function buildFollowEmail({ kind, title, start, eventUrl, reasons, manageUrl, stopUrl }) {
	const when = editionDate(start);
	const why = reasons.join(', ');
	const subject = kind === 'nuevo' ? `Se anunció: ${title}` : `Mañana: ${title}`;
	const intro =
		kind === 'nuevo'
			? 'Se anunció un evento de algo que seguís:'
			: 'Te recordamos que se viene este evento:';
	const text = [
		'Hola:',
		'',
		intro,
		'',
		`${title}${when ? ` · ${when}` : ''}`,
		eventUrl,
		'',
		`Te llega porque seguís: ${why}.`,
		`Elegí qué te llega en Mi rincón → Lo que sigo: ${manageUrl}`,
		`Para no recibir más mails de lo que seguís: ${stopUrl}`
	].join('\n');
	const html = `<div style="${WRAP}">
		<p>Hola:</p>
		<p>${escapeHtml(intro)}</p>
		<p style="font-size:18px;margin:16px 0"><a href="${escapeHtml(eventUrl)}"><strong>${escapeHtml(title)}</strong></a>${when ? `<br><span style="${SMALL}">${escapeHtml(when)}</span>` : ''}</p>
		<p style="${SMALL}">Te llega porque seguís: ${escapeHtml(why)}. Elegí qué te llega en <a href="${escapeHtml(manageUrl)}">Mi rincón → Lo que sigo</a>, o <a href="${escapeHtml(stopUrl)}">no quiero más mails de lo que sigo</a>.</p>
	</div>`;
	return { subject, html, text };
}
