/**
 * Mapa del panel de admin: la ÚNICA lista de secciones. La usan la barra lateral (desktop), la
 * barra de abajo y el panel "Más" (celu), y puede usarla el buscador. Cada PR que construye una
 * sección cambia su `soon: true` por `soon: false` (y borra `fallback`) acá, en un solo lugar.
 *
 * Forma de cada ítem ({@link NavItem}):
 * - `id`: identificador estable, igual que el final de la URL (no cambiarlo).
 * - `href`: la URL definitiva de la sección. No se cambia sin avisar a los otros PRs.
 * - `icon`: componente de Lucide (el ícono que se muestra, ver `ICON_MODE`).
 * - `emoji`: el mismo ícono como emoji (se usa si `ICON_MODE` es 'emoji').
 * - `label`: nombre en el menú.
 * - `group`: `null` (Inicio) o el id de uno de los {@link NAV_GROUPS}.
 * - `soon`: `true` mientras la página no existe. En el menú se ve gris con "próximamente", salvo
 *   que tenga `fallback`: entonces el link va a la página vieja que hoy hace eso.
 * - `fallback` (opcional): URL existente a usar mientras `soon` es `true`.
 * - `counter` (opcional): clave de `data.panelCounts` (ver `+layout.server.js`) que se muestra
 *   como contador amarillo cuando es > 0.
 * - `highlight` (opcional): se resalta en rosa en el panel "Más" (acciones principales).
 * - `match` (opcional): `'exact'` si solo se marca activo en su URL exacta (Inicio, /nuevo...).
 * - `menu` (opcional): `false` si no se muestra en la barra lateral ni en el panel "Más" (se entra
 *   desde otra página), pero sigue acá para que el buscador lo encuentre.
 * - `parent` (opcional): id del ítem que se marca activo cuando se está en esta página (para los
 *   que tienen `menu: false`).
 *
 * @typedef {{
 *   id: string,
 *   href: string,
 *   icon?: import('svelte').Component<any> | (new (...args: any[]) => any),
 *   emoji: string,
 *   label: string,
 *   group: string | null,
 *   soon: boolean,
 *   fallback?: string,
 *   counter?: string,
 *   highlight?: boolean,
 *   match?: 'exact',
 *   menu?: false,
 *   parent?: string
 * }} NavItem
 */

import {
	ArrowRightLeft,
	BookOpen,
	CalendarDays,
	CalendarPlus,
	CalendarRange,
	ChartLine,
	EyeOff,
	FileSpreadsheet,
	CircleUser,
	HandHeart,
	Heart,
	House,
	IdCard,
	KeyRound,
	Landmark,
	Mail,
	ScanLine,
	ScrollText,
	Tags,
	Ticket,
	TicketPercent,
	Users
} from '@lucide/svelte';

/**
 * Íconos del panel: 'lucide' (los del sitio, @lucide/svelte) o 'emoji'. Cambiar esta línea cambia
 * todos los íconos del marco (barra lateral, barra de abajo, panel "Más"); ver `NavIcon.svelte`.
 * @type {'lucide' | 'emoji'}
 */
export const ICON_MODE = 'lucide';

/** Grupos de la barra lateral, en orden. */
export const NAV_GROUPS = Object.freeze([
	{ id: 'eventos', label: 'Eventos' },
	{ id: 'entradas', label: 'Entradas' },
	{ id: 'contenido', label: 'Contenido' },
	{ id: 'cuentas', label: 'Cuentas' },
	{ id: 'ajustes', label: 'Ajustes' }
]);

