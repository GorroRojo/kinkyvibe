<script context="module">
	import { wikiTagManager } from '$lib/utils/stores';
	import GlosarioItem from './GlosarioItem.svelte';
</script>

<script>
	export let root = 'root';
	/**@type TagID[]*/
	$: items = $wikiTagManager.get(root).children ?? [];
</script>
{#each items as item}
	<GlosarioItem {item} />
{/each}
