/**
 * Los botones de lo de admins en el bot (decisión 0041): «📊 Estado» y «🔔 Mis avisos». Funciones
 * puras, sin imports, aparte de nav.js: ningún `callback_data` de acá se confunde con uno de
 * nav.js (lo prueba adminBot.test.js), y el router los mira **antes** que los demás para revisar
 * en cada botón que quien toca sea une admin vinculade.
 *
 * | Pantalla                                   | `callback_data` |
 * | ------------------------------------------ | --------------- |
 * | Estado: los próximos eventos (página `p`)  | `ax:<p>`        |
 * | Estado de un evento                        | `ae:<hash>`     |
 * | Mis avisos / prender o apagar uno          | `an` / `an:<k>` |
 *
 * `<hash>` es un hash corto de la dirección del evento (`shortHash` de nav.js), que se busca
 * **entre los próximos eventos con entradas**: un botón armado a mano no muestra nada más. `<k>`
 * es la letra de un tipo de aviso ({@link NOTICE_CODES}).
 */

/** Los tipos de aviso, en el orden de la pantalla, con su letra en los botones. */
export const NOTICE_CODES = Object.freeze({
	d: 'resumen_diario',
	v: 'cada_venta',
	t: 'transferencia',
	e: 'dia_evento',
	r: 'recordatorios'
});

/** @typedef {keyof typeof NOTICE_CODES} NoticeCode */
/** @typedef {(typeof NOTICE_CODES)[NoticeCode]} NoticeKind */

/** Los tipos de aviso, en orden. @type {readonly NoticeKind[]} */
export const NOTICE_KINDS = Object.freeze(Object.values(NOTICE_CODES));

/**
 * @typedef {{ screen: 'admin_events', page: number }
 *   | { screen: 'admin_event', hash: string }
 *   | { screen: 'admin_notices' }
 *   | { screen: 'admin_notice', code: NoticeCode }} AdminNavState
 */

const HASH = /^[0-9a-z]{1,7}$/;
const PAGE = /^\d{1,3}$/;

/** @param {unknown} v @returns {v is NoticeCode} */
const isNoticeCode = (v) =>
	typeof v === 'string' && Object.prototype.hasOwnProperty.call(NOTICE_CODES, v);

/**
 * El `callback_data` de una pantalla de admins (siempre corto: entra en los 64 bytes).
 *
 * @param {AdminNavState} state
 * @returns {string}
 */
export function encodeAdminNav(state) {
	switch (state.screen) {
		case 'admin_events':
			return `ax:${Math.min(999, Math.max(0, Math.floor(state.page) || 0))}`;
		case 'admin_event':
			return `ae:${state.hash}`;
		case 'admin_notice':
			return `an:${state.code}`;
		default:
			return 'an';
	}
}

/**
 * Lee un `callback_data` de admins. `null` si no es uno de estos (o está roto).
 *
 * @param {unknown} data
 * @returns {AdminNavState | null}
 */
export function decodeAdminNav(data) {
	if (typeof data !== 'string' || data.length > 16) return null;
	if (data === 'an') return { screen: 'admin_notices' };
	const parts = data.split(':');
	if (parts.length !== 2) return null;
	const [kind, value] = parts;
	if (kind === 'ax' && PAGE.test(value)) return { screen: 'admin_events', page: Number(value) };
	if (kind === 'ae' && HASH.test(value)) return { screen: 'admin_event', hash: value };
	if (kind === 'an' && isNoticeCode(value)) return { screen: 'admin_notice', code: value };
	return null;
}
