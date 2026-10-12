/**
 * Mails de la lista de espera (docs/mails.md, «Lista de espera»; docs/tickets.md). Cinco, cada
 * uno con su plantilla editable (`waitlist_*` en $lib/utils/emailTemplates.js) y la plantilla
 * común (`mailLayout`):
 *
 * - confirmar el mail (`waitlist_confirm`), en el momento de anotarse;
 * - se liberó un lugar (`waitlist_offer`): con el lugar guardado hasta una hora, o el aviso a toda
 *   la lista a la vez (sin lugar guardado, `holdUntil` null);
 * - último aviso (`waitlist_reminder`), cuando queda poco de un lugar guardado;
 * - se venció tu lugar (`waitlist_expired`), con «Volver a anotarme»;
 * - se cerró la lista (`waitlist_closed`), poco antes del comienzo o si se cancela el evento.
 *
 * Todos llevan el link para salir de la lista en el pie (`unsubscribeUrl`). Sin nombre: la lista
 * guarda solo el mail. Lo editable es el asunto, el título, el texto de arriba, la etiqueta, el
 * botón, la línea de ayuda y el pie; el evento, la hora hasta la que se guarda el lugar y los
 * links los pone siempre el código. Sin plantilla guardada, sale el texto de siempre de la
 * plantilla (sus `defaults`).
 */
import { argDeadline } from '$lib/utils/dates.js';
import { ARGENTINA_TIME_NOTE, expiresInText } from '$lib/utils/expiry.js';
import { mergeTemplates, templateDef } from '$lib/utils/emailTemplates.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import { applyTemplate, escapeHtml, formatEventDate } from './email.js';

/** @typedef {{ subject: string, html: string, text: string }} Message */
/** @typedef {import('./email.js').Template} Template */
/** @typedef {import('$lib/utils/emailTemplates.js').WaitlistTemplateId} WaitlistTemplateId */
/** @typedef {{ title: string, start?: string | null }} WaitlistEvent */

/** El recuadro amarillo de «te lo guardamos hasta…» (como el de la transferencia). */
const HOLD_BOX = 'background:#fff3c4;border-radius:12px;padding:12px 16px;margin:0 0 16px';

/** Las líneas de ayuda que pone el código si la plantilla no trae una. */
export const WAITLIST_HELP = Object.freeze({
	offerHold: 'Si no podés, no hagas nada: le pasamos el lugar a la próxima persona.',
	offerBroadcast: 'Si ya no te interesa, podés salir de la lista con el link de abajo.'
});

/**
 * La plantilla con la que sale: la guardada (la del evento sobre la general, ya juntas) y, en lo
 * que falte, el texto de siempre de la plantilla.
 *
 * @param {WaitlistTemplateId} id
 * @param {Template} template
 */
function partsFor(id, template) {
	const def = templateDef(id);
	if (!def) throw new Error(`plantilla desconocida: ${id}`);
	/** @type {import('$lib/utils/emailTemplates.js').TemplateParts} */
	const defaults = { ...def.defaults };
	for (const [k, extra] of Object.entries(def.extras)) {
		if (extra?.default)
			defaults[/** @type {import('$lib/utils/emailTemplates.js').ExtraKey} */ (k)] = extra.default;
	}
	return mergeTemplates(template, defaults);
}

/**
 * Las variables de las plantillas de la lista.
 *
 * @param {WaitlistEvent} event
 * @param {string | null | undefined} typeName el tipo de entrada (lista por tipo), o nada
 * @param {number | null} [holdUntil]
 */
export function waitlistVars(event, typeName, holdUntil = null) {
	return {
		evento: event.title,
		fecha: formatEventDate(event.start ?? undefined),
		tipo: typeName ?? '',
		vence: holdUntil ? argDeadline(holdUntil) : ''
	};
}

/**
 * El evento, su fecha y (en una lista por tipo) el tipo de entrada.
 * @param {WaitlistEvent} event
 * @param {string | null | undefined} typeName
 */
function eventBlock(event, typeName) {
	const date = formatEventDate(event.start ?? undefined);
	const lines = [event.title, date, typeName ? `Entrada: ${typeName}` : ''].filter(Boolean);
	return {
		html: `<p><strong>${escapeHtml(event.title)}</strong>${date ? `<br>${escapeHtml(date)}` : ''}${typeName ? `<br>Entrada: ${escapeHtml(typeName)}` : ''}</p>`,
		text: lines
	};
}

/**
 * El link del pie para salir de la lista.
 * @param {string} url
 * @param {string} [label]
 */
