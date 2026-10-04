/**
 * Mapa del panel de admin: la ÚNICA lista de secciones. La usan la barra lateral (desktop), la
 * barra de abajo y el panel "Más" (celu), el botón "Para revisar", la página "Próximamente" y el
 * buscador (`commands.js`). Mapa aprobado por gorrite (decisión 0026, paso 2 del orden): 7 áreas
 * ({@link NAV_AREAS}) más Inicio arriba y Ajustes al pie. Dentro de cada área, las secciones van
 * por frecuencia de uso (lo de todos los días primero) y lo que viene, al final.
 *
 * Forma de cada ítem ({@link NavItem}):
 * - `id`: identificador estable (no cambiarlo: lo usan los atajos y el buscador).
 * - `href`: la URL de la sección, siempre /admin/<área>/<sección> (paso 2 del mapa). Las
 *   excepciones: Inicio, Eventos, Check-in (su URL está guardada en los celus de la puerta),
 *   Etiquetas y Estadísticas, que son su propia área. Sin redirecciones desde las URLs viejas:
 *   si una cambia, `adminPaths.test.js` marca cada link interno que quedó apuntando a la vieja.
 * - `icon`: componente de Lucide (el ícono que se muestra, ver `ICON_MODE`).
 * - `emoji`: el mismo ícono como emoji (se usa si `ICON_MODE` es 'emoji').
 * - `label`: nombre en el menú.
 * - `area`: `null` (Inicio) o el id de una de las {@link NAV_AREAS}.
 * - `sub` (solo Ajustes): subgrupo de {@link AJUSTES_SUBGROUPS} (Plata, Comunicación…).
 * - `soon`: `true` mientras la sección está aprobada pero no construida (ver "Ciclo de vida").
 * - `phase`: fase del plan en la que llega (obligatoria con `soon: true`; el menú muestra
 *   "fase N").
 * - `soonText`: qué va a hacer la sección (lo muestra la página "Próximamente").
 * - `flag` (opcional): interruptor (`src/lib/server/flags.js`) de la función. Apagado, la sección
 *   está "en prueba" (ver abajo).
 * - `hiddenWhenOff` (opcional): con `flag` apagado la página da 404, así que no se muestra.
 * - `counter` (opcional): clave de `data.panelCounts` (ver `+layout.server.js`) que se muestra
 *   como contador amarillo cuando es > 0.
 * - `highlight` (opcional): se resalta en rosa en el panel "Más" (acciones principales).
 * - `match` (opcional): `'exact'` si solo se marca activo en su URL exacta (Inicio, /nuevo...).
 * - `menu` (opcional): `false` si no se muestra en la barra lateral ni en el panel "Más" (se entra
 *   desde otra página), pero sigue acá para que el buscador lo encuentre.
 * - `parent` (opcional): id del ítem que se marca activo cuando se está en esta página (para los
 *   que tienen `menu: false`).
 *
 * Ciclo de vida de una sección (siempre en este archivo, sin moverla de lugar en el menú):
 * 1. **Próximamente**: el plan está aprobado y tiene fase. `soon: true, phase: N, soonText`. Se ve
 *    gris y punteada al final de su área, con "fase N"; su `href` queda reservado y abre la página
 *    genérica "Próximamente" (`src/routes/(authed)/admin/[...section=soon]`). Cada persona puede
 *    ocultarlas con "Ocultar lo que viene" (menú de usuario).
 * 2. **En prueba**: la página existe pero su interruptor está apagado. `soon: false, flag: 'x'`.
 *    Solo la ven les superadmins, con la etiqueta "prueba" (hoy todes les admins son superadmins,
 *    así que la ven todes). Si con el interruptor apagado la página da 404, `hiddenWhenOff: true`.
 * 3. **Lista**: se prende el interruptor y se ve normal. El PR que la construyó ya hizo el cambio;
 *    prenderla no pide otro PR. Cuando el interruptor desaparece, se borra `flag`.
 * 4. **Descartada**: si el plan se cae, se borra el ítem. No quedan secciones fantasma.
 *
 * @typedef {{
 *   id: string,
 *   href: string,
 *   icon?: import('svelte').Component<any> | (new (...args: any[]) => any),
 *   emoji: string,
 *   label: string,
 *   area: string | null,
 *   sub?: string,
 *   soon: boolean,
 *   phase?: number,
 *   soonText?: string,
 *   flag?: string,
 *   hiddenWhenOff?: boolean,
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
	Database,
	EyeOff,
	FileSpreadsheet,
	FileText,
	CircleUser,
	HandCoins,
	HandHeart,
	House,
	IdCard,
	Inbox,
	KeyRound,
	Landmark,
	Library,
	ListPlus,
	Mail,
	MapPin,
	Repeat,
	ScanLine,
	ScrollText,
	Settings,
	ShoppingBag,
	Sparkles,
	Tags,
	Ticket,
	TicketPercent,
	ToggleRight,
	Users,
	Video,
	Workflow
} from '@lucide/svelte';

/**
 * Íconos del panel: 'lucide' (los del sitio, @lucide/svelte) o 'emoji'. Cambiar esta línea cambia
 * todos los íconos del marco (barra lateral, barra de abajo, panel "Más"); ver `NavIcon.svelte`.
 * @type {'lucide' | 'emoji'}
 */
