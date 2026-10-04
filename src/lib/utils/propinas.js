/**
 * Propinas al pie de las publicaciones (docs/propinas.md): montos y validación. Lo usan el
 * formulario (navegador) y el servidor, que es el que decide: el navegador solo manda un número.
 */
import { formatARS } from './money.js';
import { parseAmount } from './tickets.js';
// La etiqueta de KinkyVibe (igual que KINKYVIBE_TAG de ticketsEditor.js, que no se importa acá
// para no sumarle el parser de YAML a las páginas públicas; un test controla que coincidan).
export const KINKYVIBE_TAG = 'KinkyVibe';

/**
 * Lo que manda el formulario de propina (todo texto; ver `validateTip`).
 * @typedef {{ amount: string, custom: string, message: string, category: string, slug: string }} TipFormValues
 */

/**
 * A dónde va una propina, como quedó guardada (la plata entra igual a la cuenta de MP de las
 * entradas, solo cambia cómo se cuenta en el panel). `fondo` suma a los aportes al Fondo
 * KinkyVibe, como el aporte de una entrada solidaria. Desde octubre de 2026 **todas** las
 * propinas nuevas van al Fondo (decisión de gorrite): ya no se elige. `kinkyvibe` queda solo en
 * propinas viejas, que se siguen leyendo y mostrando como están.
 * @typedef {'kinkyvibe' | 'fondo'} TipDestination
 */

/** Montos sugeridos (botones), en pesos. */
export const TIP_PRESETS = Object.freeze([1000, 2000, 5000]);
/** Monto mínimo de "otro monto". */
export const TIP_MIN = 500;
/** Monto máximo de "otro monto". */
export const TIP_MAX = 500_000;
/** Largo máximo del mensaje opcional (solo lo ven les admins). */
export const TIP_MESSAGE_MAX = 280;
/** Categorías de publicación que pueden tener el bloque de propina. */
export const TIP_CATEGORIES = Object.freeze(['material', 'calendario']);
/** Destinos que puede tener una propina guardada (los viejos `kinkyvibe` se siguen leyendo). */
export const TIP_DESTINATIONS = Object.freeze(/** @type {const} */ (['kinkyvibe', 'fondo']));
/** El destino de toda propina nueva: el Fondo KinkyVibe (ya no se elige). */
export const TIP_DESTINATION = /** @type {TipDestination} */ ('fondo');
/** Nombre de cada destino (panel y CSV). */
export const TIP_DESTINATION_LABELS = Object.freeze({
	kinkyvibe: 'Para KinkyVibe',
	fondo: 'Para el Fondo'
});

/** Slug de una publicación (como los nombres de archivo de src/lib/posts). */
export const TIP_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,150}$/;

/**
 * La publicación de una propina, si `category` y `slug` tienen forma válida; si no, `null`.
 * @param {unknown} category
 * @param {unknown} slug
 * @returns {{ category: 'material' | 'calendario', slug: string } | null}
 */
export function tipPost(category, slug) {
	if (typeof category !== 'string' || !TIP_CATEGORIES.includes(category)) return null;
	if (typeof slug !== 'string' || !TIP_SLUG_RE.test(slug)) return null;
	return { category: /** @type {'material' | 'calendario'} */ (category), slug };
}

/**
 * Ruta pública de la publicación de una propina (siempre de este sitio, nunca otra web).
 * @param {string} category 'material' o 'calendario'
 * @param {string} slug
 */
export function tipPostPath(category, slug) {
	return `/${category === 'calendario' ? 'calendario' : 'material'}/${encodeURIComponent(slug)}`;
}

/**
 * ¿La publicación lleva el bloque de apoyo al pie (propina o cafecito)? Las de KinkyVibe.
 * @param {{ tags?: unknown } | null | undefined} meta metadatos ya procesados de la publicación
 */
export function isKinkyVibePost(meta) {
	return Array.isArray(meta?.tags) && meta.tags.includes(KINKYVIBE_TAG);
}