const leaveHtml = (url, label = 'Salir de la lista de espera') =>
	`<a href="${escapeHtml(url)}" style="${MAIL_STYLES.link}">${escapeHtml(label)}</a>`;

/**
 * Arma un mail de la lista con la plantilla común.
 *
 * @param {{
 *   id: WaitlistTemplateId,
 *   template: Template,
 *   vars: Record<string, string>,
 *   event: WaitlistEvent,
 *   typeName?: string | null,
 *   boxHtml?: string,
 *   boxText?: string,
 *   button: { href: string } | null,
 *   helpHtml?: string,
 *   helpText?: string,
 *   unsubscribeUrl: string,
 *   unsubscribeLabel?: string,
 *   unsubscribeText?: string,
 *   origin?: string,
 *   contactEmail?: string
 * }} input
 * `helpHtml`/`helpText`: la ayuda del código si la plantilla no trae una (vacía = sin ayuda).
 * @returns {Message}
 */
function buildWaitlistMail({
	id,
	template,
	vars,
	event,
	typeName,
	boxHtml = '',
	boxText = '',
	button,
	helpHtml = '',
	helpText = '',
	unsubscribeUrl,
	unsubscribeLabel,
	unsubscribeText = 'Para salir de la lista de espera',
	origin,
	contactEmail
}) {
	const c = applyTemplate(partsFor(id, template), vars);
	const block = eventBlock(event, typeName);
	const label = /** @type {string} */ (c.label);
	const buttonLabel = c.button ?? '';
	const help = c.helpHtml ?? helpHtml;
	const helpPlain = c.helpText ?? helpText;
	const html = mailLayout({
		origin,
		label,
		titleHtml: /** @type {string} */ (c.headingHtml),
		contentHtml: `${c.bodyHtml}
		${block.html}${boxHtml ? `\n\t\t<p style="${HOLD_BOX}">${boxHtml}</p>` : ''}`,
		button: button && buttonLabel ? { href: button.href, label: buttonLabel } : null,
		helpHtml: help,
		whyHtml: /** @type {string} */ (c.whyHtml),
		contactEmail,
		unsubscribeHtml: leaveHtml(unsubscribeUrl, unsubscribeLabel)
	});
	const text = [
		c.headingText,
		'',
		c.bodyText,
		'',
		...block.text,
		...(boxText ? ['', boxText] : []),
		...(button && buttonLabel ? ['', `${buttonLabel}: ${button.href}`] : []),
		...(helpPlain ? [helpPlain] : []),
		'',
		`${unsubscribeText}: ${unsubscribeUrl}`
	].join('\n');
	return { subject: /** @type {string} */ (c.subject), html, text };
}

/**
 * «Confirmá tu mail»: el link para entrar a la fila (vale hasta `expiresAt`). El link del pie
 * borra el pedido.
 *
 * @param {{ event: WaitlistEvent, typeName?: string | null, confirmUrl: string,
 *   unsubscribeUrl: string, expiresAt: number, now: number, origin?: string,
 *   contactEmail?: string, template?: Template }} input
 * @returns {Message}
 */
export function buildWaitlistConfirmEmail({
	event,
	typeName = null,
	confirmUrl,
	unsubscribeUrl,
	expiresAt,
	now,
	origin,
	contactEmail,
	template
}) {
	const help = `El link ${expiresInText(expiresAt, now, { lowercase: true })}. Si no lo pediste vos, ignorá este mail: sin confirmar no quedás en la lista.`;
	return buildWaitlistMail({
		id: 'waitlist_confirm',
		template,
		vars: waitlistVars(event, typeName),
		event,
		typeName,
		button: { href: confirmUrl },
		helpHtml: escapeHtml(help),
		helpText: help,
		unsubscribeUrl,
		unsubscribeLabel: 'Borrar el pedido ahora',
		unsubscribeText: 'Para borrar el pedido ahora',
		origin,
		contactEmail
	});
}

/**
 * «¡Se liberó un lugar!»: con `holdUntil`, le guardamos el lugar hasta esa hora; con `null`, se le
 * avisó a toda la lista a la vez y se lo queda quien compre primero. `offerUrl` es el link de la
 * compra con su oferta (`/calendario/<slug>/entradas?lista=<token>`).
 *
 * @param {{ event: WaitlistEvent, typeName?: string | null, offerUrl: string,
 *   holdUntil: number | null, unsubscribeUrl: string, origin?: string, contactEmail?: string,
 *   template?: Template }} input
 * @returns {Message}
 */
