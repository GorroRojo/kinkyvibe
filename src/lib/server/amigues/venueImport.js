/**
 * Lugares → «Importar de eventos»: lee el «Dónde» de todos los eventos (de la base, con los
 * mismos lectores que el sitio, `sitePosts`), arma los candidatos a
 * lugar (reglas puras en src/lib/utils/venueImport.js) y crea los elegidos.
 *
 * Escribe solo con los caminos de siempre:
 * - el lugar nuevo, con saveObject() (perfil de tipo lugar, visible y aprobado como los que crea
 *   une admin), y en la MISMA tanda su aprobación; después, los vínculos de sus eventos. Nace **no
 *   listado** (`data.unlisted`: no aparece en /amigues) salvo que le admin elija «Públicos»
 *   (decisión de gorrite); eso no cambia lo que muestran sus eventos, que sigue su nivel de
 *   privacidad;
 * - «sucede en» es el edge `lugar` del evento en la base (docs/amigues.md), escrito con
 *   saveObject() sobre cada evento (`linkEventVenueIfFree`): vincular un evento NO toca su .md ni
 *   sus datos, así que no hace falta commit ni PR. Un evento que todavía no está en la base no se
 *   vincula (no figura en `links`);
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
import {
	importLinks,
	newVenueFor,
	planVenueImport,
	refitEvents,
	venueListing
} from '$lib/utils/venueImport.js';
import { approveNewStatement } from './approvals.js';
import { isEventSlug, linkEventVenueIfFree, listEventVenues, listVenues } from './venues.js';

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
 * Lo que eligió le admin en la vista previa. `listing` solo cuenta para un lugar nuevo; sin él,
 * el lugar nace no listado.
 * @typedef {{ key: string, title: string, location: string, events: string[], listing?: import('$lib/utils/venueImport.js').VenueListing }} VenueChoice
 */

/**
 * Lee el formulario de la vista previa: `crear` (las claves elegidas, en orden), `listado` (cómo
 * se crean: `unlisted` o `listed`) y, por cada clave, `titulo:<clave>`, `donde:<clave>`,
 * `evento:<clave>` (los eventos marcados) y `listado:<clave>` (vacío = como todos).
 * @param {FormData} form
 * @returns {VenueChoice[]}
 */
export function readVenueChoices(form) {
	const all = form.get('listado');
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
			events: form.getAll(`evento:${key}`).map(String),
			listing: venueListing(all, form.get(`listado:${key}`))
		});
	}
	return out;
}

/**
 * Vincula los eventos a un lugar, uno por uno (cada uno es un guardado del evento). Nunca pisa un
 * vínculo vigente: solo uno a un lugar borrado. Devuelve los que vinculó.
 *
 * @param {D1Database} db
 * @param {{ slug: string, privacy: VenuePrivacy | null }[]} links
 * @param {number} venueId
 * @param {string} by
 * @param {number} now
 */
async function linkEvents(db, links, venueId, by, now) {
	/** @type {{ slug: string, privacy: VenuePrivacy | null }[]} */
	const done = [];
	for (const l of links) {
		const ok = await linkEventVenueIfFree(db, {
			eventSlug: l.slug,
			venueId,
			privacy: l.privacy,
			by,
			now
		});
		if (ok) done.push(l);
	}
	return done;
}

/**
 * @typedef {{
 *   key: string,
 *   action: 'created' | 'linked' | 'error',
 *   venueId?: number,
 *   title: string,
 *   slug?: string,
 *   venuePrivacy?: VenuePrivacy,
 *   listing?: import('$lib/utils/venueImport.js').VenueListing,
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
		// Cada evento: leerlo, el lugar y su guardado (saveObject: ~6 sentencias).
		const cost = (c.existing ? 1 : 5) + 8 * choice.events.length;
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
	// No listado salvo que se elija «Público» (venueListing: ante la duda, no listado).
	const listing = venueListing(undefined, choice.listing);
	/** @type {Record<string, unknown>} */
	const data = { ...venue.data, venue_privacy: venuePrivacy };
	if (listing === 'unlisted') data.unlisted = true;
	const base = slugify(venue.title) || 'lugar';
	for (const slug of [base, `${base.slice(0, 80)}-${now.toString(36).slice(-5)}`]) {
		try {
			const saved = await saveObject(
				db,
				{ type: PROFILE_TYPE, title: venue.title, slug, data, visibility: 'public' },
				{
					actor,
					now,
					also: (self) => [approveNewStatement(db, self, actor, now)]
				}
			);
			return {
				key: c.key,
				action: 'created',
				venueId: saved.id,
				title: saved.title,
				slug: saved.slug,
				venuePrivacy,
				listing,
				links: await linkEvents(db, links, saved.id, actor, now)
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
	const done = await linkEvents(db, links, existing.id, actor, now);
	return { key: c.key, action: 'linked', venueId: existing.id, title: existing.title, links: done };
}
