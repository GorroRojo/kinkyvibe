/**
 * Organizadores: sus eventos en Mi rincón (PROTOTIPO, interruptor `rol_organizadore`, apagado).
 * Plan: `rol-organizadore`; docs/cuentas.md, «Organizadores (prototipo)».
 *
 * Sin migración: no hay tabla de roles. «Organiza este evento» sale de lo que ya existe, la misma
 * regla que las respuestas de inscripción (./organiza.js):
 *   la cuenta gestiona (dueñe o gestore, `profile_managers`) un perfil que figura con el rol
 *   «Organiza» en las personas del evento publicado (edge `persona` del evento).
 * Un pedido «¿Es tu perfil?» aprobado deja a la cuenta como dueñe del perfil, así que también
 * cuenta. Les admins siguen en el panel como siempre: esto no les cambia nada.
 *
 * TODA decisión de acceso pasa por {@link canManageEvent} (y {@link requireEventOrganizer} en las
 * rutas). Si no corresponde: 404, no 403 (no se sabe si el evento existe).
 *
 * Qué ve quien organiza (propuesta para mirar):
 * - venta: entradas vendidas, reservadas sin pagar y cupo por tipo, y la plata en totales
 *   (recaudado, comisión de Mercado Pago, lo que queda). Nunca órdenes una por una;
 * - la lista para la puerta: nombre y pronombres de cada entrada, tipo y si ya entró. Lo mismo que
 *   muestra la puerta, sin el mail, el DNI ni quién compró;
 * - cambiar el texto del evento (el cuerpo), por el mismo guardado que el editor del panel
 *   (`commitFiles` del cliente de contenido), como autor `cuenta:<id>` y sin permisos de superadmin:
 *   el texto se muestra con el HTML acotado (decisión 0004), aunque antes fuera libre.
 */
import { error } from '@sveltejs/kit';
import { listMyProfiles } from '$lib/server/cuentas/perfiles.js';
import { requireMember } from '$lib/server/cuentas/perfilesWeb.js';
import { rolOrganizadoreEnabled } from '$lib/server/flags.js';
import { getRepoClient } from '$lib/server/eventos';
import { readDbPostFile } from '$lib/server/contenido/repo.js';
import { FileChangedError } from '$lib/server/contenido/cliente.js';
import { getEventMeta, getEventTickets, isValidEventSlug } from '$lib/server/tickets/events.js';
import { getCounts } from '$lib/server/tickets/orders.js';
import { logOrganizerEventEdited } from '$lib/server/admin/accountEvents.js';
import { joinMarkdown, splitMarkdown } from '$lib/utils/eventDraft.js';
import { postFilePath } from '$lib/utils/postPaths.js';
import { organizedEvents, organizesEvent } from './organiza.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ id: number, slug: string, title: string }} OrganizerProfile */

/** Largo máximo del texto del evento que se acepta del formulario. */
export const ORGANIZER_BODY_MAX = 20_000;

/** @param {unknown} v */
const dateText = (v) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

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

/**
 * ¿Puede esta cuenta gestionar este evento como organizadore? Lo único que decide el acceso.
 * `null` si no (sin cuenta, sin el permiso de perfiles, evento inexistente o no publicado, o
 * ninguno de sus perfiles lo organiza); si sí, el evento y los perfiles por los que organiza.
 *
 * @param {D1Database} db
 * @param {{ id: string } | null | undefined} account la cuenta de la sesión (`locals.member`)
 * @param {string} eventSlug
 */
export async function canManageEvent(db, account, eventSlug) {
	if (!account?.id || !isValidEventSlug(eventSlug)) return null;
	const [managed, meta] = await Promise.all([
		listMyProfiles(db, account.id),
		getEventMeta(eventSlug)
	]);
	const profiles = organizerProfilesOf(meta, managed);
	if (!meta || profiles.length === 0) return null;
	return {
		profiles: profiles.map((p) => ({ id: p.id, slug: p.slug, title: p.title })),
		event: {
			slug: eventSlug,
			title: typeof meta.title === 'string' && meta.title ? meta.title : eventSlug,
			start: dateText(meta.start)
		}
	};
}

/**
 * La entrada de las páginas: interruptor prendido, sesión de cuenta con el permiso de perfiles
 * (si no hay sesión, a /ingresar) y, si hay `params.event`, {@link canManageEvent}. 404 si no.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function requireOrganizerArea(event) {
	if (!(await rolOrganizadoreEnabled(event.platform))) error(404, 'Not found');
	return requireMember(event);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function requireEventOrganizer(event) {
	const { db, member } = await requireOrganizerArea(event);
	const access = await canManageEvent(db, member, event.params.event ?? '');
	if (!access) error(404, 'Not found');
	return { db, member, ...access };
}

/**
 * Los eventos publicados que organiza la cuenta (por cualquiera de sus perfiles), del más nuevo al
 * más viejo, con los perfiles por los que organiza cada uno.
 *
 * @param {D1Database} db
 * @param {string} accountId
 */