/** @type {readonly NavItem[]} */
export const NAV = Object.freeze([
	{
		id: 'inicio',
		href: '/admin',
		icon: House,
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
		icon: CalendarRange,
		emoji: '🎟️',
		label: 'Eventos',
		group: 'eventos',
		soon: false,
		match: 'exact'
	},
	{
		id: 'eventos-nuevo',
		href: '/admin/eventos/nuevo',
		icon: CalendarPlus,
		emoji: '＋',
		label: 'Cargar evento',
		group: 'eventos',
		soon: false,
		highlight: true
	},
	{
		id: 'eventos-importar',
		href: '/admin/eventos/importar',
		icon: FileSpreadsheet,
		emoji: '📥',
		label: 'Importar planilla',
		group: 'eventos',
		soon: false,
		// Se entra desde la Agenda (y desde Inicio); no ocupa lugar en el menú.
		menu: false,
		parent: 'eventos-agenda'
	},
	{
		id: 'eventos-agenda',
		href: '/admin/eventos/agenda',
		icon: CalendarDays,
		emoji: '🗓️',
		label: 'Agenda',
		group: 'eventos',
		soon: false
	},
	{
		id: 'checkin',
		href: '/admin/checkin',
		icon: ScanLine,
		emoji: '🚪',
		label: 'Check-in',
		group: 'eventos',
		soon: false,
		highlight: true
	},

	// Entradas
	{
		id: 'entradas',
		href: '/admin/entradas',
		icon: Ticket,
		emoji: '💰',
		label: 'Ventas',
		group: 'entradas',
		soon: false,
		match: 'exact'
	},
	{
		id: 'entradas-transferencias',
		href: '/admin/entradas/transferencias',
		icon: ArrowRightLeft,
		emoji: '💸',
		label: 'Transferencias',
		group: 'entradas',
		soon: false,
		counter: 'transfers'
	},
	{
		id: 'entradas-codigos',
		href: '/admin/entradas/codigos',
		icon: TicketPercent,
		emoji: '🏷️',
		label: 'Códigos',
		group: 'entradas',
		soon: false
	},
	{
		id: 'personas',
		href: '/admin/personas',
		icon: Users,
		emoji: '🧑‍🤝‍🧑',
		label: 'Personas',
		group: 'entradas',
		soon: false
	},
	{
		id: 'estadisticas',
		href: '/admin/estadisticas',
		icon: ChartLine,
		emoji: '📈',
		label: 'Estadísticas',
		group: 'entradas',
		soon: false
	},

	// Contenido
	{
		id: 'material',
		href: '/admin/material',
		icon: BookOpen,
		emoji: '📚',
		label: 'Material',
		group: 'contenido',
		soon: false
	},
	{
		id: 'amigues',
		href: '/admin/amigues',
		icon: Heart,
		emoji: '💞',
		label: 'Amigues',
		group: 'contenido',
		soon: false
	},
	{
		id: 'etiquetas',
		href: '/admin/etiquetas',
		icon: Tags,
		emoji: '🔖',
		label: 'Etiquetas',
		group: 'contenido',
		soon: false
	},
	{
		id: 'no-listadas',
		href: '/admin/no-listadas',
		icon: EyeOff,
		emoji: '🙈',
		label: 'No listadas',
		group: 'contenido',
		soon: false,
		counter: 'unlisted'
	},

	// Cuentas del público y sus perfiles (docs/cuentas.md)
	{
		id: 'cuentas',
		href: '/admin/cuentas',
		icon: CircleUser,
		emoji: '👤',
		label: 'Cuentas',
		group: 'cuentas',
		soon: false
	},
	{
		id: 'cuentas-perfiles',
		href: '/admin/cuentas/perfiles',
		icon: IdCard,
		emoji: '🪪',
		label: 'Perfiles',
		group: 'cuentas',
		soon: false,
		counter: 'profilesToReview'
	},

	// Ajustes
	{
		id: 'ajustes-cobros',
		href: '/admin/ajustes/cobros',
		icon: Landmark,
		emoji: '🏦',
		label: 'Cobros',
		group: 'ajustes',
		soon: false
	},
	{
		id: 'ajustes-fondo',
		href: '/admin/ajustes/fondo',
		icon: HandHeart,
		emoji: '🫶',
		label: 'Fondo',
		group: 'ajustes',
		soon: false
	},
	{
		id: 'ajustes-mails',
		href: '/admin/ajustes/mails',
		icon: Mail,
		emoji: '✉️',
		label: 'Mails y plantillas',
		group: 'ajustes',
		soon: false
	},
	{
		id: 'ajustes-admins',
		href: '/admin/ajustes/admins',
		icon: KeyRound,
		emoji: '🔑',
		label: 'Admins',
		group: 'ajustes',
		soon: false
	},
	{
		id: 'actividad',
		href: '/admin/actividad',
		icon: ScrollText,
		emoji: '📜',
		label: 'Actividad',
		group: 'ajustes',
		soon: false
	}
]);

/**
 * Pestañas de la ficha de un evento (`/admin/eventos/[slug]` + sufijo). `''` es el Resumen.
 * @type {readonly { id: string, suffix: string, label: string, soon: boolean }[]}
 */
export const EVENT_TABS = Object.freeze([
	{ id: 'resumen', suffix: '', label: 'Resumen', soon: false },
	{ id: 'ventas', suffix: '/ventas', label: 'Ventas', soon: false },
	{ id: 'ordenes', suffix: '/ordenes', label: 'Órdenes', soon: false },
	{ id: 'transferencias', suffix: '/transferencias', label: 'Transferencias', soon: false },
	{ id: 'ingreso', suffix: '/ingreso', label: 'Ingreso', soon: false },
	{ id: 'codigos', suffix: '/codigos', label: 'Códigos', soon: false },
	{ id: 'mail', suffix: '/mail', label: 'Mail a compradores', soon: false },
	{ id: 'editar', suffix: '/editar', label: 'Editar', soon: false }
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
 * Link "Este evento en el panel" (menú de usuario del sitio público, listas del panel). Va a la
 * ficha del evento: a Ventas si vende entradas (la pestaña que más se usa), si no al Resumen.
 * @param {string} slug
 * @param {{ tickets?: boolean }} [opts]
 */
export function eventPanelLink(slug, { tickets = false } = {}) {
	return eventHref(slug, tickets ? 'ventas' : 'resumen');
}

/**
 * Link "Editar contenido" de una página pública. Los eventos se editan dentro del panel (pestaña
 * Editar de la ficha); el resto de las publicaciones, en /edit/<categoría>/<slug>. `null` si la
 * página no es una publicación editable.
 * @param {string} pathname
 * @returns {string | null}
 */
export function contentEditLink(pathname) {
	const m = pathname.match(/^\/(amigues|calendario|material)\/([^/]+)\/?$/);
	if (!m) return null;
	if (m[1] === 'calendario') return eventHref(decodeURIComponent(m[2]), 'editar');
	return `/edit/${m[1]}/${m[2]}`;
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
	// Páginas fuera del menú: se marca el ítem del que dependen, si ya tiene página.
	if (best?.menu === false) {
		const parent = best.parent ? navItem(best.parent) : undefined;
		best = parent && !parent.soon ? parent : undefined;
	}
	// Páginas sin ítem propio: se marca la sección a la que pertenecen.
	if (!best) {
		if (path.startsWith('/admin/eventos/')) return navItem('eventos');
		if (path.startsWith('/admin/entradas/')) return navItem('entradas');
	}
	return best;
}

/**
 * Ítems de un grupo que se muestran en el menú (barra lateral y panel "Más"), en orden. Los que
 * tienen `menu: false` quedan afuera (siguen en `NAV` para el buscador).
 * @param {string | null} group
 */
export function navGroupItems(group) {
	return NAV.filter((i) => i.group === group && i.menu !== false);
}
