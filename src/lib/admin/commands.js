/**
 * Acciones y atajos de teclado de la paleta de comandos del panel (SearchBox). Sin dependencias
 * del navegador: se testea en Node.
 *
 * - Acciones: todas las secciones del menú (`NAV`) que ya tienen página, más atajos como
 *   "Nuevo código" o "Abrir check-in de hoy".
 * - Atajos de dos teclas: `g` y después una letra (`g i` Inicio, `g e` Eventos…). `/` o
 *   Ctrl/⌘+K abren la paleta y `?` muestra la hoja de atajos.
 */
import { NAV, NAV_GROUPS, navItem, navLink } from './nav.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   hint: string,
 *   keywords: string,
 *   icon: string,
 *   href?: string,
 *   external?: boolean,
 *   run?: 'help',
 *   shortcut?: string,
 *   navId?: string
 * }} Command
 */

/** `g` + letra → id de NAV. El orden es el de la hoja de atajos. */
export const GO_SHORTCUTS = Object.freeze([
	{ key: 'i', id: 'inicio' },
	{ key: 'e', id: 'eventos' },
	{ key: 'n', id: 'eventos-nuevo' },
	{ key: 'c', id: 'checkin' },
	{ key: 'v', id: 'entradas' },
	{ key: 't', id: 'entradas-transferencias' },
	{ key: 'd', id: 'entradas-codigos' },
	{ key: 'p', id: 'personas' },
	{ key: 's', id: 'estadisticas' },
	{ key: 'l', id: 'no-listadas' },
	{ key: 'm', id: 'ajustes-mails' },
	{ key: 'a', id: 'actividad' }
]);

/** Otras teclas, para la hoja de atajos. */
export const OTHER_SHORTCUTS = Object.freeze([
	{ keys: ['/'], label: 'Buscar (abre la paleta)' },
	{ keys: ['Ctrl', 'K'], label: 'Buscar desde cualquier lado (⌘ K en Mac)' },
	{ keys: ['↑', '↓'], label: 'Moverse por los resultados' },
	{ keys: ['Enter'], label: 'Abrir el resultado elegido' },
	{ keys: ['Esc'], label: 'Cerrar la paleta' },
	{ keys: ['?'], label: 'Mostrar esta hoja de atajos' }
]);

/** Palabras extra para encontrar cada sección con otras palabras. */
const NAV_KEYWORDS = /** @type {Record<string, string>} */ ({
	inicio: 'home resumen principal',
	eventos: 'lista calendario agenda',
	'eventos-nuevo': 'nuevo crear evento cargar duplicar',
	'eventos-importar': 'importar planilla excel sheet',
	'eventos-agenda': 'agenda planilla tabla',
	'eventos-lugares': 'lugares direccion mapa venue espacio donde',
	checkin: 'check-in ingreso puerta qr escanear',
	entradas: 'ventas entradas plata recaudado',
	'entradas-transferencias': 'transferencias pagos comprobante confirmar',
	'entradas-codigos': 'codigos descuento cupon',
	personas: 'personas clientes compradores gente',
	estadisticas: 'estadisticas graficos tendencias analytics',
	'no-listadas': 'no listadas borradores ocultas',
	'ajustes-cobros': 'ajustes cobros alias cbu mercado pago comision',
	'ajustes-fondo': 'ajustes fondo porcentaje',
	'ajustes-mails': 'ajustes de mails plantillas recordatorios remitente email',
	'ajustes-admins': 'admins permisos',
	'ajustes-interruptores': 'ajustes interruptores funciones nuevas prender apagar activar flags',
	cuentas: 'cuentas usuaries publico registradas',
	'cuentas-perfiles': 'perfiles cuentas revisar grupos',
	actividad: 'actividad registro auditoria historial quien cambio'
});

/** Ícono (nombre de Lucide, ver SearchBox) de cada sección. */
export const NAV_ICONS = /** @type {Record<string, string>} */ ({
	inicio: 'home',
	eventos: 'calendar',
	'eventos-nuevo': 'calendar-plus',
	'eventos-importar': 'sheet',
	'eventos-agenda': 'calendar',
	'eventos-lugares': 'map-pin',
	checkin: 'scan',
	entradas: 'wallet',
	'entradas-transferencias': 'transfer',
	'entradas-codigos': 'tag',
	personas: 'users',
	estadisticas: 'chart',
	material: 'book',
	amigues: 'heart',
	etiquetas: 'tag',
	'no-listadas': 'eye-off',
	'ajustes-cobros': 'settings',
	'ajustes-fondo': 'settings',
	'ajustes-mails': 'mail',
	'ajustes-admins': 'key',
	'ajustes-interruptores': 'settings',
	cuentas: 'person',
	'cuentas-perfiles': 'person',
	actividad: 'history'
});

/**
 * Atajo `g x` de una sección, o `''`.
 * @param {string} id
 */
export function shortcutOf(id) {
	const s = GO_SHORTCUTS.find((x) => x.id === id);
	return s ? `g ${s.key}` : '';
}

