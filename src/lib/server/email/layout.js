/**
 * Plantilla común de todos los mails transaccionales (entradas, transferencia, transmisión,
 * recordatorios, reembolso, mail a compradores, códigos de Mi rincón, invitaciones, avisos de
 * series y de «Lo que sigo»). Diseño aprobado por gorrite: logo centrado arriba, tarjeta blanca
 * con borde rosa, etiqueta gris, título, detalles, un botón rosa y una línea de ayuda; abajo, por
 * qué te llega, el contacto, la baja (si hay) y «Kinky Vibe · Buenos Aires».
 *
 * Seguro para clientes de mail: tablas, estilos en línea, sin media queries ni imágenes en
 * `data:` (muchos clientes las bloquean). El logo es una URL absoluta del sitio y su `alt` se lee
 * en rosa si las imágenes están bloqueadas.
 *
 * Todo lo que llega en `*Html` ya tiene que venir escapado (lo arma cada builder).
 */
import { env } from '$env/dynamic/private';
import { escapeHtml } from '$lib/utils/escape.js';
import { DEFAULT_CONTACT_EMAIL } from '$lib/utils/tickets.js';
import { renderInlineHtml } from '$lib/utils/emailTemplates.js';

/** Origen del sitio cuando el builder no recibe uno (ni hay SITE_URL). */
export const DEFAULT_MAIL_ORIGIN = 'https://kinkyvibe.ar';
/** Ruta del logo (static/). */
export const MAIL_LOGO_PATH = '/android-chrome-192x192.png';
/** Marca para los tests: todo mail armado con esta plantilla la lleva. */
export const MAIL_LAYOUT_MARK = 'data-kv-mail="layout"';

export const MAIL_COLORS = Object.freeze({
	page: '#f4eff6',
	card: '#ffffff',
	pink: 'hsl(319,90%,60%)',
	pinkText: 'hsl(319,100%,36%)',
	link: 'hsl(262,90%,45%)',
	text: '#2b2730',
	muted: '#625b68',
	faint: '#8a8290',
	soft: '#f6eef3'
});

const FONT = "Lato,'Helvetica Neue',Helvetica,Arial,sans-serif";

/** Estilos en línea reutilizables dentro de la tarjeta. */
export const MAIL_STYLES = Object.freeze({
	p: `margin:0 0 14px;font-size:16px;line-height:1.55;color:${MAIL_COLORS.text}`,
	small: `margin:0 0 14px;font-size:14px;line-height:1.5;color:${MAIL_COLORS.muted}`,
	link: `color:${MAIL_COLORS.link}`,
	box: `background:${MAIL_COLORS.soft};border-radius:12px;padding:12px 16px;margin:0 0 16px`
});

/**
 * Origen del sitio para el logo: el que pasó el builder, o SITE_URL, o el de producción.
 * @param {string | undefined} origin
 */
function siteOrigin(origin) {
	const o = origin?.trim() || env.SITE_URL?.trim() || DEFAULT_MAIL_ORIGIN;
	return o.replace(/\/+$/, '');
}

/** Contacto público (el mismo que `contactEmail()` de tickets/index.js). */
export function defaultMailContact() {
	return env.TICKETS_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;
}

/**
 * Botón rosa (uno por mail). Tabla con fondo en la celda: se ve también en Outlook.
 * @param {{ href: string, label: string }} button
 */
