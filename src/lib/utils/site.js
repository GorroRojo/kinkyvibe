/**
 * La dirección del sitio, en un solo lugar: los links absolutos (JSON-LD, feeds, calendarios,
 * security.txt), el origen por defecto de los mails y del cron, y el webhook del bot.
 *
 * Sin imports: lo usan también el Worker del cron (src/lib/server/scheduled.js, sin Vite) y el
 * navegador.
 */

/** El sitio publicado (producción). */
export const SITE_URL = 'https://kinkyvibe.ar';

/**
 * El primer origen que diga algo (sin espacios ni `/` al final), o {@link SITE_URL}. Para elegir
 * entre lo que pasó quien llama, la variable `SITE_URL` del entorno y el de producción.
 *
 * @param {...(string | null | undefined)} candidates en orden de preferencia
 * @returns {string}
 */
export function siteOriginFrom(...candidates) {
	for (const c of candidates) {
		const origin = typeof c === 'string' ? c.trim().replace(/\/+$/, '') : '';
		if (origin) return origin;
	}
	return SITE_URL;
}
