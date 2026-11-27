/**
 * Organizadores en el panel (interruptor `rol_organizadore`, apagado por defecto; docs/cuentas.md,
 * «Organizadores en el panel»; plan `rol-organizadore`).
 *
 * Sin migración: «organiza este evento» sale de lo que ya existe, la misma regla que las
 * respuestas de inscripción (decisión 0024, `personas/organiza.js`): la cuenta tiene el permiso
 * «puede tener perfiles» y gestiona (dueñe o gestore, `profile_managers`) un perfil que el evento
 * **publicado** lista con el rol «Organiza». Otros roles (Facilita, Enseña…) no cuentan.
 *
 * Cómo se controla (todo en el servidor, en cada pedido):
 * 1. `hooks.server.js` llama a {@link organizerAccess} antes de cada pedido al panel (todo lo de
 *    `(authed)`, también las acciones y los `+server.js`). Une admin pasa como siempre. Una cuenta
 *    que organiza algo, con el interruptor prendido: solo las rutas de {@link ORGANIZER_ROUTES}, con
 *    sus métodos y acciones, y solo con un evento suyo ({@link canManageEvent}); todo lo demás, 404.
 *    Si pasa, el pedido corre con `locals.organizer` y como autor `cuenta:<id>` sin superadmin (el
 *    texto que guarda se muestra con el HTML acotado, decisión 0004).
 * 2. Las rutas permitidas cambian `requireAdmin` por {@link requireAdminOrOrganizer}, que vuelve a
 *    mirar que el evento del pedido sea el de `locals.organizer`. Las demás siguen con
 *    `requireAdmin`: aunque la lista de arriba tuviera un error, una cuenta sin GitHub no entra.
 *
 * Una cuenta que no organiza nada (o con el interruptor apagado) ve el panel como hoy: sin sesión
 * de admin, a /login.
 */
