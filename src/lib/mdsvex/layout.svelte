<script context="module">
	import { h2, h3, li, img, blockquote } from './components.js';
	export { h2, h3, li, img, blockquote };
	import { aliaserFactory } from '$lib/utils/index.js';
</script>

<script>
	//@ts-nocheck
	import Tags from '$lib/components/Tags.svelte';
	import { onMount } from 'svelte';
	let tagsConfig = { tags: {} };
	onMount(() => {
		fetch('/api?getTags')
			.then((r) => r.json())
			.then((c) => (tagsConfig = c));
	});
	export let title;
	export let tags;
	export let authors;
</script>

<h1>{title}</h1>
{#if authors}
	<address>por {authors}</address>
{/if}
<Tags tags={tags.map(aliaserFactory(tagsConfig))} {tagsConfig} />
<slot />

<style lang="scss">
	:global(article h1) {
		font-size: 3rem;
		margin-bottom: 0.2em;
	}
	:global(article sup) {
		line-height: 0;
		font-size: 0.7em;
		color: var(--2-dark);
		font-weight: bold;
	}

	:global(article) {
		max-width: 800px;
		width: 100%;
		position: relative;
		margin-inline: auto;
		margin-top: 3em;
		overflow-x: visible;
		padding-inline: 5px;
	}
	:global(article p, .cli) {
		font-size: 1.5rem;
	}
	:global(.cli .cli) {
		margin-block: 0.4em;
	}
	:global(.cli .cli::before) {
		content: '|';
		color: var(--1);
	}
	:global(article strong) {
		font-size: 1em;
		color: var(--2);
		font-weight: black;
	}
	:global(article h1 strong, article h2 strong, article h3 strong) {
		color: var(--2);
	}
	:global(article small) {
		font-size: 0.9em;
		opacity: 0.8;
	}

	:global(article pre) {
		padding: 1em;
		border-radius: 1em;
		box-shadow: inset 0 0 1em rgba(1, 1, 1, 0.1);
	}
	:global(article code) {
		padding: 0.1em 0.4em;
		border-radius: 0.4em;
		font-family: 'Courier New', Courier, monospace !important;
		font-size: 0.9em;
	}

	:global(article code span.token) {
		font-family: 'Courier New', Courier, monospace !important;
	}
	:global(article code, article pre) {
		background: var(--3);
	}

	:global(article img) {
		margin-inline: auto;
		position: relative;
		width: 100%;
		object-fit: contain;
		object-position: center;
		border-radius: 1em;
	}
	:global(article .col-2),
	:global(article .col-3),
	:global(article .col-4) {
		display: grid;
		gap: 0.5em;
		margin-block: 1em;
		/* margin-inline: -4em; */
		max-width: 100vw;
	}
	@media (max-width: 900px) {
		:global(.col-2),
		:global(.col-3),
		:global(.col-4) {
			margin-inline: 0;
		}
	}
	:global(article .col-2) {
		grid-template-columns: 1fr 1fr;
	}
	:global(article .col-3) {
		grid-template-columns: 1fr 1fr 1fr;
	}
	:global(article .col-4) {
		grid-template-columns: 1fr 1fr 1fr 1fr;
	}
</style>
