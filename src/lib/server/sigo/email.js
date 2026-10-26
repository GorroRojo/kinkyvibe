/**
 * Los mails de «Lo que sigo»: «se anunció algo nuevo» y el recordatorio, que sale cuando el evento
 * entra en las próximas 24 horas (por eso dice «Hoy», «Mañana» o «Se viene» según el día, en hora
 * de Argentina, de `now` y del evento: ver {@link followReminderDay}). Los dos
 * dicen por qué llegan (qué sigue la persona) y llevan el link para apagar todos estos mails y el
 * de Mi rincón → Lo que sigo. Nunca nada de otras cuentas.
 */
import { escapeHtml } from '$lib/server/tickets/email.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import { editionDate } from '$lib/server/series/email.js';
import { parseSiteDate, toArgentina } from '$lib/utils/dates.js';

/** @typedef {{ subject: string, html: string, text: string }} Message */

const SMALL = 'font-size:14px;color:#625b68';

/**
 * Qué día es el evento visto desde `now`, en hora de Argentina: `hoy`, `manana` o `pronto` (más
 * adelante, o una fecha que no se puede leer).
 *
 * @param {string} start
 * @param {number} now
 * @returns {'hoy' | 'manana' | 'pronto'}
 */
export function followReminderDay(start, now) {
	const d = parseSiteDate(start);
	if (Number.isNaN(d.getTime())) return 'pronto';
	/** @param {Date | number} x */
	const day = (x) => {
		const a = toArgentina(x);
		return Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
	};
	const diff = Math.round((day(d) - day(now)) / (24 * 60 * 60 * 1000));
	return diff <= 0 ? 'hoy' : diff === 1 ? 'manana' : 'pronto';
}

/** Asunto y título del recordatorio según {@link followReminderDay}. */
const REMINDER_WORDS = Object.freeze({
	hoy: { subject: 'Hoy', title: 'Hoy se viene' },
	manana: { subject: 'Mañana', title: 'Mañana se viene' },
	pronto: { subject: 'Se viene', title: 'Se viene' }
});

/**
 * @param {{ kind: 'nuevo' | 'recordatorio', title: string, start: string, eventUrl: string,
 *   reasons: readonly string[], manageUrl: string, stopUrl: string, origin?: string,
 *   now?: number }} input
 * `origin`: del sitio, para el logo (sin él, SITE_URL o el de producción).
 * `now`: cuándo sale (para «Hoy» o «Mañana» en el recordatorio).
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
	origin,
	now = Date.now()
}) {
	const when = editionDate(start);
	const why = reasons.join(', ');
	const words = REMINDER_WORDS[followReminderDay(start, now)];
	const subject = kind === 'nuevo' ? `Se anunció: ${title}` : `${words.subject}: ${title}`;
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
		titleHtml: escapeHtml(kind === 'nuevo' ? 'Se anunció algo que seguís' : words.title),
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
