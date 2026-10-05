/**
 * Lugares → «Vincular lugares»: los eventos sin lugar que tienen el «Dónde» escrito a mano,
 * juntados por lugar (las mismas reglas que «Importar de eventos», `planVenueImport`), con el
 * perfil de lugar que probablemente es cada grupo (src/lib/utils/venueMatch.js). Le admin
 * confirma y se vinculan de a muchos.
 *
 * Escribe solo con los caminos de siempre:
 * - «Vincular» es el edge `lugar` de cada evento, con saveObject() sobre el evento
 *   (`linkFreeEventVenue`: versión nueva, su revisión, `content_sources` al día). Nunca pisa el
 *   lugar de un evento que ya tiene uno (lo saltea); el «Dónde» escrito queda como está (se sigue
 *   viendo si el lugar se borra). El nivel de cada evento: el del lugar, salvo que el evento mostraba
 *   menos (`eventShowLevel`): entonces ese, como nivel propio en el edge (`linkPrivacy`). Nunca
 *   muestra del lugar más de lo que el lugar deja ver por defecto;
 * - «Dejar como texto» es una fila por evento en `event_venue_dismissals` (migración 0046), con la
 *   clave de su «Dónde»: si el «Dónde» cambia, se vuelve a sugerir. «Volver a sugerir» la borra.
 *
 * De a tandas ({@link VENUE_IMPORT_BUDGET}): D1 tiene un máximo de consultas por pedido, así que la
 * página repite el pedido con los grupos que faltan. Repetir es seguro: lo ya vinculado se saltea.
 */
import { listEventVenues, listVenues, linkFreeEventVenue } from './venues.js';
import { importableEvents, VENUE_IMPORT_BUDGET } from './venueImport.js';
import { eventShowLevel, planVenueImport, readEventPlace } from '$lib/utils/venueImport.js';
import { isConfident, linkPrivacy, placeKeyOf, suggestVenues } from '$lib/utils/venueMatch.js';
import { effectivePrivacy, isVenuePrivacy } from '$lib/utils/venues.js';
import { VENUE_FIELDS } from '$lib/server/objects/types/perfil.js';

export { importableEvents };

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/venueImport.js').ImportEvent} ImportEvent */
/** @typedef {import('$lib/utils/venueImport.js').VenueCandidate} VenueCandidate */
/** @typedef {import('$lib/utils/venueMatch.js').VenueSuggestion} VenueSuggestion */
/** @typedef {import('$lib/utils/venues.js').VenuePrivacy} VenuePrivacy */

/** Qué cuesta (en consultas, aproximado) vincular un evento: leerlo, el lugar y su guardado. */
const EVENT_COST = 8;

/**
 * Un evento de un grupo, con su «Dónde» y el nivel que muestra lo mismo que ya mostraba.
 * @typedef {{ slug: string, title: string, start: string, name: string, location: string, mapUrl: string, level: VenuePrivacy }} LinkEvent
 */

/**
 * Un grupo de eventos con el mismo «Dónde» y sus sugerencias.
 * @typedef {{
 *   key: string,
 *   title: string,
 *   names: { text: string, count: number }[],
 *   locations: { text: string, count: number }[],
 *   mapUrl: string,
 *   events: LinkEvent[],
 *   first: string,
 *   last: string,
 *   suggestions: VenueSuggestion[],
 *   marked: boolean
 * }} LinkGroup
 */

/**
 * Un lugar para elegir en la página: lo que muestra la lista y lo que usa `eventFit` para decir
 * qué cambiaría (solo admins ven esta página).
 * @typedef {{ id: number, slug: string, title: string, address: string, area: string, city: string, privacy: VenuePrivacy, data: Record<string, unknown> }} LinkVenue
 */

/**
 * Los eventos que se dejaron como texto: dirección del evento → clave del «Dónde» de entonces.
 * @param {D1Database} db
 * @returns {Promise<Map<string, string>>}
 */
export async function listDismissals(db) {
	const { results } = await db
		.prepare(
			`SELECT coalesce(cs.legacy_slug, ev.slug) AS event_slug, d.place_key
			FROM event_venue_dismissals d
			JOIN objects ev ON ev.id = d.event_id AND ev.type = 'evento'
			LEFT JOIN content_sources cs ON cs.object_id = ev.id AND cs.category = 'calendario'`
		)
		.all();
	return new Map(results.map((r) => [String(r.event_slug), String(r.place_key)]));
}

/** @param {string} value */
const str = (value) => (typeof value === 'string' ? value : '');

/**
 * Los lugares para la página (sin lo que no hace falta para elegir ni para `eventFit`).
 * @param {import('$lib/server/objects/read.js').StoredObject[]} venues
 * @returns {LinkVenue[]}
 */
function toLinkVenues(venues) {
	return venues.map((v) => ({
		id: v.id,
		slug: v.slug,
		title: v.title,
		address: str(/** @type {string} */ (v.data.address)),
		area: str(/** @type {string} */ (v.data.area)),
		city: str(/** @type {string} */ (v.data.city)),
		privacy: effectivePrivacy(
			null,
			isVenuePrivacy(v.data.venue_privacy) ? v.data.venue_privacy : null
		),
		data: Object.fromEntries(
			Object.entries(v.data).filter(([k]) => k === 'kind' || VENUE_FIELDS.includes(k))
		)
	}));
}

