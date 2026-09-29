<script>
	import { scale, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import {
		filteredTags,
		visibleTags,
		allTags,
		userConfig,
		tagManager,
		redundantTags,
		searchText
	} from '$lib/utils/stores';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { filterPosts, readSearchParams, writeSearchParams } from '$lib/utils/postSearch';
	import PostListItem from './PostListItem.svelte';
	import FilterBar from './FilterBar.svelte';
	import TagSearch from './TagSearch.svelte';
	import Card from './Card.svelte';
	/**
	 * @type {Record<string,*>[]}
	 */
	/**@type ProcessedPost[]*/
	export let posts = [];
	/** @type {false|{prop: string, value: *}}*/
	export let filter = false;
	/** Keep the search in the URL (`?tags=a,b&q=texto`). Only one PostList per page should do this. */
	export let syncUrl = true;

	/**@type ProcessedPost[]*/
	$: outerFilteredPosts = posts.filter(
		(/**@type {ProcessedPost}*/ p) =>
			// @ts-ignore
			(!filter || (filter && p[filter.prop] == filter.value)) &&
			($userConfig.show_past_events ||
				new Date(p.meta.start).getTime() > Date.now() ||
				p.meta.category != 'calendario')
	);

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
	/**@type ProcessedPost[]*/
	$: tagFilteredPosts = filterPosts(
		outerFilteredPosts,
		{ tags: $filteredTags, text: $searchText },
		$tagManager
	);
	$: searching = $filteredTags.length > 0 || $searchText.trim() != '';

	onMount(() => {
		if (!syncUrl) return;
		const pathname = location.pathname;
		/** search string we last wrote ourselves, so our own navigations don't echo back
		 * @type {string|null} */
		let written = null;
		/** @type {ReturnType<typeof setTimeout>|undefined} */
		let timer;

		function writeUrl() {
			clearTimeout(timer);
			if (location.pathname != pathname) return;
			const next = writeSearchParams(new URL(location.href), {
				tags: get(filteredTags),
				text: get(searchText)
			});
			if (next.search == location.search) return;
			written = next.search;
			goto(next.pathname + next.search + next.hash, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}

		const unsubPage = page.subscribe(($page) => {
			if ($page.url.pathname != pathname || $page.url.search == written) return;
			// initial load, back/forward or a link: the URL wins
			clearTimeout(timer);
			written = $page.url.search;
			const { tags, text } = readSearchParams($page.url);
			if (tags.join(',') != get(filteredTags).join(',')) filteredTags.set(tags);
			if (text != get(searchText)) searchText.set(text);
		});
		const unsubTags = filteredTags.subscribe(() => {
			clearTimeout(timer);
			timer = setTimeout(writeUrl, 0);
		});
		const unsubText = searchText.subscribe(() => {
			clearTimeout(timer);
			timer = setTimeout(writeUrl, 400);
		});
		return () => {
			clearTimeout(timer);
			unsubPage();
			unsubTags();
			unsubText();
		};
	});

	$: allTags.set([
		// @ts-ignore
		...posts.reduce((a, b) => [...a, ...b.meta.tags], []),
		...$tagManager.tagIDs()
	]);
</script>

<slot />
<div class="container">
	<div class="postlist">
		{#if outerFilteredPosts.length > 0 || searching}
			<div class="search">
				<TagSearch posts={outerFilteredPosts} />
			</div>
		{/if}
		<div id="filterbar">
			<FilterBar
				event_toggle={tagFilteredPosts.length == 0 ||
					tagFilteredPosts.some((p) => p.meta.category == 'calendario')}
			/>
		</div>
		{#if outerFilteredPosts.length > 0 || searching}
			{@const Item = $userConfig.display_type == 'list' ? PostListItem : Card}
			<div class="results">
				<p class="post-amount" aria-live="polite">
					{tagFilteredPosts.length}
					{tagFilteredPosts.length == 1 ? 'resultado' : 'resultados'}
				</p>
				{#if tagFilteredPosts.length == 0}
					<div class="empty-state">
						<p>No encontramos nada con esa búsqueda.</p>
						<p>Probá sacando alguna etiqueta o buscando con otras palabras.</p>
						<button
							type="button"
							on:click={() => {
								filteredTags.set([]);
								searchText.set('');
							}}>Despejar búsqueda</button
						>
					</div>
				{/if}
				{#key $userConfig.display_type}
					<ul id="posts" in:fade={{ duration: 300 }} class={$userConfig.display_type + ' h-feed'}>
						{#each tagFilteredPosts as post, i (post.path)}
							<li in:scale={{ delay: i * 10 }} animate:flip={{ duration: 500 }}>
								<svelte:component this={Item} {post} />
							</li>
						{/each}
					</ul>
				{/key}
			</div>
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
	.search,
	.results {
		min-width: 0;
		padding-inline: 1em;
	}
	.post-amount {
		text-align: right;
		max-width: 50rem;
		margin: 0 auto 1.5em;
		opacity: 0.7;
	}
	.empty-state {
		max-width: 50rem;
		margin: 0 auto 2em;
		text-align: center;
		color: var(--1-dark);
		p {
			margin: 0.3em 0;
		}
		button {
			margin-top: 0.8em;
			border: none;
			outline: 2px solid var(--1);
			border-radius: 0.5em;
			padding: 0.3em 0.6em;
			color: var(--1);
			background: white;
			font-size: var(--step--1);
			cursor: pointer;
		}
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
		/* search above the results, filters in the left column beside both */
		.search {
			grid-column: 2;
			grid-row: 1;
			padding-inline: 0;
		}
		#filterbar {
			grid-column: 1;
			grid-row: 1 / span 2;
		}
		.results {
			grid-column: 2;
			grid-row: 2;
			padding-inline: 0;
		}
	}
	@media screen and (min-width: 1300px) {
	}
</style>
