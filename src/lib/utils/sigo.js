/**
 * «Lo que sigo» (decisión 0025, docs/lo-que-sigo.md): lo puro, sin base ni SvelteKit. Qué se
 * puede seguir, cómo se nombra cada cosa en un formulario, qué opciones tiene cada una y el CSV
 * de la lista. Las lecturas y escrituras están en $lib/server/sigo/.
 */

/** Las clases de cosas que se pueden seguir (`follows.target_kind`). */
export const FOLLOW_KINDS = /** @type {const} */ (['etiqueta', 'perfil']);

/** @typedef {typeof FOLLOW_KINDS[number]} FollowKind */
/** @typedef {{ kind: FollowKind, key: string }} FollowTarget */

/**
 * Las opciones de cada cosa seguida: nombre en el formulario → columna de `follows`.
 * El orden es el de la página.
 */
export const FOLLOW_OPTIONS = Object.freeze(
	/** @type {const} */ ([
		{ name: 'calendario', column: 'in_calendar', label: 'En mi calendario' },
		{ name: 'mail_nuevo', column: 'mail_new', label: 'Mail cuando se anuncia algo nuevo' },
		{ name: 'recordatorio', column: 'mail_reminder', label: 'Recordatorio el día antes' }
	])
);

/** @typedef {{ calendario: boolean, mail_nuevo: boolean, recordatorio: boolean }} FollowOptions */

/**
 * Lo que queda prendido al tocar «Seguir» (Decidido por Claude, a confirmar con gorrite): sus
 * eventos en el calendario y un mail cuando se anuncia algo nuevo; el recordatorio, apagado.
 *
 * @type {Readonly<FollowOptions>}
 */
export const DEFAULT_FOLLOW_OPTIONS = Object.freeze({
	calendario: true,
	mail_nuevo: true,
	recordatorio: false
});

/** Largo máximo de la clave (como el CHECK de la migración 0032). */
export const MAX_KEY_LENGTH = 100;

/** Cuántas cosas puede seguir una cuenta, como mucho. */
export const MAX_FOLLOWS = 300;

/**
 * Lo que se sigue, leído de un formulario o de la URL (`tipo` y `clave`), o `null` si no vale.
 * La etiqueta va por su nombre (sin espacios en las puntas); el perfil, por el id del objeto.
 *
 * @param {unknown} kind
 * @param {unknown} key
 * @returns {FollowTarget | null}
 */
export function parseTarget(kind, key) {
	if (typeof kind !== 'string' || typeof key !== 'string') return null;
	if (!(/** @type {readonly string[]} */ (FOLLOW_KINDS).includes(kind))) return null;
	const k = key.trim();
	if (!k || k.length > MAX_KEY_LENGTH || /[\r\n]/.test(k)) return null;
	if (kind === 'perfil' && !/^[1-9][0-9]{0,15}$/.test(k)) return null;
	return { kind: /** @type {FollowKind} */ (kind), key: k };
}

/**
 * Las opciones de un formulario con una casilla por opción (marcada = prendida).
 *
 * @param {{ get(name: string): unknown }} form FormData o URLSearchParams
 * @returns {FollowOptions}
 */
export function optionsFromForm(form) {
	const on = (/** @type {string} */ name) => {
		const v = form.get(name);
		return v === 'on' || v === '1' || v === 'true';
	};
	return {
		calendario: on('calendario'),
		mail_nuevo: on('mail_nuevo'),
		recordatorio: on('recordatorio')
	};
}

/**
 * Las opciones de una fila de `follows`.
 *
 * @param {Record<string, unknown>} row
 * @returns {FollowOptions}
 */
export function optionsFromRow(row) {
	return {
		calendario: Number(row.in_calendar) === 1,
		mail_nuevo: Number(row.mail_new) === 1,
		recordatorio: Number(row.mail_reminder) === 1
	};
}

/** @param {FollowOptions} o ¿Pide algún mail? */
export const wantsMail = (o) => o.mail_nuevo || o.recordatorio;

/**
 * Qué es cada cosa seguida, para mostrar.
 *
 * @param {FollowKind} kind
 * @param {string | null} [profileKind] `persona`, `proyecto` o `lugar` (de un perfil)
 */
export function followKindLabel(kind, profileKind = null) {
	if (kind === 'etiqueta') return 'Etiqueta';
	if (profileKind === 'lugar') return 'Lugar';
	if (profileKind === 'proyecto') return 'Proyecto';
	return 'Perfil';
}

/**
 * @typedef {{ kind: FollowKind, key: string, title: string, href: string | null,
 *   label: string, available: boolean, options: FollowOptions, createdAt: number }} FollowView
 */

/**
 * Ordena la lista de Mi rincón: primero lo que sigue disponible, por clase y nombre.
 *
 * @param {readonly FollowView[]} items
 */
export function sortFollows(items) {
	return [...items].sort(
		(a, b) =>
			Number(b.available) - Number(a.available) ||
			a.label.localeCompare(b.label, 'es') ||
			a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
	);
}

/**
 * Las columnas del CSV de «Lo que sigo» (para `toCsv` de $lib/admin/csv.js).
 *
 * @type {import('$lib/admin/csv.js').CsvColumn<FollowView>[]}
 */
export const FOLLOW_CSV_COLUMNS = [
	{ label: 'qué es', value: (r) => r.label },
	{ label: 'nombre', value: (r) => r.title },
	{ label: 'link', value: (r) => (r.href ? `https://kinkyvibe.ar${r.href}` : '') },
	...FOLLOW_OPTIONS.map((o) => ({
		label: o.label.toLowerCase(),
		value: (/** @type {FollowView} */ r) => r.options[o.name]
	})),
	{ label: 'desde', value: (r) => new Date(r.createdAt).toISOString().slice(0, 10) }
];
