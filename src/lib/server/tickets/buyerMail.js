/**
 * "Mail a compradores" (/admin/eventos/<slug>/mail): un aviso de une admin (cambio de lugar,
 * horario, algo para llevar…) a todas las personas con una orden aprobada del evento.
 *
 * - Un envío tiene un id que genera la página al abrir el formulario (tablas de
 *   migrations/0006_event_mail.sql). El mismo id con el mismo texto es el mismo envío: un doble
 *   click o un reintento no crea otro.
 * - Se manda en tandas de a `limit` (cada mail es un subrequest y un Worker tiene un límite por
 *   pedido): la página pide tandas hasta que no queda nadie, mostrando el progreso.
 * - Cada destinatarie (por email, en minúsculas: una persona con varias órdenes recibe un solo
 *   mail) se reclama con un INSERT atómico antes de mandarle. Dos pestañas o dos tandas a la vez
 *   no le mandan dos veces; si el mail falla, se libera y la próxima tanda lo reintenta. Un
 *   reclamo que quedó colgado (el Worker se cortó a la mitad) se puede retomar después de
 *   {@link STALE_CLAIM_MS}.
 * - El mail sale por `deliver()` de index.js, así que en los previews solo llega a EMAIL_ALLOWLIST.
 */
import { escapeHtml, formatEventDate } from './email.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const BODY_MIN = 10;
export const BODY_MAX = 5000;
/** Mails por tanda (muy por debajo del límite de subrequests de un Worker). */
export const BATCH_SIZE = 20;
/** Un reclamo "mandando" más viejo que esto se considera cortado y se reintenta. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

const SEND_ID_RE = /^[a-z0-9-]{16,64}$/i;

/**
 * @typedef {{
 *   id: string, event_slug: string, subject: string, body: string, created_by: string,
 *   created_at: number, finished_at: number | null
 * }} BuyerMailSend
 */

/** @param {unknown} id */
export function isValidSendId(id) {
	return typeof id === 'string' && SEND_ID_RE.test(id);
}

/**
 * Valida y normaliza el formulario (asunto en una línea, texto con saltos de línea normales).
 *
 * @param {{ subject?: unknown, body?: unknown }} input
 * @returns {{ ok: true, value: { subject: string, body: string } }
 *   | { ok: false, errors: { subject?: string, body?: string } }}
 */
