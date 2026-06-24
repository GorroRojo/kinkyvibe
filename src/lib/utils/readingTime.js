/**
 * Estima el tiempo de lectura en minutos a partir del markdown crudo de un post.
 *
 * Cuenta palabras sobre el texto fuente (no el componente compilado de mdsvex):
 * descarta frontmatter, bloques `<script>`/`<style>`, código, imágenes y sintaxis
 * markdown/HTML. Es un estimado a propósito — no rastrea el texto generado por
 * Svelte inline, y el tooltip de la UI lo aclara.
 *
 * @param {string} [rawMd] - contenido crudo del archivo `.md`
 * @param {number} [wpm=200] - palabras por minuto (≈ lectura en español)
 * @returns {number} minutos estimados, mínimo 1
 */
export function estimateReadingTime(rawMd, wpm = 200) {
	if (!Number.isFinite(wpm) || wpm <= 0) wpm = 200;
	const text = (rawMd ?? '')
		.replace(/^---\r?\n[\s\S]*?\r?\n---/, '') // frontmatter YAML
		.replace(/<script[\s\S]*?<\/script>/gi, '') // <script> de mdsvex
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/```[\s\S]*?```/g, '') // bloques de código
		.replace(/`[^`]*`/g, '') // código inline
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '') // imágenes
		.replace(/<[^>]+>/g, ' ') // tags HTML/Svelte
		.replace(/[#>*_~[\]()|]/g, ' '); // marcas de sintaxis markdown
	const words = text.match(/\S+/g)?.length ?? 0;
	return Math.max(1, Math.round(words / wpm));
}
