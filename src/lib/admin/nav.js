/**
 * Mapa del panel de admin: la ÚNICA lista de secciones. La usan la barra lateral (desktop), la
 * barra de abajo y el panel "Más" (celu), y puede usarla el buscador. Cada PR que construye una
 * sección cambia su `soon: true` por `soon: false` (y borra `fallback`) acá, en un solo lugar.
 *
 * Forma de cada ítem ({@link NavItem}):
 * - `id`: identificador estable, igual que el final de la URL (no cambiarlo).
 * - `href`: la URL definitiva de la sección. No se cambia sin avisar a los otros PRs.
 * - `emoji`, `label`: ícono y nombre en el menú.
 * - `group`: `null` (Inicio) o el id de uno de los {@link NAV_GROUPS}.
 * - `soon`: `true` mientras la página no existe. En el menú se ve gris con "próximamente", salvo
 *   que tenga `fallback`: entonces el link va a la página vieja que hoy hace eso.
 * - `fallback` (opcional): URL existente a usar mientras `soon` es `true`.
 * - `counter` (opcional): clave de `data.panelCounts` (ver `+layout.server.js`) que se muestra
 *   como contador amarillo cuando es > 0.
 * - `highlight` (opcional): se resalta en rosa en el panel "Más" (acciones principales).
 * - `match` (opcional): `'exact'` si solo se marca activo en su URL exacta (Inicio, /nuevo...).
 *
 * @typedef {{
 *   id: string,
 *   href: string,
 *   emoji: string,
 *   label: string,
 *   group: string | null,
 *   soon: boolean,
 *   fallback?: string,
 *   counter?: string,
 *   highlight?: boolean,
 *   match?: 'exact'
 * }} NavItem
 */

/** Grupos de la barra lateral, en orden. */
export const NAV_GROUPS = Object.freeze([
	{ id: 'eventos', label: 'Eventos' },
	{ id: 'entradas', label: 'Entradas' },
	{ id: 'contenido', label: 'Contenido' },
	{ id: 'ajustes', label: 'Ajustes' }
]);

/** @type {readonly NavItem[]} */
export const NAV = Object.freeze([
	{
		id: 'inicio',
		href: '/admin',
		emoji: '🏠',
		label: 'Inicio',
		group: null,
		soon: false,
		match: 'exact'
	},

	// Eventos
	{
		id: 'eventos',
		href: '/admin/eventos',
		emoji: '🎟️',
		label: 'Eventos',
		group: 'eventos',
		soon: false,
		match: 'exact'
	},
	{
		id: 'eventos-nuevo',
		href: '/admin/eventos/nuevo',
		emoji: '＋',
		label: 'Cargar evento',
		group: 'eventos',
		soon: false,
		highlight: true
	},
	{
		id: 'eventos-importar',
		href: '/admin/eventos/importar',
		emoji: '📥',
		label: 'Importar planilla',
		group: 'eventos',
		soon: false
	},
	{
		id: 'eventos-agenda',
		href: '/admin/eventos/agenda',
		emoji: '🗓️',
		label: 'Agenda',
		group: 'eventos',
		soon: true
	},
	{
		id: 'checkin',
		href: '/admin/checkin',
		emoji: '🚪',
		label: 'Check-in',
		group: 'eventos',
		soon: true,
		fallback: '/admin/entradas',
		highlight: true
	},

	// Entradas
	{
		id: 'entradas',
		href: '/admin/entradas',
		emoji: '💰',
		label: 'Ventas',
		group: 'entradas',
		soon: false,
		match: 'exact'
	},
	{
		id: 'entradas-transferencias',
		href: '/admin/entradas/transferencias',
		emoji: '💸',
		label: 'Transferencias',
		group: 'entradas',
		soon: true,
		fallback: '/admin/entradas',
		counter: 'transfers'
	},
	{
		id: 'entradas-codigos',
		href: '/admin/entradas/codigos',
		emoji: '🏷️',
		label: 'Códigos',
		group: 'entradas',
		soon: false
	},
	{
		id: 'personas',
		href: '/admin/personas',
		emoji: '🧑‍🤝‍🧑',
		label: 'Personas',
		group: 'entradas',
		soon: true
	},
	{
		id: 'estadisticas',
		href: '/admin/estadisticas',
		emoji: '📈',
		label: 'Estadísticas',
		group: 'entradas',
		soon: true
	},

	// Contenido
	{
		id: 'material',
		href: '/admin/material',
		emoji: '📚',
		label: 'Material',
		group: 'contenido',
		soon: false
	},
	{
		id: 'amigues',
		href: '/admin/amigues',
		emoji: '💞',
		label: 'Amigues',
		group: 'contenido',
		soon: false
	},
	{
		id: 'etiquetas',
		href: '/admin/etiquetas',
		emoji: '🔖',
		label: 'Etiquetas',
		group: 'contenido',
		soon: true
	},
	{
		id: 'no-listadas',
		href: '/admin/no-listadas',
		emoji: '🙈',
		label: 'No listadas',
		group: 'contenido',
		soon: true,
		fallback: '/admin',
		counter: 'unlisted'
	},

	// Ajustes
	{
		id: 'ajustes-cobros',
		href: '/admin/ajustes/cobros',
		emoji: '🏦',
		label: 'Cobros',
		group: 'ajustes',
		soon: true,
		fallback: '/admin/entradas/ajustes'
	},
	{
		id: 'ajustes-fondo',
		href: '/admin/ajustes/fondo',
		emoji: '🫶',
		label: 'Fondo',
		group: 'ajustes',
		soon: true,
		fallback: '/admin/entradas/ajustes'
	},
	{
		id: 'ajustes-mails',
		href: '/admin/ajustes/mails',
		emoji: '✉️',
		label: 'Mails y plantillas',
		group: 'ajustes',
		soon: true,
		fallback: '/admin/entradas/ajustes'
	},
	{
		id: 'ajustes-admins',
		href: '/admin/ajustes/admins',
		emoji: '🔑',
		label: 'Admins',
		group: 'ajustes',
		soon: true
	},
	{
		id: 'actividad',
		href: '/admin/actividad',
		emoji: '📜',
		label: 'Actividad',
		group: 'ajustes',
		soon: true
	}
]);

