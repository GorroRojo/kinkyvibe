/**
 * Busca la publicación desde la que se deja una propina: tiene que existir, estar publicada y ser
 * de KinkyVibe (las únicas que muestran el bloque). Separado de checkout.js porque importa todos
 * los markdown (los tests de checkout.js pasan su propia búsqueda).
 */
import { fetchPost } from '$lib/utils';
import { isKinkyVibePost } from '$lib/utils/propinas.js';

/**
 * @param {'material' | 'calendario'} category
 * @param {string} slug ya validado con TIP_SLUG_RE (sin `/` ni `.`)
 * @returns {Promise<{ title: string } | null>}
 */
export async function findTipPost(category, slug) {
	try {
		const post = await fetchPost(category, slug, true);
		if (!isKinkyVibePost(post.meta)) return null;
		return { title: String(post.meta.title ?? slug) };
	} catch {
		return null;
	}
}
