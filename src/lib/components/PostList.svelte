<script>
	//@ts-nocheck
	export let posts = [];
	export let filter = false;
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import PostListItem from './PostListItem.svelte';
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
			const matchedTags = p.meta.tags.filter((t) => positiveTagFilters.includes(t));
			return matchedTags.length == positiveTagFilters.length;
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
			/* width: 100px; */
			&:has(:checked) {
				color: white;
				outline: none;
				background: var(--tag-color);
			}
		}
	}
</style>
