/**
 * El mail con el link personal de un formulario para quienes tenían entrada (docs/formularios.md):
 * la encuesta de después del evento (textos del prototipo #566) o un formulario que une admin
 * mandó a quienes tienen entrada. Textos fijos acá (todavía no es una plantilla editable).
 *
 * El asunto y el preencabezado de la encuesta no llevan el título del evento (puede ser sensible y
 * se ve en la notificación del celu); el título va solo adentro.
 */
import { escapeHtml } from '$lib/utils/escape.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';

export const SURVEY_MAIL_SUBJECT = '¿Cómo la pasaste? Contanos en un minuto';

const HELP = 'El link es solo tuyo y sirve para contestar una vez. Si no tenés ganas, ignoralo.';
const WHY = 'Te llega porque tenías entrada para este evento.';

/** «Son 5 preguntas cortas» / «Es una pregunta corta». @param {number} n */
export function questionCountText(n) {
	return n === 1 ? 'Es una pregunta corta' : `Son ${n} preguntas cortas`;
}

/**
 * @param {{ survey: boolean, formTitle: string, eventTitle: string, questions: number,
 *   anonymous: boolean, url: string, origin?: string, contactEmail?: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildFormEmail({
	survey,
	formTitle,
	eventTitle,
	questions,
	anonymous,
	url,
	origin,
	contactEmail
}) {
	const count = questionCountText(questions);
	const privacy = anonymous ? ' y es anónima: no guardamos quién contestó qué' : '';
	const button = survey ? 'Contestar la encuesta' : 'Responder';
	const subject = survey ? SURVEY_MAIL_SUBJECT : formTitle;
	const title = survey ? '¿Cómo la pasaste?' : formTitle;
	const lead = survey
		? `¡Gracias por venir a ${eventTitle}!`
		: `Tenés entrada para ${eventTitle} y te queremos preguntar algo.`;
	const leadHtml = survey
		? `¡Gracias por venir a <strong>${escapeHtml(eventTitle)}</strong>!`
		: `Tenés entrada para <strong>${escapeHtml(eventTitle)}</strong> y te queremos preguntar algo.`;
	const ask = survey
		? 'Nos ayuda un montón saber qué te gustó y qué podemos mejorar para las próximas.'
		: '';
	const countLine = `${count}${privacy}.`;
	const text = [
		title,
		'',
		lead,
		...(ask ? [ask] : []),
		countLine,
		'',
		`${button}: ${url}`,
		'',
		HELP,
		'',
		WHY
	].join('\n');
	const html = mailLayout({
		origin,
		preheader: `${count}${anonymous ? ' y es anónima' : ''}`,
		label: survey ? 'Encuesta' : 'Formulario',
		titleHtml: escapeHtml(title),
		contentHtml: [
			`<p style="${MAIL_STYLES.p}">${leadHtml}</p>`,
			ask ? `<p style="${MAIL_STYLES.p}">${escapeHtml(ask)}</p>` : '',
			`<p style="${MAIL_STYLES.p}">${escapeHtml(countLine)}</p>`
		]
			.filter(Boolean)
			.join('\n'),
		button: { href: url, label: button },
		helpHtml: escapeHtml(HELP),
		whyHtml: escapeHtml(WHY),
		contactEmail
	});
	return { subject, html, text };
}
