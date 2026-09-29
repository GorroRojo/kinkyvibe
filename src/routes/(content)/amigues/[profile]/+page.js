import { fetchPost } from '$lib/utils';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	return { ...data, ...(await fetchPost('amigues', params.profile)) };
}
