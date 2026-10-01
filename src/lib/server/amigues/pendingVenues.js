/**
 * Lugares que cargó una cuenta y esperan que une admin los apruebe (decisión de gorrite,
 * docs/decisiones/0022-lugares-desde-cuentas.md).
 *
 * - Una cuenta crea un lugar desde Mi rincón → Perfiles (como cualquier perfil suyo: nace sin
 *   aprobar, ver approvals.js). Hasta que une admin lo aprueba no aparece en el sitio: ni en
 *   /amigues, ni en su página para quien no lo gestiona, ni en los eventos.
 * - Los que crea une admin (Panel → Eventos → Lugares o Contenido → Amigues) y los importados
 *   nacen aprobados: nunca están en esta lista.
 * - Aprobar es {@link approveProfile}. Rechazar NO lo borra (decisión de gorrite): deja una fila
 *   en `profile_rejections` (migración 0025) con quién, cuándo y un motivo opcional. El lugar
 *   sigue sin aparecer en el sitio, sale de "Para aprobar" y quien lo cargó lo ve en Mi rincón
 *   como «Rechazado» (con el motivo). Editarlo no lo vuelve a mandar: lo hace «Volver a mandar»
 *   (`resubmitVenue` en cuentas/perfiles.js), que borra la fila (`clearRejectionStatement` en
 *   approvals.js). Los rechazados se listan en el panel con {@link listRejectedVenues}.
 */
import { OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { cleanRejectReason } from '$lib/utils/venues.js';
import { approvalOf } from './approvals.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {{
 *   id: number, slug: string, title: string, version: number, visibility: string,
 *   address: string, area: string, city: string, createdAt: number, byAccount: boolean
 * }} PendingVenue
 */

/** @typedef {{ at: number, by: string, reason: string }} Rejection */

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Una fila de objects (lugar) → lo que muestran "Para aprobar" y "Rechazados".
 *
 * @param {Record<string, unknown>} r
 * @returns {PendingVenue}
 */
function toVenueRow(r) {
	const o = rowToObject(r);
	return {
		id: o.id,
		slug: o.slug,
		title: o.title,
		version: o.version,
		visibility: o.visibility,
		address: str(o.data.address),
		area: str(o.data.area),
		city: str(o.data.city),
		createdAt: o.created_at,
		byAccount: o.created_by.startsWith('cuenta:')
	};
}

/** Condición SQL: `o` es un lugar vivo sin aprobar. */
const UNAPPROVED_VENUE = `o.type = ?1 AND o.deleted_at IS NULL AND json_extract(o.data, '$.kind') = 'lugar'
	AND NOT EXISTS (SELECT 1 FROM profile_approvals ap WHERE ap.profile_id = o.id)`;

const VENUE_COLUMNS = OBJECT_COLUMNS.split(', ')
	.map((c) => `o.${c}`)
	.join(', ');

/**
 * Los lugares sin aprobar ni rechazar (no borrados), del más viejo al más nuevo (el que más
 * espera, primero).
 *
 * @param {D1Database} db
 * @returns {Promise<PendingVenue[]>}
 */
export async function listPendingVenues(db) {
	const { results } = await db
		.prepare(
			`SELECT ${VENUE_COLUMNS} FROM objects o
			WHERE ${UNAPPROVED_VENUE}
			AND NOT EXISTS (SELECT 1 FROM profile_rejections rj WHERE rj.profile_id = o.id)
			ORDER BY o.created_at, o.id LIMIT 500`
		)
		.bind(PROFILE_TYPE)
		.all();
	return results.map(toVenueRow);
}

/**
 * Los lugares rechazados (sin aprobar, no borrados), del rechazo más nuevo al más viejo, con
 * cuándo, quién (login de le admin) y el motivo. Para la tarjeta "Rechazados" del panel (solo
 * admins): desde ahí se pueden aprobar.
 *
 * @param {D1Database} db
 * @returns {Promise<(PendingVenue & { rejectedAt: number, rejectedBy: string, reason: string })[]>}
 */
export async function listRejectedVenues(db) {
	const { results } = await db
		.prepare(
			`SELECT ${VENUE_COLUMNS}, rj.rejected_at AS rejected_at, rj.rejected_by AS rejected_by,
				rj.reason AS reason
			FROM objects o JOIN profile_rejections rj ON rj.profile_id = o.id
			WHERE ${UNAPPROVED_VENUE}
			ORDER BY rj.rejected_at DESC, o.id LIMIT 500`
		)
		.bind(PROFILE_TYPE)
		.all();
	return results.map((r) => ({
		...toVenueRow(r),
		rejectedAt: Number(r.rejected_at),
		rejectedBy: str(r.rejected_by),
		reason: str(r.reason)
	}));
}

/**
 * Rechaza un lugar que espera aprobación: queda la fila del rechazo (no se borra el lugar). Solo
 * lugares que siguen esperando: uno ya aprobado se saca del sitio con "desaprobar"; uno ya
 * rechazado no se rechaza de nuevo (409).
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @param {{ by: string, reason?: unknown, now?: number }} opts `by`: login de le admin
 * @returns {Promise<{ ok: true, title: string, reason: string } | { ok: false, status: number, message: string }>}
 */
export async function rejectPendingVenue(db, profileId, { by, reason, now = Date.now() }) {
	const row = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1 AND type = ?2 AND deleted_at IS NULL`
		)
		.bind(profileId, PROFILE_TYPE)
		.first();
	const venue = row ? rowToObject(row) : null;
	if (!venue || profileKindOf(venue.data) !== 'lugar') {
		return { ok: false, status: 404, message: 'Ese lugar ya no está.' };
	}
	if (await approvalOf(db, venue.id)) {
		return { ok: false, status: 409, message: 'Ese lugar ya estaba aprobado.' };
	}
	const text = cleanRejectReason(reason);
	// Condicional: si otre admin lo rechazó o aprobó en el medio, no cambia nada.
	const r = await db
		.prepare(
			`INSERT INTO profile_rejections (profile_id, rejected_at, rejected_by, reason)
			SELECT ?1, ?2, ?3, ?4
			WHERE NOT EXISTS (SELECT 1 FROM profile_approvals WHERE profile_id = ?1)
			ON CONFLICT (profile_id) DO NOTHING`
		)
		.bind(venue.id, now, by, text)
		.run();
	if (r.meta.changes === 0) {
		return { ok: false, status: 409, message: 'Ese lugar ya no estaba para aprobar.' };
	}
	return { ok: true, title: venue.title, reason: text };
}

/**
 * El rechazo de un perfil, o `null`.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @returns {Promise<Rejection | null>}
 */
export async function rejectionOf(db, profileId) {
	const row = await db
		.prepare(
			'SELECT rejected_at, rejected_by, reason FROM profile_rejections WHERE profile_id = ?1'
		)
		.bind(profileId)
		.first();
	return row
		? { at: Number(row.rejected_at), by: String(row.rejected_by), reason: str(row.reason) }
		: null;
}
