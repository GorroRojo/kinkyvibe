<script context="module">
	import '$lib/types.d.js';
	import { jsonForScript } from '$lib/utils/escape.js';
	/**
	 * @param {LD.Schema} thing
	 **/
	function serializeSchema(thing) {
		return `<script type="application/ld+json">${jsonForScript(thing, 2)}</${''}script>`;
	}
</script>

<script>
	/**@type LD.Schema*/
	export let schema;
</script>

<svelte:head>
	{@html serializeSchema(schema)}
</svelte:head>
