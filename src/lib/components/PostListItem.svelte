<script>
	//@ts-nocheck
	export let post;
	let {
		path,
		meta: { title, tags, published_date, authors, start, end, featured: src, mark }
	} = post;
	import { addHours, format } from 'date-fns';
	import Tags from './Tags.svelte';
	const date = post.meta.start ? addHours(new Date(post.meta.start), 3) : post.meta.published_date;
</script>

<a href={path} class="post" class:mark id={path}>
	<div class="publication">
		<!-- {#if authors}<address>{authors.join(', ')}</address>{/if} -->
		<!-- {#if authors && published_date}&nbsp;-&nbsp;{/if} -->
		{#if date}
			<time datetime={start}>
				{#if start}
					 {format(new Date(start), 'yyyy-MM-dd | HH:mm - ') + format(new Date(end),'HH:mm')}
				{:else}
					{authors?authors.join(', '):''}
					{authors && date ? ' - ' : ''}
					{date ? format(new Date(date), 'yyyy-MM-dd') : ''}
				{/if}
			</time>
		{/if}
	</div>
	<img {src} alt="" />
	<h3>
		{title}
	</h3>
	<div class="tags"><Tags {tags} bind:mark /></div>
</a>

<style lang="scss">
	.post {
		--post-color: var(--2);
		position: relative;
		width: 100%;
		max-width: 900px;
		height: 10.5em;

		display: grid;
		grid-template-areas: 'img title' 'img tags';
		grid-template-columns: 9em 1fr;
		gap: 2em;
		box-sizing: content-box;
		align-items: center;

		margin-inline: auto;
		/* padding: 1em; */
		padding-top: 1.7em;

		list-style: none;
		background: white;
		border-radius: 2em;
		box-shadow: 0 1em 1em rgba(0, 0, 0, 0.1);
		overflow: hidden;
		&.mark {
			--post-color: var(--1);
		}
	}
	h3 {
		grid-area: title;
		font-size: 2em;
		/* align-self:flex-start; */
		margin: 0;
	}
	.time {
		grid-area: time;
	}
	.tags {
		grid-area: tags;
		--color: var(--post-color);
		z-index: 3;
		/* cursor:crosshair; */
	}
	img {
		grid-area: img;
		max-height: 11em;
		max-width: 8em;
		object-fit: contain;
		object-position: center;
		border-radius: 1em;
		width: unset;
		margin-left: 1em;
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
		padding-left: 1.5em;
		color: white;
		* {
			display: inline;
		}
	}
	a {
		color: inherit;
		text-decoration-color: var(--post-color, var(--2));
		scale: 1;
		transition: 100ms;
	}
	a:hover {
		scale: 1.03;
	}
</style>
