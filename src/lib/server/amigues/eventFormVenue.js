/**
 * «Lugar» en el formulario de eventos (crear y editar; pedido de gorrite: elegir el lugar desde el
 * evento, no solo desde Eventos → Lugares). El vínculo vive en `event_venues` (ver
 * docs/amigues.md), se guarde el evento en GitHub o en la base (`contenido_db`): el .md no cambia
 * por elegir un lugar.
 *
 * - {@link venuePickerData}: los lugares para el buscador y lo elegido ahora.
 * - {@link checkVenueChoice}: antes de guardar el evento (si el lugar no existe, no se guarda nada).
 * - {@link saveVenueChoice}: después de guardar el evento (al crear, recién con la dirección
 *   conocida; si crear falla, no se vincula nada).
 * - {@link linkEventVenue} y {@link unlinkEventVenue}: `setEventVenue`/`removeEventVenue` con el
 *   registro de actividad; los usan también Eventos → Lugares, así que se registra igual.
 * - {@link createVenueAction}: «+ Crear lugar» desde el formulario (nombre y dirección), con la
 *   misma validación que crear un perfil en el panel.
 *
 * Solo admins (las acciones que llaman a esto ya lo revisaron, salvo createVenueAction, que lo
 * revisa sola).
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { eventPrivacyText, isVenuePrivacy, VENUE_PRIVACY_LABELS } from '$lib/utils/venues.js';
import { venueChoice } from '$lib/utils/venueChoice.js';
import { createProfileFromPanel, readProfileForm } from './editor.js';
import { isFlagOn } from '$lib/server/flags.js';
import { eventVenue, listVenues, removeEventVenue, setEventVenue } from './venues.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/utils/venueChoice.js').VenueOption} VenueOption */
/** @typedef {import('$lib/utils/venueChoice.js').VenueChoice} VenueChoice */
/** @typedef {import('$lib/utils/venues.js').VenuePrivacy} VenuePrivacy */

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Un perfil de lugar como opción del buscador (sin la dirección: solo barrio y ciudad).
 * @param {StoredObject} v
 * @param {boolean} approved
 * @returns {VenueOption}
 */
export function venueOption(v, approved) {
	return {
		id: v.id,
		slug: v.slug,
		title: v.title,
		visibility: v.visibility,
		unlisted: v.data.unlisted === true,
		approved,
		privacy: isVenuePrivacy(v.data.venue_privacy) ? v.data.venue_privacy : null,
		area: str(v.data.area),
		city: str(v.data.city)
	};
}

/**
 * Todos los lugares (también ocultos, no listados y sin aprobar, marcados), para el buscador.
 * @param {D1Database} db
 * @returns {Promise<VenueOption[]>}
 */
export async function venueOptions(db) {
	const [venues, approvals] = await Promise.all([
		listVenues(db),
		db.prepare('SELECT profile_id FROM profile_approvals').all()
	]);
	const approved = new Set(approvals.results.map((r) => Number(r.profile_id)));
	return venues.map((v) => venueOption(v, approved.has(v.id)));
}

/**
 * Lo elegido ahora para un evento (también si el lugar se borró: el formulario lo avisa).
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<VenueChoice>}
 */
export async function eventVenueChoice(db, eventSlug) {
	const row = await db
		.prepare('SELECT venue_id, privacy FROM event_venues WHERE event_slug = ?1')
		.bind(eventSlug)
		.first();
	return row ? venueChoice(Number(row.venue_id), row.privacy) : venueChoice(null, null);
}

/**
 * Para el formulario: los lugares, lo elegido para `eventSlug` (al crear: el evento que se
 * duplica, así la copia sale con el mismo lugar; sin evento, sin lugar) y si el sitio ya usa los
 * lugares (interruptor `perfiles_publicos`; apagado, el vínculo se guarda igual, como en Eventos
 * → Lugares). `null` sin base o si la base falla: el formulario muestra solo el «Dónde» en texto
 * libre, como antes.
 *
 * @param {D1Database | null | undefined} db
 * @param {string | null} eventSlug
 * @returns {Promise<{ venues: VenueOption[], current: VenueChoice, flagOn: boolean } | null>}
 */
export async function venuePickerData(db, eventSlug) {
	if (!db) return null;
	try {
		const [venues, current, flagOn] = await Promise.all([
			venueOptions(db),
			eventSlug ? eventVenueChoice(db, eventSlug) : venueChoice(null, null),
			isFlagOn(db, 'perfiles_publicos')
		]);
		return { venues, current, flagOn };
	} catch (e) {
		console.error('[lugares] no se pudieron leer los lugares para el formulario', e);
		return null;
	}
}

/**
 * La fila «Lugar» de la ficha del evento en el panel: el lugar vinculado y qué se muestra de su
 * dirección, o `null` si no tiene (o la base no responde: la ficha muestra lo del .md).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} eventSlug
 * @returns {Promise<{ title: string, slug: string, privacy: string, flagOn: boolean } | null>}
 */
export async function panelVenueRow(db, eventSlug) {
	if (!db) return null;
	try {
		const link = await eventVenue(db, eventSlug);
		if (!link) return null;
		return {
			title: link.venue.title,
			slug: link.venue.slug,
			privacy: eventPrivacyText(link.override, link.venue.data.venue_privacy),
			flagOn: await isFlagOn(db, 'perfiles_publicos')
		};
	} catch (e) {
		console.error('[lugares] no se pudo leer el lugar del evento para la ficha', e);
		return null;
	}
}

