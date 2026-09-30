/**
 * Tema del panel: 'auto' (sigue al sistema), 'light' o 'dark'. La elección se guarda en
 * localStorage (puede fallar en ventanas privadas o con el storage bloqueado: entonces vale 'auto')
 * y se aplica como `data-theme` en <html>; los tokens de `panel.scss` hacen el resto.
 */

export const THEME_KEY = 'kv-panel-theme';

/** @typedef {'auto' | 'light' | 'dark'} Theme */

/**
 * Script en línea para el <head> del panel: pone `data-theme` antes de pintar (sin parpadeo).
 * Es un string fijo, sin datos de la persona.
 */
export const THEME_HEAD_SCRIPT = `<script>try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>`;

/** @returns {Theme} */
export function readTheme() {
	try {
		const t = localStorage.getItem(THEME_KEY);
		return t === 'light' || t === 'dark' ? t : 'auto';
	} catch {
		return 'auto';
	}
}

/** @param {Theme} theme */
export function applyTheme(theme) {
	const root = document.documentElement;
	if (theme === 'auto') root.removeAttribute('data-theme');
	else root.setAttribute('data-theme', theme);
}

/** @param {Theme} theme */
export function saveTheme(theme) {
	try {
		if (theme === 'auto') localStorage.removeItem(THEME_KEY);
		else localStorage.setItem(THEME_KEY, theme);
	} catch {
		// Sin storage: el tema dura hasta recargar.
	}
	applyTheme(theme);
}

/**
 * Siguiente tema al tocar el botón: auto → claro → oscuro → auto.
 * @param {Theme} theme
 * @returns {Theme}
 */
export function nextTheme(theme) {
	return theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
}

/** @type {Record<Theme, { icon: string, label: string }>} */
export const THEME_LABELS = {
	auto: { icon: '🌓', label: 'Tema: automático' },
	light: { icon: '☀️', label: 'Tema: claro' },
	dark: { icon: '🌙', label: 'Tema: oscuro' }
};
