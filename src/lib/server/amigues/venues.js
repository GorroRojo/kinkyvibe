/**
 * Lugares y eventos: "sucede en" y lo que se muestra de cada lugar según su privacidad (decisión
 * B3). Las reglas de qué se ve en cada nivel están en src/lib/utils/venues.js (puras); acá, las
 * lecturas y escrituras.
 *
 * "Sucede en" es un edge `lugar` (evento → perfil de lugar, `edges.data.privacy` = el nivel propio
 * del evento, o sin `data` si usa el del lugar), escrito SOLO con saveObject() sobre el evento
 * (con su historial). Antes era la tabla `event_venues` (migraciones 0017 y 0027); la 0035 pasó
 * sus filas a edges y nada la usa más (queda en la base: las migraciones solo agregan). Por eso
 * el evento tiene que estar en la base para tener lugar (docs/amigues.md). Para afuera todo sigue
 * siendo por la dirección del evento (la de su página: la del .md importado o la del objeto), como
 * las listas de posts.
 *
 * Lo que nunca se tiene que romper:
 * - la dirección de un lugar sale de acá solo en {@link publicVenueForEvent} (según el nivel) y en
 *   {@link buyerVenueForEvent} (completa, solo para mails y páginas de quien compró);
 * - la página de un lugar lista solo los eventos que muestran el link al lugar (niveles 1 y 2);
 * - sitemap y RSS no llevan lugares; el buscador lleva solo los que ya se alcanzan navegando
 *   (listados, o no listados con link desde un evento visible: {@link linkedVenues}), con su
 *   nombre, descripción y lo que muestra su página según su nivel (nunca la calle), y nunca el
 *   «Dónde» del .md (src/lib/server/search/siteIndex.js);
 * - los .ics (el general, etiqueta o serie, "lo tuyo") usan {@link feedVenues}: lo mismo que la
 *   página del evento le muestra a cualquiera;
 * - un lugar vinculado manda: las salidas públicas que mandan la meta de los eventos (listas,
 *   carrusel, /api/posts) pasan por {@link withVenuePlaces}, que cambia el «Dónde» del .md por el
 *   lugar según su nivel (lo verifica la prueba de filtraciones).
 */
import { venuePlaceMeta, stripMdPlace } from '$lib/utils/eventPlace.js';
import { ANON, canSee, getObject } from '$lib/server/objects/index.js';
import { ObjectError, VersionConflictError } from '$lib/server/objects/errors.js';
import { saveObject } from '$lib/server/objects/save.js';
import { revisionStatement } from '$lib/server/contenido/revisions.js';
import { OBJECT_COLUMNS, forViewer, rowToObject } from '$lib/server/objects/read.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import {
	effectivePrivacy,
	fullAddress,
	isVenuePrivacy,
	showsVenueLink,
	venuePageLevel,
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

/** El tipo de los eventos y la relación «sucede en» (src/lib/server/objects/types/evento.js). */
const EVENT_TYPE = 'evento';
const LUGAR_EDGE = 'lugar';

/** Dirección de evento válida (la de los .md de calendario). */
const EVENT_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** @param {unknown} slug */
export function isEventSlug(slug) {
	return typeof slug === 'string' && EVENT_SLUG.test(slug);
}

/**
 * La dirección con la que las páginas conocen a un evento de la base: la del .md importado
 * (`content_sources.legacy_slug`) o, si no tiene, la del objeto. La misma regla que `postID` en
 * src/lib/server/contenido/posts.js. Para SQL con `ev` (el evento) y `cs` (su `content_sources`).
 */
const EVENT_POST_SLUG = 'coalesce(cs.legacy_slug, ev.slug)';

/**
 * Los vínculos evento → lugar (edges `lugar`), con la dirección del evento, el lugar y el nivel
 * propio del evento. Lectura interna (decide qué mostrar; nunca se manda así a una página): no
 * filtra por visibilidad, como la tabla de antes. `where` se agrega con AND.
 *
 * @param {string} where
 */
const lugarLinksSql = (where) =>
	`SELECT ${EVENT_POST_SLUG} AS event_slug, e.from_id AS event_id, e.to_id AS venue_id,
		json_extract(e.data, '$.privacy') AS privacy, e.created_at, e.created_by
	FROM edges e
	JOIN objects ev ON ev.id = e.from_id AND ev.type = '${EVENT_TYPE}'
	LEFT JOIN content_sources cs ON cs.object_id = ev.id AND cs.category = 'calendario'
	WHERE e.kind = '${LUGAR_EDGE}' AND (${where})`;

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
			`SELECT ${cols}, l.privacy AS ev_privacy, s.legacy_slug AS legacy_slug
			FROM (${lugarLinksSql(`${EVENT_POST_SLUG} = ?1`)}) l
			JOIN objects o ON o.id = l.venue_id
			LEFT JOIN profile_sources s ON s.profile_id = o.id
			WHERE o.type = ?2 AND o.deleted_at IS NULL`
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
	if (effectivePrivacy(link.override, link.venue.data.venue_privacy) === 'hidden') {
		return { level: 'hidden' };
	}
	const visible = await getObject(db, { id: link.venue.id }, viewer);
	return linkedVenueView(link, visible, visible ? await isApproved(db, link.venue.id) : false);
}

