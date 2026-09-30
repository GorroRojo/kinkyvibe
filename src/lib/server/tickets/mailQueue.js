/**
 * Una corrida del cron de mails masivos, sin depender del entorno (el armado de cada mail lo
 * pone index.js; acá solo el reparto de la tanda, para poder probarlo con D1).
 *
 * Primero los recordatorios que tocan y, con lo que sobre de la tanda, lo que quede de cada
 * "Enviar el link a todes" pedido (del más viejo al más nuevo). En total, como mucho `limit`
 * mails (por defecto, el "de a cuántos" de Ajustes → Mails); lo demás sigue en la próxima
 * corrida.
 */
import { mailBatchSize } from './batchSize.js';
import { getSalesSettings } from './settings.js';
import { pendingStreamLinkRequests } from './stream.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ sent: number, failed: number, remaining: number }} BatchResult */

/**
 * @param {D1Database} db
 * @param {{
 *   limit?: number,
 *   sendReminders: (limit: number) => Promise<BatchResult>,
 *   sendStreamLink: (input: { eventSlug: string, link: string, limit: number }) => Promise<BatchResult>
 * }} input
 * @returns {Promise<{
 *   limit: number,
 *   reminders: BatchResult,
 *   streamLinks: BatchResult & { waitingEvents: number }
 * }>} `remaining`: mails que quedan para las próximas corridas (de lo que se miró);
 *   `waitingEvents`: eventos con un "Enviar el link a todes" que esta corrida no llegó a mirar.
 */
export async function runMailQueueWith(db, { limit, sendReminders, sendStreamLink }) {
	const budget = limit ?? mailBatchSize((await getSalesSettings(db)).mail_batch_size);
	const r = await sendReminders(budget);
	const reminders = { sent: r.sent, failed: r.failed, remaining: r.remaining };
	const streamLinks = { sent: 0, failed: 0, remaining: 0, waitingEvents: 0 };
	let left = budget - reminders.sent - reminders.failed;
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
	return { limit: budget, reminders, streamLinks };
}
