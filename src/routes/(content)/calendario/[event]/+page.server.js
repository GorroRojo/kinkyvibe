import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { seriesEnabled } from '$lib/server/flags.js';
import { eventSeries } from '$lib/server/series/index.js';
import { seriesAccountState } from '$lib/server/series/web.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch, locals }) {
	const post = await fetchPost('calendario', params.event, true).catch(() => null);
	const [related, tickets, series] = await Promise.all([
		loadRelated(post),
		loadTickets(params.event, platform, fetch),
		loadSeries(post, platform, locals)
	]);
	return { ...related, tickets, series };
}

/** Related posts, computed on the server so the page doesn't need every post.
 * @param {ProcessedPost|null} post null if missing/unpublished (handled by +page.js) */
async function loadRelated(post) {
	if (!post) return { relatedPosts: [], relatedPastCount: 0 };
	return currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts()));
}

/**
 * Interruptor `series`: las series del evento ("Edición N de…", anterior/siguiente, "Avisame si
 * se repite"). Apagado, `null` y la página queda como siempre.
 * @param {ProcessedPost|null} post
 * @param {App.Platform|undefined} platform
 * @param {App.Locals} locals
 */
async function loadSeries(post, platform, locals) {
	if (!post || !(await seriesEnabled(platform))) return null;
	const { postID: slug, tags, start } = post.meta;
	const list = await eventSeries({ slug, tags, start });
	if (!list.length) return null;
	return { list, account: await seriesAccountState(platform, locals) };
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