/**
 * Antes de guardar el evento: ¿se puede guardar lo elegido? (Sin lugar, siempre.)
 * @param {D1Database | null | undefined} db
 * @param {VenueChoice | null} choice `null`: no se tocó
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function checkVenueChoice(db, choice) {
	if (!choice || choice.venueId === null) return { ok: true };
	if (!db) return { ok: false, message: 'Lugar: no hay base de datos disponible.' };
	const row = await db
		.prepare(
			`SELECT id FROM objects WHERE id = ?1 AND type = ?2 AND deleted_at IS NULL
			AND json_extract(data, '$.kind') = 'lugar'`
		)
		.bind(choice.venueId, PROFILE_TYPE)
		.first();
	return row ? { ok: true } : { ok: false, message: 'Lugar: ese lugar ya no existe.' };
}

/**
 * Vincula (o cambia) el lugar de un evento y lo registra.
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ eventSlug: string, venueId: number, privacy: VenuePrivacy | null, by: string }} input
 */
export async function linkEventVenue(db, locals, { eventSlug, venueId, privacy, by }) {
	const r = await setEventVenue(db, { eventSlug, venueId, privacy, by });
	if (!r.ok) return r;
	await logAdminAction(db, locals, {
		action: 'event.venue_set',
		targetType: 'event',
		targetId: eventSlug,
		summary: `Puso el lugar del evento ${eventSlug}${privacy ? ` (se muestra: ${VENUE_PRIVACY_LABELS[privacy]})` : ''}`,
		detail: { venueId, privacy }
	});
	return r;
}

/**
 * Saca el lugar de un evento y lo registra. `false` si no tenía.
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {string} eventSlug
 */
export async function unlinkEventVenue(db, locals, eventSlug) {
	if (!(await removeEventVenue(db, eventSlug))) return false;
	await logAdminAction(db, locals, {
		action: 'event.venue_remove',
		targetType: 'event',
		targetId: eventSlug,
		summary: `Sacó el lugar del evento ${eventSlug}`
	});
	return true;
}

/**
 * Después de guardar el evento: guarda lo elegido en el «Lugar» (`null`: no se tocó, no hace
 * nada). Sacar el lugar de un evento que no tenía no es un error.
 *
 * @param {D1Database | null | undefined} db
 * @param {App.Locals} locals
 * @param {{ eventSlug: string, choice: VenueChoice | null, by: string }} input
 * @returns {Promise<{ ok: true, changed: boolean } | { ok: false, message: string }>}
 */
export async function saveVenueChoice(db, locals, { eventSlug, choice, by }) {
	if (!choice) return { ok: true, changed: false };
	if (!db) return { ok: false, message: 'No hay base de datos disponible.' };
	try {
		if (choice.venueId === null) {
			return { ok: true, changed: await unlinkEventVenue(db, locals, eventSlug) };
		}
		const r = await linkEventVenue(db, locals, {
			eventSlug,
			venueId: choice.venueId,
			privacy: choice.privacy,
			by
		});
		return r.ok ? { ok: true, changed: true } : r;
	} catch (e) {
		console.error('[lugares] no se pudo guardar el lugar del evento', e);
		return { ok: false, message: 'No se pudo escribir en la base de datos.' };
	}
}

/** El aviso cuando el evento se guardó pero el lugar no. @param {string} message */
export const venueNotSavedWarning = (message) =>
	`El evento se guardó, pero el lugar no: ${message} Probá de nuevo desde el formulario o desde Eventos → Lugares.`;

/**
 * `?/crearLugar`: «+ Crear lugar» desde el formulario del evento. Crea un perfil de lugar
 * aprobado (como «Lugar nuevo» en Eventos → Lugares) con nombre y dirección, sin salir del
 * formulario; el resto se completa en su página. Devuelve la opción para elegirlo.
 *
 * @param {{ locals: App.Locals, url: URL, platform?: App.Platform, request: Request }} event
 */
export async function createVenueAction({ locals, url, platform, request }) {
	const admin = requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) return fail(503, { venueError: 'Sin base de datos.' });
	const sent = await request.formData();
	const title = String(sent.get('title') ?? '').trim();
	if (!title) return fail(400, { venueError: 'Escribí el nombre del lugar.' });
	// Solo nombre y dirección: el resto, con los mismos valores que «Lugar nuevo».
	const form = new FormData();
	form.set('kind', 'lugar');
	form.set('visibility', 'public');
	form.set('version', '0');
	form.set('title', title);
	form.set('address', String(sent.get('address') ?? ''));
	const values = readProfileForm(form);
	const result = await createProfileFromPanel(db, values, { actor: admin.login });
	if (!result.ok) return fail(result.status, { venueError: result.message });
	await logAdminAction(db, locals, {
		action: 'profile.create',
		targetType: 'profile',
		targetId: result.profile.id,
		summary: `Creó el perfil «${result.profile.title}» (lugar)`
	});
	return { venueCreated: venueOption(result.profile, true) };
}

/**
 * {@link createVenueAction} solo para los eventos (el editor de /edit es de todas las categorías).
 * @param {{ params: { category?: string }, locals: App.Locals, url: URL, platform?: App.Platform, request: Request }} event
 */
export async function createVenueForEventAction(event) {
	if (event.params.category !== 'calendario') error(404, 'Not found');
	return createVenueAction(event);
}
