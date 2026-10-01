/**
 * Lugares que cargó una cuenta y esperan que une admin los apruebe (decisión de gorrite,
 * docs/decisiones/0022-lugares-desde-cuentas.md).
 *
 * - Una cuenta crea un lugar desde Mi rincón → Perfiles (como cualquier perfil suyo: nace sin
 *   aprobar, ver approvals.js). Hasta que une admin lo aprueba no aparece en el sitio: ni en
 *   /amigues, ni en su página para quien no lo gestiona, ni en los eventos.
 * - Los que crea une admin (Panel → Eventos → Lugares o Contenido → Amigues) y los importados
 *   nacen aprobados: nunca están en esta lista.
 * - Aprobar es {@link approveProfile}; rechazar lo borra (suave, con saveObject(): se puede
 *   deshacer desde la base) para que salga de la lista y de Mi rincón de quien lo cargó.
 */
import { saveObject } from '$lib/server/objects/index.js';
import { OBJECT_COLUMNS, rowToObject } from '$lib/server/objects/read.js';
import { PROFILE_TYPE } from '$lib/server/cuentas/perfiles.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { approvalOf } from './approvals.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {{
 *   id: number, slug: string, title: string, version: number, visibility: string,
 *   address: string, area: string, city: string, createdAt: number, byAccount: boolean
 * }} PendingVenue
 */

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Los lugares sin aprobar (no borrados), del más viejo al más nuevo (el que más espera, primero).
 *
 * @param {D1Database} db
 * @returns {Promise<PendingVenue[]>}
 */
export async function listPendingVenues(db) {
	const { results } = await db
		.prepare(
			`SELECT ${OBJECT_COLUMNS} FROM objects o
			WHERE o.type = ?1 AND o.deleted_at IS NULL AND json_extract(o.data, '$.kind') = 'lugar'
			AND NOT EXISTS (SELECT 1 FROM profile_approvals ap WHERE ap.profile_id = o.id)
			ORDER BY o.created_at, o.id LIMIT 500`
		)
		.bind(PROFILE_TYPE)
		.all();
	return results.map((r) => {
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
	});
}

/**
 * Rechaza un lugar sin aprobar: lo borra (suave). Solo lugares que siguen esperando; uno ya
 * aprobado se saca de la lista con "desaprobar", no se borra desde acá.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @param {{ by: string, now?: number }} opts `by`: login de le admin
 * @returns {Promise<{ ok: true, title: string } | { ok: false, status: number, message: string }>}
 */
export async function rejectPendingVenue(db, profileId, { by, now = Date.now() }) {
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
	await saveObject(
		db,
		{ id: venue.id, type: PROFILE_TYPE, version: venue.version, deleted: true },
		{ actor: by, now }
	);
	return { ok: true, title: venue.title };
}
