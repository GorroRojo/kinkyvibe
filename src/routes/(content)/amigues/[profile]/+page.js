import { fetchPost } from '$lib/utils';

/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	return await fetchPost('amigues', params.profile);
}
