/**
 * Que los atajos de teclado del panel se vean (decisión de gorrite, «atajos visibles»):
 *
 * - Pistas «g e» al lado de cada sección del menú lateral (`NavShortcut.svelte`), solo en una
 *   compu con mouse y pantalla ancha ({@link HINTS_MEDIA}; el CSS repite la misma consulta).
 * - {@link goPending}: `true` mientras se espera la segunda tecla de un `g x` (lo maneja el
 *   teclado de `SearchBox.svelte`); las pistas se encienden.
 * - Aviso de una sola vez «¿Sabías que hay atajos?» (`ShortcutTip.svelte`), recordado en
 *   localStorage con una versión: si cambian los atajos, subir {@link SHORTCUT_TIP_VERSION} lo
 *   vuelve a mostrar.
 *
 * Sin dependencias del navegador al importar: se testea en Node.
 */
import { writable } from 'svelte/store';

/** Compu con mouse (o trackpad) y pantalla ancha. Nunca celu ni tablet. */
export const HINTS_MEDIA = '(hover: hover) and (pointer: fine) and (min-width: 1100px)';

/** `true` mientras `g` espera su segunda tecla. */
export const goPending = writable(false);

/** Clave de localStorage del aviso de atajos. */
export const SHORTCUT_TIP_KEY = 'kv-panel-tip-atajos';
/** Subirla cuando cambian los atajos, así el aviso vuelve a aparecer. */
export const SHORTCUT_TIP_VERSION = 1;

/**
 * El localStorage del navegador, o `null` (servidor, modo privado, storage bloqueado).
 * @returns {Pick<Storage, 'getItem' | 'setItem'> | null}
 */
function defaultStorage() {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/**
 * Si el aviso de atajos ya se cerró (en esta versión). Sin storage, cuenta como cerrado: mejor
 * no mostrarlo en cada página que no poder cerrarlo nunca.
 * @param {Pick<Storage, 'getItem'> | null} [storage]
 */
export function tipDismissed(storage = defaultStorage()) {
	if (!storage) return true;
	try {
		return Number(storage.getItem(SHORTCUT_TIP_KEY)) >= SHORTCUT_TIP_VERSION;
	} catch {
		return true;
	}
}

/**
 * Recuerda que se cerró el aviso (en esta versión). Si no hay storage, no pasa nada.
 * @param {Pick<Storage, 'setItem'> | null} [storage]
 */
export function dismissTip(storage = defaultStorage()) {
	try {
		storage?.setItem(SHORTCUT_TIP_KEY, String(SHORTCUT_TIP_VERSION));
	} catch {
		// Storage lleno o bloqueado: el aviso se cierra igual en esta página.
	}
}

/**
 * Si este dispositivo muestra pistas y el aviso (compu con mouse y pantalla ancha).
 * @param {((q: string) => { matches: boolean }) | undefined} [match] `window.matchMedia`
 */
export function hintsDevice(
	match = typeof matchMedia === 'function' ? (/** @type {string} */ q) => matchMedia(q) : undefined
) {
	try {
		return Boolean(match?.(HINTS_MEDIA).matches);
	} catch {
		return false;
	}
}

/**
 * Si es una Mac (para mostrar «⌘ K» en vez de «Ctrl K»).
 * @param {{ platform?: string, userAgent?: string } | undefined} [nav] `navigator`
 */
export function isMac(nav = typeof navigator === 'undefined' ? undefined : navigator) {
	return /Mac|iPhone|iPad/.test(nav?.platform || nav?.userAgent || '');
}
