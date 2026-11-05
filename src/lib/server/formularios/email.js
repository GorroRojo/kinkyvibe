/**
 * El mail con el link personal de un formulario para quienes tenían entrada (docs/formularios.md):
 * la encuesta de después del evento (textos del prototipo #566) o un formulario que une admin
 * mandó a quienes tienen entrada.
 *
 * El asunto y el texto se pueden cambiar (gorrite, 5/11): en cada encuesta o formulario
 * (`forms.mail_subject`, `forms.mail_body`) y para todos en «Cómo salen por defecto»
 * (`defaults.js`). Vacío = el de arriba de esa lista; si todos están vacíos, el de siempre
 * ({@link SURVEY_MAIL_SUBJECT}…). Formato seguro de los mails del panel (negrita, links; sin HTML)
 * y variables: `{{evento}}`, `{{formulario}}`, `{{preguntas}}` y `{{link}}` (el link personal; el
 * botón va siempre).
 *
 * El asunto de siempre de la encuesta no lleva el título del evento (puede ser sensible y se ve en
 * la notificación del celu); el título va solo adentro.
 */
import { escapeHtml } from '$lib/utils/escape.js';
import { renderBlockHtml, renderPlain, safeTextError } from '$lib/utils/emailTemplates.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';

export const SURVEY_MAIL_SUBJECT = '¿Cómo la pasaste? Contanos en un minuto';
export const SURVEY_MAIL_BODY =
	'¡Gracias por venir a **{{evento}}**!\n\n' +
	'Nos ayuda un montón saber qué te gustó y qué podemos mejorar para las próximas.\n\n' +
	'{{preguntas}}.';
export const FORM_MAIL_SUBJECT = '{{formulario}}';
export const FORM_MAIL_BODY =
	'Tenés entrada para **{{evento}}** y te queremos preguntar algo.\n\n{{preguntas}}.';

/** Las variables de los textos del mail. */
export const MAIL_VARS = Object.freeze(['evento', 'formulario', 'preguntas', 'link']);

/** Largos máximos (los mismos que los CHECK de la migración 0080). */
export const MAIL_TEXT_LIMITS = Object.freeze({ subject: 150, body: 2000 });

const HELP = 'El link es solo tuyo y sirve para contestar una vez. Si no tenés ganas, ignoralo.';
const WHY = 'Te llega porque tenías entrada para este evento.';

/** «Son 5 preguntas cortas» / «Es una pregunta corta». @param {number} n */
export function questionCountText(n) {
	return n === 1 ? 'Es una pregunta corta' : `Son ${n} preguntas cortas`;
}

/**
 * ¿Está bien este texto del mail? `null` si sí (vacío también: vale el de arriba).
 *
 * @param {string} text ya sin espacios a los costados
 * @param {'subject' | 'body'} part
 */
export function mailTextError(text, part) {
	if (!text) return null;
	if (part === 'subject' && /[\r\n]/.test(text)) return 'El asunto va en una sola línea.';
	return safeTextError(text, {
		max: MAIL_TEXT_LIMITS[part],
		vars: MAIL_VARS,
		links: part === 'body'
	});
}

/**
 * El asunto y el texto que valen para un formulario: el suyo, si no el de «Cómo salen por defecto»,
 * si no el de siempre.
 *
 * @param {{ kind: string, mailSubject?: string, mailBody?: string }} form
 * @param {Pick<import('./defaults.js').FormDefaults, 'surveyMailSubject' | 'surveyMailBody' |
 *   'formMailSubject' | 'formMailBody'> | null} [defaults]
 */
export function mailTexts(form, defaults = null) {
	const survey = form.kind === 'survey';
	return {
		subject:
			form.mailSubject ||
			(survey ? defaults?.surveyMailSubject : defaults?.formMailSubject) ||
			(survey ? SURVEY_MAIL_SUBJECT : FORM_MAIL_SUBJECT),
		body:
			form.mailBody ||
			(survey ? defaults?.surveyMailBody : defaults?.formMailBody) ||
			(survey ? SURVEY_MAIL_BODY : FORM_MAIL_BODY)
	};
}

/**
 * @param {{ survey: boolean, formTitle: string, eventTitle: string, questions: number,
 *   anonymous: boolean, url: string, origin?: string, contactEmail?: string,
 *   subject?: string, body?: string }} input `subject` y `body`: los textos que valen
 *   ({@link mailTexts}); sin ellos, los de siempre
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
	contactEmail,
	subject,
	body
}) {
	const count = questionCountText(questions);
	const privacy = anonymous ? ' y es anónima: no guardamos quién contestó qué' : '';
	const button = survey ? 'Contestar la encuesta' : 'Responder';
	const vars = {
		evento: eventTitle,
		formulario: formTitle,
		preguntas: `${count}${privacy}`,
		link: url
	};
	const subjectText = renderPlain(
		subject || (survey ? SURVEY_MAIL_SUBJECT : FORM_MAIL_SUBJECT),
		vars
	).replace(/\s+/g, ' ');
	const bodyText = body || (survey ? SURVEY_MAIL_BODY : FORM_MAIL_BODY);
	const title = survey ? '¿Cómo la pasaste?' : formTitle;
	const text = [
		title,
		'',
		renderPlain(bodyText, vars, { links: true }),
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
		contentHtml: renderBlockHtml(bodyText, vars).replace(/<p>/g, `<p style="${MAIL_STYLES.p}">`),
		button: { href: url, label: button },
		helpHtml: escapeHtml(HELP),
		whyHtml: escapeHtml(WHY),
		contactEmail
	});
	return { subject: subjectText, html, text };
}
