/**
 * Ficha del evento, pestaña Editar: el editor de /edit (datos, imagen, etiquetas, entradas y texto)
 * dentro del panel. Mismo load y mismas acciones (guarda con un commit por el mismo camino, así
 * que en los previews va a la capa demo), con la categoría fija en `calendario`.
 *
 * Abajo, la sección «Partes» (talleres en varias partes, docs/talleres-partes.md), con sus propias
 * acciones (`partes_*`): guardan los edges `parte` del taller en la base, aparte del editor.
 *
 * Al guardar con otro inicio o fin, el cambio de fecha queda anotado (dateChange.js) y la ficha
 * ofrece «Avisar a les compradores» (nunca manda nada sola).
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import {
	createWorkshopPart,
	panelParts,
	setHideParts,
	setPerPartTickets,
	setWorkshopParts
} from '$lib/server/eventos/partes.js';
import {
	_editActions,
	_editLoad
} from '../../../../edit/[category=category]/[postID]/+page.server.js';
import { readDbPostFile } from '$lib/server/contenido/repo.js';
import { postFilePath } from '$lib/utils/postPaths.js';
import { recordDateChange, scheduleFromFile } from '$lib/server/tickets/dateChange.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { queueWaitlistAdvance } from '$lib/server/tickets/waitlistEngine.js';

/**
 * @template {{ params: { slug: string } }} E
 * @param {E} event
 */
function asEventEdit(event) {
	return Object.assign(Object.create(Object.getPrototypeOf(event)), event, {
		params: { category: 'calendario', postID: event.params.slug }
	});
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	requireAdmin(event.locals, event.url);
	const [base, partes] = await Promise.all([
		_editLoad(asEventEdit(event)),
		panelParts(getDB(event.platform), event.params.slug).catch((e) => {
			console.error('[partes] no se pudieron leer las partes:', e);
			return null;
		})
	]);
	return { ...base, partes };
}

/** Lo que contestan las acciones de «Partes»: el estado nuevo y el mensaje. */
/**
 * @param {import('./$types').RequestEvent} event
 * @param {(db: import('@cloudflare/workers-types').D1Database, form: FormData, by: string) => Promise<{ ok: true, slug?: string } | { ok: false, message: string }>} run
 * @param {string} done mensaje si salió bien
 */
async function partesAction(event, run, done) {
	const user = requireAdmin(event.locals, event.url);
	const db = getDB(event.platform);
	if (!db) return fail(503, { partes: { ok: false, message: 'No hay base de datos disponible.' } });
	const r = await run(db, await event.request.formData(), user.login);
	if (!r.ok) return fail(400, { partes: { ok: false, message: r.message } });
	return {
		partes: {
			ok: true,
			message: done,
			state: await panelParts(db, event.params.slug)
		}
	};
}

/**
 * «2026-10-09T22:00» (input datetime-local) → «2026-10-09T22:00-03:00» (hora de Argentina).
 *
 * @param {FormDataEntryValue | null} raw
 */
function argDateTime(raw) {
	const v = String(raw ?? '').trim();
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return v ? 'inválida' : '';
	return `${v}-03:00`;
}

/**
 * El inicio y el fin guardados del evento (antes de guardar), o `null` si no se pueden leer.
 * @param {string} slug
 */
async function savedSchedule(slug) {
	const path = postFilePath('calendario', slug);
	const file = path ? await readDbPostFile(path).catch(() => null) : null;
	return file && 'raw' in file ? scheduleFromFile(file.raw) : null;
}

/**
 * «Guardar» del editor y, si se guardó con otro inicio o fin, el cambio de fecha anotado para
 * ofrecer «Avisar a les compradores» (dateChange.js). Si anotarlo falla, el guardado vale igual.
 *
 * @param {import('./$types').RequestEvent} event
 */
async function saveWithDateChange(event) {
	const user = requireAdmin(event.locals, event.url);
	const db = getDB(event.platform);
	const content = db ? (await event.request.clone().formData()).get('content') : null;
	const before = typeof content === 'string' ? await savedSchedule(event.params.slug) : null;
	const result = await _editActions.save(asEventEdit(event));
	// Más cupo, un tipo o un tramo nuevo, dejó de estar agotado, otra fecha de cierre o se
	// canceló: la lista de espera se mueve (en segundo plano; sin gente en la lista, nada).
	if (db && result && 'save' in result) {
		queueWaitlistAdvance({
			platform: event.platform,
			db,
			eventSlug: event.params.slug,
			fetch: event.fetch,
			origin: siteOrigin(event.url)
		});
	}
	if (!db || !before || !result || !('save' in result)) return result;
	try {
		await recordDateChange(db, {
			eventSlug: event.params.slug,
			before,
			after: scheduleFromFile(/** @type {string} */ (content)),
			by: user.login
		});
	} catch (e) {
		console.error('[cambio de fecha] no se pudo anotar:', e);
	}
	return result;
}

/** @type {import('./$types').Actions} */
export const actions = {
	...Object.fromEntries(
		Object.entries(_editActions).map(([name, action]) => [
			name,
			/** @param {import('./$types').RequestEvent} event */
			(event) => action(asEventEdit(event))
		])
	),
	save: saveWithDateChange,

	// La lista entera de partes (2 en adelante), en orden: sumar, sacar y reordenar.
	partes_guardar: (event) =>
		partesAction(
			event,
			(db, form, by) =>
				setWorkshopParts(db, {
					eventSlug: event.params.slug,
					partSlugs: form
						.getAll('parte')
						.map((s) => String(s).trim())
						.filter(Boolean),
					by
				}),
			'Partes guardadas.'
		),

	// Parte nueva copiando el taller, con su fecha.
	partes_crear: (event) =>
		partesAction(
			event,
			(db, form, by) =>
				createWorkshopPart(db, {
					eventSlug: event.params.slug,
					start: argDateTime(form.get('start')),
					end: argDateTime(form.get('end')) || null,
					by
				}),
			'Parte creada: completá lo que cambia (fecha, lugar, texto) desde su ficha.'
		),

	// «Entradas por parte»: cada parte vende la suya (si no, una sola entrada para todo el taller).
	partes_entradas: (event) =>
		partesAction(
			event,
			(db, form, by) =>
				setPerPartTickets(db, {
					eventSlug: event.params.slug,
					perPart: form.get('por_parte') === 'on',
					by
				}),
			'Listo.'
		),

	// «Si ocultás el taller, ocultar también sus partes» (docs/talleres-partes.md).
	partes_ocultar: (event) =>
		partesAction(
			event,
			(db, form, by) =>
				setHideParts(db, {
					eventSlug: event.params.slug,
					hideParts: form.get('ocultar_partes') === 'on',
					by
				}),
			'Listo.'
		)
};