export const ICON_MODE = 'lucide';

/**
 * Áreas del menú, en orden. `foot: true` va al pie de la barra lateral (Ajustes, que se usa poco).
 * @type {readonly { id: string, label: string, icon: NavItem['icon'], emoji: string, foot?: true }[]}
 */
export const NAV_AREAS = Object.freeze([
	{ id: 'eventos', label: 'Eventos', icon: CalendarRange, emoji: '🎟️' },
	{ id: 'ventas', label: 'Ventas', icon: Ticket, emoji: '💰' },
	{ id: 'comunidad', label: 'Comunidad', icon: Users, emoji: '🧑‍🤝‍🧑' },
	{ id: 'mensajes', label: 'Mensajes', icon: Inbox, emoji: '📨' },
	{ id: 'etiquetas', label: 'Etiquetas', icon: Tags, emoji: '🔖' },
	{ id: 'contenido', label: 'Contenido', icon: BookOpen, emoji: '📚' },
	{ id: 'estadisticas', label: 'Estadísticas', icon: ChartLine, emoji: '📈' },
	{ id: 'ajustes', label: 'Ajustes', icon: Settings, emoji: '⚙️', foot: true }
]);

/**
 * Grupos del menú (barra lateral y panel "Más" del celu): el menú simplificado de la revisión de
 * UI (paso 3). Junta áreas chicas con la que se parecen, así arriba hay menos entradas: Inicio,
 * Eventos, Ventas (con Estadísticas), Comunidad (con Mensajes), Contenido (con Etiquetas) y
 * Ajustes al pie. Es solo cómo se muestra: cada sección sigue en su área y en su URL
 * (/admin/<área>/<sección>), y «← Área» sigue llevando a su área. Dentro de un grupo, las
 * secciones del área principal van primero y las de las otras áreas, debajo de su nombre.
 * @type {readonly { id: string, label: string, icon: NavItem['icon'], emoji: string, areas: readonly string[], foot?: true }[]}
 */
export const NAV_GROUPS = Object.freeze([
	{ id: 'eventos', label: 'Eventos', icon: CalendarRange, emoji: '🎟️', areas: ['eventos'] },
	{ id: 'ventas', label: 'Ventas', icon: Ticket, emoji: '💰', areas: ['ventas', 'estadisticas'] },
	{
		id: 'comunidad',
		label: 'Comunidad',
		icon: Users,
		emoji: '🧑‍🤝‍🧑',
		areas: ['comunidad', 'mensajes']
	},
	{
		id: 'contenido',
		label: 'Contenido',
		icon: BookOpen,
		emoji: '📚',
		areas: ['contenido', 'etiquetas']
	},
	{
		id: 'ajustes',
		label: 'Ajustes',
		icon: Settings,
		emoji: '⚙️',
		areas: ['ajustes'],
		foot: true
	}
]);

