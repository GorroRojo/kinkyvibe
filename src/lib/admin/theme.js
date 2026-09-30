/**
 * Tema del panel: 'light' (el de siempre, como el sitio), 'dark' o 'auto' (sigue al sistema).
 * Sin elección guardada el panel es claro. La elección se guarda en localStorage (puede fallar en
 * ventanas privadas o con el storage bloqueado: entonces vale el claro) y se aplica como
 * `data-theme` en <html>; los tokens de `panel.scss` hacen el resto.
 */

export const THEME_KEY = 'kv-panel-theme';

/** @typedef {'auto' | 'light' | 'dark'} Theme */

/** Tema cuando la persona no eligió ninguno. */
export const DEFAULT_THEME = 'light';

/**
 * @param {unknown} value lo guardado en localStorage
 * @returns {Theme}
 */
export function parseTheme(value) {
	return value === 'light' || value === 'dark' || value === 'auto' ? value : DEFAULT_THEME;
}

/**
 * Script en línea para el <head> del panel: pone `data-theme` antes de pintar (sin parpadeo).
 * Es un string fijo, sin datos de la persona.
 */
export const THEME_HEAD_SCRIPT = `<script>try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='auto')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`;

/** @returns {Theme} */
export function readTheme() {
	try {
		return parseTheme(localStorage.getItem(THEME_KEY));
	} catch {
		return DEFAULT_THEME;
	}
}

/** @param {Theme} theme */
export function applyTheme(theme) {
	document.documentElement.setAttribute('data-theme', theme);
}

/** @param {Theme} theme */
export function saveTheme(theme) {
	try {
		if (theme === DEFAULT_THEME) localStorage.removeItem(THEME_KEY);
		else localStorage.setItem(THEME_KEY, theme);
	} catch {
		// Sin storage: el tema dura hasta recargar.
	}
	applyTheme(theme);
}

/**
 * Siguiente tema al tocar el botón: claro → oscuro → automático → claro.
 * @param {Theme} theme
 * @returns {Theme}
 */
export function nextTheme(theme) {
	return theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
}

/** @type {Record<Theme, { icon: string, label: string }>} */
export const THEME_LABELS = {
	auto: { icon: '🌓', label: 'Tema: automático' },
	light: { icon: '☀️', label: 'Tema: claro' },
	dark: { icon: '🌙', label: 'Tema: oscuro' }
};
