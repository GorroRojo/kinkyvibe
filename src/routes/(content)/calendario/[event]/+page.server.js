import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { propinasEnabled } from '$lib/server/flags.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch }) {
	const [related, tickets, propinas] = await Promise.all([
		loadRelated(params.event),
		loadTickets(params.event, platform, fetch),
		// Interruptor `propinas`: bloque de propina en lugar de la nota del cafecito (la página
		// solo lo muestra en los eventos de KinkyVibe).
		propinasEnabled(platform)
	]);
	return { ...related, tickets, propinas };
}

/** Related posts, computed on the server so the page doesn't need every post.
 * @param {string} slug */
async function loadRelated(slug) {
	let post;
	try {
		post = await fetchPost('calendario', slug, true);
	} catch (e) {
		// missing/unpublished posts are handled by +page.js
		return { relatedPosts: [], relatedPastCount: 0 };
	}
	return currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts()));
}

/**
 * Solo el resumen para el botón "Comprar entradas" (el formulario está en /entradas); `null` si
 * el evento no vende entradas.
 * @param {string} slug
 * @param {App.Platform|undefined} platform
 * @param {typeof fetch} fetchFn
 */
async function loadTickets(slug, platform, fetchFn) {
	if (!isValidEventSlug(slug)) return null;
	const view = await getTicketsView(getDB(platform), slug, fetchFn);
	return view ? summarizeTickets(view) : null;
}
