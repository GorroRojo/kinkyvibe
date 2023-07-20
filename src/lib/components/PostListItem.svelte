<script>
	//@ts-nocheck
	import { Calendar, Text, ShoppingCart, Download, MousePointerClick } from 'lucide-svelte';
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
			status,
			featured: src,
			mark,
			link,
			link_text,
			category,
			job_title
		}
	} = post;
	import { addHours, format, isPast } from 'date-fns';
	import Tag from './Tag.svelte';
	import { onMount } from 'svelte/internal';
	import { tagsConfig } from '$lib/utils/stores';
	const date = start ? addHours(new Date(start), 3) : published_date;
	if (tags.includes('KinkyVibe')) {
		mark = mark ? mark : 'KinkyVibe';
		let indexOfMark = tags.indexOf('KinkyVibe');
		tags = [...tags.slice(0, indexOfMark), ...tags.slice(indexOfMark + 1)];
	}
	// mark = tags.includes('KinkyVibe') ? 'KinkyVibe' : undefined;
	let mounted = false;
	onMount(() => (mounted = true));
	let past = start ? isPast(new Date(start)) : false;
	let style = `scale:var(--scale,1);
				 translate:var(--translate,0 0);
				 display: inline-block;
				 margin-right: .4em;`;
</script>

<a
	href={path}
	class="post {category}"
	class:mark
	class:noimg={!src}
	id={path}
	class:past={start ? isPast(new Date(start)) : false}
	tabindex="0"
>
	<div class="publication">
		{#if category == 'calendario'}<Calendar {style} />&ThickSpace;
		{:else if category == 'material'}
			{#if tags.includes('pago')}<ShoppingCart {style} />
			{:else if tags.includes('descargable')}<Download {style} />
			{:else if tags.includes('interactivo')}
				<MousePointerClick {style} />
			{:else}<Text {style} />&ThickSpace;
			{/if}
		{/if}
		{#if category != 'amigues'}
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
		{:else}
			{job_title}
		{/if}
	</div>
	{#if src}<img {src} alt="" />{/if}
	<h3>
		<!-- {#if start ? isPast(new Date(start)) : false}<small>TERMINADO</small> {/if} -->
		{#if (status && ['cancelado', 'lleno'].includes(status)) || past}<small
				>{past && !(status && status == 'cancelado') ? 'TERMINADO' : status.toUpperCase()}</small
			>
		{/if}

		{title}
	</h3>
	{#if summary}
		<p class="summary">{summary}</p>
	{/if}
	<div class="tags">
		<ul class="tagrow">
			{#each [...tags.filter((/**@type string*/ t) => t != 'KinkyVibe')].sort() as tag}
				{@const config = Object.hasOwn($tagsConfig.tags, tag) ? $tagsConfig.tags[tag] : false}
				{@const color = config ? config?.color : 'var(--color-2,var(--1))'}
				<li style:--tag-color={color} style:white-space={'nowrap'}>
					<Tag {tag} isLink={mounted} />
				</li>
			{/each}
		</ul>
	</div>
	{#if link && link_text && status && status == 'abierto' && !past}<a
			class="CTA"
			href={link}
			target="_blank">{link_text}</a
		>{/if}
</a>

<style lang="scss">
	.post.amigues {
		border-radius: 999em;
		padding-top: 0;
		outline: 2px solid var(--post-color, var(--2));
		img {
			border-radius: 10em;
		}
		.publication {
			display: none;
		}
	}
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
	.post:has(.CTA) {
		grid-template-areas: 'img title title' 'img summary summary' 'img tags cta';
	}
	.CTA {
		grid-area: cta;
		background: var(--post-color);
		color: white;
		padding: 0.5em;
		border-radius: 1em;
		outline: 2px dashed var(--post-color);
		outline-offset: 2px;
	}
	.CTA:hover {
		outline-offset: 4px;
		/* outline-style: dashed; */
	}
	.post {
		--post-color: var(--2);
		position: relative;
		width: 100%;
		/* max-width: 900px; */
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
		box-shadow: 0 0.1em 0.3em rgba(0, 0, 0, 0.1);
		overflow: hidden;
		&.mark {
			--post-color: var(--1);
		}
		&.past {
			opacity: 0.5;
		}
		&.noimg {
			grid-template-columns: 0 1fr;
		}
	}
	a h3 {
		grid-area: title;
		font-size: var(--step-2);
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
		font-size: var(--step-0);
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
			padding-top: 0.2em;
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
		font-size: var(--step--1);
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
	a:hover:not(.past),
	a:focus {
		scale: 1.03;
	}
</style>
