/**
 * Busca la publicación desde la que se deja una propina: tiene que existir, estar publicada y ser
 * de KinkyVibe (las únicas que muestran el bloque). Las páginas de la Kinkipedia son todas de
 * KinkyVibe: alcanza con que el término tenga su página. Separado de checkout.js porque lee el
 * contenido del sitio (los tests de checkout.js pasan su propia búsqueda).
 */
import { sitePost } from '$lib/server/contenido/posts.js';
import { siteWikiEntry } from '$lib/server/wiki/site.js';
import { isKinkyVibePost } from '$lib/utils/propinas.js';

/**
 * @param {import('$lib/utils/propinas.js').TipCategory} category
 * @param {string} slug ya validado con la forma de su clase (`TIP_POST_KINDS`)
 * @param {App.Platform} [platform] los eventos, el material y la wiki salen de la base de esta plataforma
 * @returns {Promise<{ title: string } | null>}
 */
export async function findTipPost(category, slug, platform) {
	try {
		if (category === 'wiki') {
			const { entry } = await siteWikiEntry(platform, slug);
			return entry ? { title: String(entry.title || entry.key) } : null;
		}
		const post = await sitePost(platform, category, slug);
		if (!isKinkyVibePost(post.meta)) return null;
		return { title: String(post.meta.title ?? slug) };
	} catch {
		return null;
	}
}
