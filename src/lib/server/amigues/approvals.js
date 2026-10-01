/**
 * Aprobación de perfiles para /amigues (tabla `profile_approvals`, migración 0017).
 *
 * Un perfil que crea una cuenta no aparece en /amigues hasta que une admin lo aprueba (decisión de
 * gorrite, 1/10); hasta entonces lo ven solo quienes lo gestionan y les admins. Los importados de
 * las fichas .md y los que crean les admins nacen aprobados (en la misma tanda de saveObject()).
 * Aprobar no cambia el objeto (ni su `version`): es una fila de apoyo.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */

/**
 * La sentencia que aprueba el perfil recién creado (para la opción `also` de saveObject()).
 *
 * @param {D1Database} db
 * @param {{ type: string, slug: string }} self
 * @param {string} by
 * @param {number} now
 * @returns {D1PreparedStatement}
 */
export function approveNewStatement(db, self, by, now) {
	return db
		.prepare(
			`INSERT INTO profile_approvals (profile_id, approved_at, approved_by)
			SELECT id, ?3, ?4 FROM objects WHERE type = ?1 AND slug = ?2`
		)
		.bind(self.type, self.slug, now, by);
}

/**
 * Aprueba un perfil (si ya estaba aprobado, no cambia nada). Si estaba rechazado (un lugar de una
 * cuenta, migración 0025), el rechazo se borra en la misma tanda.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @param {string} by login de le admin
 * @param {{ now?: number }} [opts]
 * @returns {Promise<boolean>} si cambió algo
 */
export async function approveProfile(db, profileId, by, { now = Date.now() } = {}) {
	const [r] = await db.batch([
		db
			.prepare(
				`INSERT INTO profile_approvals (profile_id, approved_at, approved_by)
				SELECT id, ?2, ?3 FROM objects WHERE id = ?1 AND type = 'perfil' AND deleted_at IS NULL
				ON CONFLICT (profile_id) DO NOTHING`
			)
			.bind(profileId, now, by),
		db
			.prepare(
				`DELETE FROM profile_rejections WHERE profile_id = ?1
				AND EXISTS (SELECT 1 FROM profile_approvals WHERE profile_id = ?1)`
			)
			.bind(profileId)
	]);
	return r.meta.changes > 0;
}

/**
 * Saca un perfil de /amigues (deja de estar aprobado). No lo oculta ni lo borra.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @returns {Promise<boolean>} si cambió algo
 */
export async function unapproveProfile(db, profileId) {
	const r = await db
		.prepare('DELETE FROM profile_approvals WHERE profile_id = ?1')
		.bind(profileId)
		.run();
	return r.meta.changes > 0;
}

/**
 * Cuándo y quién lo aprobó, o `null`.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @returns {Promise<{ at: number, by: string } | null>}
 */
export async function approvalOf(db, profileId) {
	const row = await db
		.prepare('SELECT approved_at, approved_by FROM profile_approvals WHERE profile_id = ?1')
		.bind(profileId)
		.first();
	return row ? { at: Number(row.approved_at), by: String(row.approved_by) } : null;
}

/**
 * La sentencia que saca el rechazo de un perfil (el lugar vuelve a esperar aprobación). Para la
 * opción `also` de saveObject(), así se borra solo si se guardó la edición.
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @returns {D1PreparedStatement}
 */
export function clearRejectionStatement(db, profileId) {
	return db.prepare('DELETE FROM profile_rejections WHERE profile_id = ?1').bind(profileId);
}
