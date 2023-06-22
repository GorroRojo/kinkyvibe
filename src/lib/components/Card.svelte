<script>
	import { onMount } from 'svelte/internal';
	import Tag from './Tag.svelte';
	import Tags from './Tags.svelte';
	export let post;
	let {
		path: href,
		meta: { tags, tagsConfig, featured: src },
		mark
	} = post;
	mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	let mounted = false;
	onMount(() => (mounted = true));
</script>

<a {href} class="card {mark ? 'mark' : ''}">
	{#if mark}
		<span class="card-mark">{mark}</span>
	{/if}
	<img class="card-img" {src} alt="" />
	<slot />
	{#if tags}
		<!-- <div class="tags"><Tags {tags} {tagsConfig} {mark} --color="var(--color-2)" /></div> -->
		<ul class="tagrow">
			{#each [...tags.filter((/**@type string*/ t) => t != 'KinkyVibe')].sort() as tag}
				{@const config = Object.hasOwn(tagsConfig.tags, tag) ? tagsConfig.tags[tag] : false}
				{@const color = config ? config?.color : 'var(--color-2,var(--1))'}
				<li style:--tag-color={color} style:white-space={'nowrap'}>
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
		height: 10em;
		width: 100%;
		background: gray;
		--cround: calc(var(--round) * 0.7);
		border-radius: var(--cround) var(--cround) 0 0;
		border: 0 !important;
		outline: 0 !important;
		object-fit: cover;
	}
	.card {
		display: flex;
		justify-content: flex-start;
		flex-direction: column;
		margin: 0;
		border-radius: var(--round);
		width: var(--card-width);
		height: 100%;
		background: white;
		cursor: pointer;
		padding-bottom: 1em;
		transition: 100ms;
		transform: scale(100%);
		text-decoration: none;
		color: inherit;
	}
	.card.mark {
		border: 3px var(--color, var(--color-2, var(--1))) solid;
		height: 100%;
	}
	.card:hover {
		transform: scale(105%);
	}
	.card-mark {
		position: absolute;
		top: 0;
		left: 0;
		border-radius: calc(var(--round) * 0.5) 0;
		padding: 0.2em 0.5em;
		color: white;
		background: var(--color, var(--color-2, var(--1)));
		z-index: 1;
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
	}
	.tagrow::-webkit-scrollbar {
		display: none;
	}
</style>
