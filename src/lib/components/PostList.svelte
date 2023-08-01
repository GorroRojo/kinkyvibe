<script>
	import { scale, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { filteredTags, visibleTags, allTags, userConfig, tagsConfig } from '$lib/utils/stores';
	import PostListItem from './PostListItem.svelte';
	import FilterBar from './FilterBar.svelte';
	import Card from './Card.svelte';
	/**
	 * @type {Record<string,*>[]}
	 */
	export let posts = [];
	/** @type {false|{prop: string, value: string}}*/
	export let filter = false;

	$: outerFilteredPosts = posts.filter(
		(/**@type {Record<string,string>}*/ p) => !filter || (filter && p[filter.prop] == filter.value)
	);

	/**@type {<T>(arr: T[])=>T[]}*/
	let uniq = (arr) => [...new Set(arr)];

	// @ts-ignore
	$: visibleTags.set(uniq(uniq(tagFilteredPosts.reduce((all, p) => [...all, ...p.meta.tags], []))));
	// $: tags = [...new Set(nonAliasTags)];
	// /** @type {{[k: string]: Group | undefined}}*/
	// $: groupByName = Object.fromEntries(
	// 	getAllGroupNames($tagsConfig.groups).map((name) => [name, getGroupByName(name)])
	// );
	$: tagFilteredPosts = outerFilteredPosts.filter((post) =>
		$filteredTags && $filteredTags.length == 0
			? true
			: $filteredTags.every(
					(f) =>
						post.meta.tags.includes(f) ||
						post.meta.tags
							.map((/**@type {string}*/ t) => {
								let p = getParents(t);
								console.log(post.meta.title, t, p);
								return p;
							})
							.flat()
							.includes(f)
			  )
	);

	/**
	for each post
		are all the filtered tags or their parents

	*/

	/**@type {(tag:string)=>string[]}*/
	function getParents(tag) {
		/**@type {string[]}*/
		let parents = [];
		$tagsConfig.groups.forEach((g) => {
			parents = [...parents, ...findTagAndReturnParents(tag, g)];
		});
		return parents;
	}

	/**
	 * Finds a specific tag within a group and returns its parents.
	 * @param {string} tag - The tag to search for.
	 * @param {Group} group - The group object to search within.
	 * @param {string[]} [parents=[]] - An array of parent names (optional, defaults to an empty array).
	 * @returns {string[]} - An array containing the names of the parents of the tag.
	 */
	function findTagAndReturnParents(tag, group, parents = []) {
		if (group.name == tag) return parents;
		if (group.members.includes(tag)) return [...parents, group.name];
		/**@type {string[]}*/
		let deeper = [];
		group.sub.forEach((sub) => {
			deeper.push(...findTagAndReturnParents(tag, sub, ['sub', ...parents, group.name]));
		});
		return deeper;
	}

	/**@type {(groups: Group[]|Group|undefined)=>string[]}*/
	function getAllChildren(groups = $tagsConfig.groups) {
		if (!groups) return [];
		if (!Array.isArray(groups)) groups = [groups];
		/**@type {string[]}*/
		let children = [];
		[groups].flat().forEach((g) => {
			children = [...children, g.name, ...g.members, ...getAllChildren(g.sub)];
		});
		return children;
	}

	/** @param {Group[]|Group} groups
	 * @returns {string[]}
	 */
	function getAllGroupNames(groups) {
		if (Array.isArray(groups)) {
			// console.log(groups);
			//@ts-ignore
			return groups.reduce((prev, g) => [...prev, ...getAllGroupNames(g)], []);
		} else {
			let accumulated = [groups.name];
			if (groups.sub) {
				accumulated.push(...getAllGroupNames(groups.sub));
			}
			return accumulated;
		}
	}

	/** breadth-first search
	 * @type {(name:string)=>Group|undefined}
	 * */
	function getGroupByName(name, groups = $tagsConfig.groups) {
		for (let g of groups) {
			if (g.name == name) return g;
		}
		for (let g of groups) {
			let sub;
			if (g.sub) sub = getGroupByName(g.sub);
			if (sub) return sub;
		}
	}

	$: allTags.set([
		// @ts-ignore
		...posts.reduce((a, b) => [...a, ...b.meta.tags], []),
		...getAllGroupNames($tagsConfig.groups)
	]);
</script>

{#if tagFilteredPosts.length > 0 || $filteredTags.length > 0}
<div class="container">
	<div class="postlist">
		<div id="filterbar">
			<FilterBar />
		</div>

			{#key $userConfig.display_type}
				<p class="post-amount">{tagFilteredPosts.length} resultados</p>
				<ul id="posts" in:fade={{ duration: 300 }} class={$userConfig.display_type}>
					{#if $userConfig.display_type == 'list'}
						{#each tagFilteredPosts as post, i (post.path)}
							<li in:scale|local={{ delay: i * 100 }} animate:flip={{ duration: 500 }}>
								<PostListItem {post} />
							</li>
						{/each}
					{:else if $userConfig.display_type == 'grid'}
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
