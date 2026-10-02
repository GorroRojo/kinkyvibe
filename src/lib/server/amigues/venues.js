/**
 * Lugares y eventos: "sucede en" (tabla `event_venues`, migración 0017) y lo que se muestra de
 * cada lugar según su privacidad (decisión B3). Las reglas de qué se ve en cada nivel están en
 * src/lib/utils/venues.js (puras); acá, las lecturas y escrituras.
 *
 * Vínculo PROVISORIO por la dirección del evento, mientras los eventos sigan siendo .md. Cuando
 * pasen a la base, cada fila se convierte en un edge `lugar` (evento → perfil de lugar) con
 * saveObject(), y `privacy` pasa a `edges.data` (ver docs/amigues.md).
 *
 * Lo que nunca se tiene que romper:
 * - la dirección de un lugar sale de acá solo en {@link publicVenueForEvent} (según el nivel) y en
 *   {@link buyerVenueForEvent} (completa, solo para mails y páginas de quien compró);
 * - la página de un lugar lista solo los eventos que muestran el link al lugar (niveles 1 y 2);
 * - sitemap, RSS y buscador no llevan lugares (ni el «Dónde» del .md);
 * - los .ics (el general, etiqueta o serie, "lo tuyo") usan {@link feedVenues}: lo mismo que la
 *   página del evento le muestra a cualquiera;
 * - un lugar vinculado manda: las salidas públicas que mandan la meta de los eventos (listas,
 *   carrusel, /api/posts) pasan por {@link withVenuePlaces}, que cambia el «Dónde» del .md por el
 *   lugar según su nivel (lo verifica la prueba de filtraciones).
 */
import { venuePlaceMeta, stripMdPlace } from '$lib/utils/eventPlace.js';
import { ANON, getObject } from '$lib/server/objects/index.js';
import { OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import {
	effectivePrivacy,
	fullAddress,
	isVenuePrivacy,
	showsVenueLink,
	venueView
} from '$lib/utils/venues.js';
import { isFlagOn } from '$lib/server/flags.js';
import { isApproved, urlSlugOf, viewerFor } from './profiles.js';
import { textOrNull as s } from '$lib/utils/text.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/server/objects/visibility.js').Viewer} Viewer */
/** @typedef {import('$lib/utils/venues.js').VenuePrivacy} VenuePrivacy */
/** @typedef {import('$lib/utils/venues.js').VenueView} VenueView */

/** Dirección de evento válida (la de los .md de calendario). */
const EVENT_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** @param {unknown} slug */
export function isEventSlug(slug) {
	return typeof slug === 'string' && EVENT_SLUG.test(slug);
}

/**
 * El vínculo de un evento con su lugar, con el lugar entero (sin filtrar: es para decidir qué
 * mostrar, nunca se manda así a una página). `null` si no tiene lugar o el lugar está borrado o
 * ya no es un lugar.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ venue: StoredObject, legacySlug: string | null, override: VenuePrivacy | null } | null>}
 */
export async function eventVenue(db, eventSlug) {
	if (!isEventSlug(eventSlug)) return null;
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `o.${c}`)
		.join(', ');
	const row = await db
		.prepare(
			`SELECT ${cols}, ev.privacy AS ev_privacy, s.legacy_slug AS legacy_slug FROM event_venues ev
			JOIN objects o ON o.id = ev.venue_id
			LEFT JOIN profile_sources s ON s.profile_id = o.id
			WHERE ev.event_slug = ?1 AND o.type = ?2 AND o.deleted_at IS NULL`
		)
		.bind(eventSlug, PROFILE_TYPE)
		.first();
	if (!row) return null;
	const venue = rowToObject(row);
	if (profileKindOf(venue.data) !== 'lugar') return null;
	return {
		venue,
		legacySlug: row.legacy_slug == null ? null : String(row.legacy_slug),
		override: isVenuePrivacy(row.ev_privacy) ? row.ev_privacy : null
	};
}