export function mailButton({ href, label }) {
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 4px"><tr><td style="border-radius:999px;background:${MAIL_COLORS.pink};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:19px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/**
 * El pie de todos los mails que se puede cambiar en Ajustes → Mails (`mail_footer_contact` y
 * `mail_footer_signoff` de `ticket_settings`): la línea de contacto y la firma. Vacíos = estos
 * textos (el mail sale byte a byte como siempre). Mismo formato seguro que las plantillas
 * (`**negrita**`, links); en la línea de contacto, `{{contacto}}` es la dirección de contacto
 * con su link `mailto:`.
 */
export const DEFAULT_MAIL_FOOTER = Object.freeze({
	contact: '¿Dudas? Escribinos a {{contacto}}',
	signoff: 'Kinky Vibe · Buenos Aires'
});

/** Las variables de la línea de contacto del pie. */
export const MAIL_FOOTER_VARS = Object.freeze(['contacto']);

/** @typedef {{ contact?: string | null, signoff?: string | null }} MailFooter */

/** @param {string} contact */
const contactLink = (contact) =>
	`<a href="mailto:${escapeHtml(contact)}" style="color:${MAIL_COLORS.link};">${escapeHtml(contact)}</a>`;

/** @param {string} inner ya en HTML */
const signoffSpan = (inner) => `<span style="color:${MAIL_COLORS.faint};">${inner}</span>`;

/** La línea de contacto de siempre, tal cual la escribe {@link mailLayout}. */
const DEFAULT_CONTACT_LINE_RE = new RegExp(
	`\n¿Dudas\\? Escribinos a (<a href="mailto:[^"<>]*" style="color:${MAIL_COLORS.link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};">[^<>]*</a>)<br>\n`,
	'g'
);

/**
 * Reemplaza la última coincidencia de `re` en `text`.
 * @param {string} text
 * @param {RegExp} re con `g`
 * @param {(match: RegExpMatchArray) => string} to
 */
function replaceLast(text, re, to) {
	const all = [...text.matchAll(re)];
	const last = all[all.length - 1];
	if (!last || last.index === undefined) return text;
	return text.slice(0, last.index) + to(last) + text.slice(last.index + last[0].length);
}

/**
 * El mail con el pie de los ajustes (lo cambia `deliver()` al mandar y la vista previa del editor
 * de plantillas). Sin textos propios, el mismo HTML. Reemplaza solo la línea de contacto y la
 * firma que escribió {@link mailLayout} (la última de cada una: el pie va al final; lo editable
 * de las plantillas va escapado y nunca tiene esa forma).
 *
 * @param {string} html un mail armado con {@link mailLayout}
 * @param {MailFooter | null | undefined} footer
 */
export function withMailFooter(html, footer) {
	const contact = footer?.contact?.trim();
	const signoff = footer?.signoff?.trim();
	let out = html;
	if (contact) {
		out = replaceLast(out, DEFAULT_CONTACT_LINE_RE, (m) => {
			const mark = '\u0003';
			const line = renderInlineHtml(
				contact.replace(/\{\{\s*contacto\s*\}\}/g, mark),
				{}
			).replaceAll(mark, m[1]);
			return `\n${line}<br>\n`;
		});
	}
	if (signoff) {
		const def = signoffSpan(escapeHtml(DEFAULT_MAIL_FOOTER.signoff));
		const at = out.lastIndexOf(def);
		if (at !== -1) {
			out =
				out.slice(0, at) + signoffSpan(renderInlineHtml(signoff, {})) + out.slice(at + def.length);
		}
	}
	return out;
}

/**
 * Arma el mail completo.
 *
 * @param {{
 *   origin?: string,
 *   label: string,
 *   titleHtml: string,
 *   contentHtml?: string,
 *   button?: { href: string, label: string } | null,
 *   helpHtml?: string,
 *   afterHtml?: string,
 *   whyHtml: string,
 *   contactEmail?: string,
 *   unsubscribeHtml?: string
 * }} input
 * - `label`: etiqueta gris de arriba («Tus entradas», «Tu código»…), texto plano.
 * - `titleHtml`: el título (h1).
 * - `contentHtml`: los detalles (texto editable de la plantilla, datos del evento, QR…).
 * - `button`: el botón rosa, si el mail lleva uno.
 * - `helpHtml`: la línea gris de ayuda después del botón.
 * - `afterHtml`: lo que va al final de la tarjeta (número de orden, política de devoluciones).
 * - `whyHtml`: por qué te llega, en el pie.
 * - `unsubscribeHtml`: el link para darse de baja, en el pie (solo los mails que lo tienen).
 */
export function mailLayout({
	origin,
	label,
	titleHtml,
	contentHtml = '',
	button,
	helpHtml = '',
	afterHtml = '',
	whyHtml,
	contactEmail,
	unsubscribeHtml = ''
}) {
	const logo = `${siteOrigin(origin)}${MAIL_LOGO_PATH}`;
	const contact = contactEmail || defaultMailContact();
	const c = MAIL_COLORS;
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:${c.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.page};" ${MAIL_LAYOUT_MARK}><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};color:${c.text};">
<tr><td align="center" style="padding:0 0 16px;"><img src="${escapeHtml(logo)}" width="56" height="56" alt="Kinky Vibe" style="display:block;margin:0 auto;border:0;border-radius:12px;font-family:${FONT};font-size:18px;font-weight:700;color:${c.pinkText};"></td></tr>
<tr><td style="background:${c.card};border-radius:16px;padding:28px 24px;border-top:5px solid ${c.pink};font-size:16px;line-height:1.55;color:${c.text};">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${c.muted};">${escapeHtml(label)}</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:${c.text};">${titleHtml}</h1>
${contentHtml}
${button ? mailButton(button) : ''}
${helpHtml ? `<p style="margin:20px 0 0;font-size:15px;line-height:1.55;color:${c.muted};">${helpHtml}</p>` : ''}
${afterHtml}
</td></tr>
<tr><td style="padding:18px 8px 0;font-size:13px;line-height:1.5;color:${c.muted};text-align:center;">
${whyHtml}<br>
¿Dudas? Escribinos a ${contactLink(contact)}<br>
${unsubscribeHtml ? `${unsubscribeHtml}<br>` : ''}${signoffSpan(escapeHtml(DEFAULT_MAIL_FOOTER.signoff))}
</td></tr>
</table></td></tr></table></body></html>`;
}
