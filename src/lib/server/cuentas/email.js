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