/**
 * Lo que la página pública de un evento puede mostrar de su lugar. `null` si el evento no tiene
 * lugar (la página muestra lo de su .md, como siempre). Si quien mira no puede ver el lugar (oculto,
 * solo con cuenta o sin aprobar), es como el nivel "oculto".
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {Viewer} viewer
 * @returns {Promise<VenueView | null>}
 */
export async function publicVenueForEvent(db, eventSlug, viewer) {
	const link = await eventVenue(db, eventSlug);
	if (!link) return null;
	const level = effectivePrivacy(link.override, link.venue.data.venue_privacy);
	if (level === 'hidden') return { level };
	const visible = await getObject(db, { id: link.venue.id }, viewer);
	if (!visible || visible.visibility === 'hidden' || !(await isApproved(db, link.venue.id))) {
		return { level: 'hidden' };
	}
	return venueView(link.venue, level, `/amigues/${urlSlugOf(link.venue, link.legacySlug)}`);
}

/**
 * "Sucede en" para las páginas de un evento (la del evento, /entradas y /compartir): el lugar
 * según su privacidad para quien mira, solo con el interruptor `perfiles_publicos` prendido.
 * `null` si no tiene lugar (o si la base falla): la página muestra lo de su .md.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} eventSlug
 * @param {App.Locals} locals
 * @returns {Promise<VenueView | null>}
 */
export async function eventPageVenue(db, eventSlug, locals) {
	try {
		if (!db || !(await isFlagOn(db, 'perfiles_publicos'))) return null;
		return await publicVenueForEvent(db, eventSlug, viewerFor(locals));
	} catch (e) {
		console.error('[calendario] no se pudo leer el lugar del evento', e);
		return null;
	}
}

/**
 * Para el editor de un evento: el nombre del lugar vinculado si la página lo usa (interruptor
 * `perfiles_publicos` prendido), para avisar que el «Dónde» del .md no se muestra. `null` si no
 * tiene lugar o no se pudo leer.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} eventSlug
 * @returns {Promise<string | null>}
 */
export async function linkedVenueName(db, eventSlug) {
	try {
		if (!db || !(await isFlagOn(db, 'perfiles_publicos'))) return null;
		return (await eventVenue(db, eventSlug))?.venue.title ?? null;
	} catch (e) {
		console.error('[lugares] no se pudo leer el lugar del evento para el editor', e);
		return null;
	}
}

/**
 * El lugar completo para quien compró una entrada (mail de confirmación, recordatorios y página
 * de la entrada), en cualquier nivel de privacidad. `null` si el evento no tiene lugar.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ name: string, address: string, howTo: string | null, accessibility: string | null } | null>}
 */
export async function buyerVenueForEvent(db, eventSlug) {
	const link = await eventVenue(db, eventSlug);
	if (!link) return null;
	const d = link.venue.data;
	return {
		name: link.venue.title,
		address: fullAddress(d),
		howTo: s(d.how_to_get_there),
		accessibility: s(d.accessibility)
	};
}

/**
 * Para los mails y la página de la entrada de quien compró: el lugar completo como
 * `{ location_name, location }` (los mismos campos que usan las plantillas), o `null` si el
 * interruptor `perfiles_publicos` está apagado o el evento no tiene lugar (entonces se usa lo del
 * .md, como siempre). Nunca tira: un error deja lo del .md.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} eventSlug
 * @returns {Promise<{ location_name: string, location: string | undefined } | null>}
 */
export async function buyerLocation(db, eventSlug) {
	if (!db) return null;
	try {
		if (!(await isFlagOn(db, 'perfiles_publicos'))) return null;
		const venue = await buyerVenueForEvent(db, eventSlug);
		if (!venue) return null;
		return { location_name: venue.name, location: venue.address || undefined };
	} catch (e) {
		console.error('[lugares] no se pudo leer el lugar para quien compró', e);
		return null;
	}
}

