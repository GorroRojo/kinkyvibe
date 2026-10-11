<script>
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import { filteredTags } from '$lib/utils/stores';
	import TagChip from '$lib/components/TagChip.svelte';

	/**@type {string[]}*/
	export let tags;
	export let mark = '';
	export let showFilteredTags = true;
	$: localFilteredTags = (
		mark
			? [...tags.slice(0, tags.indexOf('KinkyVibe')), ...tags.slice(tags.indexOf('KinkyVibe') + 1)]
			: tags
	).filter((t) => showFilteredTags || !$filteredTags.includes(t));
</script>

<!-- Chips de etiqueta con el color y el emoji de cada una (TagChip, `.kv-tag`). -->
<ul>
	{#each [...new Set(localFilteredTags)] as tag (tag)}
		<li in:scale animate:flip>
			<TagChip {tag} href="/todo?tags={encodeURIComponent(tag)}" />
		</li>
	{/each}
</ul>

<style>
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
		padding: 0 0.4em;
		margin: 0;
		/* sin recortar: los chips se acomodan en filas y su zona de toque (.tap-target) se puede
		   tocar entera */
		justify-content: center;
		list-style: none;
	}
	/* en las páginas públicas, un paso más grande que en el panel */
	ul :global(.kv-tag) {
		font-size: var(--text-sm);
		padding: 0.25em 0.8em;
	}
	li {
		display: block;
	}
</style>
