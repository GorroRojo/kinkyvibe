<script>
	/**
	 * Chip de una etiqueta con su emoji, su nombre y SU color (decisión de gorrite, 4/10; estilo
	 * `.kv-tag` en style.scss, ver docs/estilo.md, «Piezas»). El color y el emoji salen del árbol
	 * de etiquetas en uso (`$tagManager`: `getColor()`, que hereda el color de la madre, e `icon`);
	 * sin color, el rosa de la marca.
	 * Props: `tag` (id; los alias se resuelven), `href` (opcional: el chip es un link),
	 * `selected` (opcional: lleno, para filtros y selectores).
	 */
	import { tagManager } from '$lib/utils/stores';

	/** @type {string} */
	export let tag;
	/** @type {string | undefined} */
	export let href = undefined;
	export let selected = false;

	$: config = $tagManager.get(tag);
	$: color = config?.getColor?.() ?? undefined;
	$: icon = (config?.icon ?? '').trim();
	$: name = config?.visible_name ?? tag;
</script>

{#if href}
	<a class="kv-tag" class:on={selected} {href} rel="tag" style:--tag-color={color}
		>{#if icon}<span aria-hidden="true">{icon}</span>{/if}{name}</a
	>
{:else}
	<span class="kv-tag" class:on={selected} style:--tag-color={color}
		>{#if icon}<span aria-hidden="true">{icon}</span>{/if}{name}</span
	>
{/if}
