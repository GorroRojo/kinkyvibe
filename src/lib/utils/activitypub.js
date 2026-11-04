/**
 * Prototipo de ActivityPub (interruptor `fediverso`, apagado): lo mínimo para que un servidor del
 * fediverso **descubra** la agenda (docs/investigaciones/indieweb-activitypub.md). Solo lectura:
 * una cuenta `agenda@kinkyvibe.ar` (WebFinger + actor) y su outbox con los próximos eventos
 * públicos como objetos `Event` (FEP-8a8e). Sin claves, sin firmas, sin entregas, sin seguidores.
 *
 * Funciones puras (sin SvelteKit ni base): reciben las publicaciones que ya listan las páginas y el
 * lugar de cada evento como lo ve cualquiera (`feedVenues`), y la dirección pasa SOLO por
 * `feedLocation`, igual que en los .ics: nada que la página del evento no le muestre a cualquiera.
 */
import { eventEnd, parseSiteDate } from './dates.js';
import { escapeHtml } from './escape.js';
import { eventLead } from './eventText.js';
import { isOnlineEvent, ONLINE_PLACE_TEXT } from './eventPlace.js';
import { feedLocation } from './icsFeed.js';
import { SITE_NAME, SITE_URL, absoluteUrl } from './jsonLd.js';
import { SITE_TAGLINE } from './previewTexts.js';

/** El usuario de la cuenta de la agenda: `agenda@kinkyvibe.ar`. */
export const AP_USERNAME = 'agenda';
/** El dominio de la cuenta (el de producción, también en previews y en local). */
export const AP_DOMAIN = new URL(SITE_URL).host;
/** `acct:agenda@kinkyvibe.ar`, lo que pide WebFinger. */
export const AP_ACCT = `acct:${AP_USERNAME}@${AP_DOMAIN}`;
/** La dirección (id) del actor. */
export const AP_ACTOR_ID = `${SITE_URL}/ap/${AP_USERNAME}`;
export const AP_OUTBOX_ID = `${AP_ACTOR_ID}/outbox`;
export const AP_INBOX_ID = `${AP_ACTOR_ID}/inbox`;

/** El tipo de contenido de ActivityPub. */
export const AP_CONTENT_TYPE = 'application/activity+json; charset=utf-8';
const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
const TIMEZONE = 'America/Argentina/Buenos_Aires';
/** Cuántos eventos lleva el outbox (los próximos; en una sola página). */
export const AP_OUTBOX_LIMIT = 50;
/**
 * Sin hora de fin válida, `endTime` es esto después del comienzo, con `displayEndTime: false`
 * (FEP-8a8e pide un fin para las máquinas aunque no se muestre).
 */
const OPEN_END_MS = 4 * 60 * 60 * 1000;

const CONTEXT = Object.freeze([
	'https://www.w3.org/ns/activitystreams',
	'https://w3id.org/fep/8a8e',
	{
		schema: 'https://schema.org/',
		VirtualLocation: 'schema:VirtualLocation',
		address: 'schema:address'
	}
]);

/**
 * Una fecha en UTC sin milésimas (`2026-09-11T22:30:00Z`): RFC 3339 las permite, pero hay lectores
 * (el validador de FEP-8a8e, entre otros) que no.
 * @param {Date} d
 */
const apDate = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** La dirección del objeto `Event` de un evento. @param {unknown} slug */
export const apEventId = (slug) => `${SITE_URL}/ap/eventos/${encodeURIComponent(String(slug))}`;

/** Estado del evento → `eventStatus` de FEP-8a8e. */
const STATUS = /** @type {Record<string, string>} */ ({
	abierto: 'EventScheduled',
	agotadas: 'EventScheduled',
	anunciado: 'EventTentative',
	cancelado: 'EventCancelled'
});

/**
 * La respuesta de WebFinger (RFC 7033) para la agenda, o `null` si `resource` no es ella (quien
 * llama sigue con lo de siempre: el puente de Bridgy Fed para el resto del dominio).
 * @param {string | null} resource
 */
export function webfingerFor(resource) {
	const r = (resource ?? '').trim();
	if (r.toLowerCase() !== AP_ACCT && r !== AP_ACTOR_ID) return null;
	return {
		subject: AP_ACCT,
		aliases: [AP_ACTOR_ID],
		links: [
			{ rel: 'self', type: 'application/activity+json', href: AP_ACTOR_ID },
			{
				rel: 'http://webfinger.net/rel/profile-page',
				type: 'text/html',
				href: `${SITE_URL}/calendario`
			}
		]
	};
}

/** El actor de la agenda. Sin `publicKey`: el prototipo no firma ni recibe nada. */
export function actorDocument() {
	return {
		'@context': [
			'https://www.w3.org/ns/activitystreams',
			'https://purl.archive.org/socialweb/webfinger',
			{ manuallyApprovesFollowers: 'as:manuallyApprovesFollowers' }
		],
		id: AP_ACTOR_ID,
		type: 'Application',
		preferredUsername: AP_USERNAME,
		// FEP-2c59 (Mastodon 4.6): la dirección para mencionarla, sin depender de preferredUsername.
		webfinger: `${AP_USERNAME}@${AP_DOMAIN}`,
		name: `Agenda de ${SITE_NAME}`,
		summary: `<p>${escapeHtml(SITE_TAGLINE)}</p><p>Los próximos eventos públicos del calendario de ${escapeHtml(SITE_NAME)}.</p>`,
		url: `${SITE_URL}/calendario`,
		icon: { type: 'Image', mediaType: 'image/png', url: `${SITE_URL}/android-chrome-512x512.png` },
		inbox: AP_INBOX_ID,
		outbox: AP_OUTBOX_ID,
		// Nadie la puede seguir de verdad todavía (el inbox no procesa nada): que se vea así.
		manuallyApprovesFollowers: true
	};
}