/**
 * Lo que se muestra del lugar de un evento, con lo ya leído: el vínculo (`eventVenue`), el lugar
 * como lo ve quien mira (`getObject`, `null` si no lo puede ver) y si está aprobado. La usan la
 * página del evento (un evento) y {@link feedVenues} (muchos, leídos juntos), así deciden igual.
 *
 * @param {{ venue: StoredObject, legacySlug: string | null, override: VenuePrivacy | null }} link
 * @param {StoredObject | null} visible
 * @param {boolean} approved
 * @returns {VenueView}
 */
function linkedVenueView(link, visible, approved) {
	const level = effectivePrivacy(link.override, link.venue.data.venue_privacy);
	if (level === 'hidden') return { level };
	if (!visible || visible.visibility === 'hidden' || !approved) return { level: 'hidden' };
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
	for (const { eventSlug, view } of await anonEventVenues(db, slugs)) out.set(eventSlug, view);
	return out;
}

/**
 * Los lugares a los que lleva el link de alguno de los eventos de `slugs`, como lo ve cualquiera
 * en la página del evento (ANON): solo niveles "Nombre + dirección" o "Sólo Nombre" y lugares
 * que ANON puede ver y están aprobados (lo mismo que decide el link, {@link linkedVenueView}).
 * Para el buscador: un lugar no listado al que se llega desde un evento visible también se puede
 * encontrar buscando (regla de gorrite: lo que ya se alcanza navegando). El objeto va como lo ve
 * ANON (`forViewer`); quien lo use elige qué campos muestra. No mira el interruptor
 * `perfiles_publicos`: quien llama lo decide.
 *
 * @param {D1Database} db
 * @param {Iterable<string>} slugs los eventos que ya se pueden alcanzar (listados y publicados)
 * @returns {Promise<{ object: StoredObject, legacySlug: string | null }[]>}
 */
export async function linkedVenues(db, slugs) {
	/** @type {Map<number, { object: StoredObject, legacySlug: string | null }>} */
	const out = new Map();
	for (const { view, found } of await anonEventVenues(db, slugs)) {
		if (!view.href || !found.visible || out.has(found.venue.id)) continue;
		out.set(found.venue.id, { object: found.visible, legacySlug: found.legacySlug });
	}
	return [...out.values()];
}

/**
 * Una marca que cambia cuando cambia algún vínculo evento → lugar (agregar, sacar o cambiar el
 * nivel: cada cambio pasa por saveObject() sobre el evento, que le sube la `version`). Una
 * consulta chica, para quien recuerda algo armado con los vínculos (el índice de la búsqueda).
 *
 * @param {D1Database} db
 * @returns {Promise<string>}
 */
export async function eventVenuesStamp(db) {
	const row = await db
		.prepare(
			`SELECT count(*) AS n, total(e.id) AS i, total(e.to_id) AS v, total(ev.version) AS u,
				total(length(e.data)) AS p
			FROM edges e JOIN objects ev ON ev.id = e.from_id WHERE e.kind = ?1`
		)
		.bind(LUGAR_EDGE)
		.first();
	return `${row?.n}:${row?.i}:${row?.v}:${row?.u}:${row?.p}`;
}

/**
 * El lugar de cada evento de `slugs` que tiene uno, como lo ve ANON en la página del evento, con
 * lo leído del lugar. Todos juntos, en una sola vuelta a la base: los vínculos de los eventos
 * pedidos y sus lugares (una fila por lugar, no por evento). Antes eran tres consultas por evento
 * con lugar: la página de un lugar con 80 eventos hacía ~240 y el .ics general ~850.
 *
 * @param {D1Database} db
 * @param {Iterable<string>} slugs
 */