/**
 * Para los calendarios .ics dinámicos (etiqueta o serie, "lo tuyo"): el lugar de cada evento de
 * `slugs` que tiene uno, como lo ve cualquiera en la página del evento (ANON), para
 * `feedLocation`. Vacío si `perfiles_publicos` está apagado (entonces el .ics usa lo del .md, como
 * la página). Si algo falla, tira: mejor un .ics que no carga que uno con una dirección oculta.
 *
 * @param {D1Database | null | undefined} db
 * @param {Iterable<string>} slugs
 * @returns {Promise<Map<string, VenueView>>}
 */
export async function feedVenues(db, slugs) {
	/** @type {Map<string, VenueView>} */
	const out = new Map();
	if (!db || !(await isFlagOn(db, 'perfiles_publicos'))) return out;
	const want = new Set(slugs);
	const { results } = await db.prepare('SELECT event_slug FROM event_venues').all();
	for (const r of results) {
		const slug = String(r.event_slug);
		if (!want.has(slug)) continue;
		const view = await publicVenueForEvent(db, slug, ANON);
		if (view) out.set(slug, view);
	}
	return out;
}

/**
 * Un lugar vinculado manda: `posts` con el «Dónde» del .md (`location`, `location_name`,
 * `location_map`) de cada evento con lugar cambiado por lo que la página del evento le muestra a
 * cualquiera (`venuePlaceMeta`). Para todo lo público que manda la meta de los eventos (listas,
 * carrusel, /api/posts). No toca los posts de entrada (vienen de la caché de los .md).
 *
 * Sin base o con `perfiles_publicos` apagado, como están (la página del evento también usa el
 * .md). Si la base falla, los eventos van sin el «Dónde» del .md: mejor sin lugar que con uno
 * que debía estar oculto.
 *
 * @template {{ meta: Record<string, any> }} P
 * @param {D1Database | null | undefined} db
 * @param {readonly P[]} posts
 * @returns {Promise<P[]>}
 */
export async function withVenuePlaces(db, posts) {
	/** @param {P} p */
	const isEvent = (p) => p.meta?.category === 'calendario';
	const slugs = posts.filter(isEvent).map((p) => String(p.meta.postID));
	if (!slugs.length) return [...posts];
	/** @type {Map<string, VenueView>} */
	let venues;
	try {
		venues = await feedVenues(db, slugs);
	} catch (e) {
		console.error('[lugares] no se pudieron leer los lugares de los eventos', e);
		return posts.map((p) => (isEvent(p) ? { ...p, meta: stripMdPlace(p.meta) } : p));
	}
	if (!venues.size) return [...posts];
	return posts.map((p) => {
		const venue = isEvent(p) ? venues.get(String(p.meta.postID)) : undefined;
		return venue ? { ...p, meta: venuePlaceMeta(p.meta, venue) } : p;
	});
}

/**
 * {@link withVenuePlaces} para los posts relacionados de una página (`currentRelated`).
 * @template {{ relatedPosts: { meta: Record<string, any> }[] }} R
 * @param {D1Database | null | undefined} db
 * @param {R} related
 * @returns {Promise<R>}
 */
export async function relatedWithVenuePlaces(db, related) {
	return { ...related, relatedPosts: await withVenuePlaces(db, related.relatedPosts) };
}

/**
 * Los eventos que la página de un lugar puede listar: los que muestran el link al lugar (su nivel,
 * el del evento o el del lugar, es "Nombre + dirección" o "Sólo Nombre"). Los demás no aparecen
 * nunca; tampoco los de "Sólo dirección": listarlos juntaría el nombre con la dirección.
 *
 * @param {D1Database} db
 * @param {StoredObject} venue
 * @returns {Promise<string[]>} direcciones de eventos
 */
export async function listedVenueEvents(db, venue) {
	const { results } = await db
		.prepare('SELECT event_slug, privacy FROM event_venues WHERE venue_id = ?1')
		.bind(venue.id)
		.all();
	return results
		.filter((r) => showsVenueLink(effectivePrivacy(r.privacy, venue.data.venue_privacy)))
		.map((r) => String(r.event_slug));
}