/**
 * ¿Va en el outbox? Un evento listado, sin redirección, con fecha válida, no cancelado y que
 * todavía no terminó.
 * @param {Pick<ProcessedPost, 'meta'>} post
 * @param {number} now
 */
export function isOutboxEvent(post, now) {
	const meta = post.meta;
	if (meta?.category !== 'calendario' || meta.redirect || meta.status === 'cancelado') return false;
	const start = parseSiteDate(meta.start);
	if (isNaN(start.getTime())) return false;
	return eventEnd(meta.start, meta.end).getTime() >= now;
}

/**
 * Dónde, como `location` de AS2/FEP-8a8e, o `undefined`. La dirección sale solo de `feedLocation`
 * (lo mismo que el .ics). Online: un `VirtualLocation` sin link (el link es solo para quien tiene
 * entrada).
 * @param {Record<string, any>} meta
 * @param {import('./venues.js').VenueView | undefined} venue
 */
function eventLocation(meta, venue) {
	if (!venue && isOnlineEvent(meta, { hasVenue: false }))
		return { type: 'VirtualLocation', name: ONLINE_PLACE_TEXT };
	const text = feedLocation(meta, venue);
	return text ? { type: 'Place', name: text, address: text } : undefined;
}

/**
 * Un evento como objeto `Event` de ActivityStreams con lo que piden FEP-8a8e y Mastodon (que lo
 * muestra como un post: `content` o `name`, y agrega `url`; `summary` sería el aviso de contenido,
 * por eso no va).
 * @param {Pick<ProcessedPost, 'meta' | 'path'>} post
 * @param {import('./venues.js').VenueView | undefined} [venue] como en `feedVenues`
 */
export function eventObject(post, venue) {
	return { '@context': CONTEXT, ...eventBody(post, venue) };
}

/**
 * {@link eventObject} sin `@context` (adentro del outbox va el de la colección).
 * @param {Pick<ProcessedPost, 'meta' | 'path'>} post
 * @param {import('./venues.js').VenueView | undefined} [venue]
 */
function eventBody(post, venue) {
	const meta = /** @type {Record<string, any>} */ (post.meta);
	const start = parseSiteDate(meta.start);
	let end = eventEnd(meta.start, meta.end);
	const openEnd = !(end.getTime() > start.getTime());
	if (openEnd) end = new Date(start.getTime() + OPEN_END_MS);
	const url = absoluteUrl(post.path) ?? SITE_URL;
	const summary = typeof meta.summary === 'string' ? meta.summary.trim() : '';
	const image = absoluteUrl(meta.featured);
	const location = eventLocation(meta, venue);
	const published = parseSiteDate(meta.published_date);
	return {
		id: apEventId(meta.postID),
		type: 'Event',
		url,
		name: String(meta.title ?? ''),
		// Mastodon no muestra startTime: la fecha va en el texto, como en los feeds (`feedEntry`).
		content: `<p>${escapeHtml(eventLead(meta, { capitalized: true }))}</p>${summary ? `<p>${escapeHtml(summary)}</p>` : ''}`,
		startTime: apDate(start),
		endTime: apDate(end),
		displayEndTime: !openEnd,
		timezone: TIMEZONE,
		eventStatus: STATUS[meta.status] ?? 'EventScheduled',
		...(location ? { location } : {}),
		...(image
			? {
					icon: { type: 'Image', url: image },
					attachment: [{ type: 'Image', url: image, isBannerImage: true }]
				}
			: {}),
		published: isNaN(published.getTime()) ? undefined : apDate(published),
		attributedTo: AP_ACTOR_ID,
		// Sin quién organiza a propósito: nada de cuentas ni nombres de personas en el fediverso
		// hasta decidirlo (ver la investigación). `null` = «no lo decimos» (FEP-8a8e).
		organizers: null,
		to: [PUBLIC],
		// Nadie se anota por acá: la entrada o la inscripción son en el sitio.
		joinMode: 'external',
		externalParticipationUrl: url
	};
}

/**
 * El outbox: una `OrderedCollection` de una sola página con un `Create` por cada próximo evento
 * público, el que empieza antes primero.
 * @param {readonly Pick<ProcessedPost, 'meta' | 'path'>[]} posts los que listan las páginas
 * @param {ReadonlyMap<string, import('./venues.js').VenueView>} venues `feedVenues`
 * @param {number} [now]
 */
export function outboxCollection(posts, venues, now = Date.now()) {
	const items = posts
		.filter((p) => isOutboxEvent(p, now))
		.sort((a, b) => parseSiteDate(a.meta.start).getTime() - parseSiteDate(b.meta.start).getTime())
		.slice(0, AP_OUTBOX_LIMIT)
		.map((p) => {
			const object = eventBody(p, venues.get(String(p.meta.postID)));
			return {
				id: `${object.id}#create`,
				type: 'Create',
				actor: AP_ACTOR_ID,
				published: object.published,
				to: [PUBLIC],
				object
			};
		});
	return {
		'@context': CONTEXT,
		id: AP_OUTBOX_ID,
		type: 'OrderedCollection',
		totalItems: items.length,
		orderedItems: items
	};
}

/**
 * Una respuesta JSON de ActivityPub (o de WebFinger con `type`). Los `undefined` no salen.
 * @param {unknown} body
 * @param {{ type?: string, status?: number }} [opts]
 */
export function apJson(body, { type = AP_CONTENT_TYPE, status = 200 } = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': type,
			'access-control-allow-origin': '*',
			'cache-control': 'public, max-age=300, s-maxage=300'
		}
	});
}
