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
 * `source`: `fondo` si se deja desde fondo.kinkyvibe.ar (`/propinas?de=fondo`, sin publicación);
 * vacío o `post` si es desde una publicación.
 * @typedef {{ amount: string, custom: string, message: string, category: string, slug: string, source?: string }} TipFormValues
 */

/**
 * Desde dónde se dejó una propina: `post` (el pie de una publicación) o `fondo` (las «donaciones
 * únicas» de fondo.kinkyvibe.ar, que llegan a `/propinas?de=fondo`). Columna `source` (0052).
 * @typedef {'post' | 'fondo'} TipSource
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
/** Destinos que puede tener una propina guardada (los viejos `kinkyvibe` se siguen leyendo). */
export const TIP_DESTINATIONS = Object.freeze(/** @type {const} */ (['kinkyvibe', 'fondo']));
/** El destino de toda propina nueva: el Fondo Kinky Vibe (ya no se elige). */
export const TIP_DESTINATION = /** @type {TipDestination} */ ('fondo');
/** Nombre de cada destino (panel y CSV). */
export const TIP_DESTINATION_LABELS = Object.freeze({
	kinkyvibe: 'Para Kinky Vibe',
	fondo: 'Para el Fondo'
});

/** Los orígenes que puede tener una propina guardada. */
export const TIP_SOURCES = Object.freeze(/** @type {const} */ (['post', 'fondo']));
/** El `?de=` de /propinas para las donaciones únicas de fondo.kinkyvibe.ar. */
export const TIP_SOURCE_FONDO = /** @type {TipSource} */ ('fondo');
/** El sitio del Fondo (el link de vuelta del gracias de una propina desde el Fondo). */
export const FONDO_SITE_URL = 'https://fondo.kinkyvibe.ar';

/** Slug de una publicación (como los nombres de archivo de src/lib/posts). */
export const TIP_SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,150}$/;
/**
 * Dirección de una página de la Kinkipedia: el id de la etiqueta con guiones en vez de espacios
 * (`tagSlug`), que puede llevar tildes y eñes. Sin espacios, `/`, `\`, `?`, `#`, `%` ni
 * caracteres de control; que exista lo controla el servidor (`findTipPost`).
 */
