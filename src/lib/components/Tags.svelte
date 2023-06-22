<script>
	// @ts-nocheck
	import { flip } from 'svelte/animate';
	import { scale } from 'svelte/transition';
	import { onMount } from 'svelte/internal';
	export let tags;
	export let tagsConfig = { tags: {} };
	// if (tagsConfig == {} || tagsConfig == undefined || tagsConfig == null) tagsConfig = { tags: {} };
	export let mark = '';
	// $: mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	$: filteredTags = mark
		? [...tags.slice(0, tags.indexOf('KinkyVibe')), ...tags.slice(tags.indexOf('KinkyVibe') + 1)]
		: tags;
	let invisible = false;
	onMount(() => {invisible = false});
</script>

<ul>
	{#each [...new Set(filteredTags)] as tag (tag)}
		{@const config = Object.hasOwn(tagsConfig.tags, tag) ? tagsConfig.tags[tag] : false}
		{@const color = config ? config?.color : 'var(--color,var(--1))'}
		<li style:--tag-color={color} class:invisible in:scale animate:flip>
			<a href="/todo?tags={tag}" class:card={false}>
				{tag}
			</a>
		</li>
	{/each}
</ul>

<style>
	.invisible {
		opacity: 0;
		transition: 300ms;
	}
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
		border-radius: 3em;
		--tag-color: var(--color);
		background: var(--tag-color, var(--1));
		padding: 0.5em 0.8em;
		transition: 50ms;
	}
	a {
		color: white;
		text-decoration: none;
	}
	li:hover {
		text-decoration: underline;
		text-decoration-color: white;
	}
</style>
