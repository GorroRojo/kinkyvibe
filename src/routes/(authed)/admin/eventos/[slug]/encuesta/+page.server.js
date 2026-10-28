/**
 * Ficha del evento, Mails › Encuesta (PROTOTIPO, interruptor `encuesta_post_evento`;
 * docs/mails.md): cuándo sale la encuesta de este evento, a cuántes les salió, las respuestas
 * (cuántas, el promedio del puntaje, cuántes volverían y los textos) y cómo se ve el mail. Solo
 * admins (cada load y cada acción lo controla).
 *
 * Las respuestas no dicen quién contestó: son anónimas (store.js).
 */
import { dev } from '$app/environment';
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { contactEmail, siteOrigin } from '$lib/server/tickets/index.js';
import {
	SURVEY_MAX_LATE_MS,
	SURVEY_QUESTIONS,
	SURVEY_SEND_KEY,
	summarizeSurvey
} from '$lib/server/encuesta/index.js';
import { buildSurveyEmail } from '$lib/server/encuesta/email.js';
import { runSurveyCron, surveyDueAt } from '$lib/server/encuesta/send.js';
import { surveyStore } from '$lib/server/encuesta/store.js';

/**
 * Cuántos mails de la encuesta salieron, fallaron o están en camino para el evento.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function sendCounts(db, slug) {
	const counts = { sent: 0, failed: 0, pending: 0, orders: 0 };
	try {
		const row = await db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM orders WHERE event_slug = ?1 AND status = 'approved') AS orders,
					SUM(CASE WHEN s.status = 'sent' THEN 1 ELSE 0 END) AS sent,
					SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) AS failed,
					SUM(CASE WHEN s.status IN ('sending', 'retry') THEN 1 ELSE 0 END) AS pending
				FROM reminder_sends s JOIN orders o ON o.id = s.order_id
				WHERE o.event_slug = ?1 AND s.reminder_id = ?2`
			)
			.bind(slug, SURVEY_SEND_KEY)
			.first();
		counts.orders = Number(row?.orders ?? 0);
		counts.sent = Number(row?.sent ?? 0);
		counts.failed = Number(row?.failed ?? 0);
		counts.pending = Number(row?.pending ?? 0);
	} catch (e) {
		logDBError('envíos de la encuesta', e);
	}
	return counts;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	const [config, enabled] = await Promise.all([
		getEventTickets(params.slug),
		isFlagOn(db, 'encuesta_post_evento')
	]);
	if (!config) error(404, 'Este evento no vende entradas.');
	const store = surveyStore();
	const responses = store ? await store.list(params.slug) : [];
	const due = surveyDueAt(config);
	const preview = buildSurveyEmail({
		eventTitle: config.title || params.slug,
		url: `${siteOrigin(url)}/encuesta/ejemplo`,
		origin: siteOrigin(url),
		contactEmail: contactEmail()
	});
	return {
		enabled,
		storeAvailable: Boolean(store),
		dev,
		eventSurvey: config.survey,
		cancelled: config.status === 'cancelado',
		due,
		lastDay: due === null ? null : due + SURVEY_MAX_LATE_MS,
		now: Date.now(),
		counts: db ? await sendCounts(db, params.slug) : null,
		questions: SURVEY_QUESTIONS,
		summary: summarizeSurvey(responses),
		preview: { subject: preview.subject, html: preview.html }
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Solo en `vite dev`: manda ya la encuesta de este evento (sin esperar a que termine), para
	// probar el mail y el formulario con órdenes de prueba.
	mandar: async ({ locals, url, params, platform, fetch }) => {
		requireAdmin(locals, url);
		if (!dev) return fail(404, { error: 'Solo en desarrollo.' });
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Sin base.' });
		const r = await runSurveyCron({
			db,
			platform,
			origin: siteOrigin(url),
			fetch,
			forceSlug: params.slug
		});
		if (!r) return fail(400, { error: 'La encuesta está apagada en Interruptores.' });
		return { sent: r.sent, failed: r.failed };
	}
};