/**
 * Si un evento muestra el bloque de propina: solo los de KinkyVibe totalmente gratis (etiqueta
 * «gratis», sin «pago» ni «a la gorra»). En los pagos o a la gorra ya hubo con qué aportar
 * (decisión de gorrite, 2/10). El material sigue con {@link isKinkyVibePost}.
 *
 * @param {{ tags?: unknown } | null | undefined} meta
 */
export function showEventTip(meta) {
	if (!isKinkyVibePost(meta)) return false;
	const tags = /** @type {string[]} */ (meta?.tags);
	return tags.includes('gratis') && !tags.includes('pago') && !tags.includes('a la gorra');
}

/**
 * Monto de una propina: entero en pesos entre {@link TIP_MIN} y {@link TIP_MAX}. Acepta "2000",
 * "2.000" y "$ 2.000".
 *
 * @param {unknown} raw
 * @returns {{ ok: true, amount: number } | { ok: false, error: string }}
 */
export function parseTipAmount(raw) {
	const amount = parseAmount(typeof raw === 'number' ? raw : String(raw ?? ''));
	if (amount === null || amount === 0) return { ok: false, error: 'Escribí un monto en pesos.' };
	if (amount < TIP_MIN) return { ok: false, error: `El mínimo es ${formatARS(TIP_MIN)}.` };
	if (amount > TIP_MAX) return { ok: false, error: `El máximo es ${formatARS(TIP_MAX)}.` };
	return { ok: true, amount };
}

/**
 * Mensaje opcional: sin espacios de más; vacío = `null`.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, message: string | null } | { ok: false, error: string }}
 */
export function parseTipMessage(raw) {
	const message = String(raw ?? '')
		// Sin caracteres de control (salvo saltos de línea).
		.replace(/\r\n?/g, '\n')
		.replace(/(?!\n)\p{Cc}/gu, '')
		.trim();
	if (!message) return { ok: true, message: null };
	if ([...message].length > TIP_MESSAGE_MAX) {
		return { ok: false, error: `El mensaje puede tener hasta ${TIP_MESSAGE_MAX} caracteres.` };
	}
	return { ok: true, message };
}

/**
 * Valida todo lo que manda el formulario. El monto sale de `amount` (un botón sugerido) o, si es
 * `otro`, de `custom`. El destino siempre es el Fondo ({@link TIP_DESTINATION}): si llega un
 * `destination` (un formulario viejo o armado a mano), se ignora.
 *
 * @param {{ amount?: unknown, custom?: unknown, message?: unknown, category?: unknown, slug?: unknown, destination?: unknown }} input
 * @returns {{ ok: true, amount: number, message: string | null, category: 'material' | 'calendario', slug: string, destination: TipDestination }
 *   | { ok: false, errors: Record<string, string> }}
 */
export function validateTip(input) {
	/** @type {Record<string, string>} */
	const errors = {};
	const choice = String(input.amount ?? '').trim();
	const amount = parseTipAmount(choice === 'otro' ? input.custom : choice);
	if (!amount.ok) errors.amount = choice ? amount.error : 'Elegí un monto.';
	const message = parseTipMessage(input.message);
	if (!message.ok) errors.message = message.error;
	const post = tipPost(input.category, input.slug);
	if (!post) errors.post = 'No sabemos desde qué publicación llegaste.';
	if (!amount.ok || !message.ok || !post) return { ok: false, errors };
	return {
		ok: true,
		amount: amount.amount,
		message: message.message,
		...post,
		destination: TIP_DESTINATION
	};
}

/** Nombre de cada estado de una propina (panel y CSV). */
export const TIP_STATUS_LABELS = Object.freeze({
	pending: 'Pendiente',
	approved: 'Aprobada',
	rejected: 'Rechazada',
	refunded: 'Reembolsada'
});

const monthFmt = new Intl.DateTimeFormat('es-AR', {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

/**
 * "2026-10" → "octubre de 2026" (los meses de la lista del panel). Si no tiene esa forma, igual.
 * @param {string} month
 */
export function monthLabel(month) {
	const m = /^(\d{4})-(\d{2})$/.exec(month);
	if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return month;
	return monthFmt.format(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}
