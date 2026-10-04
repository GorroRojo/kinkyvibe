/**
 * Mail con el código para ingresar. Sin el código en el asunto (se ve en las notificaciones del
 * celu) y sin links: el código se escribe en la página donde se pidió.
 */
import { escapeHtml } from '$lib/server/tickets/email.js';
import { MAIL_STYLES, mailLayout } from '$lib/server/email/layout.js';
import { expiresInText } from '$lib/utils/expiry.js';
import { CODE_TTL_MS } from './codes.js';

/**
 * «Vence en 10 minutos (a las 14:35, hora de Argentina y Uruguay)»: en el mail no sabemos la zona
 * horaria de quien lo lee (src/lib/utils/expiry.js).
 * @param {{ now?: number, expiresAt?: number }} input
 */
const expires = ({ now = Date.now(), expiresAt = now + CODE_TTL_MS }) =>
	expiresInText(expiresAt, now);

/** Por qué llegan los mails de códigos (pie de la plantilla común). */
const WHY_CODE = 'Te llega porque alguien pidió un código con este mail en kinkyvibe.ar.';

/**
 * El código grande, en un recuadro (se copia fácil desde el celu).
 * @param {string} code
 */
const codeBlock = (code) =>
	`<p style="${MAIL_STYLES.box};margin:16px 0;text-align:center;font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:0.2em">${escapeHtml(code)}</p>`;

/**
 * @param {{ code: string, now?: number, expiresAt?: number, origin?: string }} input `expiresAt`:
 *   cuándo vence el código (por defecto, `now` + CODE_TTL_MS); `origin`: del sitio, para el logo
 *   (sin él, SITE_URL o el de producción)
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildLoginCodeEmail({ code, now, expiresAt, origin }) {
	const vence = expires({ now, expiresAt });
	const subject = 'Tu código para ingresar a KinkyVibe';
	const text = [
		'Hola:',
		'',
		`Tu código para entrar a Kinky Vibe es: ${code}`,
		'',
		`Escribilo en la página donde lo pediste. ${vence}. Sirve una sola vez.`,
		'',
		'Si no lo pediste vos, ignorá este mail: sin el código nadie puede entrar a tu rincón.'
	].join('\n');
	const html = mailLayout({
		origin,
		label: 'Tu código',
		titleHtml: 'Tu código para entrar',
		contentHtml: `<p>Hola:</p>
		<p>Tu código para entrar a Kinky Vibe es:</p>
		${codeBlock(code)}
		<p>Escribilo en la página donde lo pediste. ${escapeHtml(vence)}. Sirve una sola vez.</p>`,
		helpHtml:
			'Si no lo pediste vos, ignorá este mail: sin el código nadie puede entrar a tu rincón.',
		whyHtml: WHY_CODE
	});
	return { subject, html, text };
}

/** Qué se confirma, para el texto del mail. */
const CONFIRM_WHAT = {
	password: 'un cambio en la contraseña de tu cuenta',
	delete: 'que querés borrar tu cuenta',
	grupo: 'un cambio de dueñes o el borrado de un proyecto que gestionás'
};

/**
 * Mail con el código para confirmar una acción delicada en Mi rincón.
 *
 * @param {{ code: string, purpose: 'password' | 'delete' | 'grupo', now?: number, expiresAt?: number,
 *   origin?: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildConfirmCodeEmail({ code, purpose, now, expiresAt, origin }) {
	const vence = expires({ now, expiresAt });
	const what = CONFIRM_WHAT[purpose];
	const subject = 'Tu código para confirmar en KinkyVibe';
	const text = [
		'Hola:',
		'',
		`Para confirmar ${what}, escribí este código en Mi rincón: ${code}`,
		'',
		`${vence}. Sirve una sola vez.`,
		'',
		'Si no fuiste vos, ignorá este mail y no le pases el código a nadie: sin él no se puede hacer el cambio.'
	].join('\n');
	const html = mailLayout({
		origin,
		label: 'Tu código',
		titleHtml: 'Tu código para confirmar',
		contentHtml: `<p>Hola:</p>
		<p>Para confirmar ${escapeHtml(what)}, escribí este código en Mi rincón:</p>
		${codeBlock(code)}
		<p>${escapeHtml(vence)}. Sirve una sola vez.</p>`,
		helpHtml:
			'Si no fuiste vos, ignorá este mail y no le pases el código a nadie: sin él no se puede hacer el cambio.',
		whyHtml: WHY_CODE
	});
	return { subject, html, text };
}

/**
 * Aviso de que te invitaron a gestionar un proyecto. Solo le llega a una cuenta verificada con ese
 * mail (src/lib/server/cuentas/perfiles.js, `sendInviteNotice`). Nombra al proyecto, nunca a quien
 * invitó, y lleva a Mi rincón → Perfiles, donde se acepta o se rechaza.
 *
 * @param {{ groupTitle: string, url: string, origin?: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildProfileInviteEmail({ groupTitle, url, origin }) {
	const subject = 'Te invitaron a gestionar un perfil en KinkyVibe';
	const text = [
		'Hola:',
		'',
		`Te invitaron a gestionar el perfil del proyecto «${groupTitle}» en KinkyVibe.`,
		'',
		`Para aceptar o rechazar la invitación, entrá a Mi rincón → Perfiles: ${url}`,
		'',
		'Si no te interesa, ignorá este mail: la invitación vence sola.'
	].join('\n');
	const html = mailLayout({
		origin,
		label: 'Invitación',
		titleHtml: 'Te invitaron a gestionar un perfil',
		contentHtml: `<p>Hola:</p>
		<p>Te invitaron a gestionar el perfil del proyecto <strong>«${escapeHtml(groupTitle)}»</strong> en Kinky Vibe.</p>
		<p>Para aceptar o rechazar la invitación, entrá a <a href="${escapeHtml(url)}" style="${MAIL_STYLES.link}">Mi rincón → Perfiles</a>.</p>`,
		button: { href: url, label: 'Ver la invitación' },
		helpHtml: 'Si no te interesa, ignorá este mail: la invitación vence sola.',
		whyHtml: 'Te llega porque te invitaron a gestionar un perfil en kinkyvibe.ar.'
	});
	return { subject, html, text };
}