/**
 * El grupo del menú de un área (o de un grupo, por su id), o `undefined`.
 * @param {string | null | undefined} id id de área o de grupo
 */
export function navGroupOf(id) {
	if (!id) return undefined;
	return NAV_GROUPS.find((g) => g.id === id) ?? NAV_GROUPS.find((g) => g.areas.includes(id));
}

/** Subgrupos de Ajustes, en orden. */
export const AJUSTES_SUBGROUPS = Object.freeze([
	{ id: 'plata', label: 'Plata' },
	{ id: 'comunicacion', label: 'Comunicación' },
	{ id: 'equipo', label: 'Equipo' },
	{ id: 'sistema', label: 'Sistema' }
]);

/**
 * Botón global "Para revisar" (barra de arriba y header del celu). Por ahora lleva a la tarjeta
 * "Para revisar" del Inicio; `counter` es la clave de `data.panelCounts`.
 */
export const REVIEW_LINK = Object.freeze({
	href: '/admin#para-revisar',
	label: 'Para revisar',
	counter: 'review'
});

/**
 * Cuántas cosas hay "Para revisar": la ÚNICA cuenta, la del botón global (barra de arriba y
 * header del celu) y la del Inicio ("N cosas para revisar" y la tarjeta). Sale de
 * `data.panelCounts` (`panelCounts.js`), así los dos números no pueden ser distintos.
 * @param {Record<string, number> | null | undefined} counts `data.panelCounts`
 * @returns {number}
 */
export function reviewCountOf(counts) {
	return Number(counts?.[REVIEW_LINK.counter] ?? 0) || 0;
}