async function anonEventVenues(db, slugs) {
	/** @type {{ eventSlug: string, view: VenueView, found: { venue: StoredObject, legacySlug: string | null, visible: StoredObject | null, approved: boolean } }[]} */
	const out = [];
	const want = [...new Set(slugs)].filter(isEventSlug);
	if (!want.length) return out;
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `o.${c}`)
		.join(', ');
	const wanted = JSON.stringify(want);
	/** @type {import('@cloudflare/workers-types').D1Result<Record<string, unknown>>[]} */
	const [links, venues] = await db.batch([
		db
			.prepare(
				`${lugarLinksSql(`${EVENT_POST_SLUG} IN (SELECT value FROM json_each(?1))`)}
				ORDER BY event_slug`
			)
			.bind(wanted),
		db
			.prepare(
				`SELECT ${cols}, s.legacy_slug AS legacy_slug,
					EXISTS (SELECT 1 FROM profile_approvals a WHERE a.profile_id = o.id) AS approved
				FROM objects o LEFT JOIN profile_sources s ON s.profile_id = o.id
				WHERE o.id IN (
					SELECT venue_id FROM (${lugarLinksSql(`${EVENT_POST_SLUG} IN (SELECT value FROM json_each(?1))`)})
				) AND o.type = ?2 AND o.deleted_at IS NULL`
			)
			.bind(wanted, PROFILE_TYPE)
	]);
	/** @type {Map<number, { venue: StoredObject, legacySlug: string | null, visible: StoredObject | null, approved: boolean }>} */
	const byId = new Map();
	for (const row of venues.results) {
		const venue = rowToObject(row);
		if (profileKindOf(venue.data) !== 'lugar') continue;
		byId.set(venue.id, {
			venue,
			legacySlug: row.legacy_slug == null ? null : String(row.legacy_slug),
			// Lo mismo que `getObject(db, { id }, ANON)` con la fila ya leída.
			visible: canSee(venue, ANON) ? forViewer(venue, ANON) : null,
			approved: Boolean(row.approved)
		});
	}
	for (const r of links.results) {
		const found = byId.get(Number(r.venue_id));
		if (!found) continue;
		const link = {
			venue: found.venue,
			legacySlug: found.legacySlug,
			override: isVenuePrivacy(r.privacy) ? r.privacy : null
		};
		out.push({
			eventSlug: String(r.event_slug),
			view: linkedVenueView(link, found.visible, found.approved),
			found
		});
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
	const { results } = await db.prepare(lugarLinksSql('e.to_id = ?1')).bind(venue.id).all();
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
	return venueView(venue, venuePageLevel(venue.data.venue_privacy), href);
}

// ---------------------------------------------------------------------------------------------
// Panel (solo admins).
// ---------------------------------------------------------------------------------------------

/**
 * Todos los vínculos evento → lugar, para el panel. `updatedAt`/`updatedBy`: cuándo y quién
 * vinculó el evento a ese lugar (el edge; cambiar solo el nivel no lo cambia).
 *
 * @param {D1Database} db
 * @returns {Promise<{ eventSlug: string, venueId: number, venueTitle: string, venueDeleted: boolean, privacy: VenuePrivacy | null, updatedAt: number, updatedBy: string }[]>}
 */
