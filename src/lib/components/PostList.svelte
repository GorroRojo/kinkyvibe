<script>
	//@ts-nocheck
	export let posts = [];
	export let filter = false;
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import PostListItem from './PostListItem.svelte';
	/** @type {[]} */
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
	let tagsConfig = posts
		.map((p) => p.meta.tagsConfig)
		.reduce((sum, curr) => ({ ...sum, ...curr }), {});
	let uniq = (arr) => [...new Set(arr)];
	$: tags = uniq(
		uniq(tagFilteredPosts.reduce((all, p) => [...all, ...p.meta.tags], [])).map(aliasTag)
	);
	// $: tags = [...new Set(nonAliasTags.map(aliasTag))];
	$: tagFilteredPosts = outerFilteredPosts.filter((p) => {
		if (positiveTagFilters == []) {
			return true;
		} else {
			const matchedTags = p.meta.tags.filter((t) => positiveTagFilters.includes(aliasTag(t)));
			return matchedTags.length == positiveTagFilters.length;
		}
	});
	function aliasTag(tag) {
		let result = tag;
		let max = 20;
		while (
			Object.hasOwn(tagsConfig.tags, result) &&
			Object.hasOwn(tagsConfig.tags[result], 'aliasOf')
		) {
			result = tagsConfig.tags[tag].aliasOf;
			if (max-- < 0) {
				alert('too many aliases: ', tag);
				break;
			}
			max--;
		}
		return result;
	}
</script>

<form>
	{#each [...tags].sort() as tag (tag)}
		{@const config = Object.hasOwn(tagsConfig.tags, tag) ? tagsConfig.tags[tag] : false}
		{@const color = config?.color ? config.color : 'var(--color,var(--2))'}
		<label style:--tag-color={color} animate:flip={{ duration: 600 }}
			><input
				type="checkbox"
				on:click={() => togglePositiveTagFilter(tag)}
				name={tag}
				checked={positiveTagFilters.includes(tag)}
			/>{tag}</label
		>
	{/each}
</form>
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
			cursor: pointer;
			/* width: 100px; */
			&:has(:checked) {
				color: white;
				outline: none;
				background: var(--tag-color);
			}
		}
	}
</style>
