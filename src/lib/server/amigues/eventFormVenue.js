/**
 * «Lugar» en el formulario de eventos (crear y editar; pedido de gorrite: elegir el lugar desde el
 * evento, no solo desde Eventos → Lugares). El vínculo es el edge `lugar` del evento en la base
 * (ver docs/amigues.md y ./venues.js), no un campo del evento: su texto no cambia por elegir un
 * lugar. El evento tiene que estar en la base.
 *
 * - {@link venuePickerData}: los lugares para el buscador y lo elegido ahora.
 * - {@link checkVenueChoice}: antes de guardar el evento (si el lugar no existe, no se guarda nada).
 * - {@link saveVenueChoice}: después de guardar el evento (al crear, recién con la dirección
 *   conocida; si crear falla, no se vincula nada).
 * - {@link linkEventVenue} y {@link unlinkEventVenue}: `setEventVenue`/`removeEventVenue` con el
 *   registro de actividad; los usan también Eventos → Lugares, así que se registra igual.
 * - {@link createVenueAction}: «+ Crear lugar» desde el formulario (nombre y dirección), con la
 *   misma validación que crear un perfil en el panel; no listado en Amigues salvo que se elija
 *   «Público» (decisión de gorrite, como al importar lugares desde los eventos).
 * - {@link editVenueAction}: edición rápida del lugar elegido (nombre, dirección, barrio y ciudad)
 *   sin salir del formulario, por el mismo camino que el editor de perfiles (decisión de gorrite).
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
import { venueListing } from '$lib/utils/venueImport.js';
import {
	createProfileFromPanel,
	profileFormValues,
	readProfileForm,
	saveProfileFromPanel
} from './editor.js';
import { OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import {
	eventVenue,
	eventVenueLink,
	listVenues,
	removeEventVenue,
	setEventVenue
} from './venues.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */
/** @typedef {import('$lib/utils/venueChoice.js').VenueOption} VenueOption */
/** @typedef {import('$lib/utils/venueChoice.js').VenueChoice} VenueChoice */
/** @typedef {import('$lib/utils/venues.js').VenuePrivacy} VenuePrivacy */

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Un perfil de lugar como opción del buscador del panel (solo admins: con la dirección, como la
 * ven en el editor del perfil; decisión de gorrite). Lo que ve el público no cambia: eso lo decide
 * el nivel de privacidad (src/lib/utils/venues.js).
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
		address: str(v.data.address),
		area: str(v.data.area),
		city: str(v.data.city),
		version: v.version
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
	const link = await eventVenueLink(db, eventSlug);
	return link ? venueChoice(link.venueId, link.privacy) : venueChoice(null, null);
}

/**
 * Para el formulario: los lugares, lo elegido para `eventSlug` (al crear: el evento que se
 * duplica, así la copia sale con el mismo lugar; sin evento, sin lugar). `null` sin base o si la
 * base falla: el formulario muestra solo el «Dónde» en texto libre, como antes.
 *
 * @param {D1Database | null | undefined} db
 * @param {string | null} eventSlug
 * @returns {Promise<{ venues: VenueOption[], current: VenueChoice } | null>}
 */