/**
 * La ubicación que muestra la página de un lugar, según su privacidad por defecto. La página
 * muestra siempre el nombre del lugar, así que en "Sólo dirección" no puede mostrar también la
 * dirección (juntaría las dos cosas): ahí se ve como "Sólo Nombre".
 *
 * @param {StoredObject} venue
 * @param {string} href
 * @returns {VenueView}
 */
export function venuePageLocation(venue, href) {
	const level = effectivePrivacy(null, venue.data.venue_privacy);
	return venueView(venue, level === 'address' ? 'name' : level, href);
}

// ---------------------------------------------------------------------------------------------
// Panel (solo admins).
// ---------------------------------------------------------------------------------------------

/**
 * Todos los vínculos evento → lugar, para el panel.
 *
 * @param {D1Database} db
 * @returns {Promise<{ eventSlug: string, venueId: number, venueTitle: string, venueDeleted: boolean, privacy: VenuePrivacy | null, updatedAt: number, updatedBy: string }[]>}
 */
export async function listEventVenues(db) {
	const { results } = await db
		.prepare(
			`SELECT ev.event_slug, ev.venue_id, ev.privacy, ev.updated_at, ev.updated_by, o.title,
				o.deleted_at FROM event_venues ev JOIN objects o ON o.id = ev.venue_id
			ORDER BY ev.event_slug`
		)
		.all();
	return results.map((r) => ({
		eventSlug: String(r.event_slug),
		venueId: Number(r.venue_id),
		venueTitle: String(r.title),
		venueDeleted: r.deleted_at != null,
		privacy: isVenuePrivacy(r.privacy) ? r.privacy : null,
		updatedAt: Number(r.updated_at),
		updatedBy: String(r.updated_by)
	}));
}

/**
 * Los perfiles de lugar (también ocultos), para el panel.
 *
 * @param {D1Database} db
 * @returns {Promise<StoredObject[]>}
 */
export async function listVenues(db) {
	const { results } = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS} FROM objects WHERE type = ?1 AND deleted_at IS NULL
			AND json_extract(data, '$.kind') = 'lugar' ORDER BY title COLLATE NOCASE, id`
		)
		.bind(PROFILE_TYPE)
		.all();
	return results.map(rowToObject);
}

/**
 * Vincula (o cambia) el lugar de un evento.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, venueId: number, privacy: VenuePrivacy | null, by: string, now?: number }} input
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function setEventVenue(db, { eventSlug, venueId, privacy, by, now = Date.now() }) {
	if (!isEventSlug(eventSlug)) return { ok: false, message: 'Elegí un evento.' };
	if (privacy !== null && !isVenuePrivacy(privacy)) {
		return { ok: false, message: 'Elegí la privacidad de la dirección.' };
	}
	const venue = await db
		.prepare(
			`SELECT id FROM objects WHERE id = ?1 AND type = ?2 AND deleted_at IS NULL
			AND json_extract(data, '$.kind') = 'lugar'`
		)
		.bind(venueId, PROFILE_TYPE)
		.first();
	if (!venue) return { ok: false, message: 'Ese lugar ya no existe.' };
	await db
		.prepare(
			`INSERT INTO event_venues (event_slug, venue_id, privacy, created_at, created_by, updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?5)
			ON CONFLICT (event_slug) DO UPDATE SET venue_id = excluded.venue_id,
				privacy = excluded.privacy, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
		)
		.bind(eventSlug, venueId, privacy, now, by)
		.run();
	return { ok: true };
}

/**
 * Saca el lugar de un evento (vuelve a mostrar lo de su .md).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 */
export async function removeEventVenue(db, eventSlug) {
	if (!isEventSlug(eventSlug)) return false;
	const r = await db
		.prepare('DELETE FROM event_venues WHERE event_slug = ?1')
		.bind(eventSlug)
		.run();
	return r.meta.changes > 0;
}
