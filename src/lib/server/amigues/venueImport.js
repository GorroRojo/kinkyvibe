/**
 * Lugares → «Importar de eventos»: lee el «Dónde» de todos los eventos (los .md, o la base con
 * `contenido_db` prendido: los mismos lectores que el sitio, `sitePosts`), arma los candidatos a
 * lugar (reglas puras en src/lib/utils/venueImport.js) y crea los elegidos.
 *
 * Escribe solo con los caminos de siempre:
 * - el lugar nuevo, con saveObject() (perfil de tipo lugar, público y aprobado como los que crea
 *   une admin), y en la MISMA tanda su aprobación y los vínculos de sus eventos;
 * - «sucede en» es una fila de `event_venues` (docs/amigues.md): vincular un evento NO toca su .md
 *   ni su objeto en la base, así que no hace falta commit ni PR;
 * - nunca pisa el lugar de un evento que ya tiene uno (solo si su lugar está borrado).
 *
 * De a tandas ({@link runVenueImport} con `budget`): D1 tiene un máximo de consultas por pedido,
 * así que el panel la llama varias veces hasta que no queda nada. Repetir es seguro: lo ya creado
 * pasa a ser un lugar existente y sus eventos ya vinculados se saltean.
 */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { ObjectError } from '$lib/server/objects/errors.js';
import { saveObject, slugify } from '$lib/server/objects/save.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { effectivePrivacy, isVenuePrivacy } from '$lib/utils/venues.js';
import { importLinks, newVenueFor, planVenueImport, refitEvents } from '$lib/utils/venueImport.js';
import { approveNewStatement } from './approvals.js';
import { isEventSlug, listEventVenues, listVenues } from './venues.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('$lib/utils/venueImport.js').ImportEvent} ImportEvent */
/** @typedef {import('$lib/utils/venueImport.js').VenueCandidate} VenueCandidate */
/** @typedef {import('$lib/utils/venues.js').VenuePrivacy} VenuePrivacy */

/**
 * Cuántas consultas escribe {@link runVenueImport} como mucho por llamada (aproximado: un lugar
 * nuevo son ~4 más una por evento y una del registro). Siempre hace al menos un candidato.
 */
export const VENUE_IMPORT_BUDGET = 150;

/** Largo máximo del nombre de un lugar (el del editor). */
const TITLE_MAX = 200;

/**
 * Todos los eventos (listados y no listados), como los lee el sitio.
 * @param {App.Platform | undefined} platform
 * @returns {Promise<ImportEvent[]>}
 */
export async function importableEvents(platform) {
	const [listed, unlisted] = await Promise.all([
		sitePosts(platform, false, false),
		sitePosts(platform, false, true)
	]);
	/** @type {Map<string, ImportEvent>} */
	const bySlug = new Map();
	for (const p of [...listed, ...unlisted]) {
		if (p.meta.category !== 'calendario') continue;
		const slug = String(p.meta.postID);
		if (!isEventSlug(slug) || bySlug.has(slug)) continue;
		bySlug.set(slug, {
			slug,
			title: String(p.meta.title ?? slug),
			start: p.meta.start ? String(p.meta.start) : '',
			meta: p.meta
		});
	}
	return [...bySlug.values()];
}

/**
 * Los candidatos con lo que hay ahora en la base (lugares y vínculos).
 *
 * @param {D1Database} db
 * @param {readonly ImportEvent[]} events
 */
export async function loadVenueImportPlan(db, events) {
	const [venues, links] = await Promise.all([listVenues(db), listEventVenues(db)]);
	// Un vínculo a un lugar borrado no cuenta (el evento muestra lo de su .md).
	const linked = new Set(links.filter((l) => !l.venueDeleted).map((l) => l.eventSlug));
	const plan = planVenueImport(events, { linked, venues });
	return { ...plan, venues };
}

/**
 * Lo que eligió le admin en la vista previa.
 * @typedef {{ key: string, title: string, location: string, events: string[] }} VenueChoice
 */

/**
 * Lee el formulario de la vista previa: `crear` (las claves elegidas, en orden) y, por cada
 * clave, `titulo:<clave>`, `donde:<clave>` y `evento:<clave>` (los eventos marcados).
 * @param {FormData} form
 * @returns {VenueChoice[]}
 */
export function readVenueChoices(form) {
	const seen = new Set();
	/** @type {VenueChoice[]} */
	const out = [];
	for (const raw of form.getAll('crear')) {
		const key = String(raw);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			key,
			title: String(form.get(`titulo:${key}`) ?? '')
				.replace(/\s+/g, ' ')
				.trim()
				.slice(0, TITLE_MAX),
			location: String(form.get(`donde:${key}`) ?? ''),
			events: form.getAll(`evento:${key}`).map(String)
		});
	}
	return out;
}

/**
 * Vincula un evento a un lugar dentro de una tanda. Nunca pisa un vínculo vigente: solo uno a un
 * lugar borrado. `venue` es el id o el lugar recién creado en la misma tanda (por su slug).
 *
 * @param {D1Database} db
 * @param {{ slug: string, privacy: VenuePrivacy | null }} link
 * @param {{ id: number } | { slug: string }} venue
 * @param {string} by
 * @param {number} now
 * @returns {D1PreparedStatement}
 */