export function buildWaitlistOfferEmail({
	event,
	typeName = null,
	offerUrl,
	holdUntil,
	unsubscribeUrl,
	origin,
	contactEmail,
	template
}) {
	const deadline = holdUntil ? argDeadline(holdUntil) : '';
	const box = deadline
		? {
				html: `Te lo guardamos hasta el <strong>${escapeHtml(deadline)}</strong> (${ARGENTINA_TIME_NOTE}). Podés comprar todas las entradas que haya en ese momento.`,
				text: `Te lo guardamos hasta el ${deadline} (${ARGENTINA_TIME_NOTE}). Podés comprar todas las entradas que haya en ese momento.`
			}
		: {
				html: 'Le avisamos a toda la lista a la vez: se lo queda quien compre primero.',
				text: 'Le avisamos a toda la lista a la vez: se lo queda quien compre primero.'
			};
	const help = deadline ? WAITLIST_HELP.offerHold : WAITLIST_HELP.offerBroadcast;
	return buildWaitlistMail({
		id: 'waitlist_offer',
		template,
		vars: waitlistVars(event, typeName, holdUntil),
		event,
		typeName,
		boxHtml: box.html,
		boxText: box.text,
		button: { href: offerUrl },
		helpHtml: escapeHtml(help),
		helpText: help,
		unsubscribeUrl,
		origin,
		contactEmail
	});
}

/**
 * «Último aviso»: queda poco del lugar guardado (solo con lugar guardado, nunca en el aviso a
 * toda la lista).
 *
 * @param {{ event: WaitlistEvent, typeName?: string | null, offerUrl: string,
 *   holdUntil: number, unsubscribeUrl: string, origin?: string, contactEmail?: string,
 *   template?: Template }} input
 * @returns {Message}
 */
export function buildWaitlistReminderEmail({
	event,
	typeName = null,
	offerUrl,
	holdUntil,
	unsubscribeUrl,
	origin,
	contactEmail,
	template
}) {
	const deadline = argDeadline(holdUntil);
	return buildWaitlistMail({
		id: 'waitlist_reminder',
		template,
		vars: waitlistVars(event, typeName, holdUntil),
		event,
		typeName,
		boxHtml: `Te lo guardamos hasta el <strong>${escapeHtml(deadline)}</strong> (${ARGENTINA_TIME_NOTE}). Después se lo pasamos a la próxima persona de la fila.`,
		boxText: `Te lo guardamos hasta el ${deadline} (${ARGENTINA_TIME_NOTE}). Después se lo pasamos a la próxima persona de la fila.`,
		button: { href: offerUrl },
		unsubscribeUrl,
		origin,
		contactEmail
	});
}

/**
 * «Se venció tu lugar», con «Volver a anotarme» (`rejoinUrl`: al final de la fila, sin confirmar
 * de nuevo).
 *
 * @param {{ event: WaitlistEvent, typeName?: string | null, rejoinUrl: string,
 *   unsubscribeUrl: string, origin?: string, contactEmail?: string, template?: Template }} input
 * @returns {Message}
 */
export function buildWaitlistExpiredEmail({
	event,
	typeName = null,
	rejoinUrl,
	unsubscribeUrl,
	origin,
	contactEmail,
	template
}) {
	return buildWaitlistMail({
		id: 'waitlist_expired',
		template,
		vars: waitlistVars(event, typeName),
		event,
		typeName,
		button: { href: rejoinUrl },
		unsubscribeUrl,
		origin,
		contactEmail
	});
}

/**
 * «Se cerró la lista de espera»: poco antes del comienzo o al cerrar la venta (`closed`), o
 * porque se canceló el evento (`event_cancelled`).
 *
 * @param {{ event: WaitlistEvent, typeName?: string | null, reason: 'closed' | 'event_cancelled',
 *   eventUrl: string, unsubscribeUrl: string, origin?: string, contactEmail?: string,
 *   template?: Template }} input
 * @returns {Message}
 */
export function buildWaitlistClosedEmail({
	event,
	typeName = null,
	reason,
	eventUrl,
	unsubscribeUrl,
	origin,
	contactEmail,
	template
}) {
	const why =
		reason === 'event_cancelled'
			? 'El evento se canceló.'
			: 'Ya no vamos a ofrecer más lugares: falta poco para que empiece o ya cerró la venta.';
	return buildWaitlistMail({
		id: 'waitlist_closed',
		template,
		vars: waitlistVars(event, typeName),
		event,
		typeName,
		boxHtml: escapeHtml(why),
		boxText: why,
		button: { href: eventUrl },
		unsubscribeUrl,
		origin,
		contactEmail
	});
}
