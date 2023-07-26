<script>
	import { tagsConfig } from '$lib/utils/stores';
	import { onMount } from 'svelte/internal';
	import Tag from './Tag.svelte';
	import Tags from './Tags.svelte';
	import { isPast } from 'date-fns';
	export let post;
	let {
		path: href,
		meta: { tags, featured: src, category, title },
		mark,
		start
	} = post;
	mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	let mounted = false;
	onMount(() => (mounted = true));

	/**@type {(tag:string)=>string[]}*/
	function getParents(tag) {
		/**@type {string[]}*/
		let parents = [];
		$tagsConfig.groups.forEach((g) => {
			parents = [...parents, ...findTagAndReturnParents(tag, g)];
		});
		return parents;
	}

	/**
	 * Finds a specific tag within a group and returns its parents.
	 * @param {string} tag - The tag to search for.
	 * @param {Group} group - The group object to search within.
	 * @param {string[]} [parents=[]] - An array of parent names (optional, defaults to an empty array).
	 * @returns {string[]} - An array containing the names of the parents of the tag.
	 */
	function findTagAndReturnParents(tag, group, parents = []) {
		if (group.name == tag) return parents;
		if (group.members.includes(tag)) return [...parents, group.name];
		/**@type {string[]}*/
		let deeper = [];
		group.sub.forEach((sub) => {
			deeper.push(...findTagAndReturnParents(tag, sub, ['sub', ...parents, group.name]));
		});
		return deeper;
	}

	/**@type {(tag:string[])=>string[]}*/
	function removeParents(tags) {
		let allParents = [...new Set(tags.map((t) => getParents(t)).flat())];
		return tags.filter((t) => !allParents.includes(t));
	}
</script>

<!-- TODO past no funciona? -->
<a
	{href}
	class:past={isPast(new Date(start))}
	class="card {mark ? 'mark' : ''} {category}"
	tabindex="0"
>
	{#if mark}
		<span class="card-mark">{mark}</span>
	{/if}
	<img class="card-img" {src} alt="" />
	<h3>{title}</h3>
	{#if tags}
		<ul class="tagrow">
			{#each removeParents([...tags.filter((/**@type string*/ t) => t != 'KinkyVibe')]) as tag}
				{@const config = Object.keys($tagsConfig.tags).includes(tag)
					? $tagsConfig.tags[tag]
					: false}
				{@const color = config ? config?.color : 'var(--color-2,var(--1))'}
				<li
					style:--tag-color={color}
					style:white-space={'nowrap'}
					style:--hover-text-decoration={'underline white'}
				>
					<Tag {tag} isLink={mounted} />
				</li>
			{/each}
		</ul>
	{/if}
</a>

<style>
	:root {
		--round: 1rem;
	}
	.card-img {
		height: 15em;
		width: 100%;
		background: gray;
		--cround: calc(var(--round) * 0.93);
		border-radius: var(--cround) var(--cround) 0 0;
		border: 0 !important;
		outline: 0;
		object-fit: cover;
	}
	.card {
		display: flex;
		justify-content: flex-start;
		flex-direction: column;
		margin: 0;
		border-radius: var(--round);
		width: var(--card-width, 13rem);
		height: 100%;
		background: white;
		cursor: pointer;
		padding-bottom: 1em;
		transition: 100ms;
		transform: scale(100%);
		text-decoration: none;
		color: inherit;
	}
	h3 {
		margin: auto auto;
		padding: 0.5em;
		text-align: center;
	}
	.card.past {
		opacity: 0.8;
	}
	.card.mark {
		--post-color: var(--1);
		--shadow-color: var(--color, var(--color-2, var(--1)));
		box-shadow: 0 0 0.3em 0.2em rgba(0, 0, 0, 0.05);
		height: 100%;
		outline: 0px var(--color, var(--color-2, var(--1))) solid;
	}
	.card.mark:hover,
	.card.mark:focus {
		outline: 3px var(--color, var(--color-2, var(--1))) solid;
		box-shadow: 0em 0em 0em -0em var(--shadow-color);
	}
	.card:hover,
	.card:focus {
		transform: scale(105%);
	}
	.card-mark {
		position: absolute;
		top: -0.7em;
		left: -1em;
		--radius: calc(var(--round) * 0.9);
		border-radius: var(--round);
		padding: 0.2em 0.5em;
		color: white;
		background: var(--color, var(--color-2, var(--1)));
		z-index: 1;
		scale: 0;
		opacity: 0;
		transition: 200ms;
	}
	.card.mark:hover .card-mark,
	.card.mark:focus .card-mark {
		opacity: 1;
		scale: 1;
	}
	.tagrow {
		list-style: none;
		padding: 0;
		display: flex;
		font-size: 0.8em;
		/* padding: 0 0.4em; */
		overflow-x: scroll;
		overflow-y: hidden;
		position: absolute;
		bottom: -1em;
		left: 0;
		width: var(--card-width);
		transition: 100ms;
		max-width: 100%;
	}
	.tagrow::-webkit-scrollbar {
		display: none;
	}
	.amigues {
		border-top-left-radius: 999em;
		border-top-right-radius: 999em;
		margin-inline: 0.3em;
	}
	.amigues .card-img {
		outline: 1px solid var(--post-color, var(--2));
		height: unset;
		aspect-ratio: 1;
		border-radius: 999em;
		scale: 1.1;
	}
	.amigues h3 {
		font-size: var(--step-1);
		padding-top: 1em;
	}
</style>