function linkStatement(db, link, venue, by, now) {
	const target =
		'id' in venue
			? { where: 'id = ?5 AND deleted_at IS NULL', value: venue.id }
			: { where: 'slug = ?5', value: venue.slug };
	return db
		.prepare(
			`INSERT INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by)
			SELECT ?1, id, ?2, ?3, ?4, ?3, ?4 FROM objects WHERE type = ?6 AND ${target.where}
			ON CONFLICT (event_slug) DO UPDATE SET venue_id = excluded.venue_id,
				privacy = excluded.privacy, updated_at = excluded.updated_at, updated_by = excluded.updated_by
			WHERE event_venues.venue_id IN (SELECT id FROM objects WHERE deleted_at IS NOT NULL)`
		)
		.bind(link.slug, link.privacy, now, by, target.value, PROFILE_TYPE);
}

/**
 * @typedef {{
 *   key: string,
 *   action: 'created' | 'linked' | 'error',
 *   venueId?: number,
 *   title: string,
 *   slug?: string,
 *   venuePrivacy?: VenuePrivacy,
 *   links: { slug: string, privacy: VenuePrivacy | null }[],
 *   message?: string
 * }} VenueImportResult
 */

/**
 * Crea los lugares elegidos (o vincula a los que ya existen) de a tandas. Las claves que ya no
 * están en el plan (porque se crearon en una tanda anterior, o cambiaron los eventos) se ignoran.
 *
 * @param {D1Database} db
 * @param {Awaited<ReturnType<typeof loadVenueImportPlan>>} plan
 * @param {readonly VenueChoice[]} choices
 * @param {{ actor: string, now?: number, budget?: number }} opts
 * @returns {Promise<{ results: VenueImportResult[], remaining: number }>}
 */
export async function runVenueImport(
	db,
	plan,
	choices,
	{ actor, now = Date.now(), budget = VENUE_IMPORT_BUDGET }
) {
	const byKey = new Map(plan.candidates.map((c) => [c.key, c]));
	const todo = choices
		.map((choice) => ({ choice, candidate: byKey.get(choice.key) }))
		.filter(
			(x) =>
				x.candidate &&
				// Solo los eventos del candidato (lo demás del formulario no cuenta).
				x.candidate.events.some((e) => x.choice.events.includes(e.slug))
		);
	/** @type {VenueImportResult[]} */
	const results = [];
	let spent = 0;
	for (const { choice, candidate } of todo) {
		const c = /** @type {VenueCandidate} */ (candidate);
		const cost = (c.existing ? 1 : 5) + choice.events.length;
		if (results.length && spent + cost > budget) break;
		spent += cost;
		try {
			results.push(
				c.existing
					? await linkToExisting(db, plan, c, choice, { actor, now })
					: await createVenue(db, c, choice, { actor, now })
			);
		} catch (e) {
			results.push({
				key: c.key,
				action: 'error',
				title: choice.title || c.title,
				links: [],
				message: e instanceof ObjectError ? e.message : String(e)
			});
		}
	}
	return { results, remaining: todo.length - results.length };
}

/**
 * @param {D1Database} db
 * @param {VenueCandidate} c
 * @param {VenueChoice} choice
 * @param {{ actor: string, now: number }} opts
 * @returns {Promise<VenueImportResult>}
 */
async function createVenue(db, c, choice, { actor, now }) {
	// El «Dónde» del lugar: uno de los que escribieron los eventos (el más usado si no se eligió).
	const location = c.locations.some((v) => v.text === choice.location)
		? choice.location
		: c.address || c.area;
	const venue = newVenueFor(c, { title: choice.title, location });
	const fitted = { ...c, events: refitEvents(c, venue) };
	const { venuePrivacy, links } = importLinks(fitted, choice.events);
	const data = { ...venue.data, venue_privacy: venuePrivacy };
	const base = slugify(venue.title) || 'lugar';
	for (const slug of [base, `${base.slice(0, 80)}-${now.toString(36).slice(-5)}`]) {
		try {
			const saved = await saveObject(
				db,
				{ type: PROFILE_TYPE, title: venue.title, slug, data, visibility: 'public' },
				{
					actor,
					now,
					also: (self) => [
						approveNewStatement(db, self, actor, now),
						...links.map((l) => linkStatement(db, l, { slug: self.slug }, actor, now))
					]
				}
			);
			return {
				key: c.key,
				action: 'created',
				venueId: saved.id,
				title: saved.title,
				slug: saved.slug,
				venuePrivacy,
				links
			};
		} catch (e) {
			if (e instanceof ObjectError && e.code === 'slug_taken') continue;
			throw e;
		}
	}
	throw new ObjectError('slug_taken', 'No pudimos armar una dirección para ese nombre.');
}

/**
 * @param {D1Database} db
 * @param {Awaited<ReturnType<typeof loadVenueImportPlan>>} plan
 * @param {VenueCandidate} c
 * @param {VenueChoice} choice
 * @param {{ actor: string, now: number }} opts
 * @returns {Promise<VenueImportResult>}
 */
async function linkToExisting(db, plan, c, choice, { actor, now }) {
	const existing = /** @type {NonNullable<VenueCandidate['existing']>} */ (c.existing);
	const venue = plan.venues.find((v) => v.id === existing.id);
	const current =
		venue && isVenuePrivacy(venue.data.venue_privacy) ? venue.data.venue_privacy : null;
	// El nivel del lugar no cambia: cada evento lleva el suyo si es distinto.
	const { links } = importLinks(c, choice.events, effectivePrivacy(null, current));
	if (links.length) {
		await db.batch(links.map((l) => linkStatement(db, l, { id: existing.id }, actor, now)));
	}
	return { key: c.key, action: 'linked', venueId: existing.id, title: existing.title, links };
}
