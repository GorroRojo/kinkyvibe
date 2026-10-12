/**
 * Mapa del panel de admin: la ÚNICA lista de secciones. La usan la barra lateral (desktop), la
 * barra de abajo y el panel "Más" (celu), el botón "Para revisar", la página "Próximamente" y el
 * buscador (`commands.js`). Mapa aprobado por gorrite (decisión 0026, paso 2 del orden): las áreas
 * ({@link NAV_AREAS}) más Inicio arriba y Ajustes al pie; desde la opción C (decisión 0038) la
 * Puerta es un área propia. Dentro de cada área, las secciones van por frecuencia de uso (lo de
 * todos los días primero) y lo que viene, al final.
 *
 * Forma de cada ítem ({@link NavItem}):
 * - `id`: identificador estable (no cambiarlo: lo usan los atajos y el buscador).
 * - `href`: la URL de la sección, siempre /admin/<área>/<sección> (paso 2 del mapa). Las
 *   excepciones: Inicio, Eventos, Check-in (su URL está guardada en los celus de la puerta) y
 *   Etiquetas, que es su propia área. Sin redirecciones desde las URLs viejas: si una cambia,
 *   `adminPaths.test.js` marca cada link interno que quedó apuntando a la vieja.
 *   **Excepciones** (aprobadas por gorrite, 11/10): `/admin/estadisticas` era una página y
 *   ahora redirige (307) a Ventas (`/admin/estadisticas/ventas`), así los favoritos viejos siguen
 *   andando (`src/routes/(authed)/admin/estadisticas/+server.js`). No es un ítem del menú. Y
 *   /admin/ajustes/mails redirige (308) a Mensajes › Configuración
 *   (`src/routes/(authed)/admin/ajustes/mails/+server.js`).
 * - `icon`: componente de Lucide (el ícono que se muestra, ver `ICON_MODE`).
 * - `emoji`: el mismo ícono como emoji (se usa si `ICON_MODE` es 'emoji').
 * - `label`: nombre en el menú.
 * - `area`: `null` (Inicio) o el id de una de las {@link NAV_AREAS}.
 * - `sub` (solo Ajustes): subgrupo de {@link AJUSTES_SUBGROUPS} (Plata, Comunicación…). Todas
 *   las secciones de Ajustes lo llevan, menos su portada (`/admin/ajustes`, decisión 0042).
 * - `desc` (solo Ajustes): qué hay en la sección, en una línea (la tarjeta de la portada).
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
 *   desc?: string,
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
	Bot,
	CalendarDays,
	CalendarPlus,
	CalendarRange,
	ChartLine,
	Database,
	Eye,
	EyeOff,
	FileSpreadsheet,
	FileText,
	CircleUser,
	HandCoins,
	HandHeart,
	House,
	IdCard,
	Images,
	Inbox,
	KeyRound,
	Landmark,
	LayoutDashboard,
	Library,
	ListPlus,
	Mail,
	MapPin,
	Pencil,
	Repeat,
	ScanLine,
	ScrollText,
	Settings,
	Share2,
	ShoppingBag,
	Sparkles,
	Tags,
	Ticket,
	TicketPercent,
	ToggleRight,
	Users,
	Video,
	UserCheck,
	Workflow
} from '@lucide/svelte';
import { tagSlug } from '$lib/utils/tagSlug.js';

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
	{ id: 'puerta', label: 'Puerta', icon: ScanLine, emoji: '🚪' },
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
 * Puerta (sola y resaltada, opción C), Eventos, Ventas, Comunidad (con Mensajes), Contenido (con
 * Etiquetas), Estadísticas (sola, por pedido de gorrite) y Ajustes al pie. En la barra lateral
 * cada grupo es UNA sección (link a su primera página, {@link sideSections}); sus páginas son las
 * pestañas de arriba ({@link sectionTabs}). Es solo cómo se muestra: cada sección sigue en su área y en su URL
 * (/admin/<área>/<sección>), y «← Área» sigue llevando a su área. Dentro de un grupo, las
 * secciones del área principal van primero y las de las otras áreas, debajo de su nombre.
 *
 * `landing` (solo Ajustes, decisión 0042): el id del ítem de la portada del grupo. Un grupo con
 * portada no lleva pestañas: la barra lateral (y el panel «Más» del celu) llevan a la portada, que
 * muestra una tarjeta por sección, y cada sección vuelve a ella con «← Ajustes» (`areaBackLink`).
 * @type {readonly { id: string, label: string, icon: NavItem['icon'], emoji: string, areas: readonly string[], foot?: true, highlight?: true, side?: false, landing?: string }[]}
 */
