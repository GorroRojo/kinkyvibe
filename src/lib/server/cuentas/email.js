/**
 * Mail con el código para ingresar. Sin el código en el asunto (se ve en las notificaciones del
 * celu) y sin links: el código se escribe en la página donde se pidió.
 */
import { escapeHtml } from '$lib/server/tickets/email.js';
import { CODE_TTL_MS } from './codes.js';

/**
 * @param {{ code: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildLoginCodeEmail({ code }) {
	const minutes = Math.round(CODE_TTL_MS / 60_000);
	const subject = 'Tu código para ingresar a KinkyVibe';
	const text = [
		'Hola:',
		'',
		`Tu código para ingresar a KinkyVibe es: ${code}`,
		'',
		`Escribilo en la página donde lo pediste. Vence en ${minutes} minutos y sirve una sola vez.`,
		'',
		'Si no lo pediste vos, ignorá este mail: sin el código nadie puede entrar a tu rincón.'
	].join('\n');
	const html = `<div style="font-family:sans-serif;font-size:16px;color:#222;max-width:32rem">
		<p>Hola:</p>
		<p>Tu código para ingresar a KinkyVibe es:</p>
		<p style="font-size:32px;font-weight:bold;letter-spacing:0.2em;margin:16px 0">${escapeHtml(code)}</p>
		<p>Escribilo en la página donde lo pediste. Vence en ${minutes} minutos y sirve una sola vez.</p>
		<p style="font-size:13px;color:#555">Si no lo pediste vos, ignorá este mail: sin el código nadie puede entrar a tu rincón.</p>
	</div>`;
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
 * @param {{ code: string, purpose: 'password' | 'delete' | 'grupo' }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildConfirmCodeEmail({ code, purpose }) {
	const minutes = Math.round(CODE_TTL_MS / 60_000);
	const what = CONFIRM_WHAT[purpose];
	const subject = 'Tu código para confirmar en KinkyVibe';
	const text = [
		'Hola:',
		'',
		`Para confirmar ${what}, escribí este código en Mi rincón: ${code}`,
		'',
		`Vence en ${minutes} minutos y sirve una sola vez.`,
		'',
		'Si no fuiste vos, ignorá este mail y no le pases el código a nadie: sin él no se puede hacer el cambio.'
	].join('\n');
	const html = `<div style="font-family:sans-serif;font-size:16px;color:#222;max-width:32rem">
		<p>Hola:</p>
		<p>Para confirmar ${escapeHtml(what)}, escribí este código en Mi rincón:</p>
		<p style="font-size:32px;font-weight:bold;letter-spacing:0.2em;margin:16px 0">${escapeHtml(code)}</p>
		<p>Vence en ${minutes} minutos y sirve una sola vez.</p>
		<p style="font-size:13px;color:#555">Si no fuiste vos, ignorá este mail y no le pases el código a nadie: sin él no se puede hacer el cambio.</p>
	</div>`;
	return { subject, html, text };
}

/**
 * Aviso de que te invitaron a gestionar un proyecto. Solo le llega a una cuenta verificada con ese
 * mail (src/lib/server/cuentas/perfiles.js, `sendInviteNotice`). Nombra al proyecto, nunca a quien
 * invitó, y lleva a Mi rincón → Perfiles, donde se acepta o se rechaza.
 *
 * @param {{ groupTitle: string, url: string }} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildProfileInviteEmail({ groupTitle, url }) {
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
	const html = `<div style="font-family:sans-serif;font-size:16px;color:#222;max-width:32rem">
		<p>Hola:</p>
		<p>Te invitaron a gestionar el perfil del proyecto <strong>«${escapeHtml(groupTitle)}»</strong> en KinkyVibe.</p>
		<p>Para aceptar o rechazar la invitación, entrá a <a href="${escapeHtml(url)}">Mi rincón → Perfiles</a>.</p>
		<p style="font-size:13px;color:#555">Si no te interesa, ignorá este mail: la invitación vence sola.</p>
	</div>`;
	return { subject, html, text };
}
