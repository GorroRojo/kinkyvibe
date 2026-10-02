/**
 * Datos guardados de la cuenta para la compra de entradas (docs/cuentas.md, «Datos guardados»):
 * nombre, pronombres y, si la persona lo pide aparte, el DNI. Funciones puras: qué se completa
 * en el formulario, qué se guarda o se saca según las casillas, cómo se valida lo que se edita
 * en Mi rincón y cómo se muestra el DNI tapado. Las usan el servidor y las páginas.
 *
 * Se guardan en `accounts.preferences` (clave `savedBuyer`, ver $lib/server/cuentas/savedBuyer.js).
 * El mail no se guarda acá: es el de la cuenta.
 */
import { normalizeDni } from './tickets.js';
import { checkName, checkPronouns } from './ticketBuyer.js';

/** @typedef {{ name?: string, pronouns?: string, dni?: string }} SavedBuyer */
/** @typedef {'name' | 'pronouns' | 'dni'} SavedBuyerField */

/** Los campos que se pueden guardar, en el orden en que se muestran. */
export const SAVED_BUYER_FIELDS = /** @type {const} */ (['name', 'pronouns', 'dni']);

/** @param {unknown} v @returns {v is SavedBuyerField} */
export function isSavedBuyerField(v) {
	return v === 'name' || v === 'pronouns' || v === 'dni';
}

/**
 * Lo guardado, limpio: solo los campos conocidos y solo si siguen pasando las mismas reglas que
 * la compra (lo que no pasa se ignora). Acepta el objeto o su JSON.
 *
 * @param {unknown} raw
 * @returns {SavedBuyer}
 */
export function cleanSavedBuyer(raw) {
	let obj = raw;
	if (typeof raw === 'string') {
		try {
			obj = JSON.parse(raw);
		} catch {
			return {};
		}
	}
	if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
	const o = /** @type {Record<string, unknown>} */ (obj);
	/** @type {SavedBuyer} */
	const out = {};
	const name = checkName(o.name, '-');
	if (!name.error) out.name = name.value;
	const pronouns = checkPronouns(o.pronouns, '-');
	if (!pronouns.error) out.pronouns = pronouns.value;
	const dni = normalizeDni(o.dni);
	if (dni) out.dni = dni;
	return out;
}

/**
 * Qué se completa en «Tus datos» para una cuenta: nombre, pronombres y DNI guardados, el mail
 * de la cuenta y cómo arrancan las dos casillas. «Guardar mis datos para la próxima» arranca
 * marcada; «Recordar mi DNI», marcada solo si ya había un DNI guardado (si no, la persona la
 * marca a propósito; y si ya lo había elegido, desmarcarla es la forma de sacarlo).
 *
 * @param {SavedBuyer} saved
 * @param {string} email el de la cuenta
 */
export function purchasePrefill(saved, email) {
	return {
		name: saved.name ?? '',
		pronouns: saved.pronouns ?? '',
		email,
		dni: saved.dni ?? '',
		remember: true,
		rememberDni: Boolean(saved.dni)
	};
}

/**
 * Lo que queda guardado después de una compra con cuenta, según las casillas: con «Guardar mis
 * datos» se guardan el nombre y los pronombres de quien compra (sin ella se sacan); con
 * «Recordar mi DNI», el DNI (sin ella se saca). `buyer` ya validado (validateBuyer).
 *
 * @param {SavedBuyer} current
 * @param {{ name: string, pronouns: string, dni: string }} buyer
 * @param {{ remember: boolean, rememberDni: boolean }} choices
 * @returns {SavedBuyer}
 */
export function savedAfterPurchase(current, buyer, { remember, rememberDni }) {
	/** @type {SavedBuyer} */
	const next = { ...current };
	if (remember) {
		next.name = buyer.name;
		next.pronouns = buyer.pronouns;
	} else {
		delete next.name;
		delete next.pronouns;
	}
	if (rememberDni) next.dni = buyer.dni;
	else delete next.dni;
	return cleanSavedBuyer(next);
}

/**
 * Valida lo que se edita en Mi rincón → «Mis datos». Un nombre o pronombres vacíos se sacan;
 * el DNI vacío no cambia (no se muestra en el campo: para sacarlo está «Borrar»).
 *
 * @param {SavedBuyer} current
 * @param {{ name?: unknown, pronouns?: unknown, dni?: unknown }} raw
 * @returns {{ ok: true, saved: SavedBuyer } | { ok: false, errors: Partial<Record<SavedBuyerField, string>> }}
 */
export function editSavedBuyer(current, raw) {
	/** @type {Partial<Record<SavedBuyerField, string>>} */
	const errors = {};
	/** @type {SavedBuyer} */
	const next = {};
	const name = checkName(raw.name, 'Poné tu nombre (entre 2 y 80 letras) o dejalo vacío.');
	if (name.value) {
		if (name.error) errors.name = name.error;
		else next.name = name.value;
	}
	const pronouns = checkPronouns(raw.pronouns, '');
	if (pronouns.value) {
		if (pronouns.error) errors.pronouns = pronouns.error;
		else next.pronouns = pronouns.value;
	}
	const dniText = typeof raw.dni === 'string' ? raw.dni.trim() : '';
	if (dniText) {
		const dni = normalizeDni(dniText);
		if (dni) next.dni = dni;
		else errors.dni = 'Revisá el DNI: tiene que tener entre 7 y 9 números.';
	} else if (current.dni) {
		next.dni = current.dni;
	}
	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, saved: next };
}

/**
 * Lo guardado sin un campo.
 *
 * @param {SavedBuyer} current
 * @param {SavedBuyerField} field
 * @returns {SavedBuyer}
 */
export function withoutSavedField(current, field) {
	const next = { ...current };
	delete next[field];
	return next;
}

/**
 * El DNI tapado salvo los últimos 3 números (como en el control de ingreso): `•••••678`.
 *
 * @param {string | null | undefined} dni
 */
export function maskDni(dni) {
	if (!dni) return '';
	const digits = String(dni).replace(/\D/g, '');
	if (digits.length <= 3) return '•'.repeat(digits.length);
	return '•'.repeat(digits.length - 3) + digits.slice(-3);
}
