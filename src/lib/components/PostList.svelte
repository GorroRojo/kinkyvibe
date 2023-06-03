<script>
	//@ts-nocheck
	export let posts = [];
	export let filter = false;
	import Tags from '$lib/components/Tags.svelte';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { addHours } from 'date-fns';
	/**
	 * @type {[]}
	 */
	let positiveTagFilters = [];
	function togglePositiveTagFilter(tag) {
		let iOf = positiveTagFilters.indexOf(tag);
		if (iOf == -1) {
			positiveTagFilters = [...positiveTagFilters, tag];
		} else {
			positiveTagFilters = [
				...positiveTagFilters.slice(0, iOf),
				...positiveTagFilters.slice(iOf + 1)
			];
		}
	}
	$: outerFilteredPosts = posts.filter(
		(p) => !filter || (filter && p[filter.prop] == filter.value)
	);
	$: tags = Array.from(
		new Set(outerFilteredPosts.reduce((all, p) => [...all, ...p.meta.tags], []))
	);
	$: tagFilteredPosts = outerFilteredPosts.filter((p) => {
		if (positiveTagFilters == []) {
			return true;
		} else {
			return (
				p.meta.tags.filter((t) => positiveTagFilters.includes(t)).length ==
				positiveTagFilters.length
			);
		}
	});
</script>

<!-- {JSON.stringify(positiveTagFilters)} -->
<form>
	{#each tags as tag}
		<label style:--tag-color={tag == 'KinkyVibe' ? 'var(--1)' : 'var(--2)'}
			><input
				type="checkbox"
				on:click={() => togglePositiveTagFilter(tag)}
				name={tag}
			/>{tag}</label
		>
	{/each}
</form>
<ul id="posts">
	{#each tagFilteredPosts as { path, meta: { title, tags, published_date, authors, start, featured: src, mark } }, i (path)}
		{@const date = start ? addHours(new Date(start), 3) : published_date}
		<li
			class="post"
			class:mark
			in:fly={{ x: ((i % 2) - 0.5) * 2 * 200, duration: 300, delay: 300 }}
			out:fly={{ x: ((i % 2) - 0.5) * 2 * -200, duration: 300 }}
			animate:flip={{ duration: 300 }}
			id={path}
		>
			<div class="publication">
				{#if authors}<address>{authors.join(', ')}</address>{/if}
				{#if authors && published_date}&nbsp;-&nbsp;{/if}
				{#if date}
					<time datetime={date}>{new Date(date).toLocaleDateString('es-AR')}</time>
				{/if}
			</div>
			<img {src} alt="" />
			<h3><a href={path}>{title}</a></h3>
			<div class="tags"><Tags {tags} bind:mark /></div>
		</li>
	{/each}
</ul>

<style lang="scss">
	#posts {
		display: flex;
		gap: 3em;
		flex-direction: column;
		padding: 0;
	}
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
	.tags {
		grid-area: tags;
		--color: var(--post-color);
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
	h3 a {
		color: inherit;
		text-decoration-color: var(--post-color, var(--2));
	}
	h3 a:hover {
		text-decoration-thickness: 0.11em;
	}

	form {
		margin-top: 2em;
		font-size: 0.9em;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3em;
		justify-content: center;
		border-radius: 1em;
		/* background: white; */
		padding: 5px;
		input {
			display: none;
		}
		label {
			--tag-color: var(--2);
			padding: 0.5em 0.7em;
			background: transparent;
			border-radius: 1em;
			outline: 1px solid var(--tag-color);
			color: var(--tag-color);
			transition: 300ms;
			/* width: 100px; */
			&:has(:checked) {
				color: white;
				outline: none;
				background: var(--tag-color);
			}
		}
	}
</style>
