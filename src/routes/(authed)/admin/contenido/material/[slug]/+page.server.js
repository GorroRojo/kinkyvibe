import { editorActions, editLoad } from '$lib/server/admin/contentRoutes.js';
import { objectPageVisits } from '$lib/server/admin/pageVisits.js';

const editor = editLoad('material');

/**
 * El editor de un material y, sin esperar, la tarjeta «Visitas» de su página
 * (docs/analiticas.md, «Visitas de una página»).
 *
 * @param {Parameters<typeof editor>[0]} event
 */
export async function load(event) {
	const data = await editor(event);
	return {
		...data,
		visits: objectPageVisits(event.platform, { kind: 'material', slug: data.slug })
	};
}

/** @type {import('./$types').Actions} */
export const actions = editorActions('material');