export const NAV_GROUPS = Object.freeze([
	{
		id: 'puerta',
		label: 'Puerta',
		icon: ScanLine,
		emoji: '🚪',
		areas: ['puerta'],
		highlight: true,
		// No va en la barra lateral (gorrite, 11/10, parte 2 de la opción C): está en la barra de
		// abajo del celu, en «Ir a…», en la pestaña Puerta de cada evento y en el bot. Su URL sigue.
		side: false
	},
	{ id: 'eventos', label: 'Eventos', icon: CalendarRange, emoji: '🎟️', areas: ['eventos'] },
	{ id: 'ventas', label: 'Ventas', icon: Ticket, emoji: '💰', areas: ['ventas'] },
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
		id: 'estadisticas',
		label: 'Estadísticas',
		icon: ChartLine,
		emoji: '📈',
		areas: ['estadisticas']
	},
	{
		id: 'ajustes',
		label: 'Ajustes',
		icon: Settings,
		emoji: '⚙️',
		areas: ['ajustes'],
		foot: true,
		// Una portada con tarjetas por subgrupo en vez de pestañas (gorrite, 12/10, decisión 0042).
		landing: 'ajustes'
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
 * Cuántas cosas hay "Para revisar" en el botón global (barra de arriba y header del celu): las
 * filas de la tarjeta "Para revisar" del Inicio, cada una cuenta 1. Sale de `data.panelCounts`
 * (`panelCounts.js`), que arma las filas con la misma función que la tarjeta (`reviewRows` en
 * src/lib/server/admin/review.js, decisión 0030).
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

	// Puerta
	{
		id: 'checkin',
		href: '/admin/checkin',
		icon: ScanLine,
		emoji: '🚪',
		label: 'Puerta',
		// Sección propia (opción C, decisión 0038): se usa en el celu, con gente esperando.
		area: 'puerta',
		soon: false,
		highlight: true
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
		// Crear es una acción, no un lugar (opción C, decisión 0038): está como botón en Eventos,
		// en el buscador («Ir a…») y con `g n`, pero no en el menú.
		menu: false,
		parent: 'eventos'
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
		// Remitente, pie, recordatorios y envíos en tandas. Antes era Ajustes › «Mails y envíos»
		// (/admin/ajustes/mails, que redirige acá; gorrite, 11/10). El id quedó igual (atajos).
		id: 'ajustes-mails',
		href: '/admin/mensajes/configuracion',
		icon: Mail,
		emoji: '✉️',
		label: 'Configuración',
		area: 'mensajes',
		soon: false
	},
	{
		// El estado de «Lo que sigo» para mirar: interruptores, lo más seguido (cuántas cuentas y
		// quiénes, solo admins), números y avisos que salieron. Se ve con el interruptor apagado.
		id: 'lo-que-sigo',
		href: '/admin/mensajes/lo-que-sigo',
		icon: Sparkles,
		emoji: '✨',
		label: 'Lo que sigo',
		area: 'mensajes',
		soon: false
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
		// Todo lo de la biblioteca (R2): imágenes, documentos y videos, con dónde se usa cada cosa,
		// para buscar, subir y sacar (docs/imagenes.md).
		id: 'biblioteca',
		href: '/admin/contenido/biblioteca',
		icon: Images,
		emoji: '🖼️',
		label: 'Biblioteca',
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

	// Estadísticas: tres pestañas (gorrite, 11/10), cada una con su período en la URL. El id
	// `estadisticas` queda en Ventas (lo usan el atajo `g s` y el buscador).
	{
		id: 'estadisticas',
		href: '/admin/estadisticas/ventas',
		icon: ChartLine,
		emoji: '📈',
		label: 'Ventas en el tiempo',
		area: 'estadisticas',
		soon: false
	},
	{
		id: 'estadisticas-asistencia',
		href: '/admin/estadisticas/asistencia',
		icon: UserCheck,
		emoji: '🙋',
		label: 'Asistencia',
		area: 'estadisticas',
		soon: false
	},
	{
		id: 'estadisticas-visitas',
		href: '/admin/estadisticas/visitas',
		icon: Eye,
		emoji: '👀',
		label: 'Visitas al sitio',
		area: 'estadisticas',
		soon: false
	},

	// Ajustes (al pie)
	{
		// La portada de Ajustes (decisión 0042): una tarjeta por sección, en sus cuatro subgrupos,
		// con una línea de estado. Es la página del área (la de «← Ajustes»); sin subgrupo.
		id: 'ajustes',
		href: '/admin/ajustes',
		icon: Settings,
		emoji: '⚙️',
		label: 'Ajustes',
		area: 'ajustes',
		soon: false
	},
	{
		id: 'ajustes-cobros',
		href: '/admin/ajustes/cobros',
		icon: Landmark,
		emoji: '🏦',
		label: 'Cobros',
		area: 'ajustes',
		sub: 'plata',
		desc: 'Datos para transferir y recargo de Mercado Pago',
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
		desc: 'Qué parte de cada entrada va al Fondo Kinky Vibe',
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
		desc: 'Las propinas que entraron, por mes y por publicación',
		soon: false
	},
	{
		// Los textos de la vista previa al compartir un link (docs/compartir.md).
		id: 'ajustes-vistas-previas',
		href: '/admin/ajustes/vistas-previas',
		icon: Share2,
		emoji: '🔗',
		label: 'Vistas previas al compartir',
		area: 'ajustes',
		sub: 'comunicacion',
		desc: 'Cómo se ve un link del sitio en WhatsApp, Telegram o X',
		soon: false
	},
	{
		// Todo lo que dice el bot de Telegram (docs/telegram.md, «Textos del bot»).
		id: 'ajustes-textos-bot',
		href: '/admin/ajustes/textos-bot',
		icon: Bot,
		emoji: '💬',
		label: 'Textos del bot',
		area: 'ajustes',
		sub: 'comunicacion',
		desc: 'Todo lo que dice el bot de Telegram',
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
		desc: 'Quiénes entran al panel y su Telegram para la puerta',
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
		desc: 'Prender y apagar las funciones nuevas',
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
		desc: 'Lo que corre solo: crons, mails programados y el bot',
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
		desc: 'Quién cambió qué, con CSV y «Recuperar»',
		soon: false
	}
]);

/**
 * Pestañas de la ficha de un evento (`/admin/eventos/[slug]` + sufijo). `''` es el Resumen.
 * Cada una lleva su ícono: si es la misma cosa que una sección del menú (`section`, el id de un
 * {@link NavItem}), el de esa sección; si no, uno propio del mismo juego (Lucide), con su emoji.
 *
 * Son 7 (gorrite, 11/10): Ventas junta Órdenes y Transferencias, y Mails junta «Mail a
 * compradores» y las plantillas del evento. Cada una de esas partes es una vista (`views`) de la
 * pestaña, con su propia URL de siempre (los links viejos, los mails y los tests siguen andando);
 * la ficha las muestra como botones arriba de la página. La primera vista es la de la pestaña.
 * @type {readonly { id: string, suffix: string, label: string, soon: boolean, section?: string, icon: NavItem['icon'], emoji: string, views?: readonly { id: string, suffix: string, label: string }[] }[]}
 */
export const EVENT_TABS = Object.freeze(
	[
		{
			id: 'resumen',
			suffix: '',
			label: 'Resumen',
			soon: false,
			icon: LayoutDashboard,
			emoji: '📋'
		},
		// Editar va segunda (y también es un botón del encabezado).
		{ id: 'editar', suffix: '/editar', label: 'Editar', soon: false, icon: Pencil, emoji: '✏️' },
		{
			id: 'ventas',
			suffix: '/ventas',
			label: 'Ventas',
			soon: false,
			section: 'entradas',
			views: [
				{ id: 'ventas', suffix: '/ventas', label: 'Totales' },
				{ id: 'ordenes', suffix: '/ordenes', label: 'Órdenes' },
				{ id: 'transferencias', suffix: '/transferencias', label: 'Transferencias' },
				// Lista de espera (interruptor `lista_espera`): la ficha la muestra con la lista
				// prendida, o si el evento ya tiene lista o gente anotada.
				{ id: 'lista-espera', suffix: '/lista-espera', label: 'Lista de espera' }
			]
		},
		{ id: 'ingreso', suffix: '/ingreso', label: 'Puerta', soon: false, section: 'checkin' },
		{
			id: 'codigos',
			suffix: '/codigos',
			label: 'Códigos',
			soon: false,
			section: 'entradas-codigos'
		},
		// Mandar un aviso a quienes compraron y las plantillas de los mails de este evento (lo que
		// cambia sobre Mensajes → Plantillas).
		{
			id: 'mails',
			suffix: '/mail',
			label: 'Mails',
			soon: false,
			icon: Mail,
			emoji: '✉️',
			views: [
				{ id: 'mail', suffix: '/mail', label: 'Mandar un aviso' },
				{ id: 'mails', suffix: '/mails', label: 'Plantillas' }
			]
		},
		// Preguntas de inscripción: la ficha la muestra con base y venta de entradas.
		{
			id: 'preguntas',
			suffix: '/preguntas',
			label: 'Preguntas',
			soon: false,
			section: 'ajustes-personas'
		}
	].map((t) => {
		// Con `section`, el ícono es el de esa sección del menú (el mismo en la barra lateral y acá).
		const item = t.section ? NAV.find((i) => i.id === t.section) : undefined;
		return Object.freeze({
			...t,
			icon: item?.icon ?? t.icon,
			emoji: item?.emoji ?? t.emoji ?? '',
			...(t.views ? { views: Object.freeze(t.views.map((v) => Object.freeze(v))) } : {})
		});
	})
);

/**
 * URL de la ficha de un evento (o de una de sus pestañas o vistas). `tab` es el id de una vista
 * (`ordenes`, `transferencias`, `mail`, `mails`…) o de una pestaña de {@link EVENT_TABS}; si es
 * las dos cosas, gana la vista (`mails` son las plantillas, como antes de juntar las pestañas).
 * @param {string} slug
 * @param {string} [tab]
 */
export function eventHref(slug, tab = 'resumen') {
	const suffix =
		EVENT_TABS.flatMap((t) => t.views ?? []).find((v) => v.id === tab)?.suffix ??
		EVENT_TABS.find((x) => x.id === tab)?.suffix ??
		'';
	return `/admin/eventos/${encodeURIComponent(slug)}${suffix}`;
}

/**
 * La pestaña (y la vista, si tiene) de una dirección de la ficha de un evento. Las subpáginas
 * cuentan como su pestaña (`/mails/<id>` es Mails › Plantillas, `/ordenes/cargar` es Ventas ›
 * Órdenes). `null` si la dirección no es de la ficha o no es de ninguna pestaña. Solo mira la forma
 * de la dirección (`/admin/eventos/agenda` también le parece un Resumen): usala dentro de la ficha.
 * @param {string} pathname
 * @returns {{ tab: (typeof EVENT_TABS)[number], view: { id: string, suffix: string, label: string } | null } | null}
 */
export function eventTabOf(pathname) {
	const m = pathname.replace(/\/+$/, '').match(/^\/admin\/eventos\/[^/]+(\/.*)?$/);
	if (!m) return null;
	const rest = m[1] ?? '';
	/** @param {string} suffix */
	const within = (suffix) =>
		suffix === '' ? rest === '' : rest === suffix || rest.startsWith(`${suffix}/`);
	for (const tab of EVENT_TABS) {
		const view = tab.views?.find((v) => within(v.suffix));
		if (view) return { tab, view };
		if (!tab.views && within(tab.suffix)) return { tab, view: null };
	}
	return null;
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
 *
 * Una página de la wiki puede venir de un alias o de otra forma de la etiqueta (`/wiki/<alias>`,
 * `/wiki/rancheadita-kinky` → «Rancheadita Kinky»), con o sin entrada: con `wikiTag` (el id de la
 * etiqueta que muestra la página), el link va al editor de esa etiqueta, que también escribe la
 * entrada de un término que todavía no tiene, y no a la dirección tal cual.
 * @param {string} pathname
 * @param {{ wikiTag?: string | null }} [opts]
 * @returns {string | null}
 */
export function contentEditLink(pathname, { wikiTag = null } = {}) {
	const m = pathname.match(/^\/(amigues|calendario|material|wiki)\/([^/]+)\/?$/);
	if (!m) return null;
	if (m[1] === 'calendario') return eventHref(decodeURIComponent(m[2]), 'editar');
	if (m[1] === 'amigues') return `/admin/comunidad/perfiles/${m[2]}`;
	if (m[1] === 'wiki') return wikiEditHref(wikiTag ? tagSlug(wikiTag) : decodeURIComponent(m[2]));
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
	// Si la página del área todavía no existe («Próximamente», como la Bandeja de Mensajes), no hay
	// a dónde volver: sin link (gorrite, 11/10: «el botón "Mensajes" no lleva a ningún lado»).
	return root && !root.soon ? { href: root.href, label: area.label } : null;
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
 * (siguen en `NAV` para el buscador), las `hidden`, con `hideSoon` las que vienen, y la portada de
 * un grupo (`landing`, Ajustes: es la página que muestra las demás, no una más).
 *
 * @param {string | null} area
 * @param {{ flags?: Record<string, boolean>, hideSoon?: boolean }} [opts]
 */
export function navAreaItems(area, { flags = {}, hideSoon = false } = {}) {
	const items = NAV.filter(
		(i) => i.area === area && i.menu !== false && !NAV_GROUPS.some((g) => g.landing === i.id)
	).filter((i) => {
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
 * Las secciones de la barra lateral (opción C, decisión 0038): Inicio y un link por grupo del menú
 * ({@link NAV_GROUPS}, salvo los de `side: false`: la Puerta), sin sub-ítems. Cada una lleva a la primera página de su grupo que existe
 * (Eventos → /admin/eventos, Comunidad → Personas…), o a su portada (Ajustes → /admin/ajustes,
 * decisión 0042); las demás páginas del grupo
 * son pestañas arriba de la página ({@link sectionTabs}). Un grupo sin ninguna página lista (todo
 * próximamente u oculto) no se muestra. `count` es la suma de los contadores del grupo.
 *
 * @param {{ flags?: Record<string, boolean>, counts?: Record<string, number> }} [opts]
 * @returns {{ id: string, label: string, icon: NavItem['icon'], emoji: string, href: string, root: string, foot: boolean, highlight: boolean, count: number }[]}
 */
export function sideSections({ flags = {}, counts = {} } = {}) {
	const inicio = /** @type {NavItem} */ (navItem('inicio'));
	const out = [
		{
			id: inicio.id,
			label: inicio.label,
			icon: inicio.icon,
			emoji: inicio.emoji,
			href: inicio.href,
			root: inicio.id,
			foot: false,
			highlight: false,
			count: 0
		}
	];
	for (const g of NAV_GROUPS) {
		if (g.side === false) continue;
		// Con portada (Ajustes), a la portada; si no, a la primera página del grupo.
		const root = g.landing ? navItem(g.landing) : navGroupItems(g.id, { flags, hideSoon: true })[0];
		if (!root) continue;
		out.push({
			id: g.id,
			label: g.label,
			icon: g.icon,
			emoji: g.emoji,
			href: root.href,
			root: root.id,
			foot: Boolean(g.foot),
			highlight: Boolean(g.highlight),
			count: groupCount(g.id, counts, { flags })
		});
	}
	return out;
}

/**
 * La sección de la barra lateral de una página: `'inicio'`, el id de su grupo, o `null`.
 * @param {NavItem | undefined} item el ítem activo ({@link activeNavItem})
 * @returns {string | null}
 */
export function activeSection(item) {
	if (!item) return null;
	if (item.id === 'inicio') return 'inicio';
	return navGroupOf(item.area)?.id ?? null;
}

/**
 * Pestañas de sección: en la página principal de cada sección de un grupo del menú con dos o más
 * secciones, una barra con todas las secciones del grupo. Con la opción C (decisión 0038) la
 * barra lateral solo muestra los grupos, así que estas pestañas son el único menú de las páginas
 * de cada grupo (menos Ajustes, que tiene portada, decisión 0042): también Eventos (Eventos, Agenda, Series, Lugares, Roles y
 * preguntas). No llevan las subpáginas (fichas, formularios) ni la Puerta (es una sola página).
 * `null` si la página no lleva.
 *
 * Parte 2 (gorrite, 11/10): cada pestaña lleva el contador «a revisar» de su sección (el mismo de
 * la barra lateral y de «Para revisar», `counts` = `data.panelCounts`), y lo que viene va al final,
 * gris y sin link («Próximamente», `soon: true`), salvo con «Ocultar lo que viene»: el layout pasa
 * `hideSoon` de cada persona; sin pasarlo, como antes, sin lo que viene.
 * Cada pestaña lleva el ícono de su sección (el mismo que en la barra lateral).
 * @param {string} pathname
 * @param {{ flags?: Record<string, boolean>, counts?: Record<string, number>, hideSoon?: boolean }} [opts]
 * @returns {{ label: string, tabs: { href: string, label: string, icon: NavItem['icon'], count?: number, soon?: boolean }[] } | null}
 */
export function sectionTabs(pathname, { flags = {}, counts = {}, hideSoon = true } = {}) {
	const path = pathname.replace(/\/+$/, '') || '/';
	const item = NAV.find((i) => i.href === path && !i.soon && i.menu !== false);
	const group = navGroupOf(item?.area);
	if (!item || !group || navState(item, flags) === 'hidden') return null;
	// Un grupo con portada (Ajustes, decisión 0042) no lleva pestañas: se vuelve con «← Ajustes».
	if (group.landing) return null;
	const items = navGroupItems(group.id, { flags, hideSoon });
	if (items.filter((i) => !i.soon).length < 2) return null;
	return {
		label: `Secciones de ${group.label}`,
		tabs: items.map((i) => {
			const count = i.counter && !i.soon ? Number(counts[i.counter] ?? 0) || 0 : 0;
			return {
				href: i.href,
				label: i.label,
				icon: i.icon,
				...(count ? { count } : {}),
				...(i.soon ? { soon: true } : {})
			};
		})
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
