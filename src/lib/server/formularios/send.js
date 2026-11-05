/**
 * Manda los links personales de los formularios para quienes tenían entrada (docs/formularios.md):
 * lo llama el cron de cada 15 minutos (POST /api/cron/recordatorios), aparte de la tanda de
 * siempre y nunca con `MAILS_PAUSED`. Solo con el interruptor `formularios` prendido.
 *
 * - **La encuesta de cada evento** (reusa el prototipo #566): eventos con entradas, no cancelados,
 *   cuyo fin (`eventEnd`) más los días de «Cómo salen por defecto» (`defaults.js`; 1 si no se
 *   cambió) ya pasó. Sale siempre, aunque sea tarde (gorrite, 5/11: sin corte). Solo los eventos
 *   cuya encuesta tocaba después de la primera vuelta del cron con el interruptor prendido
 *   ({@link surveysSince}): así, al prenderlo, no les llega la encuesta de todos los eventos viejos.
 *   Si el evento todavía no tiene encuesta y la encuesta sale sola, se copia de la plantilla
 *   (abierta); si no sale sola, solo salen las que un evento prendió. Si el evento la apagó (o la
 *   borró), no sale.
 * - **Un formulario «quienes tenían entrada»** que une admin mandó («Mandar el link»): desde
 *   `send_at`.
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
import { FORM_DEFAULTS, getFormDefaults, surveyDelayMs } from './defaults.js';
import { buildFormEmail, mailTexts } from './email.js';
import { inviteToken, inviteUrl } from './invite.js';
import { ensureEventSurvey, getEventSurvey, rowToForm } from './store.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./store.js').Form} Form */

/**
 * Cuánto después del fin del evento sale la encuesta, si no se cambió en «Cómo salen por defecto»
 * (`defaults.js`).
 */
export const SURVEY_DELAY_MS = surveyDelayMs(FORM_DEFAULTS);

/** Clave de `ticket_settings`: desde cuándo salen las encuestas (la primera vuelta del cron). */
export const SURVEYS_SINCE_KEY = 'forms_surveys_since';

/**
 * Desde cuándo salen las encuestas, sin anotar nada (para el panel): `null` si el cron todavía no
 * corrió con el interruptor prendido.
 *
 * @param {D1Database} db
 */
export async function surveysSinceValue(db) {
	try {
		const r = await db
			.prepare('SELECT value FROM ticket_settings WHERE key = ?1')
			.bind(SURVEYS_SINCE_KEY)
			.first();
		const since = Number(r?.value);
		return r && Number.isFinite(since) ? since : null;
	} catch {
		return null;
	}
}

/**
 * Desde cuándo salen las encuestas (ms): la primera vuelta del cron con el interruptor prendido lo
 * anota (si no estaba). Una encuesta que tocaba antes no sale nunca; una que tocaba después sale
 * siempre, aunque el cron llegue tarde.
 *
 * @param {D1Database} db
 * @param {number} now
 */
export async function surveysSince(db, now) {
	await db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by)
			VALUES (?1, ?2, ?3, 'sistema') ON CONFLICT (key) DO NOTHING`
		)
		.bind(SURVEYS_SINCE_KEY, String(now), now)
		.run();
	const r = await db
		.prepare('SELECT value FROM ticket_settings WHERE key = ?1')
		.bind(SURVEYS_SINCE_KEY)
		.first();
	const since = Number(r?.value);
	return Number.isFinite(since) ? since : now;
}

/**
 * Cuándo toca la encuesta de un evento (ms), o `null` si no tiene fecha.
 *
 * @param {{ start?: unknown, end?: unknown }} config
 * @param {number} [delayMs] cuánto después del fin (el de «Cómo salen por defecto»)
 */
export function surveyDueAt(config, delayMs = SURVEY_DELAY_MS) {
	if (typeof config.start !== 'string' && !(config.start instanceof Date)) return null;
	const end = eventEnd(
		/** @type {string | Date} */ (config.start),
		/** @type {string | Date | undefined} */ (
			typeof config.end === 'string' || config.end instanceof Date ? config.end : undefined
		)
	).getTime();
	return Number.isFinite(end) ? end + delayMs : null;
}

/**
 * Lo que toca mandar ahora: cada formulario con su evento y desde cuándo.
 *
 * @param {D1Database} db
 * @param {number} now
 * @param {import('./defaults.js').FormDefaults} defaults
 * @returns {Promise<{ form: Form, due: number, eventTitle: string }[]>}
 */
async function dueForms(db, now, defaults) {
	/** @type {{ form: Form, due: number, eventTitle: string }[]} */
	const out = [];
	const delay = surveyDelayMs(defaults);
	const since = await surveysSince(db, now);
	const events = await listTicketedEvents();
	const titles = new Map(events.map((e) => [e.slug, e.config.title || e.slug]));
	for (const { slug, config } of events) {
		if (config.status === 'cancelado') continue;
		const due = surveyDueAt(config, delay);
		if (due === null || due > now || due < since) continue;
		// Si la encuesta no sale sola, solo salen las que un evento prendió (ya existen).
		const form = defaults.surveyAuto
			? await ensureEventSurvey(db, slug, { by: 'sistema', now, defaults })
			: await getEventSurvey(db, slug);
		if (form?.open) out.push({ form, due, eventTitle: titles.get(slug) ?? slug });
	}
	const { results } = await db
		.prepare(
			`SELECT * FROM forms WHERE kind = 'form' AND access = 'ticket' AND open = 1
				AND deleted_at IS NULL AND send_at IS NOT NULL AND send_at <= ?1`
		)
		.bind(now)
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
	const defaults = await getFormDefaults(db);
	const due = await dueForms(db, now, defaults);
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
				...mailTexts(form, defaults),
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
