/**
 * Suspender una cuenta del público (docs/cuentas.md, «Suspender una cuenta»; migración 0065).
 * Lo hace une admin desde la ficha de la cuenta (src/lib/server/admin/fichaRoutes.js).
 *
 * Una cuenta suspendida:
 * - pierde en el momento todas sus sesiones (y `getSessionAccount` no acepta ninguna aunque
 *   quedara una de un ingreso que se cruzó);
 * - no puede volver a entrar, ni con código por mail ni con contraseña: recién después de probar
 *   que es la dueña del mail (código o contraseña correctos) ve «Tu cuenta está suspendida», así
 *   el aviso no le dice a cualquiera que ese mail tiene una cuenta suspendida;
 * - pierde el Telegram vinculado y sus códigos de vinculación, y el bot no la reconoce aunque
 *   alguien intente vincularla de nuevo.
 *
 * No toca sus perfiles públicos (moderarlos es aparte: ocultar o borrar desde Perfiles) ni las
 * compras: comprar sin cuenta, con un mail, sigue andando como para cualquiera.
 *
 * El motivo es opcional y privado: queda en `accounts.suspended_reason`, lo ven solo les admins en
 * la ficha, nunca va a Actividad, a la persona ni a una página pública.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Largo máximo del motivo. */
export const SUSPEND_REASON_MAX = 500;

/**
 * El motivo como se guarda: sin espacios de más y recortado; `null` si está vacío.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function cleanSuspendReason(raw) {
	if (typeof raw !== 'string') return null;
	const text = raw.replace(/\r\n?/g, '\n').trim().slice(0, SUSPEND_REASON_MAX).trim();
	return text || null;
}

/**
 * Lo que ve la persona suspendida al intentar entrar. El contacto lo pasa quien llama
 * (`contactEmail()` de las entradas, que cae en `DEFAULT_CONTACT_EMAIL`).
 *
 * @param {string} contact
 */
export function suspendedMessage(contact) {
	return `Tu cuenta está suspendida. Si creés que es un error, escribinos a ${contact}.`;
}

/**
 * Suspende la cuenta y, en la misma tanda, cierra todas sus sesiones y desvincula su Telegram.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ by: string, reason?: unknown, now?: number }} input `by`: el login de le admin
 * @returns {Promise<{ result: 'suspended', sessions: number, telegram: boolean }
 *   | { result: 'already' } | { result: 'not_found' }>}
 */
export async function suspendAccount(db, accountId, { by, reason, now = Date.now() }) {
	const current = await db
		.prepare('SELECT suspended_at FROM accounts WHERE id = ?1 AND deleted_at IS NULL')
		.bind(accountId)
		.first();
	if (!current) return { result: 'not_found' };
	if (current.suspended_at != null) return { result: 'already' };
	const [update, sessions, telegram] = await db.batch([
		db
			.prepare(
				`UPDATE accounts SET suspended_at = ?2, suspended_by = ?3, suspended_reason = ?4,
					updated_at = ?2
				WHERE id = ?1 AND deleted_at IS NULL AND suspended_at IS NULL`
			)
			.bind(accountId, now, by, cleanSuspendReason(reason)),
		db.prepare('DELETE FROM account_sessions WHERE account_id = ?1').bind(accountId),
		db.prepare('DELETE FROM telegram_chats WHERE account_id = ?1').bind(accountId),
		db.prepare('DELETE FROM telegram_link_codes WHERE account_id = ?1').bind(accountId)
	]);
	// Otra pestaña la suspendió en el medio: las sesiones igual quedaron cerradas.
	if (!Number(update.meta?.changes ?? 0)) return { result: 'already' };
	return {
		result: 'suspended',
		sessions: Number(sessions.meta?.changes ?? 0),
		telegram: Number(telegram.meta?.changes ?? 0) > 0
	};
}

/**
 * Levanta la suspensión: la cuenta puede volver a entrar. Las sesiones y el Telegram no vuelven
 * (la persona entra de nuevo y, si quiere, vuelve a vincular el bot). El motivo se borra.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<'unsuspended' | 'not_suspended' | 'not_found'>}
 */
export async function unsuspendAccount(db, accountId, { now = Date.now() } = {}) {
	const r = await db
		.prepare(
			`UPDATE accounts SET suspended_at = NULL, suspended_by = NULL, suspended_reason = NULL,
				updated_at = ?2
			WHERE id = ?1 AND deleted_at IS NULL AND suspended_at IS NOT NULL`
		)
		.bind(accountId, now)
		.run();
	if (Number(r.meta?.changes ?? 0)) return 'unsuspended';
	const exists = await db
		.prepare('SELECT 1 FROM accounts WHERE id = ?1 AND deleted_at IS NULL')
		.bind(accountId)
		.first();
	return exists ? 'not_suspended' : 'not_found';
}
