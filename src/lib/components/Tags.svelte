<script>
	// @ts-nocheck
	import { flip } from 'svelte/animate';
	export let tags;
	export let tagsConfig = { tags: {} };
	if (tagsConfig == {} || tagsConfig == undefined || tagsConfig == null) tagsConfig = { tags: {} };
	export let ref = '';
	export let mark = '';
	// $: mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	$: filteredTags = mark
		? [...tags.slice(0, tags.indexOf('KinkyVibe')), ...tags.slice(tags.indexOf('KinkyVibe') + 1)]
		: tags;
</script>

<ul {ref}>
	{#each [...new Set(filteredTags)] as tag (tag)}
		{@const config = Object.hasOwn(tagsConfig.tags, tag) ? tagsConfig.tags[tag] : false}
		{@const color = config ? config?.color : 'var(--color,var(--1))'}
		<li style:--tag-color={color} animate:flip>{tag}</li>
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
		--tag-color: var(--color);
		background: var(--tag-color, var(--1));
		transition: 50ms;
	}
	li:hover {
		text-decoration: underline;
	}
</style>
