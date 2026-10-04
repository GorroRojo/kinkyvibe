/**
 * Los mails de «Lo que sigo»: «se anunció algo nuevo» y «recordatorio el día antes». Los dos
 * dicen por qué llegan (qué sigue la persona) y llevan el link para apagar todos estos mails y el
 * de Mi rincón → Lo que sigo. Nunca nada de otras cuentas.
 */
import { escapeHtml } from '$lib/server/tickets/email.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import { editionDate } from '$lib/server/series/email.js';

/** @typedef {{ subject: string, html: string, text: string }} Message */

const SMALL = 'font-size:14px;color:#625b68';

/**
 * @param {{ kind: 'nuevo' | 'recordatorio', title: string, start: string, eventUrl: string,
 *   reasons: readonly string[], manageUrl: string, stopUrl: string, origin?: string }} input
 * `origin`: del sitio, para el logo (sin él, SITE_URL o el de producción).
 * @returns {Message}
 */
export function buildFollowEmail({
	kind,
	title,
	start,
	eventUrl,
	reasons,
	manageUrl,
	stopUrl,
	origin
}) {
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
	const html = mailLayout({
		origin,
		label: 'Lo que seguís',
		titleHtml: escapeHtml(kind === 'nuevo' ? 'Se anunció algo que seguís' : 'Mañana se viene'),
		contentHtml: `<p>Hola:</p>
		<p>${escapeHtml(intro)}</p>
		<p style="font-size:18px;margin:16px 0"><a href="${escapeHtml(eventUrl)}" style="${MAIL_STYLES.link}"><strong>${escapeHtml(title)}</strong></a>${when ? `<br><span style="${SMALL}">${escapeHtml(when)}</span>` : ''}</p>`,
		button: { href: eventUrl, label: 'Ver el evento' },
		helpHtml: `Elegí qué te llega en <a href="${escapeHtml(manageUrl)}" style="${MAIL_STYLES.link}">Mi rincón → Lo que sigo</a>.`,
		whyHtml: `Te llega porque seguís: ${escapeHtml(why)}.`,
		unsubscribeHtml: `<a href="${escapeHtml(stopUrl)}" style="${MAIL_STYLES.link}">No quiero más mails de lo que sigo</a>`
	});
	return { subject, html, text };
}
