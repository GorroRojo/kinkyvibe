<script>
	/**
	 * Las etiquetas de un perfil, centradas debajo del encabezado. Props: `tags`.
	 */
	import Tags from '$lib/components/Tags.svelte';
	/** @type {string[]} */
	export let tags = [];
</script>

<div id="tags">
	<Tags {tags} />
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
