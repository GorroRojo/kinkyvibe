/**
 * Mail «tu link» del Fondo Kinky Vibe (fondo.kinkyvibe.ar, «¿Ya sos Mecenas?»): le manda a une
 * mecenas el link de cada una de sus suscripciones para elegir cómo aparece en el Fondo. Lo pide
 * fondo.kinkyvibe.ar por `POST /api/fondo/mi-link` (docs/mails.md, «Mail del Fondo (tu link)»);
 * el asunto, los textos y el remitente son fijos acá: quien llama solo elige la dirección y los
 * links (ya validados en miLink.js).
 */
import { escapeHtml } from '$lib/utils/escape.js';
import { MAIL_STYLES, mailButton, mailLayout } from '$lib/server/email/layout.js';

/** Remitente fijo (no el de entradas de Mensajes → Configuración). */
export const FONDO_MAIL_FROM = 'Fondo KinkyVibe <fondo@kinkyvibe.ar>';

export const FONDO_MAIL_SUBJECT = 'Tu link para elegir cómo aparecés en el Fondo Kinky Vibe';

/** Aviso de seguridad, igual en el HTML y en el texto plano. */
export const FONDO_MAIL_WARNING =
	'No compartas este mail: cualquiera que tenga el link puede cambiar cómo aparecés. Si no lo pediste, podés ignorarlo.';

const WHY = 'Te llega porque alguien pidió con este mail el link de Mecenas en fondo.kinkyvibe.ar.';

/** @typedef {{ tier: string, url: string }} FondoLink */

/** Texto del botón de un link. @param {string} tier */
export const fondoButtonLabel = (tier) => `Mecenas ${tier}: elegir cómo aparezco`;

/**
 * @param {{ links: FondoLink[], origin?: string }} input `links`: de 1 a 5, ya validados
 *   (`parseMiLinkBody`); `origin`: del sitio, para el logo (sin él, SITE_URL o el de producción)
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildFondoLinkEmail({ links, origin }) {
	const several = links.length > 1;
	const intro = several
		? 'Estos son tus links para elegir cómo aparecés en el Fondo Kinky Vibe, uno por cada suscripción:'
		: 'Este es tu link para elegir cómo aparecés en el Fondo Kinky Vibe:';
	const text = [
		'Hola:',
		'',
		intro,
		'',
		...links.flatMap(({ tier, url }) => [fondoButtonLabel(tier), url, '']),
		FONDO_MAIL_WARNING
	].join('\n');
	const buttons = links
		.map(({ tier, url }) => mailButton({ href: url, label: fondoButtonLabel(tier) }))
		.join('\n<div style="height:10px;line-height:10px;">&nbsp;</div>\n');
	const html = mailLayout({
		origin,
		label: 'Fondo Kinky Vibe',
		titleHtml: several ? 'Tus links de Mecenas' : 'Tu link de Mecenas',
		contentHtml: `<p style="${MAIL_STYLES.p}">Hola:</p>
<p style="${MAIL_STYLES.p}">${escapeHtml(intro)}</p>
${buttons}`,
		helpHtml: escapeHtml(FONDO_MAIL_WARNING),
		whyHtml: escapeHtml(WHY)
	});
	return { subject: FONDO_MAIL_SUBJECT, html, text };
}
