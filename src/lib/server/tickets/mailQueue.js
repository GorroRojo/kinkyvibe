/**
 * Una corrida del cron de mails masivos, sin depender del entorno (el armado de cada mail lo
 * pone index.js; acá solo el reparto de la tanda, para poder probarlo con D1).
 *
 * Primero los mails de la lista de espera (ofertas, últimos avisos, vencidas y cierres; ver
 * waitlistEngine.js): son pocos y urgentes. Después los recordatorios que tocan y, con lo que
 * sobre de la tanda, lo que quede de cada "Enviar el link a todes" pedido y después de cada
 * «Avisar a les compradores» de un cambio de fecha (dateChange.js; los dos del más viejo al más
 * nuevo). En total, como mucho `limit` mails (por defecto, el "de a cuántos" de Mensajes →
 * Configuración); lo demás sigue en la próxima corrida.
 */
import { mailBatchSize } from './batchSize.js';
import { getSalesSettings } from './settings.js';
import { pendingStreamLinkRequests } from './stream.js';
import { pendingDateChangeRequests } from './dateChange.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ sent: number, failed: number, remaining: number }} BatchResult */

/**
 * @param {D1Database} db
 * @param {{
 *   limit?: number,
 *   sendReminders: (limit: number) => Promise<BatchResult>,
 *   sendStreamLink: (input: { eventSlug: string, link: string, limit: number }) => Promise<BatchResult>,
 *   sendDateChange?: (input: { change: import('./dateChange.js').DateChange, limit: number }) => Promise<BatchResult>,
 *   sendWaitlist?: (limit: number) => Promise<BatchResult>
 * }} input `sendWaitlist`: los mails de la lista de espera (sin él, interruptor apagado, la
 *   corrida es la de antes)
 * @returns {Promise<{
 *   limit: number,
 *   waitlist?: BatchResult,
 *   reminders: BatchResult,
 *   streamLinks: BatchResult & { waitingEvents: number },
 *   dateChanges?: BatchResult & { waitingEvents: number }
 * }>} `remaining`: mails que quedan para las próximas corridas (de lo que se miró);
 *   `waitingEvents`: eventos con un envío pedido que esta corrida no llegó a mirar.
 */
export async function runMailQueueWith(
	db,
	{ limit, sendReminders, sendStreamLink, sendDateChange, sendWaitlist }
) {
	const budget = limit ?? mailBatchSize((await getSalesSettings(db)).mail_batch_size);
	let left = budget;
	/** @type {BatchResult | undefined} */
	let waitlist;
	if (sendWaitlist) {
		const w = await sendWaitlist(left);
		waitlist = { sent: w.sent, failed: w.failed, remaining: w.remaining };
		left -= w.sent + w.failed;
	}
	// Con la tanda gastada en la lista, igual se mira cuántos recordatorios quedan (límite 0).
	const r = await sendReminders(Math.max(0, left));
	const reminders = { sent: r.sent, failed: r.failed, remaining: r.remaining };
	const streamLinks = { sent: 0, failed: 0, remaining: 0, waitingEvents: 0 };
	left -= reminders.sent + reminders.failed;
	for (const { eventSlug, link } of await pendingStreamLinkRequests(db)) {
		if (left <= 0) {
			streamLinks.waitingEvents++;
			continue;
		}
		const s = await sendStreamLink({ eventSlug, link, limit: left });
		streamLinks.sent += s.sent;
		streamLinks.failed += s.failed;
		streamLinks.remaining += s.remaining;
		left -= s.sent + s.failed;
	}
	// Sin `sendDateChange` (quien no manda avisos de cambio de fecha), la corrida es la de antes.
	const head = { limit: budget, ...(waitlist ? { waitlist } : {}) };
	if (!sendDateChange) return { ...head, reminders, streamLinks };
	const dateChanges = { sent: 0, failed: 0, remaining: 0, waitingEvents: 0 };
	for (const change of await pendingDateChangeRequests(db)) {
		if (left <= 0) {
			dateChanges.waitingEvents++;
			continue;
		}
		const s = await sendDateChange({ change, limit: left });
		dateChanges.sent += s.sent;
		dateChanges.failed += s.failed;
		dateChanges.remaining += s.remaining;
		left -= s.sent + s.failed;
	}
	return { ...head, reminders, streamLinks, dateChanges };
}
