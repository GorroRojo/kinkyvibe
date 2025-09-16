<script>
	import { scale, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { filteredTags, visibleTags, parentsOfVisibleTags, userConfig, tagManager } from '$lib/utils/stores';
	import PostListItem from './PostListItem.svelte';
	import FilterBar from './FilterBar.svelte';
	import Card from './Card.svelte';
	/** @type {{posts?: ProcessedPost[], children?: import('svelte').Snippet}} */
	let { posts = [] } = $props();

	/**
	 * @param {ProcessedPost[]} posts
	 * @param {TagID[]} fTags
	 * @param {{display_type: 'list'|'grid', show_past_events: boolean}} uConfig
	 */
	function getFilteredPosts(posts, fTags, uConfig) {
		return posts
			.filter(
				// filter by current date (if event)
				(/**@type {ProcessedPost}*/ p) =>
					p.meta.category != 'calendario' ||
					uConfig.show_past_events ||
					new Date(p.meta.start).getTime() > Date.now()
			)
			.filter(
				// filter by tags
				(/**@type {ProcessedPost}*/ p) =>
					fTags.length == 0 ||
					fTags.every((f) => {
						return (
							p.meta.tags.includes(f) || //all filtered tags are included or their descendants are
							p.meta.tags.some((t) => $tagManager.get(t)?.getAllParents().includes(f))
						);
					})
			);
	}
	/** From a list of posts and tags returns the tags that should be visible in a FilterBar
	 * @param {ProcessedPost[]} posts
	 * @param {string[]} filteredTags
	 * @returns {string[]}
	 */
	function getVisibleTags(posts, filteredTags) {
		/** Histogram of tags in post list
		 * @type Map<TagID,number>  */
		let presentTags = new Map();
		for (const post of posts) {
			for (const tag of post.meta.tags) {
				presentTags.set(tag, presentTags.get(tag) ?? 0 + 1);
			}
		}

		return [...presentTags.entries()]
			.filter(([tag, instances]) => {
				return (
					instances < posts.length || // if filtering the tag would actually do something
					filteredTags.includes(tag) // or it's actively filtered already
				);
			})
			.map((t) => t[0]);
	}
	/**
	 * @type {ProcessedPost[]}
	 */
	let filteredPosts = $state([]);
	/**
	 *
	 * @param {TagID[]} fTags
	 * @param {{display_type: 'list'|'grid', show_past_events: boolean}} uConfig
	 */
	function updateFilteredPosts(fTags, uConfig) {
		filteredPosts = getFilteredPosts(posts, fTags, uConfig);
		$visibleTags = getVisibleTags(filteredPosts, fTags);
		$parentsOfVisibleTags = [
			...new Set($visibleTags.map((t) => $tagManager.get(t).getAllParents()).flat())
		];
	}
	/**@type ProcessedPost[]*/
	filteredTags.subscribe((ft) => updateFilteredPosts(ft, $userConfig));
	userConfig.subscribe((uc) => updateFilteredPosts($filteredTags, uc));
</script>

<div class="container">
	<div class="postlist">
		<div id="filterbar">
			<FilterBar
				event_toggle={filteredPosts.length == 0 ||
					filteredPosts.some((p) => p.meta.category == 'calendario')}
			/>
		</div>
		{#if filteredPosts.length > 0 || $filteredTags.length > 0}
			{@const Item = $userConfig.display_type == 'list' ? PostListItem : Card}

			{#key $userConfig.display_type}
				<p class="post-amount">{filteredPosts.length} resultados</p>
				<!-- FIXME resultados is way too high on display -->
				<ul
					id="posts"
					in:fade|global={{ duration: 300 }}
					class={$userConfig.display_type + ' h-feed'}
				>
					{#each filteredPosts as post, i (post.path)}
						<li in:scale|global={{ delay: i * 10 }} animate:flip={{ duration: 500 }}>
							<Item {post} />
						</li>
					{/each}
				</ul>
			{/key}
		{/if}
	</div>
</div>

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
		:global(#display-type) {
			margin-bottom: 1em;
		}
	}
</style>
