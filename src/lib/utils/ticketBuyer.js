/**
 * Validación de los datos de una compra de entradas: quien compra y cada entrada. Vive acá (y no
 * en $lib/server) porque la usan las dos puntas con las mismas reglas: el servidor al comprar
 * (`validatePurchase` en $lib/server/tickets/config.js, que las re-exporta) y la página de compra,
 * para no dejar avanzar del paso «Tus datos» con algo que el servidor va a rechazar.
 */
import { normalizeDni } from './tickets.js';

/** @typedef {{ name: string, pronouns: string }} Holder */
/** @typedef {{ name: string, pronouns: string, email: string, dni: string }} Buyer */

/**
 * Texto de una línea: sin caracteres de control ni de dirección (bidi, ancho cero), espacios
 * colapsados.
 * @param {unknown} raw
 */
export function cleanText(raw) {
	return typeof raw === 'string'
		? raw
				// eslint-disable-next-line no-control-regex -- se sacan a propósito
				.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ')
				.trim()
				.replace(/\s+/g, ' ')
		: '';
}

/**
 * Los nombres van en mails y en el admin: sin links ni etiquetas.
 * @param {string} text
 */
const looksLikeLink = (text) =>
	/https?:|www\.|[<>]|\b[a-z0-9-]+\.(com|net|org|ar|io|ly|me|xyz)\b/i.test(text);

/**
 * Nombre de una persona: 2 a 80 letras, sin links. `error` con `emptyMessage` si no sirve.
 * La usan quien compra, cada entrada y los datos guardados de la cuenta (Mi rincón).
 *
 * @param {unknown} raw
 * @param {string} emptyMessage
 * @returns {{ value: string, error: string | null }}
 */
export function checkName(raw, emptyMessage) {
	const value = cleanText(raw);
	if (value.length < 2 || value.length > 80) return { value, error: emptyMessage };
	if (looksLikeLink(value)) return { value, error: 'El nombre no puede tener links.' };
	return { value, error: null };
}

/**
 * Pronombres: obligatorios, hasta 40 letras (texto libre). `error` con `emptyMessage` si faltan.
 *
 * @param {unknown} raw
 * @param {string} emptyMessage
 * @returns {{ value: string, error: string | null }}
 */
export function checkPronouns(raw, emptyMessage) {
	const value = cleanText(raw);
	if (!value) return { value, error: emptyMessage };
	if (value.length > 40) return { value, error: 'Hasta 40 letras.' };
	return { value, error: null };
}

/**
 * Valida los datos de una persona (una entrada): son para el evento.
 *
 * - nombre: como se conoce a la persona (no hace falta que sea el del documento), 2 a 80 letras;
 * - pronombres: obligatorios, hasta 40 letras (texto libre: "ella", "elle / él", "cualquiera"…).
 *
 * @param {{ name?: unknown, pronouns?: unknown }} raw
 * @returns {{ ok: true, holder: Holder } | { ok: false, errors: { name?: string, pronouns?: string } }}
 */
export function validateHolder(raw) {
	/** @type {{ name?: string, pronouns?: string }} */
	const errors = {};
	const name = checkName(raw.name, 'Poné un nombre (entre 2 y 80 letras).');
	if (name.error) errors.name = name.error;
	const pronouns = checkPronouns(raw.pronouns, 'Poné los pronombres de esta persona.');
	if (pronouns.error) errors.pronouns = pronouns.error;
	if (Object.keys(errors).length) return { ok: false, errors };
	return { ok: true, holder: { name: name.value, pronouns: pronouns.value } };
}

/**
 * Valida los datos de quien compra (uno por compra): nombre, pronombres (obligatorios, como en
 * cada entrada), email y DNI (7 a 9 dígitos, se aceptan puntos; se guarda solo con dígitos).
 *
 * @param {{ name?: unknown, pronouns?: unknown, email?: unknown, dni?: unknown }} raw
 * @returns {{ ok: true, buyer: Buyer } | { ok: false, errors: { name?: string, pronouns?: string, email?: string, dni?: string } }}
 */
export function validateBuyer(raw) {
	/** @type {{ name?: string, pronouns?: string, email?: string, dni?: string }} */
	const errors = {};
	const name = checkName(raw.name, 'Poné tu nombre (entre 2 y 80 letras).');
	if (name.error) errors.name = name.error;
	const pronouns = checkPronouns(raw.pronouns, 'Poné tus pronombres.');
	if (pronouns.error) errors.pronouns = pronouns.error;
	const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
	if (email.length > 254 || !/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/.test(email)) {
		errors.email = 'Revisá el email: ahí te mandamos las entradas.';
	}
	const dni = normalizeDni(raw.dni);
	if (!dni) errors.dni = 'Revisá el DNI: tiene que tener entre 7 y 9 números.';
	if (Object.keys(errors).length || !dni) return { ok: false, errors };
	return { ok: true, buyer: { name: name.value, pronouns: pronouns.value, email, dni } };
}

/**
 * Valida los datos de cada entrada de una compra de `quantity`. Si el nombre o los pronombres de
 * la entrada 1 vienen vacíos se usan los de quien compra (así funciona también sin JavaScript).
 * Los errores van con el `name` del campo del formulario: `holder_<campo>_<n>` (n desde 0).
 *
 * @param {{ name?: unknown, pronouns?: unknown }} buyer
 * @param {readonly ({ name?: unknown, pronouns?: unknown } | undefined)[]} holders
 * @param {number} quantity
 * @returns {{ holders: Holder[], errors: Record<string, string> }}
 */
export function validateHolders(buyer, holders, quantity) {
	/** @type {Holder[]} */
	const valid = [];
	/** @type {Record<string, string>} */
	const errors = {};
	for (let i = 0; i < quantity; i++) {
		const raw = holders[i] ?? {};
		const name = i === 0 && !cleanText(raw.name) ? buyer.name : raw.name;
		const pronouns = i === 0 && !cleanText(raw.pronouns) ? buyer.pronouns : raw.pronouns;
		const r = validateHolder({ name, pronouns });
		if (r.ok) valid.push(r.holder);
		else for (const [k, v] of Object.entries(r.errors)) errors[`holder_${k}_${i}`] = v;
	}
	return { holders: valid, errors };
}
