/**
 * Manda el mail de la encuesta (PROTOTIPO, docs/mails.md): lo llama el cron de cada 15 minutos
 * (POST /api/cron/recordatorios), aparte de la tanda de siempre y nunca con `MAILS_PAUSED`.
 *
 * - Solo con el interruptor `encuesta_post_evento` prendido y un almacén para las respuestas
 *   (store.js: hoy, solo en `vite dev`).
 * - Eventos con entradas, no cancelados, sin `encuesta: false`, cuyo fin (`eventEnd`) más
 *   {@link SURVEY_DELAY_MS} ya pasó, pero hace menos de {@link SURVEY_MAX_LATE_MS}.
 * - A cada orden aprobada (las mismas que reciben recordatorios) creada antes de que tocara, una
 *   vez: la reserva es la de los recordatorios (`reminder_sends`, id {@link SURVEY_SEND_KEY}),
 *   con sus reintentos y su «Para revisar».
 * - Respeta «No fui yo» y los rebotes (`email_suppressions`): sale con `optOut`, como cualquier
 *   mail que no es de una compra pagada.
 */
import { eventEnd } from '$lib/utils/dates.js';
import { encuestaEnabled } from '$lib/server/flags.js';
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
import { SURVEY_DELAY_MS, SURVEY_MAX_LATE_MS, SURVEY_SEND_KEY, surveyUrl } from './index.js';
import { buildSurveyEmail } from './email.js';
import { surveyStore } from './store.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

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
 * Los eventos cuya encuesta toca ahora, con su título. Con `forceSlug` (solo «Mandarla ahora» del
 * panel en `vite dev`), ese evento sin mirar la hora.
 *
 * @param {number} now
 * @param {string} [forceSlug]
 */
async function dueEvents(now, forceSlug) {
	const out = [];
	for (const { slug, config } of await listTicketedEvents()) {
		if (forceSlug !== undefined && slug !== forceSlug) continue;
		if (!config.survey || config.status === 'cancelado') continue;
		const due = forceSlug !== undefined ? now : surveyDueAt(config);
		if (due === null || due > now || now - due > SURVEY_MAX_LATE_MS) continue;
		out.push({ slug, due, title: config.title || slug });
	}
	return out;
}

/**
 * Una tanda de mails de la encuesta. Devuelve `null` si está apagada (o sin almacén).
 *
 * @param {{
 *   db: D1Database,
 *   platform: App.Platform | undefined,
 *   origin: string,
 *   fetch: typeof fetch,
 *   now?: number,
 *   limit?: number,
 *   forceSlug?: string
 * }} input `forceSlug`: solo para probar en dev (ver {@link dueEvents})
 */
export async function runSurveyCron({
	db,
	platform,
	origin,
	fetch: fetchFn,
	now = Date.now(),
	limit,
	forceSlug
}) {
	if (!surveyStore() || !(await encuestaEnabled(platform))) return null;
	const events = await dueEvents(now, forceSlug);
	if (!events.length) return { sent: 0, failed: 0, remaining: 0 };
	await expireStaleClaims(db, 'reminder_sends', now);
	/** @type {{ order: import('$lib/server/tickets/orders.js').Order, title: string }[]} */
	const items = [];
	for (const e of events) {
		const { results } = await db
			.prepare(
				`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND ${REMINDER_ORDER_SQL}
				AND o.created_at < ?2 AND ${pendingSendSql('reminder_sends', { key: 3, stale: 4 })}
				ORDER BY o.created_at`
			)
			.bind(e.slug, e.due, SURVEY_SEND_KEY, now - STALE_CLAIM_MS)
			.all();
		for (const order of /** @type {import('$lib/server/tickets/orders.js').Order[]} */ (results))
			items.push({ order, title: e.title });
	}
	const settings = await getSalesSettings(db);
	return sendBatch(db, 'reminder_sends', {
		items,
		limit: limit ?? mailBatchSize(settings.mail_batch_size),
		now,
		label: 'la encuesta',
		claim: ({ order }) => ({ orderId: order.id, key: SURVEY_SEND_KEY }),
		send: async ({ order, title }) => {
			const url = await surveyUrl(db, origin, order.id);
			const message = buildSurveyEmail({
				eventTitle: title,
				url,
				origin,
				contactEmail: contactEmail()
			});
			const result = await deliverEmail({
				db,
				fetch: fetchFn,
				to: order.buyer_email,
				message: autoSubmitted(message),
				idempotencyKey: `survey-${order.id}`,
				optOut: true,
				// Solo se imprime en `vite dev` sin RESEND_API_KEY (deliver), para probar el link.
				log: `link de la encuesta: ${url}`
			});
			return result !== 'failed';
		}
	});
}
