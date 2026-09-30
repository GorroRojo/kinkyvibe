/**
 * Ficha del evento, pestaña "Mail a compradores": un aviso a todas las personas con una orden
 * aprobada (ver $lib/server/tickets/buyerMail.js). Se manda en tandas: la página vuelve a llamar
 * a `?/send` con el mismo id hasta que no queda nadie.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import { isPreviewDeploy } from '$lib/server/deploy.js';
import {
	buyerMailAudience,
	isValidSendId,
	listBuyerMails,
	startBuyerMail,
	validateBuyerMail
} from '$lib/server/tickets/buyerMail.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { contactEmail, deliverBuyerMailBatch } from '$lib/server/tickets/index.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!(await getEventTickets(params.slug))) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	let audience = 0;
	/** @type {Awaited<ReturnType<typeof listBuyerMails>>} */
	let sends = [];
	if (db) {
		try {
			audience = (await buyerMailAudience(db, params.slug)).length;
			sends = await listBuyerMails(db, params.slug);
		} catch (e) {
			logDBError('mail a compradores', e);
		}
	}
	return {
		audience,
		sends,
		// Id del próximo envío: mandar dos veces este mismo formulario es un solo envío.
		sendId: crypto.randomUUID(),
		contactEmail: contactEmail(),
		preview: isPreviewDeploy(),
		dbAvailable: Boolean(db)
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	send: async ({ locals, url, params, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		const data = await request.formData();
		const values = {
			subject: String(data.get('subject') ?? '').slice(0, 500),
			body: String(data.get('body') ?? '').slice(0, 10000)
		};
		if (!db) return fail(503, { mail: { ok: false, message: 'Sin base de datos.', values } });
		const config = await getEventTickets(params.slug);
		if (!config) {
			return fail(404, { mail: { ok: false, message: 'Ese evento no vende entradas.', values } });
		}
		const sendId = String(data.get('sendId') ?? '');
		if (!isValidSendId(sendId)) {
			return fail(400, {
				mail: { ok: false, message: 'Recargá la página y volvé a intentar.', values }
			});
		}
		const valid = validateBuyerMail(values);
		if (!valid.ok) {
			return fail(400, {
				mail: { ok: false, message: 'Revisá el asunto y el mensaje.', errors: valid.errors, values }
			});
		}
		const started = await startBuyerMail(db, {
			id: sendId,
			eventSlug: params.slug,
			subject: valid.value.subject,
			body: valid.value.body,
			by: admin.login
		});
		if ('mismatch' in started) {
			return fail(409, {
				mail: {
					ok: false,
					message:
						'Ese envío ya se hizo con otro texto. Recargá la página para escribir un aviso nuevo.',
					values
				}
			});
		}
		const { send, created } = started;
		const r = await deliverBuyerMailBatch({ db, send, fetch });
		const who = (/** @type {number} */ n) => (n === 1 ? '1 persona' : `${n} personas`);
		if (created) {
			await logAdminAction(db, locals, {
				action: 'event.mail',
				targetType: 'event',
				targetId: params.slug,
				summary: `Empezó a mandar el aviso «${send.subject}» a ${who(r.progress.total)}`,
				detail: { send: send.id, subject: send.subject, total: r.progress.total }
			});
		}
		const done = r.progress.pending === 0;
		if (done && (r.sent || r.failed)) {
			await logAdminAction(db, locals, {
				action: 'event.mail.done',
				targetType: 'event',
				targetId: params.slug,
				summary: `Terminó de mandar el aviso «${send.subject}»: ${who(r.progress.sent)}`,
				detail: { send: send.id, sent: r.progress.sent, failed: r.progress.failed }
			});
		}
		return {
			mail: {
				ok: r.failed === 0,
				id: send.id,
				sent: r.sent,
				failed: r.failed,
				progress: r.progress,
				done,
				message: done
					? r.progress.sent === r.progress.total
						? `Listo: el aviso les llegó a ${who(r.progress.sent)}.`
						: `Se mandó a ${who(r.progress.sent)}; faltan ${who(r.progress.pending)}.`
					: `Mandando… ${r.progress.sent} de ${r.progress.total}.`
			}
		};
	}
};
