import { fetchPost } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	let post = await fetchPost('material', params.post);
	if (post.meta?.redirect) {
		throw redirect(307, post.meta.link);
	}
	return post;
}

