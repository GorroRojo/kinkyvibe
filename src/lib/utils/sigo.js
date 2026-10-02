/**
 * «Lo que sigo» (decisión 0025, docs/lo-que-sigo.md): lo puro, sin base ni SvelteKit. Qué se
 * puede seguir, cómo se nombra cada cosa en un formulario, qué opciones tiene cada una y el CSV
 * de la lista. Las lecturas y escrituras están en $lib/server/sigo/.
 */
import { foldText } from './text.js';

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

/**
 * Las opciones de una cosa seguida. Las de Telegram (migración 0033) van aparte y son opcionales:
 * solo están cuando la cuenta puede recibir avisos por Telegram (chat vinculado e interruptores
 * prendidos), así lo de siempre no cambia.
 *
 * @typedef {{ calendario: boolean, mail_nuevo: boolean, recordatorio: boolean }
 *   & Partial<TelegramOptions>} FollowOptions
 */

/** @typedef {{ telegram_nuevo: boolean, telegram_recordatorio: boolean }} TelegramOptions */

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
	/** @type {FollowOptions} */
	const options = {
		calendario: on('calendario'),
		mail_nuevo: on('mail_nuevo'),
		recordatorio: on('recordatorio')
	};
	// Las casillas de Telegram, solo si el formulario mostró esa columna (manda `canal=telegram`):
	// si no, quedan como estaban.
	if (formChannels(form).includes('telegram')) {
		options.telegram_nuevo = on('telegram_nuevo');
		options.telegram_recordatorio = on('telegram_recordatorio');
	}
	return options;
}

/**
 * Los canales que mostró el formulario (`canal`, uno por columna prendida).
 *
 * @param {{ get(name: string): unknown, getAll?: (name: string) => unknown[] }} form
 * @returns {string[]}
 */
function formChannels(form) {
	const all = typeof form.getAll === 'function' ? form.getAll('canal') : [form.get('canal')];
	return all.filter((v) => typeof v === 'string').map(String);
}

/**
 * Las opciones de Telegram de una fila de `follows` (columnas de la migración 0033).
 *
 * @param {Record<string, unknown>} row
 * @returns {TelegramOptions}
 */
