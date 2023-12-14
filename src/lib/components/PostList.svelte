<script>
	import { scale, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import {
		filteredTags,
		visibleTags,
		allTags,
		userConfig,
		tagManager,
		redundantTags
	} from '$lib/utils/stores';
	import PostListItem from './PostListItem.svelte';
	import FilterBar from './FilterBar.svelte';
	import Card from './Card.svelte';
	/**
	 * @type {Record<string,*>[]}
	 */
	/**@type ProcessedPost[]*/
	export let posts = [];
	/** @type {false|{prop: string, value: *}}*/
	export let filter = false;

	/**@type ProcessedPost[]*/
	$: outerFilteredPosts = posts.filter(
		(/**@type {ProcessedPost}*/ p) =>
			// @ts-ignore
			(!filter || (filter && p[filter.prop] == filter.value)) &&
			($userConfig.show_past_events ||
				new Date(p.meta.start).getTime() > Date.now() ||
				p.meta.category != 'calendario')
	);

	/**@type {<T>(arr: T[])=>T[]}*/
	let uniq = (arr) => [...new Set(arr)];

	/**
	 * @param {ProcessedPost[]} posts
	 * @param {string[]} filteredTags
	 * @returns {string[]}
	 */
	function getVisibleTags(posts, filteredTags) {
		let presentTags = new Map();
		for (const post of posts) {
			for (const tag of post.meta.tags) {
				const present = presentTags.get(tag);
				if (present === undefined) {
					presentTags.set(tag, 1);
				} else {
					presentTags.set(tag, present + 1);
				}
			}
		}
		return [...presentTags.entries()]
			.filter(([tag, instances]) => {
				if (instances < posts.length || filteredTags.includes(tag)) {
					$redundantTags.delete(tag);
					return true;
				} else {
					$redundantTags.add(tag);
					const parents = $tagManager.get(tag)?.parents ?? [];
					return filteredTags.some((ft) => parents.includes(ft));
				}
			})
			.map((t) => t[0]);
	}

	$: visibleTags.set(getVisibleTags(tagFilteredPosts, $filteredTags));
	console.log($tagManager.get('español')?.getAllParents());
	/**@type ProcessedPost[]*/
	$: tagFilteredPosts = outerFilteredPosts.filter(
		(post) =>
			$filteredTags.length == 0 ||
			$filteredTags.every((f) => {
				let includesTheseTags = post.meta.tags.includes(f);
				let includesAscendances = post.meta.tags.some((t) =>
					$tagManager.get(t)?.getAllParents().includes(f)
				);
				return includesTheseTags || includesAscendances;
			})
	);

	$: allTags.set([
		// @ts-ignore
		...posts.reduce((a, b) => [...a, ...b.meta.tags], []),
		...$tagManager.tags()
	]);
</script>

<slot />
<div class="container">
	<div class="postlist">
		<div id="filterbar">
			<FilterBar
				event_toggle={tagFilteredPosts.length == 0 ||
					tagFilteredPosts.some((p) => p.meta.category == 'calendario')}
			/>
		</div>
		{#if tagFilteredPosts.length > 0 || $filteredTags.length > 0}
			{@const Item = $userConfig.display_type == 'list' ? PostListItem : Card}

			{#key $userConfig.display_type}
				<p class="post-amount">{tagFilteredPosts.length} resultados</p>
				<ul id="posts" in:fade={{ duration: 300 }} class={$userConfig.display_type + ' h-feed'}>
					{#each tagFilteredPosts as post, i (post.path)}
						<li in:scale={{ delay: i * 10 }} animate:flip={{ duration: 500 }}>
							<svelte:component this={Item} {post} />
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
		#display-type {
			margin-bottom: 1em;
		}
	}
	@media screen and (min-width: 1300px) {
	}
</style>
