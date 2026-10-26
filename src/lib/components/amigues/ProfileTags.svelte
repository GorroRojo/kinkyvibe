<script>
	/**
	 * Las etiquetas de un perfil, centradas debajo del encabezado. Props: `tags`, `wikiTags` (las que
	 * llevan a la Kinkipedia: Tags.svelte).
	 */
	import Tags from '$lib/components/Tags.svelte';
	/** @type {string[]} */
	export let tags = [];
	/** @type {readonly string[]} */
	export let wikiTags = [];
</script>

<div id="tags">
	<Tags {tags} {wikiTags} />
</div>

<style>
	#tags {
		margin-inline: auto;
		max-width: 70rem;
		width: 100%;
		margin-top: 2em;
		justify-content: center;
	}
</style>
