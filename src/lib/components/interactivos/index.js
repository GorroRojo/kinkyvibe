/**
 * Los componentes de los interactivos registrados (decisión 0004), por etiqueta. Las etiquetas y
 * su forma en los .md están en $lib/utils/interactivos.js; acá, solo qué componente muestra cada
 * una. Una etiqueta que no está acá no se muestra (ContentParts.svelte la ignora y el servidor ya
 * la escapó). Import estático: sus estilos van en el CSS de la página desde el primer pintado.
 */
import { INTERACTIVE_TAGS } from '$lib/utils/interactivos.js';
import DondeGolpearUnCuerpo from '$lib/posts/material/media/donde-y-como-golpear-un-cuerpo/DondeGolpearUnCuerpo.svelte';

/** @type {Readonly<Record<string, import('svelte').Component<any>>>} */
export const INTERACTIVE_COMPONENTS = Object.freeze({
	'kv-donde-golpear-un-cuerpo': DondeGolpearUnCuerpo
});

/**
 * El componente de una etiqueta registrada, o `undefined`.
 * @param {string} tag
 */
export function interactiveComponent(tag) {
	return Object.hasOwn(INTERACTIVE_TAGS, tag) && Object.hasOwn(INTERACTIVE_COMPONENTS, tag)
		? INTERACTIVE_COMPONENTS[tag]
		: undefined;
}
