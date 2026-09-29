import { fetchPost } from '$lib/utils';
import { error } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	try {
		// shallow: solo hacen falta los metadatos públicos del evento
		const post = await fetchPost('calendario', params.event, true);
		return { meta: post.meta, path: post.path };
	} catch (e) {
		throw error(404, 'Evento no encontrado');
	}
}
