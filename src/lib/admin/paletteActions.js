/**
 * Todas las acciones de la paleta de comandos (SearchBox): las de `buildCommands` (secciones del
 * menú, «Nuevo código de descuento», «Abrir la puerta de hoy»…) más las que no son secciones:
 * «Para revisar», crear e importar, «Cómo buscar» y las preferencias de cada persona (tema,
 * «Ocultar lo que viene»). Y la regla de qué va arriba: las acciones o los registros, y los
 * ejemplos de la ayuda «Cómo buscar» (los operadores, ver $lib/utils/searchQuery.js). Sin
 * dependencias del navegador.
 */
import { NAV, REVIEW_LINK, navState } from './nav.js';
import { buildCommands, fold } from './commands.js';
import { createItems } from './createMenu.js';
import { SEARCH_GUIDE_TEXT, searchHelp } from '$lib/utils/searchSyntax.js';

/**
 * Una fila de Fijados o Recientes en la paleta vacía: `place` dice que el ícono es el de su
 * página (`placeIcon`, como en la barra lateral).
 * @typedef {{ key: string, icon: string, title: string, sub: string, href: string, place: true }} PlaceRow
 */

/**
 * Lo que muestra «Ir a…» sin nada escrito (gorrite, 12/10): las páginas fijadas y después las
 * recientes, con los mismos nombres que en la barra lateral (`label` en negrita, `context` abajo).
 * Las secciones vacías no van; sin ninguna de las dos, `[]` (la paleta muestra un aviso).
 * `recent` ya viene sin las fijadas ni la página actual (`visibleRecent`).
 * @param {import('./recentPlaces.js').RecentPlace[]} pinned
 * @param {import('./recentPlaces.js').RecentPlace[]} recent
 * @returns {{ id: 'pinned' | 'recent', label: string, rows: PlaceRow[] }[]}
 */
export function placeSections(pinned, recent) {
	/** @param {'pin' | 'recent'} kind @returns {(p: import('./recentPlaces.js').RecentPlace) => PlaceRow} */
	const row = (kind) => (p) => ({
		key: `${kind}:${p.href}`,
		icon: '',
		title: p.label,
		sub: p.context ?? '',
		href: p.href,
		place: true
	});
	const pinnedHrefs = new Set(pinned.map((p) => p.href));
	const sections = [
		{ id: /** @type {const} */ ('pinned'), label: 'Fijados', rows: pinned.map(row('pin')) },
		{
			id: /** @type {const} */ ('recent'),
			label: 'Recientes',
			rows: recent.filter((r) => !pinnedHrefs.has(r.href)).map(row('recent'))
		}
	];
	return sections.filter((s) => s.rows.length);
}

/**
 * Una acción; `run` dice qué hace la paleta en vez de ir a `href`: la hoja de atajos, la ayuda
 * «Cómo buscar», cambiar el tema u ocultar o mostrar lo que viene.
 * @typedef {Omit<import('./commands.js').Command, 'run'> & { run?: 'help' | 'search-help' | 'theme' | 'hide-soon' }} Command
 */

/** La acción que abre la ayuda «Cómo buscar» (en la hoja de atajos). @type {Readonly<Command>} */
export const SEARCH_HELP_COMMAND = Object.freeze({
	id: 'search-help',
	label: 'Cómo buscar',
	// La pista sale de searchSyntax.js, con los demás textos de las guías «Cómo buscar».
	hint: SEARCH_GUIDE_TEXT.panel.commandHint,
	keywords: 'ayuda buscar buscador operadores filtros etiqueta persona tipo lugar fecha',
	icon: 'search',
	run: /** @type {const} */ ('search-help')
});

/**
 * Las líneas de la ayuda «Cómo buscar» del panel, en orden: `searchHelp('panel')` de
 * $lib/utils/searchSyntax.js, la fuente única de las guías del sitio, el bot y el panel (las
 * frases, las exclusiones, cada operador que anda en el panel, también los de solo el panel, y la
 * palabra de pestaña y `>`, que son líneas de solo el panel en `HELP_ROWS`). Acá no se escribe
 * ninguna línea a mano: se cambian allá. `q`: el ejemplo (al tocarlo, la paleta lo busca);
 * `label`: cómo se escribe el operador (sus formas juntas, como en la ayuda del sitio y del bot:
 * `@nombre · persona:`), que la guía muestra en una sola etiqueta.
 * @type {readonly { q: string, label?: string, text: string }[]}
 */
