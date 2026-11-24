/**
 * Panel › Comunidad › Formularios (docs/formularios.md): lo común a sus páginas. Cada `load` y cada
 * acción llama a {@link requireFormsAdmin} (las acciones no pasan por el layout): solo admins, con
 * base y con el interruptor `formularios` prendido (si no, 404).
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { formulariosEnabled } from '$lib/server/flags.js';
import { getEventMeta, getEventTickets, listTicketedEvents } from '$lib/server/tickets/events.js';
import { validateFormSettings, validateQuestions } from '$lib/utils/formularios.js';
import { getForm } from './store.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/formularios.js').Question} Question */

/**
 * @param {{ locals: App.Locals, url: URL, platform?: App.Platform }} event
 * @returns {Promise<{ admin: NonNullable<App.Locals['user']>, db: D1Database }>}
 */
export async function requireFormsAdmin({ locals, url, platform }) {
	const admin = requireAdmin(locals, url);
	if (!(await formulariosEnabled(platform))) error(404, 'Not found');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	return { admin, db };
}

/**
 * El formulario de `params.id`, o 404.
 *
 * @param {D1Database} db
 * @param {string | undefined} rawId
 */
export async function formOr404(db, rawId) {
	const id = Number(rawId);
	const form = Number.isSafeInteger(id) && id > 0 ? await getForm(db, id) : null;
	if (!form) error(404, 'Ese formulario no existe.');
	return form;
}

/**
 * Los eventos con entradas, para elegir el de un formulario (los más nuevos primero): dirección,
 * título y fecha.
 *
 * @returns {Promise<{ slug: string, title: string, start: string | null }[]>}
 */
export async function ticketedEventChoices() {
	return (await listTicketedEvents()).map(({ slug, config }) => ({
		slug,
		title: config.title || slug,
		start: typeof config.start === 'string' ? config.start : null
	}));
}

/**
 * Lo que valida el «Guardar» del editor de un formulario antes de guardar: lo general
 * (`validateFormSettings`), las preguntas (`validateQuestions`) y que el evento exista (y venda
 * entradas, si responden quienes tenían entrada o es una encuesta). Lo usan el editor y el
 * conector de Claude (src/lib/server/mcp/formularios.js), así las reglas están en un solo lugar.
 *
 * @param {{ kind: 'form' | 'survey' | 'template' }} form
 * @param {Record<string, unknown>} raw `title`, `intro`, `slug`, `access`, `privacy`, `audience`,
 *   `eventSlug`
 * @param {unknown} questionsRaw la lista de preguntas (o su JSON)
 * @returns {Promise<{ ok: true, settings: { title: string, intro: string, slug: string,
 *   access: import('$lib/utils/formularios.js').Access,
 *   privacy: import('$lib/utils/formularios.js').Privacy,
 *   audience: import('$lib/utils/formularios.js').Audience, eventSlug: string | null },
 *   questions: Question[] }
 *   | { ok: false, message: string, errors: Record<string, string>,
 *   questionErrors: Record<number, Record<string, string>> }>}
 */
export async function checkFormSave(form, raw, questionsRaw) {
	const settings = validateFormSettings(raw, { kind: form.kind });
	const questions = validateQuestions(questionsRaw);
	/** @type {Record<string, string>} */
	const errors = settings.ok ? {} : { ...settings.errors };
	if (settings.ok && settings.settings.eventSlug) {
		const evt = settings.settings.eventSlug;
		const exists =
			settings.settings.access === 'ticket' || form.kind === 'survey'
				? Boolean(await getEventTickets(evt))
				: Boolean(await getEventMeta(evt));
		if (!exists) errors.eventSlug = 'Ese evento no existe o no vende entradas.';
	}
	if (!settings.ok || !questions.ok || Object.keys(errors).length) {
		return {
			ok: false,
			message: !questions.ok ? questions.message : 'Revisá lo marcado.',
			errors,
			questionErrors: questions.ok ? {} : questions.errors
		};
	}
	return { ok: true, settings: settings.settings, questions: questions.questions };
}
