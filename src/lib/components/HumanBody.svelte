<script>
	import parts from './body-parts.js';
	import '$lib/types.d.js';
	/**
	 * @param {{ target: { id: any; }; }} e
	 */
	function click(e) {
		alert(e.target.id);
	}
	/**
	 * @type {{default: string, groups: Array<{name: string, color: string, parts: BodyPart[]}> }}
	 */
	export let colors = { default: '#888', groups: [] };
	export let debug = false;
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68.587668 92.604164">
	{#each parts as part}
		{@const group = colors.groups.find((g) => g.parts.some((p) => part.name.startsWith(p)))}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<path
			role="button"
			tabindex="0"
			id={part.name}
			style:--color={group ? group.color : colors.default ?? '#888'}
			d={part.path}
			on:click={() => (debug ? alert(part.name) : '')}
		/>
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 90vh;
	}
	path {
		/* cursor: pointer; */
		fill: var(--color);
	}
</style>
