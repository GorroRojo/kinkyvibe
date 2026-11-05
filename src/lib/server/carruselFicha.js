/**
 * Lo nuevo en el carrusel de la portada (material, perfiles, la Kinkipedia) se ve como su vista
 * previa al compartir (gorrite, 5/11: «fijate cómo resolvemos esto en las vistas previas cuando la
 * publicación no tiene imagen»): el diseño «Ficha» de #619 (docs/compartir.md, «Objetos sin imagen:
 * su tarjeta»). Acá se arma lo que va en la ficha de cada diapositiva con las mismas funciones que
 * la vista previa (`materialCardSpec`, `profileCardSpec`, `wikiCardSpec` de
 * $lib/utils/ogObjeto.js): el tipo («Material · Guía descargable», «Amigues · Proyecto»,
 * «Kinkipedia»), el símbolo y hasta 3 etiquetas con página en la Kinkipedia.
 *
 * Sin consultas: las etiquetas salen del árbol de etiquetas, que el layout ya leyó (recordado 30 s
 * por isolate).
 */
import { siteTags, cardTagNames } from '$lib/server/ogObjeto.js';
import { wikiLinkedTags } from '$lib/server/wiki/site.js';
import { materialCardSpec, profileCardSpec, wikiCardSpec } from '$lib/utils/ogObjeto.js';

/** @typedef {import('$lib/utils/ogObjeto.js').ObjectCardSpec} ObjectCardSpec */

/**
 * La ficha de lo que no es un evento, o `null` (un evento).
 * @param {App.Platform | undefined} platform
 * @param {{ path: string, meta: Record<string, any> }} post
 * @param {Parameters<typeof materialCardSpec>[0]['tagManager']} tagManager
 * @returns {Promise<ObjectCardSpec | null>}
 */
async function fichaDe(platform, post, tagManager) {
	const meta = post.meta ?? {};
	const cat = meta.category;
	if (cat !== 'material' && cat !== 'amigues' && cat !== 'wiki') return null;
	if (cat === 'wiki') return wikiCardSpec({ title: meta.title, summary: meta.summary });
	const tagNames = await cardTagNames(platform, await wikiLinkedTags(platform, meta.tags));
	if (cat === 'material') return materialCardSpec({ meta, tagManager, tagNames });
	return profileCardSpec({ title: meta.title, kind: meta.kind, bio: meta.summary, tagNames });
}

/**
 * Las diapositivas con la ficha de lo que no es un evento (`ficha`; los eventos, `null`).
 * @template {{ path: string, meta: Record<string, any> }} S
 * @param {App.Platform | undefined} platform
 * @param {readonly S[]} slides
 * @returns {Promise<(S & { ficha: ObjectCardSpec | null })[]>}
 */
export async function conFichas(platform, slides) {
	if (!slides.some((s) => s.meta?.category !== 'calendario')) {
		return slides.map((s) => ({ ...s, ficha: null }));
	}
	const tagManager = await siteTags(platform).catch(() => undefined);
	return Promise.all(
		slides.map(async (s) => ({
			...s,
			ficha: await fichaDe(platform, s, tagManager).catch(() => null)
		}))
	);
}
