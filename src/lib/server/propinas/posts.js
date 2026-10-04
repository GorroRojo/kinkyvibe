/**
 * Busca la publicación desde la que se deja una propina: tiene que existir, estar publicada y ser
 * de KinkyVibe (las únicas que muestran el bloque). Separado de checkout.js porque lee el
 * contenido del sitio (los tests de checkout.js pasan su propia búsqueda).
 */
import { sitePost } from '$lib/server/contenido/posts.js';
import { isKinkyVibePost } from '$lib/utils/propinas.js';

/**
 * @param {'material' | 'calendario'} category
 * @param {string} slug ya validado con TIP_SLUG_RE (sin `/` ni `.`)
 * @param {App.Platform} [platform] los eventos y el material salen de la base de esta plataforma
 * @returns {Promise<{ title: string } | null>}
 */
export async function findTipPost(category, slug, platform) {
	try {
		const post = await sitePost(platform, category, slug);
		if (!isKinkyVibePost(post.meta)) return null;
		return { title: String(post.meta.title ?? slug) };
	} catch {
		return null;
	}
}
