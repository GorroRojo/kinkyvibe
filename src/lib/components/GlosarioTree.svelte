<script context="module">
	import { wikiTagManager } from '$lib/utils/stores';
	import GlosarioItem from './GlosarioItem.svelte';
</script>

<script>
	export let root = 'root';
	/** @type {TagID[]} las madres de esta rama, para no volver a abrir una si los datos traen un ciclo */
	export let path = [];
	/**@type TagID[]*/
	$: items = ($wikiTagManager.get(root).children ?? []).filter(
		(c) => c !== root && !path.includes(c)
	);
</script>

{#each items as item}
	<GlosarioItem {item} path={[...path, root]} />
{/each}
