<script context="module">
	import { wikiTagManager } from '$lib/utils/stores';
	import GlosarioItem from './GlosarioItem.svelte';
</script>

<script>
	export let root = 'root';
	/**@type TagID[]*/
	let items = [];
	wikiTagManager.subscribe((wtm) => {
		items = wtm.get(root).children ?? [];
	});
</script>
{#each items as item}
	<GlosarioItem {item} />
{/each}
