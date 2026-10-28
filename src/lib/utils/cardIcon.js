/**
 * El ícono grande del tipo de una tarjeta sin imagen (Card.svelte): el mismo de `typeIcon`, el que
 * usa el panel en el encabezado de la ficha sin imagen (docs/estilo.md, «Piezas»): calendario para
 * los eventos, libro para el material, persona para los perfiles.
 */
import { typeIcon } from '$lib/admin/typeIcons.js';

/** La categoría de un post → el tipo de `typeIcon`. @type {Record<string, string>} */
const TYPE_OF_CATEGORY = { calendario: 'evento', material: 'material', amigues: 'amigues' };

/**
 * @param {{ category?: unknown, kind?: unknown } | undefined} meta
 * @returns {any} el componente de Lucide
 */
export function cardTypeIcon(meta) {
	const type = TYPE_OF_CATEGORY[String(meta?.category ?? '')] ?? 'material';
	return typeIcon(type, typeof meta?.kind === 'string' ? meta.kind : '');
}
