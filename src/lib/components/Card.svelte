<script>
	import Tags from './Tags.svelte';
	export let post;
	let {
		path:href,
		meta: { tags, tagsConfig, featured: src },
		mark
	} = post;
	mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined
</script>

<a {href} class:mark>
	{#if mark}
		<span>{mark}</span>
	{/if}
	<img {src} alt="" />
	<slot />
	{#if tags}
		<Tags {tags} {tagsConfig} {mark} ref="tags" --color="var(--color-2)" />
	{/if}
</a>

<style lang="scss">
	:root {
		--round: 1rem;
	}
	img {
		height: 10em;
		width: 100%;
		background: gray;
		--cround: calc(var(--round) * 0.7);
		border-radius: var(--cround) var(--cround) 0 0;
		border: 0 !important;
		outline: 0 !important;
		object-fit: cover;
	}
	a {
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
		&.mark {
			border: 3px var(--color, var(--color-2, var(--1))) solid;
			height: 100%;
		}
		&:hover {
			transform: scale(105%);
		}
	}
	span {
		position: absolute;
		top: 0;
		left: 0;
		border-radius: calc(var(--round) * 0.5) 0;
		padding: 0.2em 0.5em;
		color: white;
		background: var(--color, var(--color-2, var(--1)));
		z-index: 1;
	}
</style>
