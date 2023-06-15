<script>
	//@ts-nocheck
	export let posts = [];
	export let filter = false;
	import { fly } from 'svelte/transition';
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
	$: visibleTags.set(
		uniq(uniq(tagFilteredPosts.reduce((all, p) => [...all, ...p.meta.tags], [])).map(aliasTag))
	);
	// $: tags = [...new Set(nonAliasTags.map(aliasTag))];
	$: tagFilteredPosts = outerFilteredPosts.filter((p) =>
		// $filteredTags && $filteredTags.length == 0
		// 	? true
		// 	: p.meta.tags.filter((t) => $filteredTags.includes(aliasTag(t))).length ==
		// 	  $filteredTags.length
		true
	);
	function aliasTag(tag) {
		let result = tag;
		let max = 20;
		// while (
		// 	Object.hasOwn($tagsConfig.tags, result) &&
		// 	Object.hasOwn($tagsConfig.tags[result], 'aliasOf')
		// ) {
		// 	result = $tagsConfig.tags[tag].aliasOf;
		// 	if (max-- < 0) {
		// 		alert('too many aliases: ', tag);
		// 		break;
		// 	}
		// 	max--;
		// }
		return result;
	}
</script>
filtered<br/>
{$filteredTags}<br/><br/>
visible<br/>
{$visibleTags}<br/><br/>
config<br/>
{JSON.stringify($tagsConfig)}<br/><br/>
config groups<br/>
{#each $tagsConfig.groups as group}
- {JSON.stringify(group)}<br/>
{/each}
<br/>
config tags<br/>
{#each Object.entries($tagsConfig.tags) as tag}
- {tag[0]}: {JSON.stringify(tag[1])}<br/>
{/each}h
<FilterBar />

<ul id="posts">
	{#each tagFilteredPosts as post, i (post.path)}
		<li
			animate:flip={{ duration: 300 }}
			in:fly={{ x: ((i % 2) - 0.5) * 2 * 200, duration: 300, delay: 300 }}
			out:fly={{ x: ((i % 2) - 0.5) * 2 * -200, duration: 300 }}
		>
			<PostListItem {post} />
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
	li {
		list-style: none;
	}
</style>