import { error } from '@sveltejs/kit';
import { isAdmin, requireAdmin } from '$lib/server/auth';
import { accountActor, listMyProfiles, memberViewer } from '$lib/server/cuentas/perfiles.js';
import { getDB, logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { organizedEvents, organizesEvent } from '$lib/server/personas/organiza.js';
import { getEventMeta, isValidEventSlug } from '$lib/server/tickets/events.js';
import { logAdminAction } from './audit.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ id: number, slug: string, title: string }} OrganizerProfile */
/** @typedef {{ slug: string, title: string, start: string | null, profiles: string[] }} OrganizedEvent */
/**
 * Lo que queda en `locals.organizer` en un pedido permitido.
 * @typedef {{ accountId: string, login: string, name: string, events: OrganizedEvent[],
 *   event: OrganizedEvent | null }} OrganizerContext
 */

const EVENT = '/(authed)/admin/eventos/[slug]';

/**
 * Lo único del panel que ve quien organiza: ruta (`route.id`) → si se puede abrir (GET) y qué
 * acciones (POST `?/<nombre>`) puede mandar. Ningún otro método. Todo lo que no está acá, 404.
 *
 * - Fuera a propósito: mails a compradores (Mails, el link de la transmisión, el aviso de cambio
 *   de fecha), plata (reembolsar, confirmar o cancelar pagos, cargar entradas, vender en la puerta,
 *   crear o pausar códigos), el CSV de órdenes, la lista de espera, Preguntas, Gastos y reparto,
 *   los links de puerta, Partes y crear o editar lugares (son de todo el sitio).
 *
 * @type {Readonly<Record<string, { get: boolean, actions: readonly string[] }>>}
 */
export const ORGANIZER_ROUTES = Object.freeze({
	// El inicio del panel lleva a «Tus eventos».
	'/(authed)/admin': { get: true, actions: [] },
	'/(authed)/admin/organizo': { get: true, actions: [] },
	[EVENT]: { get: true, actions: [] },
	[`${EVENT}/editar`]: { get: true, actions: ['save'] },
	[`${EVENT}/ventas`]: { get: true, actions: [] },
	[`${EVENT}/ordenes`]: { get: true, actions: [] },
	[`${EVENT}/transferencias`]: { get: true, actions: [] },
	[`${EVENT}/codigos`]: { get: true, actions: [] },
	[`${EVENT}/ingreso`]: { get: true, actions: ['checkin', 'undo', 'sync', 'entregar'] },
	[`${EVENT}/ingreso/buscar`]: { get: true, actions: [] },
	[`${EVENT}/ingreso/lista`]: { get: true, actions: [] },
	[`${EVENT}/ingreso/compra`]: { get: true, actions: [] }
});

/**
 * El nombre de la acción de un POST, como lo lee SvelteKit: la primera clave de la query que
 * empieza con `/` (`?/save` → `save`); sin ninguna, `default`.
 *
 * @param {URL} url
 */
export function actionName(url) {
	for (const key of url.searchParams.keys()) {
		if (key.startsWith('/')) return key.slice(1);
	}
	return 'default';
}

/**
 * ¿Puede quien organiza hacer este pedido? (puro: ruta, método y acción; el evento se mira
 * aparte).
 *
 * @param {{ routeId: string | null | undefined, method: string, url: URL }} req
 */
export function organizerRequestAllowed({ routeId, method, url }) {
	const route = routeId ? ORGANIZER_ROUTES[routeId] : undefined;
	if (!route) return false;
	const m = method.toUpperCase();
	if (m === 'GET' || m === 'HEAD') return route.get;
	if (m === 'POST') return route.actions.includes(actionName(url));
	return false;
}

/**
 * Los perfiles de la cuenta que organizan este evento (puro): los gestionados que el evento lista
 * con el rol «Organiza». Vacío = no lo organiza.
 *
 * @param {Record<string, any> | null | undefined} meta
 * @param {OrganizerProfile[]} managed
 * @returns {OrganizerProfile[]}
 */
export function organizerProfilesOf(meta, managed) {
	if (!meta) return [];
	return managed.filter((p) => organizesEvent(meta, p.slug));
}

/** @param {unknown} v */
const dateText = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

/**
 * ¿Puede esta cuenta gestionar este evento como organizadore? La regla de acceso, en un solo
 * lugar. `null` si no (sin cuenta, sin el permiso de perfiles, evento inexistente o no publicado,
 * o ninguno de sus perfiles tiene «Organiza» en él); si sí, el evento y los perfiles.
 *
 * @param {D1Database} db
 * @param {{ id: string } | null | undefined} account la cuenta de la sesión (`locals.member`)
 * @param {string} eventSlug
 * @returns {Promise<OrganizedEvent | null>}
 */
export async function canManageEvent(db, account, eventSlug) {
	if (!account?.id || !isValidEventSlug(eventSlug)) return null;
	// listMyProfiles ya deja afuera las cuentas sin «puede tener perfiles» o borradas.
	const [managed, meta] = await Promise.all([
		listMyProfiles(db, account.id),
		getEventMeta(eventSlug)
	]);
	const profiles = organizerProfilesOf(meta, managed);
	if (!meta || profiles.length === 0) return null;
	return {
		slug: eventSlug,
		title: typeof meta.title === 'string' && meta.title ? meta.title : eventSlug,
		start: dateText(meta.start),
		profiles: profiles.map((p) => p.title)
	};
}

/**
 * Los eventos publicados que organiza la cuenta (por cualquiera de sus perfiles), del más nuevo al
 * más viejo. Vacío sin el permiso de perfiles.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<OrganizedEvent[]>}
 */
export async function myOrganizedEvents(db, accountId) {
	const managed = await listMyProfiles(db, accountId);
	/** @type {Map<string, OrganizedEvent>} */
	const bySlug = new Map();
	for (const p of managed) {
		for (const e of await organizedEvents(p.slug)) {
			const row = bySlug.get(e.slug) ?? { ...e, profiles: [] };
			row.profiles.push(p.title);
			bySlug.set(e.slug, row);
		}
	}
	return [...bySlug.values()].sort((a, b) =>
		String(b.start ?? '').localeCompare(String(a.start ?? ''))
	);
}

/**
 * La entrada al panel de una cuenta que organiza (la llama hooks.server.js en cada pedido):
 * - `null`: no aplica (no es del panel, es admin, no hay cuenta, interruptor apagado, o la cuenta
 *   no organiza nada): el pedido sigue como siempre;
 * - `'deny'`: organiza algo, pero esto no está permitido o el evento no es suyo: 404;
 * - si no, el contexto para `locals.organizer`.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<OrganizerContext | 'deny' | null>}
 */
export async function organizerAccess(event) {
	const routeId = event.route?.id ?? '';
	if (!routeId.startsWith('/(authed)')) return null;
	if (isAdmin(event.locals.user)) return null;
	const member = event.locals.member;
	if (!member?.id) return null;
	const db = getDB(event.platform);
	if (!db || !(await isFlagOn(db, 'rol_organizadore'))) return null;
	/** @type {OrganizedEvent[]} */
	let events;
	try {
		events = await myOrganizedEvents(db, member.id);
	} catch (e) {
		logDBError('eventos que organiza la cuenta (panel)', e);
		return 'deny';
	}
	if (!events.length) return null;
	if (!organizerRequestAllowed({ routeId, method: event.request.method, url: event.url })) {
		return 'deny';
	}
	/** @type {OrganizedEvent | null} */
	let current = null;
	if (routeId.startsWith(EVENT)) {
		// Se vuelve a mirar el evento del pedido con la regla (no solo la lista de arriba).
		current = await canManageEvent(db, member, event.params.slug ?? '');
		if (!current) return 'deny';
	}
	const name = [...new Set(events.flatMap((e) => e.profiles))].join(', ');
	return { accountId: member.id, login: accountActor(member.id), name, events, event: current };
}

/**
 * En las rutas permitidas, en lugar de `requireAdmin`: une admin como siempre, o quien organiza
 * **este** evento (`slug`; sin `slug`, las páginas que no son de un evento, como «Tus eventos»).
 * Devuelve quién hace el pedido, con `organizer` si es une organizadore.
 *
 * @param {App.Locals} locals
 * @param {URL} url
 * @param {string} [slug]
 * @returns {{ login: string, name: string | null, id?: number, organizer?: OrganizerContext }}
 */
export function requireAdminOrOrganizer(locals, url, slug) {
	const org = locals.organizer;
	if (org && !isAdmin(locals.user)) {
		if (slug !== undefined && org.event?.slug !== slug) error(404, 'Not found');
		return { login: org.login, name: org.name, organizer: org };
	}
	return requireAdmin(locals, url);
}

/**
 * ¿Este pedido es de une organizadore (no admin)?
 *
 * @param {App.Locals} locals
 */
export function isOrganizerRequest(locals) {
	return Boolean(locals.organizer) && !isAdmin(locals.user);
}

/**
 * «Editó el evento» en Actividad, para un guardado de une organizadore (el historial del evento ya
 * lo anota con su cuenta). Nunca tira.
 *
 * @param {D1Database | null | undefined} db
 * @param {OrganizerContext} org
 * @param {{ slug: string, title: string }} event
 */
export function logOrganizerEdit(db, org, event) {
	return logAdminAction(
		db,
		{ user: { login: org.login } },
		{
			action: 'event.organizer_edit',
			targetType: 'event',
			targetId: event.slug,
			summary: `${org.event?.profiles.join(', ') || org.name} (organiza) editó «${event.title}»`,
			detail: { account: org.accountId }
		}
	);
}

/**
 * Quién mira las imágenes de la biblioteca en el editor: une admin, todas; une organizadore, como
 * en Mi rincón (las públicas y las que subió su cuenta; docs/imagenes.md).
 *
 * @param {App.Locals} locals
 * @returns {import('$lib/server/objects/visibility.js').Viewer}
 */
export function panelImageViewer(locals) {
	if (isOrganizerRequest(locals) && locals.organizer) {
		return memberViewer(locals.organizer.accountId);
	}
	return { role: 'admin', id: locals.user?.login ?? 'panel' };
}

/**
 * «Lugar» del editor para une organizadore: solo los lugares públicos, aprobados y listados (y el
 * que el evento ya tiene), sin la dirección de los que no la muestran. Crear o editar un lugar
 * cambia algo de todo el sitio: no (`limited`, y las acciones dan 404).
 *
 * @template {{ venues: import('$lib/utils/venueChoice.js').VenueOption[],
 *   current: { venueId: number | null } }} P
 * @param {P | null} picker
 * @returns {(P & { limited: boolean }) | null}
 */
export function organizerVenuePicker(picker) {
	if (!picker) return null;
	const currentId = picker.current.venueId;
	const venues = picker.venues
		.filter((v) => v.id === currentId || (v.visibility === 'public' && v.approved && !v.unlisted))
		.map((v) => ((v.privacy ?? 'public') === 'public' ? v : { ...v, address: '' }));
	return { ...picker, venues, limited: true };
}