/**
 * Las direcciones viejas (de la ficha .md) de los lugares: también cuentan como su nombre.
 * @param {D1Database} db
 * @returns {Promise<Map<number, string>>}
 */
async function legacySlugs(db) {
	const { results } = await db
		.prepare(
			`SELECT s.profile_id, s.legacy_slug FROM profile_sources s
			JOIN objects o ON o.id = s.profile_id
			WHERE o.type = 'perfil' AND json_extract(o.data, '$.kind') = 'lugar'`
		)
		.all();
	return new Map(results.map((r) => [Number(r.profile_id), String(r.legacy_slug)]));
}

/**
 * Los grupos de eventos de un plan, con sus sugerencias.
 * @param {VenueCandidate[]} candidates
 * @param {import('$lib/utils/venueMatch.js').MatchVenue[]} venues
 * @returns {LinkGroup[]}
 */
function toGroups(candidates, venues) {
	return candidates.map((c) => {
		const suggestions = suggestVenues(c, venues);
		return {
			key: c.key,
			title: c.names[0]?.text ?? c.locations[0]?.text ?? c.mapUrl,
			names: c.names,
			locations: c.locations,
			mapUrl: c.mapUrl,
			events: c.events.map((e) => ({
				slug: e.slug,
				title: e.title,
				start: e.start,
				name: e.name,
				location: e.location,
				mapUrl: e.mapUrl,
				level: e.level
			})),
			first: c.first,
			last: c.last,
			suggestions,
			marked: isConfident(suggestions)
		};
	});
}

/**
 * Lo que muestra la página: los grupos para vincular (con sugerencias), los dejados como texto y
 * los lugares para elegir.
 *
 * @param {D1Database} db
 * @param {readonly ImportEvent[]} events todos los eventos (listados y no listados)
 */
export async function loadVenueLinkPlan(db, events) {
	const [stored, links, dismissals, legacy] = await Promise.all([
		listVenues(db),
		listEventVenues(db),
		listDismissals(db),
		legacySlugs(db)
	]);
	// Un vínculo a un lugar borrado no cuenta (el evento muestra lo de su «Dónde»).
	const linked = new Set(links.filter((l) => !l.venueDeleted).map((l) => l.eventSlug));
	/** @type {ImportEvent[]} */
	const open = [];
	/** @type {ImportEvent[]} */
	const dismissed = [];
	for (const e of events) {
		const place = readEventPlace(e.meta);
		const key = dismissals.get(e.slug);
		if (key !== undefined && place && placeKeyOf(place) === key) dismissed.push(e);
		else open.push(e);
	}
	const venues = toLinkVenues(stored);
	const matchable = stored.map((v) => ({
		id: v.id,
		slug: v.slug,
		title: v.title,
		legacySlug: legacy.get(v.id) ?? null,
		data: v.data
	}));
	const plan = planVenueImport(open, { linked });
	const later = planVenueImport(dismissed, { linked });
	return {
		groups: toGroups(plan.candidates, matchable),
		dismissed: toGroups(later.candidates, []).map(({ suggestions: _s, marked: _m, ...g }) => g),
		skipped: plan.skipped,
		venues
	};
}

/**
 * Lo que eligió le admin para un grupo: el lugar y los eventos.
 * @typedef {{ key: string, venueId: number, events: string[] }} LinkChoice
 */

/**
 * Lee el formulario: los grupos (`solo`, uno; si no, los marcados en `marcar`), y por cada uno
 * `lugar:<clave>` (el id del lugar) y `evento:<clave>` (sus eventos).
 * @param {FormData} form
 * @returns {LinkChoice[]}
 */
export function readLinkChoices(form) {
	const solo = form.get('solo');
	const keys = solo ? [String(solo)] : form.getAll('marcar').map(String);
	return [...new Set(keys)]
		.map((key) => ({
			key,
			venueId: Number(form.get(`lugar:${key}`)),
			events: [...new Set(form.getAll(`evento:${key}`).map(String))]
		}))
		.filter((c) => Number.isSafeInteger(c.venueId) && c.venueId > 0 && c.events.length);
}

/**
 * @typedef {{
 *   key: string,
 *   venueId: number,
 *   title: string,
 *   linked: { slug: string, privacy: VenuePrivacy | null }[],
 *   skipped: string[],
 *   errors: { slug: string, message: string }[]
 * }} LinkResult
 */

/**
 * Vincula los grupos elegidos, de a tandas. Cada evento se revisa de nuevo: tiene que seguir sin
 * lugar, con su «Dónde» escrito y sin «Dejar como texto»; si no, se saltea (así repetir es seguro).
 *
 * @param {D1Database} db
 * @param {readonly ImportEvent[]} events
 * @param {readonly LinkChoice[]} choices
 * @param {{ actor: string, now?: number, budget?: number }} opts
 * @returns {Promise<{ results: LinkResult[], remaining: string[] }>}
 */
