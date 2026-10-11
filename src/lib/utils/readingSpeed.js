/**
 * La velocidad de lectura de cada persona (pedido de gorrite, PR #274): con ella se recalcula todo
 * «X min de lectura» del sitio (src/lib/components/ReadingTime.svelte).
 *
 * - Sin cuenta: queda en el navegador (localStorage). Si el navegador no deja guardar o leer
 *   (modo privado, bloqueado), se usa la de siempre y la página no se rompe.
 * - Con cuenta: además se guarda en la cuenta (`accounts.preferences.readingSpeed`), así vale en
 *   todos los dispositivos. Al entrar, lo de la cuenta gana sobre lo del navegador.
 *
 * `null` = no eligió ninguna: la de siempre (`WORDS_PER_MINUTE`). Elegir «Predeterminado» vuelve a `null`.
 */
import { writable } from 'svelte/store';
import { WORDS_PER_MINUTE, parseReadingSpeed } from './readingTime.js';

/** La clave en localStorage. */
export const READING_SPEED_KEY = 'kv-velocidad-de-lectura';

/** Dónde se guarda en la cuenta (POST con `{ wpm }`; ver su +server.js). */
export const READING_SPEED_ENDPOINT = '/mi-rincon/velocidad-de-lectura';

/** La velocidad elegida en este navegador (`null`: la de siempre). */
export const readingSpeed = writable(/** @type {number | null} */ (null));

/** @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} SpeedStorage */

/** localStorage, o `undefined` si no existe o el navegador no deja tocarlo. */
function defaultStorage() {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

/**
 * La velocidad guardada en el navegador, o `null` (nada guardado, o no se puede leer).
 * @param {SpeedStorage | undefined} [storage]
 * @returns {number | null}
 */
export function loadLocalSpeed(storage = defaultStorage()) {
	try {
		return parseReadingSpeed(storage?.getItem(READING_SPEED_KEY) ?? null);
	} catch {
		return null;
	}
}

/**
 * Guarda (o borra, con `null`) la velocidad en el navegador. `false` si no se pudo.
 * @param {number | null} wpm
 * @param {SpeedStorage | undefined} [storage]
 */
export function saveLocalSpeed(wpm, storage = defaultStorage()) {
	try {
		if (!storage) return false;
		if (wpm === null) storage.removeItem(READING_SPEED_KEY);
		else storage.setItem(READING_SPEED_KEY, String(wpm));
		return true;
	} catch {
		return false;
	}
}

/**
 * Lo que vale al cargar el sitio: lo de la cuenta si eligió algo (y queda también en el
 * navegador), si no lo del navegador.
 * @param {unknown} accountSpeed la de la cuenta (`null` sin cuenta o sin elegir)
 * @param {SpeedStorage | undefined} [storage]
 * @returns {number | null}
 */
export function initReadingSpeed(accountSpeed, storage = defaultStorage()) {
	const fromAccount = parseReadingSpeed(accountSpeed);
	const value = fromAccount ?? loadLocalSpeed(storage);
	if (fromAccount !== null) saveLocalSpeed(fromAccount, storage);
	readingSpeed.set(value);
	return value;
}

/**
 * Lo de la cuenta cambió (al entrar, salir o guardar en Mi rincón). Si la misma cuenta pasó de
 * tener una velocidad a no tener ninguna, la sacó («Predeterminado»): se saca también del navegador. Si
 * no, como al cargar ({@link initReadingSpeed}): al salir queda la del navegador.
 * @param {{ previous: unknown, next: unknown, sameMember: boolean }} change
 * @param {SpeedStorage | undefined} [storage]
 * @returns {number | null}
 */
export function applyAccountSpeedChange(
	{ previous, next, sameMember },
	storage = defaultStorage()
) {
	if (sameMember && parseReadingSpeed(previous) !== null && parseReadingSpeed(next) === null) {
		saveLocalSpeed(null, storage);
		readingSpeed.set(null);
		return null;
	}
	return initReadingSpeed(next, storage);
}

/**
 * La persona elige una velocidad (o `null`, la de siempre): se aplica ya en toda la página, se
 * guarda en el navegador y, con cuenta, en la cuenta. Un error al guardar en la cuenta no deshace
 * la elección: en este navegador ya quedó.
 * @param {unknown} wpm
 * @param {{ member?: boolean, fetch?: typeof fetch, storage?: SpeedStorage }} [opts]
 * @returns {Promise<number | null>}
 */
export async function chooseReadingSpeed(wpm, opts = {}) {
	const parsed = parseReadingSpeed(wpm);
	const value = parsed === WORDS_PER_MINUTE ? null : parsed;
	readingSpeed.set(value);
	saveLocalSpeed(value, 'storage' in opts ? opts.storage : defaultStorage());
	if (opts.member) {
		try {
			await (opts.fetch ?? fetch)(READING_SPEED_ENDPOINT, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ wpm: value })
			});
		} catch {
			// Sin conexión o error: queda en este navegador.
		}
	}
	return value;
}
