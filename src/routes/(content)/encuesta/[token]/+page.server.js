/**
 * Encuesta después del evento (PROTOTIPO, interruptor `encuesta_post_evento`; docs/mails.md). El
 * link del mail (`/encuesta/<orden>.<firma>`) muestra las preguntas; el POST guarda la respuesta
 * sin la orden (store.js) y marca que esa orden ya contestó. Sin interruptor o sin almacén (fuera
 * de `vite dev`), 404.
 */
import { error, fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { encuestaEnabled } from '$lib/server/flags.js';
import { getOrder } from '$lib/server/tickets/orders.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { argDate } from '$lib/utils/dates.js';
import {
	SURVEY_QUESTIONS,
	SURVEY_TEXT_MAX,
	checkSurveyToken,
	validateSurveyAnswers
} from '$lib/server/encuesta/index.js';
import { surveyStore } from '$lib/server/encuesta/store.js';

/**
 * La orden del link (aprobada) y el almacén, o un error: 404 si la encuesta no está, y
 * `{ invalid: true }` si el link no sirve.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} token
 */
async function resolve(platform, token) {
	const db = getDB(platform);
	const store = surveyStore();
	if (!db || !store || !(await encuestaEnabled(platform)))
		error(404, 'No encontramos esta página.');
	const orderId = await checkSurveyToken(db, token);
	const order = orderId ? await getOrder(db, orderId) : null;
	if (!order || order.status !== 'approved') return { invalid: true, db, store };
	return { invalid: false, db, store, order };
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, setHeaders }) {
	setHeaders({
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex',
		// same-origin (no no-referrer): si no, el POST sale con `Origin: null` y SvelteKit lo rechaza.
		'referrer-policy': 'same-origin'
	});
	const r = await resolve(platform, params.token);
	if (r.invalid || !r.order) return { valid: false, answered: false, title: '', questions: [] };
	const config = await getEventTickets(r.order.event_slug);
	return {
		valid: true,
		answered: await r.store.hasAnswered(r.order.id),
		title: config?.title || r.order.event_slug,
		questions: SURVEY_QUESTIONS,
		textMax: SURVEY_TEXT_MAX
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, platform, request }) => {
		const r = await resolve(platform, params.token);
		if (r.invalid || !r.order) return fail(400, { error: 'Este link no es válido.' });
		const form = await request.formData();
		const checked = validateSurveyAnswers(form);
		if (!checked.ok) {
			return fail(400, {
				error: checked.error,
				values: Object.fromEntries(
					SURVEY_QUESTIONS.map((q) => [q.id, String(form.get(q.id) ?? '')])
				)
			});
		}
		const saved = await r.store.save({
			orderId: r.order.id,
			eventSlug: r.order.event_slug,
			answers: checked.answers,
			day: argDate(new Date())
		});
		return saved === 'ok' ? { ok: true } : { ok: true, repeated: true };
	}
};
