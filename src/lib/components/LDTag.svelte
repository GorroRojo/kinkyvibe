<script context="module">
	import '$lib/types.d.js';
	/**
	 * @param {LD.Schema} thing
	 **/
	function serializeSchema(thing) {
		return `<script type="application/ld+json">${JSON.stringify(thing, null, 2)}</${''}script>`;
	}
</script>

<script>
	/**@type LD.Schema*/
	export let schema;
</script>

<svelte:head>
	{@html serializeSchema(schema)}
</svelte:head>
<!-- {
    "title": "Navillus: Jamstack developers for hire",
    "description": "We specialize in finding simple solutions to complex software problems. We value data-driven decisions and accessibility over this month's latest tech trends.",
    "url": "https://navillus.dev",
    "author": "Navillus",
    "social": {
        "twitter": "navillus_dev",
        "twitter_card": "summary_large_image"
    },
    "company": {
        "name": "Navillus"
    }
} -->