export const SEARCH_TIPS = Object.freeze(
	searchHelp('panel').map((row) => ({
		q: row.example,
		...(row.label === undefined ? {} : { label: row.label }),
		text: row.help
	}))
);

/**
 * Atajos a páginas que no están en el menú (o que son un botón dentro de una sección). Van
 * después de las secciones: con la misma coincidencia, gana la sección.
 * @type {readonly Command[]}
 */
export const EXTRA_COMMANDS = Object.freeze([
	{
		id: 'review',
		label: REVIEW_LINK.label,
		hint: 'Inicio',
		keywords: 'revisar pendientes pedidos aprobar problemas avisos',
		icon: 'check',
		href: REVIEW_LINK.href
	},
	{
		id: 'new-material',
		label: 'Nuevo material',
		hint: 'Material',
		keywords: 'nuevo crear material guia articulo nota publicacion kinkipedia',
		icon: 'book',
		href: '/admin/contenido/material/nuevo'
	},
	{
		id: 'new-profile',
		label: 'Nuevo perfil',
		hint: 'Perfiles',
		keywords: 'nuevo crear perfil amigues persona proyecto lugar ficha',
		icon: 'profile',
		href: '/admin/comunidad/perfiles/nuevo'
	},
	{
		id: 'classify-profiles',
		label: 'Clasificar perfiles',
		hint: 'Perfiles · persona, proyecto o lugar',
		keywords: 'clasificar perfiles amigues confirmar persona proyecto lugar',
		icon: 'sheet',
		href: '/admin/comunidad/perfiles/importar'
	},
	{
		id: 'import-places',
		label: 'Importar lugares',
		hint: 'Lugares · desde los eventos',
		keywords: 'importar lugares venues espacios direcciones eventos',
		icon: 'map-pin',
		href: '/admin/eventos/lugares/importar'
	},
	{
		id: 'link-places',
		label: 'Vincular lugares',
		hint: 'Lugares · el «sucede en» de cada evento',
		keywords: 'vincular lugares eventos sucede en venues espacios unir',
		icon: 'map-pin',
		href: '/admin/eventos/lugares/vincular'
	}
]);

/**
 * Preferencias de cada persona (las guarda el navegador; ver theme.js y navPrefs.js). No llevan a
 * otra página: la paleta avisa al layout, que es quien las cambia.
 * @param {{ hideSoon?: boolean }} [opts] `hideSoon`: si ahora están ocultas las secciones
 *   «Próximamente» (cambia el nombre de la acción)
 * @returns {Command[]}
 */
export function preferenceCommands({ hideSoon = false } = {}) {
	return [
		{
			id: 'theme',
			label: 'Cambiar tema',
			hint: 'Claro → oscuro → automático',
			keywords: 'tema oscuro claro modo noche dark light automatico colores',
			icon: 'theme',
			run: 'theme'
		},
		{
			id: 'hide-soon',
			label: hideSoon ? 'Mostrar lo que viene' : 'Ocultar lo que viene',
			hint: 'Las secciones «Próximamente» del menú',
			keywords: 'ocultar mostrar lo que viene proximamente secciones menu',
			icon: hideSoon ? 'eye' : 'eye-off',
			run: 'hide-soon'
		}
	];
}

/** Ícono de la paleta (nombre de `ICONS` en SearchBox) de cada ítem de «Crear». */
const CREATE_ICONS = /** @type {Record<string, string>} */ ({
	evento: 'calendar-plus',
	serie: 'calendar',
	lugar: 'map-pin',
	importar: 'sheet',
	rol: 'users',
	codigo: 'tag',
	perfil: 'profile',
	material: 'book',
	kinkipedia: 'tag',
	formulario: 'mail'
});

/**
 * «Crear: …» (las del menú «+ Crear ▾», `createMenu.js`) que no son ya otra acción con la misma
 * URL (como «Nuevo material» o «Cargar evento»). Lo que viene no está: no hay a dónde ir; lo que
 * está detrás de un interruptor apagado (`flags`), tampoco.
 * @param {Command[]} existing las acciones que ya hay
 * @param {Record<string, boolean>} [flags]
 * @returns {Command[]}
 */
export function createCommands(existing, flags = {}) {
	const hrefs = new Set(existing.map((c) => c.href));
	return createItems({ hideSoon: true, flags })
		.filter((c) => c.href && !hrefs.has(c.href))
		.map((c) => ({
			id: `create:${c.id}`,
			label: `Crear: ${c.label}`,
			hint: c.hint,
			keywords: c.keywords,
			icon: CREATE_ICONS[c.id] ?? 'arrow',
			href: c.href
		}));
}

