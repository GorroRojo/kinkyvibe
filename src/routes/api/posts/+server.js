import { json } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';
export const prerender = true;

/** @type {import("./$types").RequestHandler} */
export async function GET() {
	return json(await fetchMarkdownPosts());
}