/**
 * Pestañas de la ficha de un evento (`/admin/eventos/[slug]` + sufijo). `''` es el Resumen.
 * @type {readonly { id: string, suffix: string, label: string, soon: boolean }[]}
 */
export const EVENT_TABS = Object.freeze([
	{ id: 'resumen', suffix: '', label: 'Resumen', soon: true },
	{ id: 'ventas', suffix: '/ventas', label: 'Ventas', soon: true },
	{ id: 'ordenes', suffix: '/ordenes', label: 'Órdenes', soon: true },
	{ id: 'transferencias', suffix: '/transferencias', label: 'Transferencias', soon: true },
	{ id: 'ingreso', suffix: '/ingreso', label: 'Ingreso', soon: true },
	{ id: 'codigos', suffix: '/codigos', label: 'Códigos', soon: true },
	{ id: 'editar', suffix: '/editar', label: 'Editar', soon: true }
]);

/**
 * URL de la ficha de un evento (o de una de sus pestañas).
 * @param {string} slug
 * @param {string} [tab] id de {@link EVENT_TABS}
 */
export function eventHref(slug, tab = 'resumen') {
	const t = EVENT_TABS.find((x) => x.id === tab);
	return `/admin/eventos/${encodeURIComponent(slug)}${t?.suffix ?? ''}`;
}

/**
 * Link "Este evento en el panel" (menú de usuario del sitio público). Va a la ficha del evento;
 * mientras la ficha no existe (`EVENT_TABS[0].soon`), a la página vieja: las entradas del evento
 * si vende entradas, o duplicarlo si no. El PR de la ficha solo cambia el `soon`.
 * @param {string} slug
 * @param {{ tickets?: boolean }} [opts]
 */
export function eventPanelLink(slug, { tickets = false } = {}) {
	if (!EVENT_TABS[0].soon) return eventHref(slug);
	const s = encodeURIComponent(slug);
	return tickets ? `/admin/entradas/${s}` : `/admin/eventos/nuevo?desde=${s}`;
}

/** Los 5 lugares de la barra de abajo en el celu (el del medio es el botón rosa). */
export const MOBILE_TABS = Object.freeze(['inicio', 'eventos', 'checkin', 'entradas', 'mas']);

/**
 * @param {string} id
 * @returns {NavItem | undefined}
 */
export function navItem(id) {
	return NAV.find((i) => i.id === id);
}

/**
 * La URL a la que lleva un ítem hoy: la suya, o la de `fallback` mientras no existe.
 * `null` si todavía no hay ninguna página (se muestra deshabilitado).
 * @param {NavItem} item
 * @returns {string | null}
 */
export function navLink(item) {
	if (!item.soon) return item.href;
	return item.fallback ?? null;
}

/**
 * El ítem activo para una ruta: el de `href` más largo que coincide (así
 * `/admin/entradas/codigos` marca Códigos y no Ventas). Los ítems `soon` sin página no cuentan.
 * @param {string} pathname
 * @returns {NavItem | undefined}
 */
export function activeNavItem(pathname) {
	const path = pathname.replace(/\/+$/, '') || '/';
	/** @type {NavItem | undefined} */
	let best;
	for (const item of NAV) {
		if (item.soon) continue;
		const hit = path === item.href || (item.match !== 'exact' && path.startsWith(item.href + '/'));
		if (hit && (!best || item.href.length > best.href.length)) best = item;
	}
	// Páginas sin ítem propio: se marca la sección a la que pertenecen.
	if (!best) {
		if (path.startsWith('/admin/eventos/')) return navItem('eventos');
		if (path.startsWith('/admin/entradas/')) return navItem('entradas');
	}
	return best;
}

/**
 * Ítems de un grupo, en orden.
 * @param {string | null} group
 */
export function navGroupItems(group) {
	return NAV.filter((i) => i.group === group);
}
