/**
 * Cómo se comporta el panel lateral (la barra lateral del panel, solo en la compu, ≥ 900 px; en el
 * celu está la barra de abajo y el panel "Más"). Cada admin elige el suyo (gorrite, 11/10):
 * - 'abierto': siempre abierto, con los nombres (lo de siempre; el default);
 * - 'iconos': una franja angosta con los íconos; el nombre aparece al pasar el mouse o con el
 *   foco del teclado;
 * - 'oculto': no ocupa lugar; un botón de la barra de arriba lo abre encima del contenido.
 *
 * No hay preferencias por admin en la base (les admins están en el código, `ADMINS` de auth.js):
 * se guarda en localStorage, con la clave de cada login (`kv-panel-lateral:<login>`). Vale para ese
 * navegador. Puede fallar (ventana privada, storage bloqueado): entonces vale la de siempre.
 * Se aplica como `data-lateral` en <html> (como el tema, `theme.js`), y un script del <head> lo
 * pone antes de pintar, así no se ve el panel equivocado al cargar.
 */

export const SIDEBAR_KEY = 'kv-panel-lateral';

/** @typedef {'abierto' | 'iconos' | 'oculto'} SidebarMode */

/** @type {SidebarMode} */
export const DEFAULT_SIDEBAR_MODE = 'abierto';

/** @type {readonly SidebarMode[]} */
export const SIDEBAR_MODES = Object.freeze(['abierto', 'iconos', 'oculto']);

/**
 * Nombres para el selector (menú de tu cuenta).
 * @type {Readonly<Record<SidebarMode, string>>}
 */
export const SIDEBAR_MODE_LABELS = Object.freeze({
	abierto: 'Siempre abierto',
	iconos: 'Solo íconos',
	oculto: 'Se oculta'
});

/**
 * @param {unknown} value lo guardado en localStorage
 * @returns {SidebarMode}
 */
export function parseSidebarMode(value) {
	return SIDEBAR_MODES.includes(/** @type {SidebarMode} */ (value))
		? /** @type {SidebarMode} */ (value)
		: DEFAULT_SIDEBAR_MODE;
}

/**
 * Clave de localStorage de cada admin. Un login de GitHub solo tiene letras, números y guiones;
 * cualquier otra cosa se descarta (el resultado va también dentro del script del <head>).
 * @param {string | null | undefined} login
 */
export function sidebarKey(login) {
	const clean = String(login ?? '').replace(/[^A-Za-z0-9-]/g, '');
	return clean ? `${SIDEBAR_KEY}:${clean}` : SIDEBAR_KEY;
}

/**
 * @param {string | null | undefined} login
 * @returns {SidebarMode}
 */
export function readSidebarMode(login) {
	try {
		return parseSidebarMode(localStorage.getItem(sidebarKey(login)));
	} catch {
		return DEFAULT_SIDEBAR_MODE;
	}
}

/** @param {SidebarMode} mode */
export function applySidebarMode(mode) {
	if (mode === DEFAULT_SIDEBAR_MODE) document.documentElement.removeAttribute('data-lateral');
	else document.documentElement.setAttribute('data-lateral', mode);
}

/**
 * Guarda (la de siempre borra la clave) y la aplica.
 * @param {string | null | undefined} login
 * @param {SidebarMode} mode
 */
export function saveSidebarMode(login, mode) {
	const value = parseSidebarMode(mode);
	try {
		if (value === DEFAULT_SIDEBAR_MODE) localStorage.removeItem(sidebarKey(login));
		else localStorage.setItem(sidebarKey(login), value);
	} catch {
		// Sin storage: dura hasta recargar.
	}
	applySidebarMode(value);
}

/**
 * El cuerpo del script del <head>: fijo para todes (la clave va en el atributo `data-k` del
 * propio script), así la CSP lo permite por su hash (svelte.config.js).
 */
export const SIDEBAR_SCRIPT_BODY = `try{var m=localStorage.getItem(document.currentScript.dataset.k);if(m==='iconos'||m==='oculto')document.documentElement.setAttribute('data-lateral',m)}catch(e){}`;

/**
 * Script en línea para el <head> del panel: pone `data-lateral` antes de pintar. Solo lleva la
 * clave (sacada del login con {@link sidebarKey}: letras, números, guiones y `:`, nada que
 * escapar en un atributo), sin nada más de la persona.
 * @param {string | null | undefined} login
 */
export function sidebarHeadScript(login) {
	return `<script data-k="${sidebarKey(login)}">${SIDEBAR_SCRIPT_BODY}</script>`;
}