/**
 * Todas las acciones de la paleta. `today`: eventos de hoy con venta (para "Abrir check-in de
 * hoy"; si no hay, la acción va a elegir evento).
 *
 * @param {{ today?: { slug: string, title: string, href: string }[] }} [opts]
 * @returns {Command[]}
 */
export function buildCommands({ today = [] } = {}) {
	/** @type {Command[]} */
	const out = [];
	const groupLabel = new Map(NAV_GROUPS.map((g) => [g.id, g.label]));
	const checkin = navItem('checkin');
	const checkinFallback = checkin ? navLink(checkin) : null;

	if (today.length) {
		for (const e of today) {
			out.push({
				id: `checkin-today:${e.slug}`,
				label: `Abrir check-in de hoy: ${e.title}`,
				hint: 'Modo puerta',
				keywords: 'check-in ingreso puerta hoy qr escanear',
				icon: 'scan',
				href: e.href
			});
		}
	} else if (checkinFallback) {
		out.push({
			id: 'checkin-today',
			label: 'Abrir check-in de hoy',
			hint: 'Hoy no hay eventos con entradas: elegí uno',
			keywords: 'check-in ingreso puerta hoy qr escanear',
			icon: 'scan',
			href: checkinFallback
		});
	}
	out.push({
		id: 'new-code',
		label: 'Nuevo código de descuento',
		hint: 'Códigos',
		keywords: 'nuevo codigo descuento cupon crear',
		icon: 'tag',
		href: '/admin/entradas/codigos'
	});

	for (const item of NAV) {
		const href = navLink(item);
		if (!href) continue;
		out.push({
			id: `nav:${item.id}`,
			label: item.label,
			hint: item.group ? (groupLabel.get(item.group) ?? '') : 'Panel',
			keywords: `${NAV_KEYWORDS[item.id] ?? ''} ${item.group ?? ''}`,
			icon: NAV_ICONS[item.id] ?? 'arrow',
			href,
			shortcut: shortcutOf(item.id) || undefined,
			navId: item.id
		});
	}

	out.push(
		{
			id: 'site',
			label: 'Ver el sitio',
			hint: 'Se abre en otra pestaña',
			keywords: 'sitio publico web pagina',
			icon: 'external',
			href: '/',
			external: true
		},
		{
			id: 'help',
			label: 'Atajos de teclado',
			hint: 'Tecla ?',
			keywords: 'atajos teclado ayuda shortcuts',
			icon: 'keyboard',
			run: 'help'
		},
		{
			id: 'logout',
			label: 'Cerrar sesión',
			hint: '',
			keywords: 'salir logout cerrar sesion',
			icon: 'logout',
			href: '/logout?redirectTo=/'
		}
	);
	return out;
}

/**
 * Texto para comparar sin mayúsculas ni tildes.
 * @param {unknown} s
 */
export function fold(s) {
	return String(s ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Filtra y ordena las acciones para lo que se escribió: primero las que empiezan igual, después
 * las que tienen una palabra que empieza igual, después las que lo contienen (en el nombre o en
 * las palabras extra). Con la búsqueda vacía, todas en su orden.
 *
 * @param {Command[]} commands
 * @param {string} q
 * @param {number} [limit]
 * @returns {Command[]}
 */
export function matchCommands(commands, q, limit = Infinity) {
	const f = fold(q);
	if (!f) return commands.slice(0, limit);
	const words = f.split(' ');
	/** @type {{ c: Command, rank: number, i: number }[]} */
	const found = [];
	commands.forEach((c, i) => {
		const label = fold(c.label);
		const all = `${label} ${fold(c.keywords)} ${fold(c.hint)}`;
		let rank = -1;
		if (label.startsWith(f)) rank = 0;
		else if (label.split(' ').some((w) => w.startsWith(f))) rank = 1;
		// A la mitad de una palabra solo desde 4 letras ("fer" no tiene que traer "Transferencias").
		else if (f.length >= 4 && label.includes(f)) rank = 2;
		else if (words.every((w) => all.split(' ').some((x) => x.startsWith(w)))) rank = 3;
		if (rank >= 0) found.push({ c, rank, i });
	});
	found.sort((a, b) => a.rank - b.rank || a.i - b.i);
	return found.slice(0, limit).map((x) => x.c);
}

/**
 * Sección a la que lleva `g` + `key`, si existe y tiene página.
 * @param {string} key
 * @returns {string | null} URL
 */
export function goShortcutHref(key) {
	const s = GO_SHORTCUTS.find((x) => x.key === key.toLowerCase());
	const item = s ? navItem(s.id) : undefined;
	return item ? navLink(item) : null;
}

/**
 * Filas de la hoja de atajos de navegación (las que todavía no tienen página, marcadas).
 * @returns {{ keys: string[], label: string, available: boolean }[]}
 */
export function goShortcutRows() {
	return GO_SHORTCUTS.map((s) => {
		const item = navItem(s.id);
		return {
			keys: ['g', s.key],
			label: item?.label ?? s.id,
			available: Boolean(item && navLink(item))
		};
	});
}