/**
 * Las plantillas de formularios (las que se crean solas, `src/lib/server/formularios/templates.js`;
 * una prueba controla que sean las mismas). Cada una es una acción de la paleta que lleva a su
 * fila en Comunidad › Formularios, con «Usar esta plantilla».
 */
export const FORM_TEMPLATE_LINKS = Object.freeze([
	{ slug: 'plantilla-encuesta', title: '¿Cómo la pasaste?' },
	{ slug: 'plantilla-propuesta', title: 'Proponé un taller o una colaboración' },
	{ slug: 'plantilla-beca', title: 'Pedido de beca' },
	{ slug: 'plantilla-comentarios', title: 'Contanos qué te parece' }
]);

/**
 * Atajos de Formularios (interruptor `formularios`): «Cómo salen por defecto» y una acción por
 * plantilla. La lista y «Crear: Formulario» salen de la sección y del menú «Crear».
 * @type {readonly Command[]}
 */
export const FORM_COMMANDS = Object.freeze([
	{
		id: 'forms-defaults',
		label: 'Cómo salen por defecto los formularios',
		hint: 'Formularios · encuesta, privacidad, mails',
		keywords:
			'formularios encuesta por defecto ajustes privacidad anonima dias despues mail asunto',
		icon: 'mail',
		href: '/admin/comunidad/formularios/por-defecto'
	},
	...FORM_TEMPLATE_LINKS.map((t) => ({
		id: `form-template:${t.slug}`,
		label: `Plantilla de formulario: ${t.title}`,
		hint: 'Formularios · usar esta plantilla',
		keywords: `plantilla formulario encuesta copiar ${t.title}`,
		icon: 'mail',
		href: `/admin/comunidad/formularios#${t.slug}`
	}))
]);

/**
 * Las acciones de la paleta, en orden: las de `buildCommands`, después las de
 * {@link EXTRA_COMMANDS}, las de Formularios (si está prendido), las de «Crear» que faltan,
 * «Cómo buscar» y las preferencias. Con un interruptor apagado (`flags[x] === false`), las
 * secciones que esconde no están.
 * @param {{ today?: { slug: string, title: string, href: string }[], hideSoon?: boolean,
 *   flags?: Record<string, boolean> }} [opts]
 * @returns {Command[]}
 */
export function paletteCommands({ today = [], hideSoon = false, flags = {} } = {}) {
	const hidden = new Set(
		NAV.filter((i) => navState(i, flags) === 'hidden').map((i) => `nav:${i.id}`)
	);
	const base = [
		...buildCommands({ today }).filter((c) => !hidden.has(c.id)),
		...EXTRA_COMMANDS,
		...(flags.formularios === false ? [] : FORM_COMMANDS)
	];
	return [
		...base,
		...createCommands(base, flags),
		SEARCH_HELP_COMMAND,
		...preferenceCommands({ hideSoon })
	];
}

/**
 * ¿Los registros van arriba de las acciones? Sí cuando lo buscado es claramente un registro:
 * 1. algún registro coincide entero (`exact`: el mismo nombre, título, email, código o
 *    referencia `KV-…`, sin mayúsculas ni tildes), y ninguna acción se llama exactamente así; o
 * 2. hay registros y ninguna acción coincide por su nombre (solo por palabras extra, como
 *    «analytics» → Visitas al sitio).
 * Si no, las acciones van primero, como siempre.
 *
 * @param {string} q
 * @param {string[]} actionLabels los nombres de las acciones que coincidieron
 * @param {{ items: { exact?: boolean }[] }[]} groups los grupos de registros
 */
export function recordsFirst(q, actionLabels, groups) {
	const f = fold(q);
	if (!f || !groups.some((g) => g.items.length)) return false;
	const labels = actionLabels.map(fold);
	if (labels.includes(f)) return false;
	if (groups.some((g) => g.items.some((i) => i.exact))) return true;
	// Coincidir por el nombre, como en matchCommands: al comienzo, al comienzo de una palabra o,
	// desde 4 letras, en el medio.
	return !labels.some(
		(l) =>
			l.startsWith(f) ||
			l.split(' ').some((w) => w.startsWith(f)) ||
			(f.length >= 4 && l.includes(f))
	);
}
