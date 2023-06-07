<script>
	// @ts-nocheck
	export let tags;
	export let tagsConfig;
	export let ref;
	export let mark = '';
	$: mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	$: filteredTags = mark
		? [...tags.slice(0, tags.indexOf('KinkyVibe')), ...tags.slice(tags.indexOf('KinkyVibe') + 1)]
		: tags;
</script>

<ul {ref}>
	{#each filteredTags as tag}
	{@const color = tagsConfig.tags[tag]?.color ?? 'var(--color,var(--1))'}
		<li style:--local-color={color}>{tag}</li>
	{/each}
</ul>

<style>
	ul {
		display: flex;
		gap: 0.2em;
		font-size: 0.8em;
		padding: 0 0.4em;
		overflow-x: scroll;
		overflow-y: hidden;
	}
	ul::-webkit-scrollbar {
		display: none;
	}
	li {
		display: block;
		padding: 0.5em 0.8em;
		border-radius: 3em;
		color: white;
		--local-color: var(--color);
		background: var(--local-color, var(--1));
		transition: 50ms;
	}
	li:hover {
		text-decoration: underline;
	}
</style>
