import { json } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';

// Not prerendered: the posts' tags follow the `etiquetas_db` switch (the file or the database,
// docs/etiquetas.md), and the database can't be read at build time. The processed list is
// cached per server instance (fetchMarkdownPosts), so each request only serializes it.
export const prerender = false;

/** @type {import("./$types").RequestHandler} */
export async function GET() {
	return json(await fetchMarkdownPosts(), { headers: TAGGED_CACHE });
}
