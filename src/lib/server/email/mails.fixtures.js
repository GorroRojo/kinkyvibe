/**
 * Todos los mails transaccionales con datos inventados, para los tests de la plantilla común
 * (layout.test.js). `mails.text.json` guarda el asunto y el texto plano que devolvía cada builder
 * ANTES de la plantilla común: el texto plano no cambia con ella. Solo tests.
 */
import * as ticketEmail from '$lib/server/tickets/email.js';
import { emailCases } from '$lib/server/tickets/email.fixtures.js';
import { buildBuyerMail } from '$lib/server/tickets/buyerMail.js';
import {
	buildConfirmCodeEmail,
	buildLoginCodeEmail,
	buildProfileInviteEmail
} from '$lib/server/cuentas/email.js';
import { buildNewEditionEmail, buildSeriesConfirmEmail } from '$lib/server/series/email.js';
import { buildFollowEmail } from '$lib/server/sigo/email.js';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const ORIGIN = 'https://kinkyvibe.example';
const START = '2026-10-10T22:00:00-03:00';

/**
 * [nombre, builder, entrada]. Los de entradas son los mismos casos que email.golden.json.
 * @returns {[string, (input: any) => { subject: string, html: string, text: string }, any][]}
 */
export function allMailCases() {
	/** @type {[string, (input: any) => any, any][]} */
	const tickets = emailCases().map(([name, fn, input]) => [
		`tickets/${name}`,
		/** @type {any} */ (ticketEmail)[fn],
		input
	]);
	return [
		...tickets,
		[
			'buyer-mail',
			buildBuyerMail,
			{
				subject: 'Cambio de horario',
				body: 'Les contamos que el evento empieza <una hora> más tarde.\n\nNos vemos & gracias.',
				buyerName: 'Persona <de> Ejemplo',
				event: { title: 'Fiesta <b>de</b> prueba', start: START },
				contactEmail: 'contacto@example.com'
			}
		],
		['login-code', buildLoginCodeEmail, { code: '482913', now: NOW, expiresAt: NOW + 600000 }],
		[
			'confirm-code-password',
			buildConfirmCodeEmail,
			{ code: '482913', purpose: 'password', now: NOW, expiresAt: NOW + 600000 }
		],
		[
			'confirm-code-delete',
			buildConfirmCodeEmail,
			{ code: '482913', purpose: 'delete', now: NOW, expiresAt: NOW + 600000 }
		],
		[
			'confirm-code-grupo',
			buildConfirmCodeEmail,
			{ code: '482913', purpose: 'grupo', now: NOW, expiresAt: NOW + 600000 }
		],
		[
			'profile-invite',
			buildProfileInviteEmail,
			{ groupTitle: 'Proyecto <de> ejemplo', url: `${ORIGIN}/mi-rincon/perfiles`, origin: ORIGIN }
		],
		[
			'series-confirm',
			buildSeriesConfirmEmail,
			{
				seriesName: 'Ciclo <de> prueba',
				confirmUrl: `${ORIGIN}/avisos/confirmar?t=abc&x=1`,
				unsubscribeUrl: `${ORIGIN}/avisos/baja?t=def&x=1`,
				expiresAt: NOW + 7 * 24 * 3600000,
				now: NOW,
				origin: ORIGIN
			}
		],
		[
			'series-new-edition',
			buildNewEditionEmail,
			{
				seriesName: 'Ciclo <de> prueba',
				title: 'Fiesta <b>de</b> prueba',
				start: START,
				eventUrl: `${ORIGIN}/calendario/fiesta-de-prueba`,
				unsubscribeUrl: `${ORIGIN}/avisos/baja?t=def&x=1`,
				origin: ORIGIN
			}
		],
		[
			'sigo-nuevo',
			buildFollowEmail,
			{
				kind: 'nuevo',
				title: 'Fiesta <b>de</b> prueba',
				start: START,
				eventUrl: `${ORIGIN}/calendario/fiesta-de-prueba`,
				reasons: ['Ciclo de prueba', 'Lugar <de> ejemplo'],
				manageUrl: `${ORIGIN}/mi-rincon/sigo`,
				stopUrl: `${ORIGIN}/sigo/baja?t=ghi&x=1`,
				origin: ORIGIN
			}
		],
		[
			'sigo-recordatorio',
			buildFollowEmail,
			{
				kind: 'recordatorio',
				title: 'Fiesta <b>de</b> prueba',
				start: START,
				eventUrl: `${ORIGIN}/calendario/fiesta-de-prueba`,
				reasons: ['Ciclo de prueba'],
				manageUrl: `${ORIGIN}/mi-rincon/sigo`,
				stopUrl: `${ORIGIN}/sigo/baja?t=ghi&x=1`,
				origin: ORIGIN
			}
		]
	];
}
