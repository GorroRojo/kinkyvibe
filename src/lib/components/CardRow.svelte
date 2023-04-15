<script>
	//@ts-nocheck
	import Tags from './Tags.svelte';
	import Card from './Card.svelte';
	export let title = '';
	export let items = [];
	export let id;
	export let href;
</script>

<div {id}>
	{#if title}
		<h2>
			{title}
		</h2>
	{/if}
	<ul>
		{#each items as { name, src, href, tags, mark }}
			<li>
				<Card {src} {href} {tags} {mark}>
					<h3>{name}</h3>
				</Card>
			</li>
		{/each}
	</ul>
	<a {href}>...ver más</a>
</div>

<style>
	:root {
		--card-width: 200px;
	}
	:global([ref='tags']) {
		position: absolute;
		bottom: -1em;
		left: 0;
		width: var(--card-width);
		transition: 100ms;
	}
	div {
		background: var(--color-1, var(--2));
		padding: 1em;
		border-radius: 0.5em;
		position: relative;
		margin: 4em 0 1em 0;
	}

	ul {
		display: flex;
		gap: 1em;
		padding: 1em;
		overflow-x: scroll;
		overflow-y: scroll;
		width: 100%;
	}
	::-webkit-scrollbar {
		display: none;
	}

	li {
		width: var(--card-width);
		flex: 1;
		display: block;
		padding-bottom: 1em;
		position: relative;
		overflow: visible;
	}

	ul::after {
		content: '';
		display: block;
		position: absolute;
		right: 0;
		height: 100%;
		background: var(--color-1, var(--2));
		width: 20%;
		-webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.8));
		pointer-events: none;
		transition: 300ms;
		top: 0;
	}
	ul:has(+ button:hover)::after {
		width: 40%;
	}

	h2 {
		display: block;
		margin: 0;
		padding: 0.5rem 1rem;
		/* height: em; */

		position: absolute;
		top: -1.2em;

		font-size: 1.2em;

		overflow: show;

		color: var(--color-1, var(--2));
		background: white;
		border: 3px var(--color-1, var(--2)) solid;
		border-radius: 1rem;
	}
	h3 {
		margin: 1em;
	}
	a {
		display: block;
		position: absolute;
		right: -0.5rem;
		top: calc(50% - 1.5em);

		padding: 0.6em 1em;
		outline: 3px var(--color-1, var(--2)) solid;
		outline-offset: 0;
		border: 0;
		border-radius: 0.3em;
		background: var(--color-2, var(--1));
		color: white;
		font-weight: bold;
		font-size: 1.1em;
		cursor: pointer;
		transition: 100ms;

		text-decoration: none;
		font-weight: normal;
	}
	a:hover {
		transform: scale(105%) translateX(-0.4em);
	}
	a:active {
		filter: brightness(90%);
		background: var(--1);
	}
</style>
