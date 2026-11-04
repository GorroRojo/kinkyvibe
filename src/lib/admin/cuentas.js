/**
 * Textos compartidos de Cuentas (/admin/comunidad/cuentas) y de Comunidad › Perfiles (/admin/comunidad/perfiles).
 */

/** @type {Record<string, string>} */
export const VISIBILITY_LABELS = {
	public: 'Público',
	members: 'Solo con cuenta',
	hidden: 'Oculto'
};

/**
 * Quién creó o editó un objeto, para mostrar: une admin (login de GitHub), una cuenta
 * (`cuenta:<id>`) o una cuenta borrada.
 * @param {string} actor
 */
export function actorLabel(actor) {
	if (actor === 'cuenta:borrada') return 'una cuenta borrada';
	if (actor.startsWith('cuenta:')) return 'una cuenta';
	return actor ? `@${actor}` : '—';
}

/**
 * Orden de la lista de Cuentas, en la URL (`?orden=mail-asc`): se ordena en el servidor, porque
 * con 500 cuentas o más no llegan todas a la página. Solo estas columnas (las claves son las de
 * la tabla); cualquier otro valor da el orden de siempre, la más nueva primero.
 * @type {Readonly<Record<string, string>>}
 */
export const ACCOUNT_SORT_PARAM = Object.freeze({
	email: 'mail',
	createdAt: 'creada',
	profiles: 'perfiles'
});

/** @typedef {{ key: 'email' | 'createdAt' | 'profiles', dir: 'asc' | 'desc' }} AccountSort */

/** @type {Readonly<AccountSort>} */
export const DEFAULT_ACCOUNT_SORT = Object.freeze({ key: 'createdAt', dir: 'desc' });

/**
 * El orden que pide `?orden=` (el de siempre si falta o no es uno de la lista).
 * @param {string | null | undefined} value
 * @returns {AccountSort}
 */
export function parseAccountSort(value) {
	const m = /^([a-z]+)-(asc|desc)$/.exec(String(value ?? ''));
	const key = m && Object.keys(ACCOUNT_SORT_PARAM).find((k) => ACCOUNT_SORT_PARAM[k] === m[1]);
	if (!m || !key) return { ...DEFAULT_ACCOUNT_SORT };
	return /** @type {AccountSort} */ ({ key, dir: m[2] });
}

/**
 * El valor de `?orden=` para un orden; '' para el de siempre (así la URL queda limpia).
 * @param {{ key: string, dir: 'asc' | 'desc' }} sort
 */
export function accountSortParam(sort) {
	const name = ACCOUNT_SORT_PARAM[sort.key];
	if (!name) return '';
	if (sort.key === DEFAULT_ACCOUNT_SORT.key && sort.dir === DEFAULT_ACCOUNT_SORT.dir) return '';
	return `${name}-${sort.dir}`;
}
