/**
 * Campos de los tipos de objeto: una validación chica y declarativa, sin dependencias.
 *
 * Los tipos núcleo (./types/) declaran sus campos con estas clases (`kind`). Son las mismas que
 * van a poder usar los campos extra del panel más adelante (texto, número, fecha, opción, link),
 * así que se mantienen simples: nada de dinero ni lógica acá.
 *
 * Solo usa imports relativos (lo usa el cron nocturno, que no pasa por Vite).
 */

/**
 * @typedef {'text' | 'longtext' | 'integer' | 'number' | 'boolean' | 'datetime' | 'date' | 'url' | 'option' | 'list'} FieldKind
 */

/**
 * @typedef {object} FieldDef
 * @prop {FieldKind} kind
 * @prop {string} label nombre para mostrar (castellano)
 * @prop {boolean} [required]
 * @prop {number} [max] largo máximo (texto) o valor máximo (números)
 * @prop {number} [min] valor mínimo (números)
 * @prop {readonly string[]} [options] valores posibles ('option' y cada ítem de 'list')
 */

/** @typedef {{ path: string, message: string }} FieldError */

/**
 * @typedef {{ ok: true, data: Record<string, unknown> } | { ok: false, errors: FieldError[] }} ValidationResult
 */

/** Largo máximo por defecto de 'text' y 'longtext'. */
export const TEXT_MAX = 300;
export const LONGTEXT_MAX = 100_000;

/** Fecha y hora con zona horaria explícita: 2026-10-02T20:00-03:00 (como los .md de hoy). */
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normaliza y valida un valor. Devuelve `undefined` si está vacío.
 *
 * @param {FieldDef} def
 * @param {unknown} value
 * @returns {{ value?: unknown, error?: string }}
 */
function checkValue(def, value) {
	if (value === undefined || value === null || value === '') return {};
	switch (def.kind) {
		case 'text':
		case 'longtext': {
			if (typeof value !== 'string') return { error: 'tiene que ser texto' };
			const text = def.kind === 'text' ? value.trim() : value.replace(/\r\n?/g, '\n');
			if (!text.trim()) return {};
			const max = def.max ?? (def.kind === 'text' ? TEXT_MAX : LONGTEXT_MAX);
			if (text.length > max) return { error: `es demasiado largo (máximo ${max} caracteres)` };
			if (def.kind === 'text' && /[\n\r]/.test(text)) return { error: 'tiene que ser una línea' };
			return { value: text };
		}
		case 'integer':
		case 'number': {
			const n = typeof value === 'string' && value.trim() ? Number(value) : value;
			if (typeof n !== 'number' || !Number.isFinite(n)) return { error: 'tiene que ser un número' };
			if (def.kind === 'integer' && !Number.isSafeInteger(n)) {
				return { error: 'tiene que ser un número entero' };
			}
			if (def.min !== undefined && n < def.min)
				return { error: `tiene que ser al menos ${def.min}` };
			if (def.max !== undefined && n > def.max)
				return { error: `tiene que ser como mucho ${def.max}` };
			return { value: n };
		}
		case 'boolean':
			if (typeof value !== 'boolean') return { error: 'tiene que ser sí o no' };
			return { value };
		case 'datetime': {
			if (typeof value !== 'string' || !DATETIME.test(value.trim())) {
				return { error: 'tiene que ser fecha y hora con zona, por ejemplo 2026-10-02T20:00-03:00' };
			}
			if (Number.isNaN(Date.parse(value.trim()))) return { error: 'no es una fecha válida' };
			return { value: value.trim() };
		}
		case 'date': {
			if (typeof value !== 'string' || !DATE.test(value.trim())) {
				return { error: 'tiene que ser una fecha, por ejemplo 2026-10-02' };
			}
			const d = new Date(`${value.trim()}T00:00:00Z`);
			if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value.trim()) {
				return { error: 'no es una fecha válida' };
			}
			return { value: value.trim() };
		}
		case 'url': {
			if (typeof value !== 'string') return { error: 'tiene que ser un link' };
			let url;
			try {
				url = new URL(value.trim());
			} catch {
				return { error: 'no es un link válido (tiene que empezar con https://)' };
			}
			if (url.protocol !== 'https:' && url.protocol !== 'http:') {
				return { error: 'tiene que ser un link web (https://)' };
			}
			if (value.trim().length > (def.max ?? 2000)) return { error: 'es demasiado largo' };
			return { value: value.trim() };
		}
		case 'option': {
			if (typeof value !== 'string' || !def.options?.includes(value)) {
				return { error: `tiene que ser una de: ${(def.options ?? []).join(', ')}` };
			}
			return { value };
		}
		case 'list': {
			if (!Array.isArray(value)) return { error: 'tiene que ser una lista' };
			/** @type {string[]} */
			const out = [];
			for (const item of value) {
				if (typeof item !== 'string') return { error: 'cada ítem tiene que ser texto' };
				const text = item.trim();
				if (!text) continue;
				if (def.options && !def.options.includes(text)) {
					return { error: `«${text}» no es una opción válida` };
				}
				if (text.length > TEXT_MAX) return { error: 'un ítem es demasiado largo' };
				if (!out.includes(text)) out.push(text);
			}
			if (def.max !== undefined && out.length > def.max) {
				return { error: `tiene como mucho ${def.max} ítems` };
			}
			return out.length ? { value: out } : {};
		}
		default:
			return { error: `clase de campo desconocida: ${/** @type {any} */ (def).kind}` };
	}
}

/**
 * Valida `data` contra los campos de un tipo. Estricto: una clave que el tipo no declara es un
 * error (así un campo que se deja de usar en código aparece en el chequeo de integridad en vez de
 * quedar escondido). Los vacíos se sacan.
 *
 * @param {Record<string, FieldDef>} fields
 * @param {unknown} data
 * @returns {ValidationResult}
 */
export function validateFields(fields, data) {
	if (data === undefined || data === null) data = {};
	if (typeof data !== 'object' || Array.isArray(data)) {
		return { ok: false, errors: [{ path: '', message: 'los datos tienen que ser un objeto' }] };
	}
	/** @type {FieldError[]} */
	const errors = [];
	/** @type {Record<string, unknown>} */
	const out = {};
	const input = /** @type {Record<string, unknown>} */ (data);
	for (const key of Object.keys(input)) {
		if (!Object.hasOwn(fields, key))
			errors.push({ path: key, message: 'no es un campo de este tipo' });
	}
	for (const [key, def] of Object.entries(fields)) {
		const { value, error } = checkValue(def, input[key]);
		if (error) errors.push({ path: key, message: `${def.label}: ${error}` });
		else if (value === undefined) {
			if (def.required) errors.push({ path: key, message: `${def.label}: falta completarlo` });
		} else out[key] = value;
	}
	return errors.length ? { ok: false, errors } : { ok: true, data: out };
}
