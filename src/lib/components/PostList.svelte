<script>
	//@ts-nocheck
	export let posts;
	import Tags from '$lib/components/Tags.svelte';
	import { fly } from 'svelte/transition';
</script>

<ul id="posts">
	{#each posts as { title, href, tags, mark, src, date, authors }, i}
		<li
			in:fly={{ x: ((i % 2) - 0.5) * 2 * 200, duration: 300, delay: 300 }}
			out:fly={{ x: ((i % 2) - 0.5) * 2 * -200, duration: 300 }}
		>
			<div class="content">
				<div class="publication">
					<address>{authors.join(', ')}</address>
					-
					<time datetime={date}>{date}</time>
				</div>
				<h3><a {href}>{title}</a></h3>
				<div class="tags"><Tags {tags} /></div>
			</div>
		</li>
	{/each}
</ul>
<style lang="scss">
	ul#posts {
		display: flex;
		gap: 3em;
		flex-direction: column;
		padding: 0;
	}
	#posts > li {
		position: relative;
		width: 100%;
		max-width: 900px;
		height: 10em;

		display: grid;
		grid-template-areas: 'content';
		grid-template-columns: auto;
		gap: 2em;

		margin-inline: auto;
		padding: 1em;

		list-style: none;
		background: white;
		border-radius: 2em;
		box-shadow: 0 1em 1em rgba(0, 0, 0, 0.1);
	}
	.content {
		grid-area: content;
		display: grid;
		grid-template-columns: 1fr;
		max-height: 100%;
		padding: 0.4em;
		/* * { */
		/* margin: 0; */
		/* } */
	}
	.publication {
		display: block;
		/* position: absolute;
		right: .5em;
		top: 0; */
		* {
			display: inline;
		}
	}
	h3 {
		margin-top: 0.4em;
		font-size: 2em;
	}
	h3 a {
		color: inherit;
		text-decoration-color: var(--1);
	}
	h3 a:hover {
		text-decoration-thickness: 2px;
	}
	.tags {
		/* position: absolute;
		bottom: .2em; */
		--color: var(--2);
		opacity: 0.5;
	}
	img {
		aspect-ratio: auto;
		width: 100%;
		height: 10em;
		object-fit: contain;
		object-position: center;
		grid-area: img;
		box-sizing: content-box;
	}
</style>