<script>
	//@ts-nocheck
	export let posts = [];
	export let filter = false;
	import { scale, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { filteredTags, visibleTags, tagsConfig } from '$lib/utils/stores';
	import PostListItem from './PostListItem.svelte';
	import FilterBar from './FilterBar.svelte';
	/** @type {[]} */
	function togglePositiveTagFilter(tag) {
		filteredTags.update((fTags) =>
			fTags.includes(tag)
				? [...fTags, tag]
				: [...fTags.slice(0, fTags.indexOf(tag)), ...fTags.slice(fTags.indexOf(tag) + 1)]
		);
	}
	$: outerFilteredPosts = posts.filter(
		(p) => !filter || (filter && p[filter.prop] == filter.value)
	);

	let uniq = (arr) => [...new Set(arr)];
	$: visibleTags.set(uniq(uniq(tagFilteredPosts.reduce((all, p) => [...all, ...p.meta.tags], []))));
	// $: tags = [...new Set(nonAliasTags)];
	$: tagFilteredPosts = outerFilteredPosts.filter((p) =>
		$filteredTags && $filteredTags.length == 0
			? true
			: $filteredTags.every((f) => p.meta.tags.includes(f))
	);
</script>

<div id="filterbar">
	<FilterBar />
</div>

<ul id="posts">
	{#each tagFilteredPosts as post, i (post.path)}
		<li
		in:scale|local={{delay: i*100}}
			animate:flip={{ duration: 500 }}
		>
			<PostListItem {post} />
		</li>
	{/each}
</ul>

<style lang="scss">
	#filterbar {
		margin-top: 3em;
		/* height: 7em; */
	}
	#posts {
		display: flex;
		gap: 3em;
		flex-direction: column;
		padding: 0;
		margin-top: 3em;
	}
	li {
		list-style: none;
	}
</style>
