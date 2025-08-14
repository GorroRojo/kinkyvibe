<script module>
	import { wikiTagManager } from '$lib/utils/stores';
	import GlosarioItem from './GlosarioItem.svelte';
</script>

<script>
	/** @type {{root?: string}} */
	let { root = 'root' } = $props();
	/**@type TagID[]*/
	let items = $state([]);
	wikiTagManager.subscribe((wtm) => {
		items = wtm.get(root).children ?? [];
	});
</script>
{#each items as item}
	<GlosarioItem {item} />
{/each}