export function validateBuyerMail(input) {
	const subject = String(input.subject ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	const body = String(input.body ?? '')
		.replace(/\r\n?/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	/** @type {{ subject?: string, body?: string }} */
	const errors = {};
	if (subject.length < SUBJECT_MIN) errors.subject = 'Escribí un asunto.';
	else if (subject.length > SUBJECT_MAX) errors.subject = `Máximo ${SUBJECT_MAX} caracteres.`;
	if (body.length < BODY_MIN) errors.body = 'Escribí el mensaje.';
	else if (body.length > BODY_MAX) errors.body = `Máximo ${BODY_MAX} caracteres.`;
	if (errors.subject || errors.body) return { ok: false, errors };
	return { ok: true, value: { subject, body } };
}

/**
 * El mail que recibe cada persona: el asunto con el nombre del evento, el texto de le admin
 * (escapado: nada de HTML) y de qué evento y compra se trata.
 *
 * @param {{
 *   subject: string, body: string, buyerName: string,
 *   event: { title: string, start?: string }, contactEmail: string
 * }} input
 */
export function buildBuyerMail({ subject, body, buyerName, event, contactEmail }) {
	const when = formatEventDate(event.start);
	const fullSubject = subject.includes(event.title) ? subject : `${subject} · ${event.title}`;
	const paragraphs = body
		.split(/\n{2,}/)
		.map((p) => `<p>${escapeHtml(p).replaceAll('\n', '<br>')}</p>`)
		.join('\n\t\t');
	const html = `<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:auto;padding:16px">
		<p style="font-size:13px;color:#666;margin:0 0 4px">Sobre tu entrada para <strong>${escapeHtml(event.title)}</strong>${when ? ` (${escapeHtml(when)})` : ''}</p>
		<h1 style="color:#b3127a;font-size:22px">${escapeHtml(subject)}</h1>
		<p>Hola ${escapeHtml(buyerName)}:</p>
		${paragraphs}
		<p style="font-size:13px;color:#666">Te escribimos porque compraste una entrada para este evento. Si tenés alguna duda, respondé este mail o escribinos a ${escapeHtml(contactEmail)}.</p>
		</body></html>`;
	const text = [
		`Sobre tu entrada para ${event.title}${when ? ` (${when})` : ''}`,
		'',
		subject,
		'',
		`Hola ${buyerName}:`,
		'',
		body,
		'',
		`Te escribimos porque compraste una entrada para este evento. Si tenés alguna duda, respondé este mail o escribinos a ${contactEmail}.`
	].join('\n');
	return { subject: fullSubject, html, text };
}

/**
 * Crea el envío, o devuelve el que ya existe con ese id. Si el id ya se usó para otro evento o
 * con otro texto, `mismatch` (la página tiene que abrir un formulario nuevo).
 *
 * @param {D1Database} db
 * @param {{ id: string, eventSlug: string, subject: string, body: string, by: string, now?: number }} input
 * @returns {Promise<{ send: BuyerMailSend, created: boolean } | { mismatch: true }>}
 */
export async function startBuyerMail(db, { id, eventSlug, subject, body, by, now = Date.now() }) {
	const res = await db
		.prepare(
			`INSERT INTO event_mail_sends (id, event_slug, subject, body, created_by, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT (id) DO NOTHING`
		)
		.bind(id, eventSlug, subject, body, by, now)
		.run();
	const send = await getBuyerMail(db, id);
	if (!send) throw new Error('no se pudo crear el envío');
	if (send.event_slug !== eventSlug || send.subject !== subject || send.body !== body) {
		return { mismatch: true };
	}
	return { send, created: res.meta.changes === 1 };
}

/**
 * @param {D1Database} db
 * @param {string} id
 * @returns {Promise<BuyerMailSend | null>}
 */
export async function getBuyerMail(db, id) {
	if (!isValidSendId(id)) return null;
	return /** @type {BuyerMailSend | null} */ (
		await db.prepare('SELECT * FROM event_mail_sends WHERE id = ?1').bind(id).first()
	);
}

/**
 * Personas a las que les llega un aviso del evento: una por email (en minúsculas), con el
 * nombre de su orden aprobada más nueva.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ email: string, name: string }[]>}
 */
export async function buyerMailAudience(db, eventSlug) {
	const { results } = await db
		.prepare(
			`SELECT LOWER(buyer_email) AS email, buyer_name AS name, MAX(created_at) AS last
			FROM orders WHERE event_slug = ?1 AND status = 'approved'
			GROUP BY LOWER(buyer_email) ORDER BY last`
		)
		.bind(eventSlug)
		.all();
	return results.map((r) => ({ email: String(r.email), name: String(r.name ?? '') }));
}

/**
 * Cuántas personas ya recibieron el envío, cuántas fallaron y cuántas faltan (las que compraron
 * después de empezar el envío también cuentan: la próxima tanda les manda).
 *
 * @param {D1Database} db
 * @param {BuyerMailSend} send
 */
export async function buyerMailProgress(db, send) {
	const audience = await buyerMailAudience(db, send.event_slug);
	const { results } = await db
		.prepare('SELECT email, status FROM event_mail_recipients WHERE send_id = ?1')
		.bind(send.id)
		.all();
	const status = new Map(results.map((r) => [String(r.email), String(r.status)]));
	let sent = 0;
	let failed = 0;
	for (const a of audience) {
		const s = status.get(a.email);
		if (s === 'sent') sent++;
		else if (s === 'failed') failed++;
	}
	return { total: audience.length, sent, failed, pending: audience.length - sent };
}

/**
 * Reclama a une destinatarie para este envío. `true` solo si nadie le mandó ni le está mandando
 * (o si el intento anterior falló o quedó colgado).
 *
 * @param {D1Database} db
 * @param {{ sendId: string, email: string, now?: number }} input
 */
export async function claimBuyerMailRecipient(db, { sendId, email, now = Date.now() }) {
	const res = await db
		.prepare(
			`INSERT INTO event_mail_recipients (send_id, email, status, at) VALUES (?1, ?2, 'sending', ?3)
			ON CONFLICT (send_id, email) DO UPDATE SET status = 'sending', at = ?3
			WHERE event_mail_recipients.status = 'failed'
				OR (event_mail_recipients.status = 'sending' AND event_mail_recipients.at < ?4)`
		)
		.bind(sendId, email, now, now - STALE_CLAIM_MS)
		.run();
	return res.meta.changes === 1;
}

/**
 * @param {D1Database} db
 * @param {{ sendId: string, email: string, ok: boolean, now?: number }} input
 */
async function finishRecipient(db, { sendId, email, ok, now = Date.now() }) {
	await db
		.prepare(
			'UPDATE event_mail_recipients SET status = ?3, at = ?4 WHERE send_id = ?1 AND email = ?2'
		)
		.bind(sendId, email, ok ? 'sent' : 'failed', now)
		.run();
}

/**
 * Manda una tanda del envío: hasta `limit` personas que todavía no lo recibieron.
 *
 * @param {D1Database} db
 * @param {{
 *   send: BuyerMailSend,
 *   deliver: (recipient: { email: string, name: string }) => Promise<boolean>,
 *   limit?: number,
 *   now?: number
 * }} input
 * @returns {Promise<{ sent: number, failed: number, progress: Awaited<ReturnType<typeof buyerMailProgress>> }>}
 */
export async function sendBuyerMailBatch(
	db,
	{ send, deliver, limit = BATCH_SIZE, now = Date.now() }
) {
	const audience = await buyerMailAudience(db, send.event_slug);
	const { results } = await db
		.prepare(
			`SELECT email FROM event_mail_recipients WHERE send_id = ?1
			AND (status = 'sent' OR (status = 'sending' AND at >= ?2))`
		)
		.bind(send.id, now - STALE_CLAIM_MS)
		.all();
	const done = new Set(results.map((r) => String(r.email)));
	let sent = 0;
	let failed = 0;
	let tried = 0;
	for (const recipient of audience) {
		if (tried >= limit) break;
		if (done.has(recipient.email)) continue;
		if (!(await claimBuyerMailRecipient(db, { sendId: send.id, email: recipient.email, now })))
			continue;
		tried++;
		let ok = false;
		try {
			ok = await deliver(recipient);
		} catch (error) {
			console.error(`[tickets] no se pudo mandar el aviso ${send.id}:`, error);
		}
		await finishRecipient(db, { sendId: send.id, email: recipient.email, ok, now });
		if (ok) sent++;
		else failed++;
	}
	const progress = await buyerMailProgress(db, send);
	if (progress.pending === 0 && !send.finished_at) {
		await db
			.prepare('UPDATE event_mail_sends SET finished_at = ?2 WHERE id = ?1 AND finished_at IS NULL')
			.bind(send.id, now)
			.run();
	}
	return { sent, failed, progress };
}

/**
 * Envíos anteriores del evento, más nuevos primero, con cuántas personas lo recibieron.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ limit?: number }} [options]
 */
export async function listBuyerMails(db, eventSlug, { limit = 20 } = {}) {
	const { results } = await db
		.prepare(
			`SELECT s.id, s.subject, s.body, s.created_by, s.created_at, s.finished_at,
				(SELECT COUNT(*) FROM event_mail_recipients r WHERE r.send_id = s.id AND r.status = 'sent') AS sent,
				(SELECT COUNT(*) FROM event_mail_recipients r WHERE r.send_id = s.id AND r.status = 'failed') AS failed
			FROM event_mail_sends s WHERE s.event_slug = ?1 ORDER BY s.created_at DESC LIMIT ?2`
		)
		.bind(eventSlug, Math.max(1, Math.min(100, limit)))
		.all();
	return /** @type {(Omit<BuyerMailSend, 'event_slug'> & { sent: number, failed: number })[]} */ (
		/** @type {unknown} */ (results)
	);
}