/** @type {readonly NavItem[]} */
export const NAV = Object.freeze([
	{
		id: 'inicio',
		href: '/admin',
		icon: House,
		emoji: '🏠',
		label: 'Inicio',
		area: null,
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
		area: 'eventos',
		soon: false,
		match: 'exact'
	},
	{
		id: 'eventos-nuevo',
		href: '/admin/eventos/nuevo',
		icon: CalendarPlus,
		emoji: '＋',
		label: 'Cargar evento',
		area: 'eventos',
		soon: false,
		highlight: true
	},
	{
		id: 'eventos-agenda',
		href: '/admin/eventos/agenda',
		icon: CalendarDays,
		emoji: '🗓️',
		label: 'Agenda',
		area: 'eventos',
		soon: false
	},
	{
		id: 'eventos-importar',
		href: '/admin/eventos/importar',
		icon: FileSpreadsheet,
		emoji: '📥',
		label: 'Importar planilla',
		area: 'eventos',
		soon: false,
		// Se entra desde la Agenda (y desde Inicio); no ocupa lugar en el menú.
		menu: false,
		parent: 'eventos-agenda'
	},
	{
		id: 'checkin',
		href: '/admin/checkin',
		icon: ScanLine,
		emoji: '🚪',
		label: 'Puerta',
		area: 'eventos',
		soon: false,
		highlight: true
	},
	{
		// Series de eventos (docs/decisiones/0005).
		id: 'eventos-series',
		href: '/admin/eventos/series',
		icon: Repeat,
		emoji: '🔁',
		label: 'Series',
		area: 'eventos',
		soon: false
	},
	{
		// Perfiles de tipo lugar y el "sucede en" de cada evento (docs/amigues.md), con las listas
		// "Para aprobar" y "Rechazados". Son los mismos datos que Comunidad › Perfiles con el filtro
		// «Lugares».
		id: 'eventos-lugares',
		href: '/admin/eventos/lugares',
		icon: MapPin,
		emoji: '📍',
		label: 'Lugares',
		area: 'eventos',
		soon: false
	},
	{
		// Roles de personas en eventos y preguntas de inscripción (#139, docs/personas-eventos.md).
		// El id sigue siendo el de cuando estaba en Ajustes (lo usan los atajos).
		id: 'ajustes-personas',
		href: '/admin/eventos/roles',
		icon: ListPlus,
		emoji: '🧩',
		label: 'Roles y preguntas',
		area: 'eventos',
		soon: false
	},

	// Ventas
	{
		id: 'entradas',
		href: '/admin/ventas',
		icon: Ticket,
		emoji: '💰',
		label: 'Todas las ventas',
		area: 'ventas',
		soon: false,
		match: 'exact'
	},
	{
		id: 'entradas-transferencias',
		href: '/admin/ventas/transferencias',
		icon: ArrowRightLeft,
		emoji: '💸',
		label: 'Transferencias',
		area: 'ventas',
		soon: false,
		counter: 'transfers'
	},
	{
		id: 'entradas-codigos',
		href: '/admin/ventas/codigos',
		icon: TicketPercent,
		emoji: '🏷️',
		label: 'Códigos',
		area: 'ventas',
		soon: false
	},
	{
		id: 'tienda',
		href: '/admin/ventas/tienda',
		icon: ShoppingBag,
		emoji: '🛍️',
		label: 'Tienda',
		area: 'ventas',
		soon: true,
		phase: 8,
		soonText:
			'Productos, precios y stock, y los pedidos con su envío. El cobro va con Mercado Pago o ' +
			'Tiendanube, según qué se venda.'
	},

	// Comunidad
	{
		id: 'personas',
		href: '/admin/comunidad/personas',
		icon: Users,
		emoji: '🧑‍🤝‍🧑',
		label: 'Personas',
		area: 'comunidad',
		soon: false
	},
	{
		// La única lista de perfiles (decisión de gorrite del 1/10): reemplaza a "Amigues" y a
		// "Cuentas › Perfiles". El id sigue siendo el de Amigues (lo usan los atajos);
		// "Amigues" queda como nombre del directorio público (/amigues).
		id: 'amigues',
		href: '/admin/comunidad/perfiles',
		icon: IdCard,
		emoji: '🪪',
		label: 'Perfiles',
		area: 'comunidad',
		soon: false,
		// Perfiles nuevos de cuentas sin revisar + pedidos "Es mi perfil" pendientes.
		counter: 'profilesToReview'
	},
	{
		// Cuentas del público y sus perfiles (docs/cuentas.md)
		id: 'cuentas',
		href: '/admin/comunidad/cuentas',
		icon: CircleUser,
		emoji: '👤',
		label: 'Cuentas',
		area: 'comunidad',
		soon: false
	},

	// Mensajes
	{
		id: 'ajustes-plantillas',
		href: '/admin/mensajes/plantillas',
		icon: FileText,
		emoji: '📝',
		label: 'Plantillas',
		area: 'mensajes',
		soon: false
	},
	{
		id: 'lo-que-sigo',
		href: '/admin/mensajes/lo-que-sigo',
		icon: Sparkles,
		emoji: '✨',
		label: 'Lo que sigo',
		area: 'mensajes',
		soon: true,
		phase: 2,
		soonText:
			'Qué etiquetas, perfiles y lugares sigue cada persona, para su calendario y sus mails ' +
			'(anuncios y recordatorios). Incluye a quienes pidieron "Avisame si se repite".'
	},
	{
		id: 'bandeja',
		href: '/admin/mensajes',
		icon: Inbox,
		emoji: '📥',
		label: 'Bandeja',
		area: 'mensajes',
		soon: true,
		phase: 5,
		soonText:
			'Los mails que llegan a la organización entran al panel (con copia opcional a Gmail), y se ' +
			'responden desde acá, a una persona o en masa. Lo sin responder también se ve en el Inicio.'
	},

	// Etiquetas
	{
		id: 'etiquetas',
		href: '/admin/etiquetas',
		icon: Tags,
		emoji: '🔖',
		label: 'Árbol de etiquetas',
		area: 'etiquetas',
		soon: false
	},

	// Contenido
	{
		id: 'material',
		href: '/admin/contenido/material',
		icon: BookOpen,
		emoji: '📚',
		label: 'Material',
		area: 'contenido',
		soon: false
	},
	{
		id: 'no-listadas',
		href: '/admin/contenido/no-listadas',
		icon: EyeOff,
		emoji: '🙈',
		label: 'No listadas',
		area: 'contenido',
		soon: false,
		counter: 'unlisted'
	},
	{
		id: 'contenido-base',
		href: '/admin/contenido/base',
		icon: Database,
		emoji: '🗄️',
		label: 'En la base',
		area: 'contenido',
		soon: false
	},
	{
		id: 'colecciones',
		href: '/admin/contenido/colecciones',
		icon: Library,
		emoji: '🗂️',
		label: 'Colecciones',
		area: 'contenido',
		soon: true,
		phase: 4,
		soonText:
			'Listas con nombre que arma la organización, y las que guarda cada persona (les ' +
			'superadmins las pueden ver).'
	},
	{
		id: 'videos',
		href: '/admin/contenido/videos',
		icon: Video,
		emoji: '🎬',
		label: 'Videos',
		area: 'contenido',
		soon: true,
		phase: 7,
		soonText:
			'Videos gratis, talleres pagos y transmisiones en vivo, con links firmados. El cobro va ' +
			'aparte de las entradas.'
	},

	// Estadísticas
	{
		id: 'estadisticas',
		href: '/admin/estadisticas',
		icon: ChartLine,
		emoji: '📈',
		label: 'Ventas en el tiempo',
		area: 'estadisticas',
		soon: false
	},

	// Ajustes (al pie)
	{
		id: 'ajustes-cobros',
		href: '/admin/ajustes/cobros',
		icon: Landmark,
		emoji: '🏦',
		label: 'Cobros',
		area: 'ajustes',
		sub: 'plata',
		soon: false
	},
	{
		id: 'ajustes-fondo',
		href: '/admin/ajustes/fondo',
		icon: HandHeart,
		emoji: '🫶',
		label: 'Fondo',
		area: 'ajustes',
		sub: 'plata',
		soon: false
	},
	{
		// Propinas al pie de las publicaciones (docs/propinas.md); misma cuenta de MP que las ventas.
		id: 'propinas',
		href: '/admin/ajustes/propinas',
		icon: HandCoins,
		emoji: '🪙',
		label: 'Propinas',
		area: 'ajustes',
		sub: 'plata',
		soon: false
	},
	{
		id: 'ajustes-mails',
		href: '/admin/ajustes/mails',
		icon: Mail,
		emoji: '✉️',
		label: 'Mails y envíos',
		area: 'ajustes',
		sub: 'comunicacion',
		soon: false
	},
	{
		id: 'ajustes-admins',
		href: '/admin/ajustes/admins',
		icon: KeyRound,
		emoji: '🔑',
		label: 'Admins',
		area: 'ajustes',
		sub: 'equipo',
		soon: false
	},
	{
		id: 'ajustes-interruptores',
		href: '/admin/ajustes/interruptores',
		icon: ToggleRight,
		emoji: '🎚️',
		label: 'Interruptores',
		area: 'ajustes',
		sub: 'sistema',
		soon: false
	},
	{
		// Todo lo que corre solo (crons, mails programados, bot de Telegram; reglas más adelante),
		// por ahora solo para mirar. Al lado de Interruptores: es "cómo está andando el sitio".
		id: 'ajustes-automatizaciones',
		href: '/admin/ajustes/automatizaciones',
		icon: Workflow,
		emoji: '🤖',
		label: 'Automatizaciones',
		area: 'ajustes',
		sub: 'sistema',
		soon: false
	},
	{
		// También "Recuperar" lo borrado desde el panel (docs/panel.md).
		id: 'actividad',
		href: '/admin/ajustes/actividad',
		icon: ScrollText,
		emoji: '📜',
		label: 'Actividad',
		area: 'ajustes',
		sub: 'sistema',
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
	{ id: 'ingreso', suffix: '/ingreso', label: 'Puerta', soon: false },
	{ id: 'codigos', suffix: '/codigos', label: 'Códigos', soon: false },
	{ id: 'mail', suffix: '/mail', label: 'Mail a compradores', soon: false },
	// Plantillas de los mails de este evento (lo que cambia sobre Mensajes → Plantillas).
	{ id: 'mails', suffix: '/mails', label: 'Plantillas de mails', soon: false },
	// Preguntas de inscripción: la ficha la muestra con base y venta de entradas.
	{ id: 'preguntas', suffix: '/preguntas', label: 'Preguntas', soon: false },
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
 * Editar de la ficha); los perfiles, en Comunidad › Perfiles; las páginas de la wiki, en
 * Etiquetas › Texto de la wiki; el material, en /edit/material/<slug>. `null` si la página no es
 * una publicación editable.
 * @param {string} pathname
 * @returns {string | null}
 */
export function contentEditLink(pathname) {
	const m = pathname.match(/^\/(amigues|calendario|material|wiki)\/([^/]+)\/?$/);
	if (!m) return null;
	if (m[1] === 'calendario') return eventHref(decodeURIComponent(m[2]), 'editar');
	if (m[1] === 'amigues') return `/admin/comunidad/perfiles/${m[2]}`;
	if (m[1] === 'wiki') return wikiEditHref(decodeURIComponent(m[2]));
	return `/edit/${m[1]}/${m[2]}`;
}

/**
 * El editor del texto de la wiki de una etiqueta (por la dirección de su página, `/wiki/<…>`).
 * @param {string} slug
 */
export const wikiEditHref = (slug) => `/admin/etiquetas/wiki/${encodeURIComponent(slug)}`;

/**
 * Los 5 lugares de la barra de abajo en el celu (el del medio es el botón rosa).
 * Cuando llegue la Bandeja (fase 5), el cuarto lugar pasa a ser "Para revisar" (mapa del panel,
 * respuesta de gorrite). No antes.
 */
export const MOBILE_TABS = Object.freeze(['inicio', 'eventos', 'checkin', 'entradas', 'mas']);

/**
 * @param {string} id
 * @returns {NavItem | undefined}
 */
export function navItem(id) {
	return NAV.find((i) => i.id === id);
}

/**
 * @param {string | null | undefined} id
 */
export function navArea(id) {
	return NAV_AREAS.find((a) => a.id === id);
}

/**
 * Link «← Área» arriba del título de una sección: a la página de su área (la sección cuya URL es
 * la del área, como /admin/ventas), con el nombre del área. `null` si la sección no tiene área o el área no tiene
 * esa página.
 * @param {string} id id de la sección
 * @returns {{ href: string, label: string } | null}
 */
export function areaBackLink(id) {
	const area = navArea(navItem(id)?.area);
	if (!area) return null;
	const root = NAV.find((i) => i.href === `/admin/${area.id}`);
	return root ? { href: root.href, label: area.label } : null;
}

/**
 * La URL de una sección que ya existe, para el buscador y los atajos. `null` para las que vienen
 * (`soon`): en el menú esas llevan a su página "Próximamente" (`item.href`).
 * @param {NavItem} item
 * @returns {string | null}
 */
export function navLink(item) {
	return item.soon ? null : item.href;
}

/**
 * Estado de una sección para el menú (ver "Ciclo de vida" arriba):
 * - `'soon'`: próximamente (gris y punteada, con la fase);
 * - `'prueba'`: la página existe pero su interruptor está apagado;
 * - `'hidden'`: interruptor apagado y la página da 404, así que no se muestra;
 * - `'ready'`: lista.
 *
 * @param {NavItem} item
 * @param {Record<string, boolean>} [flags] estado de los interruptores (`data.navFlags`). Si falta
 *   un interruptor, se toma como prendido (no se esconde nada por no saber).
 * @returns {'soon' | 'prueba' | 'hidden' | 'ready'}
 */
export function navState(item, flags = {}) {
	if (item.soon) return 'soon';
	if (item.flag && flags[item.flag] === false) return item.hiddenWhenOff ? 'hidden' : 'prueba';
	return 'ready';
}

/** Interruptores que usa el menú (para leerlos una vez en el layout). */
export function navFlagKeys() {
	return [...new Set(NAV.flatMap((i) => (i.flag ? [i.flag] : [])))];
}

/**
 * El ítem activo para una ruta: el de `href` más largo que coincide (así
 * `/admin/ventas/codigos` marca Códigos y no Ventas). Los `soon` también cuentan: su URL abre
 * la página "Próximamente".
 * @param {string} pathname
 * @returns {NavItem | undefined}
 */
export function activeNavItem(pathname) {
	const path = pathname.replace(/\/+$/, '') || '/';
	/** @type {NavItem | undefined} */
	let best;
	for (const item of NAV) {
		const hit = path === item.href || (item.match !== 'exact' && path.startsWith(item.href + '/'));
		if (hit && (!best || item.href.length > best.href.length)) best = item;
	}
	// Páginas fuera del menú: se marca el ítem del que dependen.
	if (best?.menu === false) best = best.parent ? navItem(best.parent) : undefined;
	// La ficha de un perfil (/admin/comunidad/cuentas/perfiles/<id>) es parte de Perfiles, no de Cuentas.
	if (path.startsWith('/admin/comunidad/cuentas/perfiles/')) return navItem('amigues');
	// Páginas sin ítem propio: se marca la sección a la que pertenecen.
	if (!best) {
		if (path.startsWith('/admin/eventos/')) return navItem('eventos');
		if (path.startsWith('/admin/ventas/')) return navItem('entradas');
	}
	return best;
}

/**
 * Secciones de un área que se muestran en el menú (barra lateral y panel "Más"), en orden: las
 * que existen primero y las que vienen (`soon`) al final. Quedan afuera las de `menu: false`
 * (siguen en `NAV` para el buscador), las `hidden` y, con `hideSoon`, las que vienen.
 *
 * @param {string | null} area
 * @param {{ flags?: Record<string, boolean>, hideSoon?: boolean }} [opts]
 */
export function navAreaItems(area, { flags = {}, hideSoon = false } = {}) {
	const items = NAV.filter((i) => i.area === area && i.menu !== false).filter((i) => {
		const state = navState(i, flags);
		return state !== 'hidden' && !(hideSoon && state === 'soon');
	});
	return [...items.filter((i) => !i.soon), ...items.filter((i) => i.soon)];
}

/**
 * Las secciones de Ajustes agrupadas por subgrupo (Plata, Comunicación, Equipo, Sistema), sin
 * subgrupos vacíos. Las de otras áreas devuelven un solo grupo sin nombre.
 *
 * @param {string} area
 * @param {{ flags?: Record<string, boolean>, hideSoon?: boolean }} [opts]
 * @returns {{ id: string, label: string, items: NavItem[] }[]}
 */
export function navAreaSections(area, opts) {
	const items = navAreaItems(area, opts);
	if (area !== 'ajustes') return items.length ? [{ id: '', label: '', items }] : [];
	return AJUSTES_SUBGROUPS.map((g) => ({
		...g,
		items: items.filter((i) => i.sub === g.id)
	})).filter((g) => g.items.length);
}

/**
 * Las secciones de un grupo del menú, en bloques: el área principal sin título y cada una de las
 * otras áreas con su nombre (en Ajustes, sus subgrupos). Sin bloques vacíos.
 *
 * @param {string} group id de {@link NAV_GROUPS}
 * @param {{ flags?: Record<string, boolean>, hideSoon?: boolean }} [opts]
 * @returns {{ id: string, label: string, items: NavItem[] }[]}
 */
export function navGroupSections(group, opts) {
	const g = navGroupOf(group);
	if (!g) return [];
	return g.areas.flatMap((area, i) =>
		navAreaSections(area, opts).map((section) =>
			i === 0 ? section : { ...section, id: area, label: navArea(area)?.label ?? area }
		)
	);
}

/**
 * Las secciones de un grupo del menú, en el orden en que se muestran.
 * @param {string} group
 * @param {{ flags?: Record<string, boolean>, hideSoon?: boolean }} [opts]
 */
export function navGroupItems(group, opts) {
	return navGroupSections(group, opts).flatMap((s) => s.items);
}

/**
 * Pestañas de sección (como las de Ajustes): en la página principal de cada sección de un grupo
 * del menú con dos o más secciones, una barra con todas las secciones del grupo, así se pasa de
 * una a otra sin abrir el menú. Las del grupo Eventos no llevan (son herramientas con su propia
 * barra: la lista, la agenda, Puerta…), ni las subpáginas (fichas, formularios), ni lo que viene.
 * `null` si la página no lleva.
 * @param {string} pathname
 * @param {{ flags?: Record<string, boolean> }} [opts]
 * @returns {{ label: string, tabs: { href: string, label: string }[] } | null}
 */
export function sectionTabs(pathname, { flags = {} } = {}) {
	const path = pathname.replace(/\/+$/, '') || '/';
	const item = NAV.find((i) => i.href === path && !i.soon && i.menu !== false);
	const group = navGroupOf(item?.area);
	if (!item || !group || group.id === 'eventos' || navState(item, flags) === 'hidden') return null;
	const items = navGroupItems(group.id, { flags, hideSoon: true });
	if (items.length < 2) return null;
	return {
		label: `Secciones de ${group.label}`,
		tabs: items.map((i) => ({ href: i.href, label: i.label }))
	};
}

/**
 * Suma de los contadores de un grupo del menú (se muestra en el grupo cerrado).
 * @param {string} group
 * @param {Record<string, number>} counts
 * @param {{ flags?: Record<string, boolean> }} [opts]
 */
export function groupCount(group, counts, opts) {
	return (navGroupOf(group)?.areas ?? []).reduce((n, a) => n + areaCount(a, counts, opts), 0);
}

/**
 * Suma de los contadores de un área (se muestra en el área cerrada).
 * @param {string} area
 * @param {Record<string, number>} counts
 * @param {{ flags?: Record<string, boolean> }} [opts]
 */
export function areaCount(area, counts, opts) {
	return navAreaItems(area, opts).reduce(
		(n, i) => n + (i.counter ? Number(counts[i.counter] ?? 0) : 0),
		0
	);
}

/**
 * La sección "Próximamente" de una URL, o `undefined`. La usa la ruta genérica
 * `[...section=soon]` (y su matcher en `src/params/soon.js`).
 * @param {string} pathname
 */
export function soonItemAt(pathname) {
	const path = pathname.replace(/\/+$/, '');
	return NAV.find((i) => i.soon && i.href === path);
}

/**
 * Sección del panel con la lista y el editor de cada categoría de contenido (Material está en
 * Contenido; los perfiles de /amigues, en Comunidad › Perfiles). `ContentList`, `ContentEditor` y
 * `contentRoutes.js` arman sus links con esto, así no repiten la URL.
 * @type {Readonly<Record<string, string>>}
 */
const CONTENT_SECTION = Object.freeze({ material: 'material', amigues: 'amigues' });

/**
 * URL de la lista de una categoría de contenido en el panel (`/admin/contenido/material`,
 * `/admin/comunidad/perfiles`). Lo nuevo es `<esto>/nuevo` y cada publicación, `<esto>/<slug>`.
 * @param {string} category 'material' o 'amigues'
 * @returns {string}
 */
export function contentAdminHref(category) {
	const item = navItem(CONTENT_SECTION[category] ?? '');
	if (!item) throw new Error(`No hay sección del panel para «${category}»`);
	return item.href;
}

/**
 * Nombre en el menú de la sección de una categoría de contenido ("Material", "Perfiles").
 * @param {string} category
 */
export function contentAdminLabel(category) {
	return navItem(CONTENT_SECTION[category] ?? '')?.label ?? category;
}
