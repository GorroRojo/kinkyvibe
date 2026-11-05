/**
 * Manda los links personales de los formularios para quienes tenían entrada (docs/formularios.md):
 * lo llama el cron de cada 15 minutos (POST /api/cron/recordatorios), aparte de la tanda de
 * siempre y nunca con `MAILS_PAUSED`. Solo con el interruptor `formularios` prendido.
 *
 * - **La encuesta de cada evento** (reusa el prototipo #566): eventos con entradas, no cancelados,
 *   cuyo fin (`eventEnd`) más {@link SURVEY_DELAY_MS} ya pasó, pero hace menos de
 *   {@link SEND_MAX_LATE_MS}. Si el evento todavía no tiene encuesta, se copia de la plantilla
 *   (abierta). Si el evento la apagó (encuesta cerrada), no sale.
 * - **Un formulario «quienes tenían entrada»** que une admin mandó («Mandar el link»): desde
 *   `send_at`, también hasta {@link SEND_MAX_LATE_MS}.
 * - A cada orden aprobada (las mismas que reciben recordatorios) creada antes de que tocara, una
 *   vez: la reserva es `form_sends` (sendState.js), con sus reintentos.
 * - Respeta «No fui yo» y los rebotes (`email_suppressions`): sale con `optOut`.
 */
import { eventEnd } from '$lib/utils/dates.js';
import { formulariosEnabled } from '$lib/server/flags.js';
import { contactEmail, deliverEmail } from '$lib/server/tickets/index.js';
import { autoSubmitted } from '$lib/server/tickets/email.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { getSalesSettings } from '$lib/server/tickets/settings.js';
import { mailBatchSize } from '$lib/server/tickets/batchSize.js';
import { REMINDER_ORDER_SQL } from '$lib/server/tickets/reminders.js';
import {
	STALE_CLAIM_MS,
	expireStaleClaims,
	pendingSendSql,
	sendBatch
} from '$lib/server/tickets/sendState.js';
import { buildFormEmail } from './email.js';
import { inviteToken, inviteUrl } from './invite.js';
import { ensureEventSurvey, rowToForm } from './store.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./store.js').Form} Form */

/** Cuánto después del fin del evento sale la encuesta. */
export const SURVEY_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pasado esto desde que tocaba, ya no sale (así, al prender el interruptor, no les llega la encuesta
 * de eventos viejos a todes, y un evento que se pasó por alto no la manda semanas después).
 */
export const SEND_MAX_LATE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Cuándo toca la encuesta de un evento (ms), o `null` si no tiene fecha.
 *
 * @param {{ start?: unknown, end?: unknown }} config
 */
export function surveyDueAt(config) {
	if (typeof config.start !== 'string' && !(config.start instanceof Date)) return null;
	const end = eventEnd(
		/** @type {string | Date} */ (config.start),
		/** @type {string | Date | undefined} */ (
			typeof config.end === 'string' || config.end instanceof Date ? config.end : undefined
		)
	).getTime();
	return Number.isFinite(end) ? end + SURVEY_DELAY_MS : null;
}

/**
 * Lo que toca mandar ahora: cada formulario con su evento y desde cuándo.
 *
 * @param {D1Database} db
 * @param {number} now
 * @returns {Promise<{ form: Form, due: number, eventTitle: string }[]>}
 */
async function dueForms(db, now) {
	/** @type {{ form: Form, due: number, eventTitle: string }[]} */
	const out = [];
	const events = await listTicketedEvents();
	const titles = new Map(events.map((e) => [e.slug, e.config.title || e.slug]));
	for (const { slug, config } of events) {
		if (config.status === 'cancelado') continue;
		const due = surveyDueAt(config);
		if (due === null || due > now || now - due > SEND_MAX_LATE_MS) continue;
		const form = await ensureEventSurvey(db, slug, { by: 'sistema', now });
		if (form?.open) out.push({ form, due, eventTitle: titles.get(slug) ?? slug });
	}
	const { results } = await db
		.prepare(
			`SELECT * FROM forms WHERE kind = 'form' AND access = 'ticket' AND open = 1
				AND send_at IS NOT NULL AND send_at <= ?1 AND send_at > ?2`
		)
		.bind(now, now - SEND_MAX_LATE_MS)
		.all();
	for (const r of results) {
		const form = rowToForm(r);
		if (!form.eventSlug || !titles.has(form.eventSlug)) continue;
		out.push({
			form,
			due: /** @type {number} */ (form.sendAt),
			eventTitle: titles.get(form.eventSlug) ?? form.eventSlug
		});
	}
	return out;
}

/**
 * Una tanda de links personales. Devuelve `null` si los formularios están apagados.
 *
 * @param {{
 *   db: D1Database,
 *   platform: App.Platform | undefined,
 *   origin: string,
 *   fetch: typeof fetch,
 *   now?: number,
 *   limit?: number
 * }} input
 */
export async function runFormsCron({
	db,
	platform,
	origin,
	fetch: fetchFn,
	now = Date.now(),
	limit
}) {
	if (!(await formulariosEnabled(platform))) return null;
	const due = await dueForms(db, now);
	if (!due.length) return { sent: 0, failed: 0, remaining: 0 };
	await expireStaleClaims(db, 'form_sends', now);
	/** @type {{ order: import('$lib/server/tickets/orders.js').Order, form: Form, eventTitle: string }[]} */
	const items = [];
	for (const d of due) {
		const { results } = await db
			.prepare(
				`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND ${REMINDER_ORDER_SQL}
				AND o.created_at < ?2 AND o.buyer_email != ''
				AND ${pendingSendSql('form_sends', { key: 3, stale: 4 })}
				ORDER BY o.created_at`
			)
			.bind(d.form.eventSlug, d.due, d.form.id, now - STALE_CLAIM_MS)
			.all();
		for (const order of /** @type {import('$lib/server/tickets/orders.js').Order[]} */ (results))
			items.push({ order, form: d.form, eventTitle: d.eventTitle });
	}
	const settings = await getSalesSettings(db);
	return sendBatch(db, 'form_sends', {
		items,
		limit: limit ?? mailBatchSize(settings.mail_batch_size),
		now,
		label: 'el link del formulario',
		claim: ({ order, form }) => ({ orderId: order.id, key: form.id }),
		send: async ({ order, form, eventTitle }) => {
			const url = inviteUrl(origin, form, await inviteToken(db, form.id, order.id));
			const message = buildFormEmail({
				survey: form.kind === 'survey',
				formTitle: form.title,
				eventTitle,
				questions: form.questions.length,
				anonymous: form.privacy === 'anonymous',
				url,
				origin,
				contactEmail: contactEmail()
			});
			const result = await deliverEmail({
				db,
				fetch: fetchFn,
				to: order.buyer_email,
				message: autoSubmitted(message),
				idempotencyKey: `form-${form.id}-${order.id}`,
				optOut: true,
				// Solo se imprime en `vite dev` sin RESEND_API_KEY (deliver), para probar el link.
				log: `link del formulario: ${url}`
			});
			return result !== 'failed';
		}
	});
}