export function telegramOptionsFromRow(row) {
	return {
		telegram_nuevo: Number(row.tg_new) === 1,
		telegram_recordatorio: Number(row.tg_reminder) === 1
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
 * Lo que muestra la tarjeta de cada cosa seguida, además del nombre: el emoji y el color de la
 * etiqueta, la imagen (de la serie o del perfil), si es una serie, qué clase de perfil es y el
 * próximo evento anunciado.
 *
 * @typedef {{ title: string, href: string, start: string }} NextEvent
 * @typedef {{ name?: string, icon?: string, color?: string, image?: string | null,
 *   series?: boolean, profileKind?: string | null, next?: NextEvent | null }} FollowLook
 */

/**
 * @typedef {{ kind: FollowKind, key: string, title: string, href: string | null,
 *   label: string, available: boolean, options: FollowOptions, createdAt: number }
 *   & FollowLook} FollowView
 */

/**
 * Los grupos de la página, en orden: etiquetas y series, perfiles (personas y proyectos) y
 * lugares.
 */
export const FOLLOW_GROUPS = Object.freeze(
	/** @type {const} */ ([
		{ id: 'temas', title: 'Etiquetas y series' },
		{ id: 'perfiles', title: 'Perfiles' },
		{ id: 'lugares', title: 'Lugares' }
	])
);

/** @typedef {typeof FOLLOW_GROUPS[number]['id']} FollowGroupId */

/**
 * En qué grupo va cada cosa seguida.
 *
 * @param {Pick<FollowView, 'kind' | 'profileKind'>} f
 * @returns {FollowGroupId}
 */
export function followGroupOf(f) {
	if (f.kind === 'etiqueta') return 'temas';
	return f.profileKind === 'lugar' ? 'lugares' : 'perfiles';
}

/**
 * La lista partida en grupos (en el orden de FOLLOW_GROUPS), sin los grupos vacíos. Dentro de
 * cada grupo queda el orden que traía la lista (`sortFollows`).
 *
 * @template {Pick<FollowView, 'kind' | 'profileKind'>} T
 * @param {readonly T[]} items
 * @returns {{ id: FollowGroupId, title: string, items: T[] }[]}
 */
export function groupFollows(items) {
	return FOLLOW_GROUPS.map((g) => ({
		id: g.id,
		title: g.title,
		items: items.filter((f) => followGroupOf(f) === g.id)
	})).filter((g) => g.items.length > 0);
}

/** El emoji de una cosa seguida sin emoji propio (una etiqueta sin ícono, un perfil). */
export const KIND_EMOJI = Object.freeze({
	etiqueta: '🏷️',
	serie: '🔁',
	persona: '👤',
	proyecto: '✨',
	lugar: '📍'
});

/**
 * @param {Pick<FollowView, 'kind' | 'icon' | 'series' | 'profileKind'>} f
 * @returns {string}
 */
export function followEmoji(f) {
	if (f.icon) return f.icon;
	if (f.kind === 'etiqueta') return f.series ? KIND_EMOJI.serie : KIND_EMOJI.etiqueta;
	if (f.profileKind === 'lugar') return KIND_EMOJI.lugar;
	if (f.profileKind === 'proyecto') return KIND_EMOJI.proyecto;
	return KIND_EMOJI.persona;
}

/**
 * Los avisos de cada cosa seguida, como grilla de qué (filas) × por dónde (columnas). Cada
 * columna dice qué casilla del formulario corresponde a cada fila (`fields`); una columna sin
 * `enabled` se muestra apagada con «Próximamente».
 *
 * Telegram (docs/telegram.md) está listo para sumarse: cuando haya cuentas conectadas, se le
 * ponen sus casillas en `fields` y `enabled: true`, y la grilla no cambia.
 */
export const NOTIFY_KINDS = Object.freeze(
	/** @type {const} */ ([
		{ id: 'nuevo', label: 'Algo nuevo' },
		{ id: 'recordatorio', label: 'Recordatorio el día antes' }
	])
);

/** @typedef {typeof NOTIFY_KINDS[number]['id']} NotifyKindId */

/**
 * @typedef {{ id: string, label: string, enabled: boolean,
 *   fields: Partial<Record<NotifyKindId, keyof FollowOptions>>, note?: string,
 *   offLabel?: string }} NotifyChannel `offLabel`: el cartelito de la columna apagada
 *   (si no, «Próximamente»)
 */

/** @type {readonly NotifyChannel[]} */
export const NOTIFY_CHANNELS = Object.freeze([
	{
		id: 'mail',
		label: 'Mail',
		enabled: true,
		fields: { nuevo: 'mail_nuevo', recordatorio: 'recordatorio' }
	},
	{
		id: 'telegram',
		label: 'Telegram',
		enabled: false,
		fields: {},
		note: 'Vas a poder recibir esto por Telegram cuando conectes tu cuenta.'
	}
]);

/** Las casillas de la columna Telegram (columnas `tg_new` y `tg_reminder` de `follows`). */
export const TELEGRAM_FIELDS = Object.freeze(
	/** @type {const} */ ({ nuevo: 'telegram_nuevo', recordatorio: 'telegram_recordatorio' })
);

/**
 * Las columnas de la grilla según lo que puede la cuenta (fase 2 del bot, docs/telegram.md):
 *
 * - sin el bot (`telegram` es `null` o falta): como siempre, Telegram «Próximamente»;
 * - con el bot y sin chat vinculado: apagada, con «Conectá Telegram» y la nota de cómo;
 * - con el chat vinculado: prendida, con sus casillas.
 *
 * @param {{ linked: boolean } | null | undefined} telegram
 * @returns {readonly NotifyChannel[]}
 */
export function notifyChannels(telegram) {
	if (!telegram) return NOTIFY_CHANNELS;
	return NOTIFY_CHANNELS.map((c) => {
		if (c.id !== 'telegram') return c;
		if (telegram.linked)
			return { ...c, enabled: true, fields: { ...TELEGRAM_FIELDS }, note: undefined };
		return {
			...c,
			offLabel: 'Sin conectar',
			note: 'Para recibir esto por Telegram, conectá tu cuenta con el bot (más abajo, en «Telegram»).'
		};
	});
}

/**
 * @typedef {{ key: string, name: string, kind: string }} ProfileOption un perfil para el buscador
 *   de «Agregar» (`key`: el id del objeto; `kind`: persona, proyecto o lugar)
 */

/**
 * Los perfiles que coinciden con lo escrito (sin mayúsculas ni tildes), primero los que empiezan
 * así. Sin texto, ninguno.
 *
 * @param {readonly ProfileOption[]} profiles
 * @param {string} query
 * @param {{ taken?: ReadonlySet<string>, limit?: number }} [opts] `taken`: los que ya sigue
 * @returns {ProfileOption[]}
 */
export function searchProfiles(profiles, query, { taken = new Set(), limit = 5 } = {}) {
	const q = foldText(query);
	if (!q) return [];
	/** @type {{ p: ProfileOption, score: number }[]} */
	const hits = [];
	for (const p of profiles) {
		if (taken.has(p.key)) continue;
		const name = foldText(p.name);
		const score = name.startsWith(q)
			? 0
			: name.split(/[\s/-]+/).some((w) => w.startsWith(q))
				? 1
				: name.includes(q)
					? 2
					: -1;
		if (score >= 0) hits.push({ p, score });
	}
	hits.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name, 'es'));
	return hits.slice(0, limit).map((h) => h.p);
}

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