export async function venuePickerData(db, eventSlug) {
	if (!db) return null;
	try {
		const [venues, current] = await Promise.all([
			venueOptions(db),
			eventSlug ? eventVenueChoice(db, eventSlug) : venueChoice(null, null)
		]);
		return { venues, current };
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
 * @returns {Promise<{ title: string, slug: string, privacy: string } | null>}
 */
export async function panelVenueRow(db, eventSlug) {
	if (!db) return null;
	try {
		const link = await eventVenue(db, eventSlug);
		if (!link) return null;
		return {
			title: link.venue.title,
			slug: link.venue.slug,
			privacy: eventPrivacyText(link.override, link.venue.data.venue_privacy)
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
 * @param {string} [by] quién (el login de GitHub de le admin)
 */
export async function unlinkEventVenue(db, locals, eventSlug, by) {
	if (!(await removeEventVenue(db, eventSlug, { by }))) return false;
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
			return { ok: true, changed: await unlinkEventVenue(db, locals, eventSlug, by) };
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
 * aprobado con nombre y dirección, sin salir del formulario; el resto se completa en su página.
 * Devuelve la opción para elegirlo.
 *
 * Decisión de gorrite: nace **no listado** (`data.unlisted`, no aparece en /amigues) salvo que se
 * elija «Público» (`listado=listed`), como los lugares que se importan desde los eventos
 * (`venueListing`: ante la duda, no listado). No listado no es oculto: el evento lo sigue
 * mostrando según su nivel de privacidad.
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
	if (venueListing(undefined, sent.get('listado')) === 'unlisted') form.set('unlisted', 'on');
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

/** Los campos de la edición rápida, en el orden del formulario. */
const QUICK_FIELDS = /** @type {const} */ (['address', 'area', 'city']);

/**
 * Un perfil de lugar (no borrado) por id, o `null`.
 * @param {D1Database} db
 * @param {number} id
 */
async function venueById(db, id) {
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	const row = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1 AND type = ?2 AND deleted_at IS NULL`
		)
		.bind(id, PROFILE_TYPE)
		.first();
	if (!row) return null;
	const venue = rowToObject(row);
	return profileKindOf(venue.data) === 'lugar' ? venue : null;
}

/**
 * `?/editarLugar`: edición rápida del lugar elegido en el formulario del evento (nombre,
 * dirección, barrio y ciudad; decisión de gorrite), sin mandar el formulario del evento. Guarda
 * el perfil con `saveProfileFromPanel` (lo mismo que el editor de perfiles: saveObject, control de
 * versión) y lo registra como `profile.update`. El resto del perfil queda como estaba.
 *
 * @param {{ locals: App.Locals, url: URL, platform?: App.Platform, request: Request }} event
 */
export async function editVenueAction({ locals, url, platform, request }) {
	const admin = requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) return fail(503, { venueError: 'Sin base de datos.' });
	const sent = await request.formData();
	const venue = await venueById(db, Number(sent.get('lugar')));
	if (!venue) return fail(404, { venueError: 'Ese lugar ya no existe.' });
	const title = String(sent.get('title') ?? '').trim();
	if (!title) {
		return fail(400, {
			venueError: 'Escribí el nombre del lugar.',
			venueErrors: { title: 'Escribí el nombre del lugar.' }
		});
	}
	const values = profileFormValues(venue);
	values.title = title;
	values.version = Number(sent.get('version'));
	for (const key of QUICK_FIELDS) values.text[key] = String(sent.get(key) ?? '').trim();
	const result = await saveProfileFromPanel(db, venue, values, { actor: admin.login });
	if (!result.ok) {
		return fail(result.status, {
			venueError:
				result.status === 409
					? 'Alguien más cambió este lugar mientras tanto, así que no guardamos tus cambios. Abrí su página para ver cómo quedó.'
					: result.message,
			venueErrors: result.errors ?? {}
		});
	}
	await logAdminAction(db, locals, {
		action: 'profile.update',
		targetType: 'profile',
		targetId: result.profile.id,
		summary: `Editó el perfil «${result.profile.title}»`
	});
	const approved = await db
		.prepare('SELECT 1 AS ok FROM profile_approvals WHERE profile_id = ?1')
		.bind(result.profile.id)
		.first();
	return { venueUpdated: venueOption(result.profile, Boolean(approved)) };
}

/**
 * {@link editVenueAction} solo para los eventos (el editor de /edit es de todas las categorías).
 * @param {{ params: { category?: string }, locals: App.Locals, url: URL, platform?: App.Platform, request: Request }} event
 */
export async function editVenueForEventAction(event) {
	if (event.params.category !== 'calendario') error(404, 'Not found');
	return editVenueAction(event);
}