export const TIP_WIKI_SLUG_RE = /^[^\s/\\?#%\p{Cc}]{1,150}$/u;

/**
 * Las clases de publicación que pueden llevar el bloque de propina, con su nombre (panel y CSV),
 * su ruta pública y la forma de su dirección. Sumar una es agregarla acá y enseñarle a
 * `findTipPost` (src/lib/server/propinas/posts.js) a buscarla: la base no tiene una lista fija
 * (migración 0070).
 * @typedef {'material' | 'calendario' | 'wiki'} TipCategory
 * @type {Readonly<Record<TipCategory, { label: string, base: string, slugRe: RegExp }>>}
 */
export const TIP_POST_KINDS = Object.freeze({
	material: { label: 'Material', base: '/material/', slugRe: TIP_SLUG_RE },
	calendario: { label: 'Calendario', base: '/calendario/', slugRe: TIP_SLUG_RE },
	wiki: { label: 'Kinkipedia', base: '/wiki/', slugRe: TIP_WIKI_SLUG_RE }
});
/** Categorías de publicación que pueden tener el bloque de propina. */
export const TIP_CATEGORIES = /** @type {readonly TipCategory[]} */ (
	Object.freeze(Object.keys(TIP_POST_KINDS))
);

/**
 * La publicación de una propina, si `category` y `slug` tienen forma válida; si no, `null`.
 * @param {unknown} category
 * @param {unknown} slug
 * @returns {{ category: TipCategory, slug: string } | null}
 */
export function tipPost(category, slug) {
	if (typeof category !== 'string' || !Object.hasOwn(TIP_POST_KINDS, category)) return null;
	const kind = TIP_POST_KINDS[/** @type {TipCategory} */ (category)];
	if (typeof slug !== 'string' || !kind.slugRe.test(slug)) return null;
	return { category: /** @type {TipCategory} */ (category), slug };
}

/**
 * Ruta pública de la publicación de una propina (siempre de este sitio, nunca otra web). Una
 * categoría que el código ya no conoce va al material, como antes.
 * @param {string} category ver {@link TIP_POST_KINDS}
 * @param {string} slug
 */
export function tipPostPath(category, slug) {
	const kind = Object.hasOwn(TIP_POST_KINDS, category)
		? TIP_POST_KINDS[/** @type {TipCategory} */ (category)]
		: TIP_POST_KINDS.material;
	return `${kind.base}${encodeURIComponent(slug)}`;
}

/**
 * Nombre de la clase de publicación de una propina (panel y CSV); si el código no la conoce, tal
 * cual está guardada.
 * @param {string} category
 */
export function tipCategoryLabel(category) {
	return Object.hasOwn(TIP_POST_KINDS, category)
		? TIP_POST_KINDS[/** @type {TipCategory} */ (category)].label
		: category;
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
 * El `?monto=` con el que llega alguien desde fondo.kinkyvibe.ar, para elegirlo de entrada: solo
 * un entero en pesos (dígitos) dentro del mínimo y el máximo de {@link parseTipAmount}. Si no, `null`
 * (y se ignora). Es solo la elección inicial del formulario: el servidor vuelve a validar el monto
 * que llega en el POST con `validateTip`.
 *
 * @param {string | null | undefined} raw
 * @returns {number | null}
 */
export function presetFromQuery(raw) {
	if (typeof raw !== 'string' || !/^\d{1,7}$/.test(raw)) return null;
	const parsed = parseTipAmount(raw);
	return parsed.ok ? parsed.amount : null;
}

/**
 * Los valores iniciales del selector de monto para un monto pedido: el botón sugerido si coincide
 * con uno, si no «Otro monto» con ese número. Sin monto, nada (queda el sugerido por defecto).
 *
 * @param {number | null} amount
 * @returns {Partial<TipFormValues>}
 */
export function presetValues(amount) {
	if (amount === null) return {};
	if (TIP_PRESETS.includes(amount)) return { amount: String(amount) };
	return { amount: 'otro', custom: String(amount) };
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
 * `destination` (un formulario viejo o armado a mano), se ignora. Con `source = 'fondo'` (desde
 * fondo.kinkyvibe.ar) no hay publicación: `category` y `slug` se ignoran y quedan en `null`.
 *
 * @param {{ amount?: unknown, custom?: unknown, message?: unknown, category?: unknown, slug?: unknown, destination?: unknown, source?: unknown }} input
 * @returns {{ ok: true, amount: number, message: string | null, source: 'post', category: TipCategory, slug: string, destination: TipDestination }
 *   | { ok: true, amount: number, message: string | null, source: 'fondo', category: null, slug: null, destination: TipDestination }
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
	const fromFondo = input.source === TIP_SOURCE_FONDO;
	const post = fromFondo ? null : tipPost(input.category, input.slug);
	if (!fromFondo && !post) errors.post = 'No sabemos desde qué publicación llegaste.';
	if (!amount.ok || !message.ok) return { ok: false, errors };
	if (fromFondo) {
		return {
			ok: true,
			amount: amount.amount,
			message: message.message,
			source: 'fondo',
			category: null,
			slug: null,
			destination: TIP_DESTINATION
		};
	}
	if (!post) return { ok: false, errors };
	return {
		ok: true,
		amount: amount.amount,
		message: message.message,
		source: 'post',
		...post,
		destination: TIP_DESTINATION
	};
}

/** Nombre de cada origen (panel y CSV). */
export const TIP_SOURCE_LABELS = Object.freeze({
	post: 'Publicación',
	fondo: 'Fondo (una vez)'
});

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