export async function runVenueLinks(
	db,
	events,
	choices,
	{ actor, now = Date.now(), budget = VENUE_IMPORT_BUDGET }
) {
	const plan = await loadVenueLinkPlan(db, events);
	/** @type {Map<string, LinkEvent>} los eventos que se pueden vincular ahora */
	const open = new Map(plan.groups.flatMap((g) => g.events.map((e) => [e.slug, e])));
	const venues = new Map(plan.venues.map((v) => [v.id, v]));
	/** @type {LinkResult[]} */
	const results = [];
	/** @type {string[]} */
	const remaining = [];
	let spent = 0;
	for (const choice of choices) {
		const cost = EVENT_COST * choice.events.length;
		if (results.length && spent + cost > budget) {
			remaining.push(choice.key);
			continue;
		}
		spent += cost;
		const venue = venues.get(choice.venueId);
		/** @type {LinkResult} */
		const result = {
			key: choice.key,
			venueId: choice.venueId,
			title: venue?.title ?? '',
			linked: [],
			skipped: [],
			errors: []
		};
		results.push(result);
		if (!venue) {
			result.errors.push({ slug: '', message: 'Ese lugar ya no existe.' });
			continue;
		}
		for (const slug of choice.events) {
			const e = open.get(slug);
			if (!e) {
				result.skipped.push(slug);
				continue;
			}
			// Nunca más abierto que el nivel del lugar (linkPrivacy).
			const privacy = linkPrivacy(eventShowLevel(e), venue.privacy);
			try {
				const r = await linkFreeEventVenue(db, {
					eventSlug: slug,
					venueId: venue.id,
					privacy,
					by: actor,
					now
				});
				if (!r.ok) result.errors.push({ slug, message: r.message });
				else if (r.linked) result.linked.push({ slug, privacy });
				else result.skipped.push(slug);
			} catch (err) {
				result.errors.push({ slug, message: err instanceof Error ? err.message : String(err) });
			}
			open.delete(slug);
		}
	}
	return { results, remaining };
}

/**
 * Los ids de los eventos de la base con esas direcciones (las de su página).
 * @param {D1Database} db
 * @param {readonly string[]} slugs
 * @returns {Promise<Map<string, number>>}
 */
async function eventIds(db, slugs) {
	if (!slugs.length) return new Map();
	const { results } = await db
		.prepare(
			`SELECT coalesce(cs.legacy_slug, ev.slug) AS event_slug, ev.id FROM objects ev
			LEFT JOIN content_sources cs ON cs.object_id = ev.id AND cs.category = 'calendario'
			WHERE ev.type = 'evento'
				AND coalesce(cs.legacy_slug, ev.slug) IN (SELECT value FROM json_each(?1))`
		)
		.bind(JSON.stringify(slugs))
		.all();
	return new Map(results.map((r) => [String(r.event_slug), Number(r.id)]));
}

/**
 * «Dejar como texto»: los eventos (de los grupos para vincular) no se vuelven a sugerir mientras
 * su «Dónde» no cambie. Devuelve los que marcó.
 *
 * @param {D1Database} db
 * @param {readonly ImportEvent[]} events
 * @param {readonly string[]} slugs
 * @param {{ actor: string, now?: number }} opts
 * @returns {Promise<string[]>}
 */
export async function dismissEvents(db, events, slugs, { actor, now = Date.now() }) {
	const plan = await loadVenueLinkPlan(db, events);
	const open = new Map(plan.groups.flatMap((g) => g.events.map((e) => [e.slug, e])));
	const want = slugs.filter((s) => open.has(s));
	const ids = await eventIds(db, want);
	const rows = want.filter((s) => ids.has(s));
	if (!rows.length) return [];
	await db.batch(
		rows.map((slug) =>
			db
				.prepare(
					`INSERT INTO event_venue_dismissals (event_id, place_key, dismissed_at, dismissed_by)
					VALUES (?1, ?2, ?3, ?4)
					ON CONFLICT (event_id) DO UPDATE SET place_key = excluded.place_key,
						dismissed_at = excluded.dismissed_at, dismissed_by = excluded.dismissed_by`
				)
				.bind(ids.get(slug), placeKeyOf(/** @type {LinkEvent} */ (open.get(slug))), now, actor)
		)
	);
	return rows;
}

/**
 * «Volver a sugerir»: borra el «Dejar como texto» de esos eventos. Devuelve cuántos.
 * @param {D1Database} db
 * @param {readonly string[]} slugs
 */
export async function undismissEvents(db, slugs) {
	const ids = [...(await eventIds(db, slugs)).values()];
	if (!ids.length) return 0;
	const r = await db
		.prepare(
			'DELETE FROM event_venue_dismissals WHERE event_id IN (SELECT value FROM json_each(?1))'
		)
		.bind(JSON.stringify(ids))
		.run();
	return Number(r.meta?.changes ?? 0);
}
