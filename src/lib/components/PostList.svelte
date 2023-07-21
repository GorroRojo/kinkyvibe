<script>
	//@ts-nocheck
	export let posts = [];
	export let filter = false;
	import { scale, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { filteredTags, visibleTags, allTags } from '$lib/utils/stores';
	import PostListItem from './PostListItem.svelte';
	import FilterBar from './FilterBar.svelte';
	import Card from './Card.svelte';
	/** @type {[]} */

	$: outerFilteredPosts = posts.filter(
		(p) => !filter || (filter && p[filter.prop] == filter.value)
	);

	let uniq = (arr) => [...new Set(arr)];

	$: allTags.set(posts.reduce((a, b) => [...a, ...b.meta.tags], []));
	$: visibleTags.set(uniq(uniq(tagFilteredPosts.reduce((all, p) => [...all, ...p.meta.tags], []))));
	// $: tags = [...new Set(nonAliasTags)];
	$: tagFilteredPosts = outerFilteredPosts.filter((p) =>
		$filteredTags && $filteredTags.length == 0
			? true
			: $filteredTags.every((f) => !$allTags.includes(f) || p.meta.tags.includes(f))
	);

	/**
	 * @type {"list"|"grid"}
	 */
	export let display_type = 'list';
</script>

{#if tagFilteredPosts.length > 0}
	<div class="container">
		<div class="postlist">
			<div id="filterbar">
				<FilterBar bind:display_type />
			</div>

			{#key display_type}
				<p class="post-amount">{tagFilteredPosts.length} resultados</p>
				<ul id="posts" in:fade={{ duration: 300 }} class={display_type}>
					{#if display_type == 'list'}
						{#each tagFilteredPosts as post, i (post.path)}
							<li in:scale|local={{ delay: i * 100 }} animate:flip={{ duration: 500 }}>
								<PostListItem {post} />
							</li>
						{/each}
					{:else if display_type == 'grid'}
						{#each tagFilteredPosts as post, i (post.path)}
							<li in:scale|local={{ delay: i * 100 }} animate:flip={{ duration: 500 }}>
								<Card {post} />
							</li>
						{/each}
					{/if}
				</ul>
			{/key}
		</div>
	</div>
{/if}

<style lang="scss">
	#posts {
		display: flex;
		gap: 3em;
		flex-direction: column;
		padding: 0;
		/* margin-top: 3em; */
		max-width: 50rem;
		margin-inline: auto;
	}
	.post-amount {
		position: absolute;
		left: 0;
		right: 0;
		text-align: right;
		top: -2em;
		max-width: 50rem;
		margin-inline: auto;
		padding-left: 2em;
		opacity: 0.7;
	}
	li {
		list-style: none;
		max-width: 100dvw;
		min-width: 0;
	}

	.postlist {
		display: grid;
		gap: 1em;
	}
	.container {
		container-type: inline-size;
	}
	#posts.grid {
		/* display:grid; */
		/* grid-auto-flow: column; */
		/* max-width: 100%; */
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
		width: 100%;
	}
	@container (min-width: 1300px) {
		.postlist {
			grid-template-areas: 'left' 'main' 'right';
			grid-template-columns: 1fr 50rem 1fr;
			gap: 1em;
			align-items: start;
			align-content: start;
			padding-left: 1em;
		}
		#posts {
			width: 100%;
		}
		#filterbar {
			grid-area: left;
			top: 1em;
			display: block;
			height: auto;
			align-self: start;
			min-width: 0;
		}
		#display-type {
			margin-bottom: 1em;
		}
	}
	@media screen and (min-width: 1300px) {
	}
</style>
