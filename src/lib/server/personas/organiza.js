/**
 * Respuestas de inscripción para les organizadores (decisión de gorrite): además de les admins
 * (Órdenes y su CSV), las ve quien gestiona un perfil que figura con el rol «Organiza» en el
 * `personas:` de ese evento. Se ven en Mi rincón → el perfil → Respuestas de inscripción.
 *
 * Reglas (todas en el servidor, en {@link requireOrganizer}):
 * - sesión de cuenta (si no, a /ingresar) y permiso "puede tener perfiles": lo de siempre de Mi
 *   rincón (`requireMember`);
 * - la cuenta gestiona el perfil (`getManagedProfile`, dueñe o gestore);
 * - el evento está publicado y lista ese perfil con el rol «Organiza».
 * Si algo falla, 404 (no 403): así no se sabe si el evento tiene respuestas.
 *
 * Que el perfil esté oculto o sin aprobar NO importa acá: quien organiza sigue organizando, y la
 * página es privada (no muestra el perfil a nadie más). Lo que se esconde de esos perfiles es su
 * nombre en las páginas públicas (index.js).
 *
 * Lo que se ve: la pregunta, y por cada orden confirmada (`approved`) con respuestas, el nombre
 * de quien compró y sus respuestas. Nunca el mail, el teléfono ni el DNI. Cada vista y cada CSV
 * quedan en el registro de actividad, y el CSV tiene un límite por cuenta.
 */
import { error } from '@sveltejs/kit';
import { getManagedProfile } from '$lib/server/cuentas/perfiles.js';
import { requireMember } from '$lib/server/cuentas/perfilesWeb.js';
import { logSignupAnswersViewed } from '$lib/server/admin/accountEvents.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { logDBError } from '$lib/server/db';
import { sha256Hex } from '$lib/server/hash.js';
import { getEventMeta, isValidEventSlug, listEventMetas } from '$lib/server/tickets/events.js';
import { fieldsForEvent } from '$lib/server/tickets/signupFields.js';
import { PERSONAS_KEY, findRole, parsePersonas } from '$lib/utils/personas.js';
import { answerColumns, answerFor, parseStoredAnswers } from '$lib/utils/signupFields.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ slug: string, title: string, start: string | null }} OrganizedEvent */

/** El rol que da acceso a las respuestas (rol fijo, ver FIXED_ROLES). */
export const ORGANIZER_ROLE = 'Organiza';

/** CSV de respuestas por cuenta (tabla rate_limits). */
export const ORGANIZER_CSV_RATE_LIMIT = Object.freeze({ limit: 10, windowSeconds: 60 * 60 });

/**
 * ¿El frontmatter de este evento lista al perfil con el rol «Organiza»? (sin importar
 * mayúsculas, como el resto de los roles).
 *
 * @param {Record<string, any> | null | undefined} meta
 * @param {string} profileSlug
 */
export function organizesEvent(meta, profileSlug) {
	return parsePersonas(meta?.[PERSONAS_KEY]).some(
		(e) => e.perfil === profileSlug && findRole([ORGANIZER_ROLE], e.rol) !== null
	);
}

/** @param {unknown} v */
const dateText = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

/**
 * Los eventos publicados que organiza un perfil, del más nuevo al más viejo.
 *
 * @param {string} profileSlug
 * @returns {Promise<OrganizedEvent[]>}
 */
export async function organizedEvents(profileSlug) {
	const out = (await listEventMetas())
		.filter(({ meta }) => organizesEvent(meta, profileSlug))
		.map(({ slug, meta }) => ({
			slug,
			title: typeof meta.title === 'string' && meta.title ? meta.title : slug,
			start: dateText(meta.start)
		}));
	return out.sort((a, b) => String(b.start ?? '').localeCompare(String(a.start ?? '')));
}

/**
 * Para la página del perfil en Mi rincón: los eventos que organiza. Nunca rompe la página (si
 * algo falla, `[]` y la sección no aparece).
 *
 * @param {App.Platform | undefined} _platform ya no se usa (era para el interruptor)
 * @param {string} profileSlug
 * @returns {Promise<OrganizedEvent[]>}
 */
export async function organizedEventsForPage(_platform, profileSlug) {
	try {
		return await organizedEvents(profileSlug);
	} catch (e) {
		logDBError('eventos que organiza el perfil', e);
		return [];
	}
}

/**
 * La entrada de la página y del CSV: todo lo de arriba, o 404 / redirect a /ingresar. Usa
 * `params.slug` (el perfil) y `params.event` (el evento).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function requireOrganizer(event) {
	const { db, member } = await requireMember(event);
	const eventSlug = event.params.event ?? '';
	const found = await getManagedProfile(db, member.id, event.params.slug ?? '');
	if (!found || !isValidEventSlug(eventSlug)) error(404, 'Not found');
	const meta = await getEventMeta(eventSlug);
	if (!meta || !organizesEvent(meta, found.profile.slug)) error(404, 'Not found');
	return {
		db,
		member,
		profile: found.profile,
		event: {
			slug: eventSlug,
			title: typeof meta.title === 'string' && meta.title ? meta.title : eventSlug,
			start: dateText(meta.start)
		}
	};
}

/**
 * Las respuestas que ve quien organiza: una columna por pregunta (las de hoy y las que solo
 * tienen respuestas viejas) y una fila por orden confirmada con respuestas, con el nombre de
 * quien compró. Sin mail, teléfono ni DNI.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ columns: { id: number, label: string }[], rows: { name: string, values: string[] }[] }>}
 */
export async function organizerAnswers(db, eventSlug) {
	const [{ results }, fields] = await Promise.all([
		db
			.prepare(
				`SELECT o.buyer_name, a.answers FROM order_answers a JOIN orders o ON o.id = a.order_id
				WHERE o.event_slug = ?1 AND o.status = 'approved'
				ORDER BY o.buyer_name COLLATE NOCASE, o.created_at`
			)
			.bind(eventSlug)
			.all(),
		fieldsForEvent(db, eventSlug)
	]);
	const lists = results.map((r) => ({
		name: String(r.buyer_name ?? ''),
		answers: parseStoredAnswers(r.answers)
	}));
	const columns = answerColumns(
		lists.map((l) => l.answers),
		fields
	);
	return {
		columns,
		rows: lists.map((l) => ({
			name: l.name,
			values: columns.map((c) => answerFor(l.answers, c.id))
		}))
	};
}

/**
 * ¿Puede bajar otro CSV esta cuenta? (el bucket va con hash, sin el id a la vista).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} [now]
 */
export async function organizerCsvAllowed(db, accountId, now = Date.now()) {
	const key = await sha256Hex(`personas:account:${accountId}`);
	const r = await hitRateLimit(
		db,
		`personas:respuestas-csv:a:${key}`,
		ORGANIZER_CSV_RATE_LIMIT,
		now
	);
	return r;
}

/**
 * Deja la vista (o el CSV) en el registro de actividad. Nunca tira.
 *
 * @param {D1Database} db
 * @param {Awaited<ReturnType<typeof requireOrganizer>>} access
 * @param {{ csv: boolean, now?: number }} opts
 */
export function logOrganizerAccess(db, access, { csv, now = Date.now() }) {
	return logSignupAnswersViewed(
		db,
		{
			accountId: access.member.id,
			profile: { id: access.profile.id, title: access.profile.title },
			eventSlug: access.event.slug,
			eventTitle: access.event.title,
			csv
		},
		{ now }
	);
}
