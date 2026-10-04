/**
 * Ficha del evento, pestaña Editar: el editor de /edit (datos, imagen, etiquetas, entradas y texto)
 * dentro del panel. Mismo load y mismas acciones (guarda con un commit por el mismo camino, así
 * que en los previews va a la capa demo), con la categoría fija en `calendario`.
 *
 * Abajo, la sección «Partes» (talleres en varias partes, docs/talleres-partes.md), con sus propias
 * acciones (`partes_*`): guardan los edges `parte` del taller en la base, aparte del editor.
 */
import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import {
	createWorkshopPart,
	panelParts,
	setPerPartTickets,
	setWorkshopParts
} from '$lib/server/eventos/partes.js';
import {
	_editActions,
	_editLoad
} from '../../../../edit/[category=category]/[postID]/+page.server.js';

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

/** @type {import('./$types').Actions} */
export const actions = {
	...Object.fromEntries(
		Object.entries(_editActions).map(([name, action]) => [
			name,
			/** @param {import('./$types').RequestEvent} event */
			(event) => action(asEventEdit(event))
		])
	),

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
		)
};
