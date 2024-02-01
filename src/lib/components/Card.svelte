<script>
	import { tagManager } from '$lib/utils/stores';
	import { onMount } from 'svelte/internal';
	import Tag from './Tag.svelte';
	import { isPast } from 'date-fns';
	export let post;
	/**@type {{path: string, mark: string|undefined, start: Date|undefined, meta: AnyPostData}}*/
	let {
		path: href,
		meta: { tags, featured: src, category, title, pronoun, start },
		mark
	} = post;
	export let setId = true;
	mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	let mounted = false;
	onMount(() => (mounted = true));

	/**@type {(tag:string[])=>string[]}*/
	function removeParents(tags) {
		let allParents = [...new Set(tags.map((t) => $tagManager.get(t)?.parents ?? []).flat())];
		return tags.filter((t) => !allParents.includes(t));
	}
</script>

<!-- TODO past no funciona? -->
<a
	{href}
	class:past={isPast(new Date(start ?? ''))}
	class="card {mark ? 'mark' : ''} {category} {{
		amigues: 'h-card',
		calendario: 'h-event',
		material: 'h-entry',
		wiki: 'h-entry'
	}[category]}"
	tabindex="0"
	id={setId ? href : ''}
>
	{#if mark}
		<span class="card-mark">{mark}</span>
	{/if}
	<img class="card-img u-featured placeholder-gradient" {src} alt="" />
	<h3 class="p-name">
		{title}
		{#if pronoun}
			<br />
			<small class="p-pronouns">
				{@html (pronoun + '').split('/').pop()?.split(',')[0].replaceAll('&', '&nbsp;/&nbsp;')}
			</small>
		{/if}
	</h3>
	{#if tags}
		<ul class="tagrow">
			{#each removeParents([...tags.filter((/**@type string*/ t) => t != 'KinkyVibe')]) as tag}
				{@const config = $tagManager.get(tag)}
				{@const color = config?.getColor() ?? 'var(--color-2,var(--1))'}
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

<style lang="scss">
	:root {
		--round: 1rem;
	}
	.card-img {
		height: 15em;
		width: 100%;
		background: linear-gradient(
			to bottom right,
			color-mix(in srgb, var(--post-color, var(--2)) 70%, white) 0%,
			var(--post-color, var(--2)) 50%,
			color-mix(in srgb, var(--post-color, var(--2)) 70%, black) 100%
		);
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
	.p-pronouns {
		font-size: 0.6em;
		opacity: 0.7;
		color: var(--post-color, var(--2));
		text-decoration: none;
	}
	.card.past {
		opacity: 0.3;
	}
	.card.mark {
		--post-color: var(--1);
		--shadow-color: var(--color, var(--color-2, var(--1)));
		box-shadow: 0 0 0.3em 0.2em rgba(0, 0, 0, 0.05);
		height: 100%;
		outline: 0px var(--color, var(--color-2, var(--1))) solid;
		&.amigues img {
			box-shadow: 0em 0.1em 0 0.1em var(--post-color, var(--color-2, var(--2)));
		}
	}
	.card.mark:hover,
	.card.mark:focus {
		outline: 3px var(--color, var(--color-2, var(--1))) solid;
		box-shadow: 0em 0em 0em -0em var(--shadow-color);
		&.amigues img {
			outline: 3px var(--color, var(--color-2, var(--1))) solid;
		}
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
		/* transition: 100ms; */
		max-width: 100%;
		scrollbar-width:none;
	}
	.tagrow::-webkit-scrollbar {
		display: none;
		opacity: 0;
		transition: 500ms;
	}
	.card:hover .tagrow {
		--scrollbar-width: calc(var(--step--1) * 0.4);
		scrollbar-width: thin;
		scrollbar-color: white transparent;
		margin-bottom: calc(var(--scrollbar-width) * -1);

		/* Chrome, Edge and Safari */
		&::-webkit-scrollbar {
			opacity: 1;
			display: unset;
			width: var(--scrollbar-width);
			height: var(--scrollbar-width);
		}
		&::-webkit-scrollbar-track {
			border-radius: 0px;
			background-color: transparent;
		}

		&::-webkit-scrollbar-thumb {
			border-radius: 1rem;
			background-color: var(--1-light);
			&:active {
				background-color: var(--1);
			}
		}
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
