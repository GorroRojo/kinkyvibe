import { fetchPost } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	let post = await fetchPost('calendario', params.event);
	if (post.meta?.redirect) {
		throw redirect(307, post.meta.link);
	}
	return post
}
