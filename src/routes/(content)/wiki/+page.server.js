import { fetchGlossary } from '$lib/utils';

/** @type {import("./$types").PageLoad} */
export async function load() {
	return {
		glosario: await fetchGlossary(),
	};
}
