/**
 * Datos guardados de la cuenta para la compra de entradas: nombre, pronombres y DNI (este solo si
 * la persona marcó «Recordar mi DNI»). Viven en `accounts.preferences`, clave `savedBuyer` (la
 * columna se pensó para esto, migración 0013): no hace falta una tabla nueva, y borrar la cuenta
 * ya deja `preferences = '{}'` (lo exige un CHECK de la tabla), así que se van con ella.
 *
 * Privacidad: el DNI es sensible. Se lee solo para la propia cuenta (la compra y Mi rincón), nunca
 * se loguea (los errores se registran sin valores) ni va en mails, y el panel de cuentas no lee
 * `preferences`. Las reglas puras están en $lib/utils/savedBuyer.js.
 */
import { cleanSavedBuyer, purchasePrefill, savedAfterPurchase } from '$lib/utils/savedBuyer.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/savedBuyer.js').SavedBuyer} SavedBuyer */

/**
 * Lo guardado de una cuenta activa (vacío si no hay nada o la cuenta no existe).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<SavedBuyer>}
 */
export async function getSavedBuyer(db, accountId) {
	const row = await db
		.prepare(
			`SELECT json_extract(preferences, '$.savedBuyer') AS v FROM accounts
			WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId)
		.first();
	return row?.v == null ? {} : cleanSavedBuyer(String(row.v));
}

/**
 * Reemplaza lo guardado. Vacío, la clave se saca (no queda nada).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {SavedBuyer} saved
 * @param {{ now?: number }} [opts]
 */
export async function setSavedBuyer(db, accountId, saved, { now = Date.now() } = {}) {
	const clean = cleanSavedBuyer(saved);
	const empty = Object.keys(clean).length === 0;
	await db
		.prepare(
			`UPDATE accounts SET updated_at = ?2, preferences = CASE WHEN ?3
				THEN json_remove(preferences, '$.savedBuyer')
				ELSE json_set(preferences, '$.savedBuyer', json(?4)) END
			WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId, now, empty ? 1 : 0, JSON.stringify(clean))
		.run();
	return clean;
}

/**
 * Lo que la página de compra necesita de la cuenta para completar «Tus datos», o `null` sin
 * cuenta (sin `locals.member`). Si la base
 * falla, la compra sigue como sin cuenta.
 *
 * @param {D1Database | null | undefined} db
 * @param {App.Locals['member']} member
 */
export async function purchaseAccount(db, member) {
	if (!db || !member) return null;
	try {
		return purchasePrefill(await getSavedBuyer(db, member.id), member.email);
	} catch {
		// Sin el detalle del error: no hace falta y así nunca arrastra datos.
		console.error('[cuentas] no se pudieron leer los datos guardados');
		return null;
	}
}

/**
 * Después de una compra con cuenta: guarda o saca lo guardado según las casillas de «Tus datos»
 * (ver savedAfterPurchase). Nunca frena la compra: si falla, se registra sin valores.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ name: string, pronouns: string, dni: string }} buyer validado
 * @param {{ remember: boolean, rememberDni: boolean }} choices
 * @param {{ now?: number }} [opts]
 */
export async function saveAfterPurchase(db, accountId, buyer, choices, opts) {
	try {
		const current = await getSavedBuyer(db, accountId);
		await setSavedBuyer(db, accountId, savedAfterPurchase(current, buyer, choices), opts);
	} catch {
		console.error('[cuentas] no se pudieron guardar los datos de la compra');
	}
}
