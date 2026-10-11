<script>
	/**
	 * Una etiqueta dentro de una frase que, al tocarla, se suma (o se saca) del filtro de la lista
	 * de abajo. Es el chip compartido como casilla (TagChip, docs/estilo.md, «Chip de etiqueta»);
	 * `tag` es el texto que se lee y `internalTag` la etiqueta de verdad (si es otra, como un
	 * plural).
	 */
	import { togglePositiveTagFilterFn, filteredTags } from '$lib/utils/stores';
	import TagChip from '$lib/components/ui/TagChip.svelte';

	/** @type string */
	export let tag;
	/** @type string|undefined */
	export let internalTag = undefined;
	$: aliasedTag = internalTag ?? tag;
	// `$store` instead of manual .subscribe(): Svelte unsubscribes when the chip is destroyed
	$: checked = $filteredTags?.includes(aliasedTag) ?? false;
</script>

<TagChip
	tag={aliasedTag}
	label={tag}
	name={aliasedTag}
	checkbox
	selected={checked}
	on:change={(/**@type {*} */ evt) => $togglePositiveTagFilterFn(evt.target?.checked, aliasedTag)}
/>
