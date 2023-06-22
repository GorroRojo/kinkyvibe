<script>
	//@ts-nocheck
	export let post;
	let {
		path,
		meta: {
			title,
			summary,
			tags,
			published_date,
			authors,
			start,
			end,
			featured: src,
			mark,
			tagsConfig
		}
	} = post;
	import { addHours, format, isPast } from 'date-fns';
	import Tags from './Tags.svelte';
	import Tag from './Tag.svelte';
	import { onMount } from 'svelte/internal';
	const date = start ? addHours(new Date(start), 3) : published_date;
	if (tags.includes('KinkyVibe')) {
		mark = mark ? mark : 'KinkyVibe';
		let indexOfMark = tags.indexOf('KinkyVibe');
		tags = [...tags.slice(0, indexOfMark), ...tags.slice(indexOfMark + 1)];
	}
	// mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	let mounted = false;
	onMount(() => (mounted = true));
</script>

<a
	href={path}
	class="post"
	class:mark
	id={path}
	class:past={start ? isPast(new Date(start)) : false}
	tabindex="0"
>
	<div class="publication">
		{#if date}
			<time datetime={start}>
				{#if start}
					{format(new Date(start), 'yyyy-MM-dd | HH:mm - ') + format(new Date(end), 'HH:mm')}
				{:else}
					{authors ? authors.join(', ') : ''}
					{authors && date ? ' - ' : ''}
					{date ? format(new Date(date), 'yyyy-MM-dd') : ''}
				{/if}
			</time>
		{/if}
	</div>
	<img {src} alt="" />
	<h3>
		{#if start ? isPast(new Date(start)) : false}<small>TERMINADO</small> {/if}{title}
	</h3>
	{#if summary}
		<p class="summary">{summary}</p>
	{/if}
	<div class="tags">
		<ul class="tagrow">
			{#each [...tags.filter((/**@type string*/ t) => t != 'KinkyVibe')].sort() as tag}
				{@const config = Object.hasOwn(tagsConfig.tags, tag) ? tagsConfig.tags[tag] : false}
				{@const color = config ? config?.color : 'var(--color-2,var(--1))'}
				<li style:--tag-color={color} style:white-space={'nowrap'}>
					<Tag {tag} isLink={mounted} />
				</li>
			{/each}
		</ul>
	</div>
</a>

<style lang="scss">
	.tagrow {
		list-style: none;
		padding: 0;
		display: flex;
		font-size: 0.8em;
		/* padding: 0 0.4em; */
		overflow-x: scroll;
		overflow-y: hidden;
		gap: 0.3em;
		/* position: absolute; */
		/* bottom: -1em; */
		/* left: 0; */
		/* width: var(--card-width); */
		transition: 100ms;
	}
	.tagrow::-webkit-scrollbar {
		display: none;
	}
	.post {
		--post-color: var(--2);
		position: relative;
		width: 100%;
		max-width: 900px;
		height: 10.5em;

		display: grid;
		grid-template-areas: 'img title' 'img summary' 'img tags';
		grid-template-columns: 9em 1fr;
		grid-template-rows: auto auto 3em;
		column-gap: 1em;
		box-sizing: content-box;
		align-items: center;

		margin-inline: auto;
		padding-top: 2em;
		padding-right: 1em;

		list-style: none;
		background: white;
		border-radius: 2em;
		box-shadow: 0 1em 1em rgba(0, 0, 0, 0.1);
		overflow: hidden;
		&.mark {
			--post-color: var(--1);
		}
		&.past {
			opacity: 0.5;
		}
	}
	a h3 {
		grid-area: title;
		font-size: 2em;
		/* align-self:flex-start; */
		margin: 0;
		text-decoration: underline;
		text-decoration-color: var(--post-color, var(--2));
		/* margin-left: 1em; */
		small {
			color: var(--post-color, var(--2));
		}
	}
	/* .time {
		grid-area: time;
	} */
	.tags {
		grid-area: tags;
		--color: var(--post-color);
		z-index: 3;
		/* cursor:crosshair; */
	}
	a.post p.summary {
		grid-area: summary;
		margin: 0;
		padding: 0;
		align-self: flex-start;
	}
	.summary {
		max-height: 100%;
		min-height: 0;
		/* overflow:hidden; */
		overflow: auto;
		text-overflow: ellipsis;
	}
	@media (max-width: 680px) {
		.summary {
			display: none;
		}
		.post {
			grid-template-areas: 'img title' 'img tags';
			grid-template-rows: 1fr 3em;

		}
		h3 {
			align-self: flex-start;
			padding-top: .2em;
		}
	}
	img {
		grid-area: img;
		max-height: 9em;
		max-width: 8em;
		object-fit: contain;
		object-position: center;
		border-radius: 1em;
		margin-left: 1em;
		justify-self: center;
	}
	.publication {
		display: block;
		background: var(--post-color, var(--2));
		color: whiite;
		position: absolute;
		right: 0;
		left: 0;
		top: 0;
		height: 1.7em;
		display: flex;
		align-items: center;
		padding-inline: 1.5em;
		color: white;
		* {
			display: inline;
		}
	}
	a {
		color: inherit;
		text-decoration-color: transparent;
		scale: 1;
		transition: 100ms;
	}
	a:hover:not(.past), a:focus {
		scale: 1.03;
	}
</style>