export async function myOrganizedEvents(db, accountId) {
	const managed = await listMyProfiles(db, accountId);
	/** @type {Map<string, { slug: string, title: string, start: string | null, profiles: string[] }>} */
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
 * Cómo va la venta, en totales (nunca órdenes sueltas). `null` si el evento no vende por el sitio.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {number} [now]
 */
export async function organizerSales(db, slug, now = Date.now()) {
	const config = await getEventTickets(slug);
	if (!config) return null;
	const counts = await getCounts(db, slug, now);
	const types = config.types.map((t) => {
		const c = counts.get(t.id);
		return {
			name: t.name,
			capacity: t.capacity ?? null,
			sold: c?.sold ?? 0,
			held: c?.held ?? 0
		};
	});
	let revenue = 0;
	let mpFee = 0;
	for (const c of counts.values()) {
		revenue += c.revenue;
		mpFee += c.mpFee;
	}
	const sold = types.reduce((s, t) => s + t.sold, 0);
	const held = types.reduce((s, t) => s + t.held, 0);
	const capacity = types.every((t) => t.capacity !== null)
		? types.reduce((s, t) => s + /** @type {number} */ (t.capacity), 0)
		: null;
	return {
		cancelled: config.status === 'cancelado',
		types,
		totals: { sold, held, capacity, revenue, mpFee, net: revenue - mpFee }
	};
}

/**
 * La lista para la puerta: una fila por entrada de compra confirmada, con el nombre y los
 * pronombres que figuran en la entrada, el tipo y si ya entró. Sin mail, DNI ni quién compró.
 *
 * @param {D1Database} db
 * @param {string} slug
 */
export async function organizerDoorList(db, slug) {
	const config = await getEventTickets(slug);
	/** @type {Record<string, string>} */
	const typeNames = Object.fromEntries((config?.types ?? []).map((t) => [t.id, t.name]));
	const { results } = await db
		.prepare(
			`SELECT t.holder_name, t.holder_pronouns, t.ticket_type, t.checked_in_at
			FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE t.event_slug = ?1 AND o.status = 'approved'
			ORDER BY t.holder_name COLLATE NOCASE, t.rowid`
		)
		.bind(slug)
		.all();
	return results.map((r) => ({
		name: String(r.holder_name ?? ''),
		pronouns: r.holder_pronouns ? String(r.holder_pronouns) : '',
		type: typeNames[String(r.ticket_type)] ?? String(r.ticket_type),
		inside: r.checked_in_at != null
	}));
}

/**
 * El texto del evento para editarlo, con el sha para guardar contra él. `null` si la base no lo
 * tiene.
 *
 * @param {string} slug
 */
export async function organizerEventText(slug) {
	const path = postFilePath('calendario', slug);
	const file = path ? await readDbPostFile(path) : null;
	if (!file || 'deleted' in file) return null;
	return { body: splitMarkdown(file.raw).body.replace(/^\n+/, ''), sha: file.sha };
}

/**
 * Guarda el texto (solo el cuerpo) de un evento que la cuenta organiza. Las propiedades del evento
 * quedan como estaban, letra por letra. Quien llama ya pasó por {@link requireEventOrganizer}.
 *
 * @param {D1Database} db
 * @param {{ accountId: string, slug: string, title: string, body: string, sha: string, profile: OrganizerProfile }} input
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
export async function saveOrganizerEventText(db, input) {
	const path = postFilePath('calendario', input.slug);
	const file = path ? await readDbPostFile(path) : null;
	if (!path || !file || 'deleted' in file) {
		return { ok: false, status: 404, message: 'No encontramos el evento.' };
	}
	if (file.sha !== input.sha) {
		return {
			ok: false,
			status: 409,
			message:
				'Alguien cambió el evento mientras lo editabas. Copiá tu texto, recargá la página y volvé a intentar.'
		};
	}
	const body = input.body.replace(/\r\n?/g, '\n').trim();
	if (body.length > ORGANIZER_BODY_MAX) {
		return { ok: false, status: 400, message: 'El texto es demasiado largo.' };
	}
	const { frontmatter } = splitMarkdown(file.raw);
	const content = joinMarkdown(frontmatter, body ? `\n${body}\n` : '');
	try {
		const client = await getRepoClient();
		await client.commitFiles('', {
			files: [{ path, content }],
			message: `[mi-rincon] organizadore updated calendario/${input.slug}`,
			actor: `cuenta:${input.accountId}`,
			superadmin: false,
			unchanged: [{ path, sha: input.sha }]
		});
	} catch (e) {
		if (e instanceof FileChangedError) {
			return {
				ok: false,
				status: 409,
				message:
					'Alguien cambió el evento mientras lo editabas. Copiá tu texto, recargá la página y volvé a intentar.'
			};
		}
		console.error('[organizadores] no se pudo guardar el texto:', e);
		return { ok: false, status: 502, message: 'No se pudo guardar. Probá de nuevo en un rato.' };
	}
	await logOrganizerEventEdited(db, {
		accountId: input.accountId,
		profile: input.profile,
		eventSlug: input.slug,
		eventTitle: input.title
	});
	return { ok: true };
}