export async function listEventVenues(db) {
	const { results } = await db
		.prepare(
			`SELECT l.event_slug, l.venue_id, l.privacy, l.created_at, l.created_by, o.title,
				o.deleted_at FROM (${lugarLinksSql('1')}) l JOIN objects o ON o.id = l.venue_id
			ORDER BY l.event_slug`
		)
		.all();
	return results.map((r) => ({
		eventSlug: String(r.event_slug),
		venueId: Number(r.venue_id),
		venueTitle: String(r.title),
		venueDeleted: r.deleted_at != null,
		privacy: isVenuePrivacy(r.privacy) ? r.privacy : null,
		updatedAt: Number(r.created_at),
		updatedBy: String(r.created_by)
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
 * El vínculo de un evento como está guardado (también con un lugar borrado: el formulario lo
 * avisa), o `null` si no tiene. Para el formulario del panel.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ venueId: number, privacy: unknown } | null>}
 */
export async function eventVenueLink(db, eventSlug) {
	if (!isEventSlug(eventSlug)) return null;
	const row = await db
		.prepare(lugarLinksSql(`${EVENT_POST_SLUG} = ?1`))
		.bind(eventSlug)
		.first();
	return row ? { venueId: Number(row.venue_id), privacy: row.privacy } : null;
}

/**
 * El evento de la base con esa dirección (la de su página, ver {@link EVENT_POST_SLUG}), también
 * oculto o borrado (el panel lo puede vincular igual), o `null` si la base no lo tiene.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ id: number, version: number, venueId: number | null, privacy: unknown } | null>}
 */
async function eventForVenue(db, eventSlug) {
	const row = await db
		.prepare(
			`SELECT ev.id, ev.version, e.to_id AS venue_id, json_extract(e.data, '$.privacy') AS privacy
			FROM objects ev
			LEFT JOIN content_sources cs ON cs.object_id = ev.id AND cs.category = 'calendario'
			LEFT JOIN edges e ON e.from_id = ev.id AND e.kind = ?2
			WHERE ev.type = ?3 AND (cs.legacy_slug = ?1 OR (cs.legacy_slug IS NULL AND ev.slug = ?1))
			ORDER BY cs.legacy_slug IS NULL LIMIT 1`
		)
		.bind(eventSlug, LUGAR_EDGE, EVENT_TYPE)
		.first();
	if (!row) return null;
	return {
		id: Number(row.id),
		version: Number(row.version),
		venueId: row.venue_id == null ? null : Number(row.venue_id),
		privacy: row.privacy
	};
}

/** Cuántas veces se reintenta si alguien guardó el evento en el medio. */
const VENUE_SAVE_TRIES = 3;

/**
 * Escribe el edge `lugar` de un evento con saveObject() (versión nueva del evento, con su
 * historial en la misma tanda). Lo que el evento tenía en `data` no cambia; si se importó de un
 * .md y nadie lo había editado, sigue contando como no editado (`content_sources`), así volver a
 * importar su .md lo sigue actualizando.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ to: number, data: { privacy: VenuePrivacy } | null }[]} lugar `[]` para sacarlo
 * @param {{ by: string, now: number }} opts
 * @returns {Promise<{ ok: true, changed: boolean } | { ok: false, message: string }>}
 */
async function writeVenueEdge(db, eventSlug, lugar, { by, now }) {
	for (let attempt = 1; ; attempt++) {
		const event = await eventForVenue(db, eventSlug);
		if (!event) return { ok: false, message: NOT_IN_DB };
		const want = lugar[0] ?? null;
		const same = want
			? event.venueId === want.to && (event.privacy ?? null) === (want.data?.privacy ?? null)
			: event.venueId === null;
		if (same) return { ok: true, changed: false };
		try {
			await saveObject(
				db,
				{ id: event.id, type: EVENT_TYPE, version: event.version, edges: { [LUGAR_EDGE]: lugar } },
				{
					actor: by,
					now,
					also: (self) => [
						db
							.prepare(
								`UPDATE content_sources SET imported_version = ?3
								WHERE object_id = ?1 AND imported_version = ?2`
							)
							.bind(event.id, event.version, event.version + 1),
						revisionStatement(db, self, 'lugar')
					]
				}
			);
			return { ok: true, changed: true };
		} catch (e) {
			if (e instanceof VersionConflictError && attempt < VENUE_SAVE_TRIES) continue;
			if (e instanceof ObjectError) return { ok: false, message: e.message };
			throw e;
		}
	}
}

/** Lo que se contesta si el evento todavía no está en la base. */
export const NOT_IN_DB =
	'Ese evento todavía no está en la base: importalo (Contenido → En la base) y después elegile el lugar.';

/**
 * Vincula (o cambia) el lugar de un evento: el edge `lugar` del evento, con su nivel propio en
 * `data.privacy` (`null`: el del lugar).
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
	const r = await writeVenueEdge(
		db,
		eventSlug,
		[{ to: venueId, data: privacy ? { privacy } : null }],
		{ by, now }
	);
	return r.ok ? { ok: true } : r;
}

/**
 * Saca el lugar de un evento (vuelve a mostrar lo de su .md). `false` si no tenía (o el evento no
 * está en la base).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ by?: string, now?: number }} [opts]
 */
export async function removeEventVenue(db, eventSlug, { by = 'panel', now = Date.now() } = {}) {
	if (!isEventSlug(eventSlug)) return false;
	const r = await writeVenueEdge(db, eventSlug, [], { by, now });
	return r.ok && r.changed;
}

/**
 * Vincula un evento a un lugar solo si no tiene uno vigente (sin lugar, o con uno borrado): lo que
 * usa «Importar de eventos», que nunca pisa un vínculo. `false` si no lo vinculó (ya tenía lugar o
 * el evento no está en la base).
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, venueId: number, privacy: VenuePrivacy | null, by: string, now?: number }} input
 */
export async function linkEventVenueIfFree(
	db,
	{ eventSlug, venueId, privacy, by, now = Date.now() }
) {
	if (!isEventSlug(eventSlug)) return false;
	const event = await eventForVenue(db, eventSlug);
	if (!event) return false;
	if (event.venueId !== null) {
		const alive = await db
			.prepare('SELECT 1 AS ok FROM objects WHERE id = ?1 AND deleted_at IS NULL')
			.bind(event.venueId)
			.first();
		if (alive) return false;
	}
	const r = await setEventVenue(db, { eventSlug, venueId, privacy, by, now });
	return r.ok;
}
