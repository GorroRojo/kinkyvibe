import tagsFactory from '$lib/utils/tags';
import { resolveTagSlug } from '$lib/utils/tagSlug.js';
import { mergeTagDetails } from '$lib/utils/tagDetails.js';

// Se arma en cada pedido: la página de la wiki sale de la base (+page.server.js).
export const prerender = false;

/** @type {import("./$types").PageLoad} */
export async function load({ params, data, parent }) {
	if ('meta' in data) return data;
	// no wiki entry: show the tag of the same name ("Rancheadita-Kinky" → "Rancheadita Kinky",
	// aliases → their tag; same helper as /api/series and the .ics). Tags have methods, so they
	// can't come from the server load.
	// El árbol de la base (o el archivo de respaldo; layout raíz), liviano: con los detalles que
	// manda esta página (la descripción, para la vista previa; $lib/utils/tagDetails.js).
	const { siteTags } = await parent();
	const tags = siteTags
		? tagsFactory(
				/** @type {any} */ (structuredClone(mergeTagDetails(siteTags, data.siteTagDetails)))
			)
		: tagsFactory();
	return { ...data, tag: resolveTagSlug(tags, params.term) ?? tags.get(params.term) };
}
