/**
 * Mail de la encuesta después del evento (PROTOTIPO, docs/mails.md). Textos fijos acá (todavía no
 * es una plantilla editable de Mensajes → Plantillas).
 *
 * El asunto y el preencabezado no llevan el título del evento (puede ser sensible y se ve en la
 * notificación del celu); el título va solo adentro.
 */
import { escapeHtml } from '$lib/utils/escape.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import { SURVEY_QUESTIONS } from './index.js';

export const SURVEY_MAIL_SUBJECT = '¿Cómo la pasaste? Contanos en un minuto';

const PREHEADER = `Son ${SURVEY_QUESTIONS.length} preguntas cortas y es anónima`;
const BUTTON = 'Contestar la encuesta';
const HELP = 'El link es solo tuyo y sirve para contestar una vez. Si no tenés ganas, ignoralo.';
const WHY = 'Te llega porque tenías entrada para este evento.';

/**
 * @param {{ eventTitle: string, url: string, origin?: string, contactEmail?: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildSurveyEmail({ eventTitle, url, origin, contactEmail }) {
	const thanks = `¡Gracias por venir a ${eventTitle}!`;
	const ask = 'Nos ayuda un montón saber qué te gustó y qué podemos mejorar para las próximas.';
	const anon = `Son ${SURVEY_QUESTIONS.length} preguntas cortas y es anónima: no guardamos quién contestó qué.`;
	const text = [
		'¿Cómo la pasaste?',
		'',
		thanks,
		ask,
		anon,
		'',
		`${BUTTON}: ${url}`,
		'',
		HELP,
		'',
		WHY
	].join('\n');
	const html = mailLayout({
		origin,
		preheader: PREHEADER,
		label: 'Encuesta',
		titleHtml: '¿Cómo la pasaste?',
		contentHtml: `<p style="${MAIL_STYLES.p}">¡Gracias por venir a <strong>${escapeHtml(eventTitle)}</strong>!</p>
<p style="${MAIL_STYLES.p}">${escapeHtml(ask)}</p>
<p style="${MAIL_STYLES.p}">${escapeHtml(anon)}</p>`,
		button: { href: url, label: BUTTON },
		helpHtml: escapeHtml(HELP),
		whyHtml: escapeHtml(WHY),
		contactEmail
	});
	return { subject: SURVEY_MAIL_SUBJECT, html, text };
}
