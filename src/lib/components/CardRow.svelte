<script>
	//@ts-nocheck
	import Card from './Card.svelte';
	import { fly } from 'svelte/transition';
	export let title = '';
	export let items = [];
	export let id;
	export let href;
	export let index;
</script>

<div
	{id}
	in:fly={{ y: ((index % 2) - 0.5) * 2 * 200, duration: 300, delay: 300 }}
	out:fly={{ y: ((index % 2) - 0.5) * 2 * -200, duration: 300 }}
	class="cardrowcontainer"
>
	{#if title}
		<h2 class="cardrow_title">
			{title}
		</h2>
	{/if}
	<ul class="cardrow">
		{#each items as post, i}
			<li class="cardcontainer">
				<Card {post}>
					<h3 class="card-title">{post.meta.title}</h3>
				</Card>
			</li>
		{/each}
	</ul>
	{#if href}<a class="btn-more" {href} tabindex="0">...ver más</a>{/if}
</div>

<style>
	:root {
		--card-width: 200px;
	}
	.cardrowcontainer {
		background: var(--color-1, var(--2));
		padding: 1em;
		border-radius: 0.5em;
		position: relative;
		margin: 0em 0 1em 0;
	}
	.card-title {
		margin: 1em;
	}

	.cardrow {
		display: flex;
		gap: 1em;
		padding: 2em;
		overflow-x: scroll;
		overflow-y: visible;
		margin: 0;
		width: 100%;
	}
	::-webkit-scrollbar {
		display: none;
	}

	.cardcontainer {
		width: var(--card-width);
		flex: 1;
		display: flex;
		justify-content: center;
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
		mask-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.8));
		pointer-events: none;
		transition: 300ms;
		top: 0;
		border-radius: 0 0.5em 0.5em 0;
	}
	.cardrowcontainer:has(+ a:hover)::after {
		width: 40%;
	}

	.cardrow_title {
		display: block;
		margin: 0em;
		padding: 0.5rem 1rem;
		/* height: em; */

		position: absolute;
		top: -1.2em;

		font-size: 1.2em;

		overflow: visible;

		color: var(--color-1, var(--2));
		background: white;
		border: 3px var(--color-1, var(--2)) solid;
		border-radius: 1rem;
	}
	.btn-more {
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
	.btn-more:hover, .btn-more:focus {
		transform: scale(105%) translateX(-0.4em);
	}
	.btn-more:active {
		filter: brightness(90%);
		background: var(--1);
	}
</style>
