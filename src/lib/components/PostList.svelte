<script>
	import {
		filteredTags,
		visibleTags,
		allTags,
		userConfig,
		tagManager,
		redundantTags,
		searchText
	} from '$lib/utils/stores';
	import { onMount, beforeUpdate, afterUpdate } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { filterPosts, readSearchParams, writeSearchParams } from '$lib/utils/postSearch';
	import { listMotion } from '$lib/utils/listMotion';
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
	/** Estado de la venta de entradas por slug (`ticketStatesFor` en el load de la página); si no
	 * se pasa, el `ticketStates` de los datos de la página, si lo hay.
	 * @type {import('$lib/utils/ticketCta.js').TicketStates | null | undefined} */
	export let ticketStates = undefined;
	/** Show "Mostrar/Ocultar eventos pasados"? By default, whenever the list may have events;
	 * /calendario passes whether the month on screen has past events.
	 * @type {boolean | undefined} */
	export let pastEventsToggle = undefined;
	/** Sin búsqueda, cuántos mostrar antes de «Ver más» (0 = todos). El inicio lo usa para que
	 * el pie de página quede a mano en vez de a 40 pantallas. */
	export let limit = 0;
	/** Lo que dice arriba de los resultados (por defecto «N resultados»).
	 * @type {(n: number) => string} */
	export let amountLabel = (n) => `${n} ${n == 1 ? 'resultado' : 'resultados'}`;
	let shownLimit = limit;
	$: states = ticketStates ?? $page.data?.ticketStates ?? null;

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

	/**
	 * Mount big batches of new items in two steps: the first few right away (they're what's
	 * on screen), the rest once that frame has been painted. Clearing a search or switching
	 * list/grid creates ~50 components at once; this way the list answers in one short
	 * task and the remaining items (below the fold) arrive a frame later. Items that are
	 * already on the page always stay, so nothing gets unmounted and remounted.
	 */
	const FIRST_BATCH = 10;
	let mounted = false;
	/** @type {ProcessedPost[]} */
	let prevShown = [];
	let prevDisplay = '';
	/** @type {ReturnType<typeof setTimeout>|undefined} */
	let releaseTimer;
	let batch = 0;
	/**
	 * @param {ProcessedPost[]} posts
	 * @param {string} display
	 * @returns {Set<string>|null} paths allowed to render for now; null = all of them
	 */
	function planBatch(posts, display) {
		clearTimeout(releaseTimer);
		const current = ++batch;
		if (!mounted) return null;
		const had = new Set(display == prevDisplay ? prevShown.map((p) => p.path) : []);
		const fresh = posts.filter((p) => !had.has(p.path));
		if (fresh.length <= FIRST_BATCH + 5) return null;
		for (const p of fresh.slice(0, FIRST_BATCH)) had.add(p.path);
		requestAnimationFrame(() => {
			if (current == batch) releaseTimer = setTimeout(() => (allowed = null), 0);
		});
		return had;
	}
	/** @type {Set<string>|null} */
	let allowed = null;
	// Con una búsqueda se ve todo lo que encontró; sin búsqueda, de a `limit`.
	$: capped = limit > 0 && !searching;
	$: cappedPosts = capped ? tagFilteredPosts.slice(0, shownLimit) : tagFilteredPosts;
	$: hiddenCount = tagFilteredPosts.length - cappedPosts.length;
	$: allowed = planBatch(cappedPosts, $userConfig.display_type);
	$: shownPosts = allowed
		? cappedPosts.filter((p) => /**@type {Set<string>}*/ (allowed).has(p.path))
		: cappedPosts;
	$: (prevShown = shownPosts), (prevDisplay = $userConfig.display_type);
	onMount(() => {
		mounted = true;
		return () => clearTimeout(releaseTimer);
	});

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

	/**
	 * Keep whatever the person just used (a tag in the tree, the search field, the
	 * list/grid switch...) where it was on screen when the results change. Without this
	 * the page height shrinks under the pointer (and the tag tree loses groups), so the
	 * control jumps away from the cursor. Runs synchronously around Svelte's DOM update,
	 * so there's no visible intermediate frame.
	 * @type {HTMLElement}
	 */
	let controls;
	/** @type {Element|null} */
	let touched = null;
	let touchedAt = 0;
	/** @param {Event} e */
	function remember(e) {
		touched = /** @type {Element} */ (e.target);
		touchedAt = performance.now();
	}
	/** @type {Element|null} */
	let anchor = null;
	let anchorTop = 0;
	beforeUpdate(() => {
		anchor = null;
		if (!controls) return;
		motion.before();
		const active = document.activeElement;
		const el =
			touched && performance.now() - touchedAt < 1000
				? touched
				: active && active != document.body && controls.contains(active)
				? active
				: null;
		// items of the list itself are what changes; don't anchor to them
		if (!el?.isConnected || el.closest('#posts')) return;
		anchor = el;
		anchorTop = el.getBoundingClientRect().top;
	});
	// The tag tree marks tags as checked from the URL, one navigation after the filter
	// changed; depending on it makes that update go through the anchoring above too.
	$: $page.url.search, void 0;
	afterUpdate(() => {
		if (anchor?.isConnected) {
			const dy = anchor.getBoundingClientRect().top - anchorTop;
			if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: 'instant' });
		}
		anchor = null;
		// after the anchoring scroll, so items glide from where they were seen
		motion.after();
	});

	/**
	 * Gentle list motion (see listMotion.js): items that stay glide to their new place,
	 * new ones fade in, removed ones fade out; only near the viewport, capped, one read
	 * and one write pass, nothing with prefers-reduced-motion. list <-> grid crossfades.
	 * @type {HTMLElement|undefined}
	 */
	let listEl;
	const motion = listMotion(() => listEl);

	$: allTags.set([
		// @ts-ignore
		...posts.reduce((a, b) => [...a, ...b.meta.tags], []),
		...$tagManager.tagIDs()
	]);
</script>

<slot />
<div class="container">
	<div
		class="postlist"
		bind:this={controls}
		on:pointerdown|capture={remember}
		on:keydown|capture={remember}
	>
		{#if outerFilteredPosts.length > 0 || searching}
			<div class="search">
				<TagSearch posts={outerFilteredPosts} />
			</div>
		{/if}
		<div id="filterbar">
			<FilterBar
				event_toggle={pastEventsToggle ??
					(tagFilteredPosts.length == 0 ||
						tagFilteredPosts.some((p) => p.meta.category == 'calendario'))}
			/>
		</div>
		{#if outerFilteredPosts.length > 0 || searching}
			<div class="results">
				<p class="post-amount" aria-live="polite">
					{amountLabel(tagFilteredPosts.length)}
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
				<!-- No Svelte transitions here: in:scale read getComputedStyle and animate:flip read
				getBoundingClientRect for every <li>, a forced layout per item, and kept the whole
				list moving for ~1s. `motion` animates only what's on screen, in one pass. -->
				<ul id="posts" class={$userConfig.display_type + ' h-feed'} bind:this={listEl}>
					{#each shownPosts as post (post.path)}
						<li data-key={post.path}>
							{#if $userConfig.display_type == 'list'}
								<PostListItem {post} ticketStates={states} />
							{:else}
								<Card {post} />
							{/if}
						</li>
					{/each}
				</ul>
				{#if hiddenCount > 0}
					<div class="more">
						<button
							type="button"
							class="pill-btn ghost"
							on:click={() => (shownLimit += limit)}
						>
							Ver más ({hiddenCount})
						</button>
					</div>
				{/if}
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
	.results {
		/* removed items fade out here, absolutely positioned (listMotion.js) */
		position: relative;
	}
	.more {
		display: flex;
		justify-content: center;
		margin-top: var(--space-l);
	}
	.post-amount {
		text-align: right;
		max-width: 50rem;
		margin: 0 auto 1.5em;
		color: var(--muted);
	}
	.empty-state {
		max-width: 50rem;
		margin: 0 auto 2em;
		text-align: center;
		color: var(--1-ink);
		p {
			margin: 0.3em 0;
		}
		button {
			margin-top: 0.8em;
			min-height: var(--tap);
			border: 1px solid var(--1);
			border-radius: var(--round-pill);
			padding: 0.3em 1em;
			color: var(--1-ink);
			background: var(--surface);
			font-size: var(--step--1);
			font-weight: 700;
			cursor: pointer;
			&:hover {
				background: var(--1-tint);
			}
		}
	}
	li {
		list-style: none;
		max-width: 100dvw;
		min-width: 0;
		/* Off-screen items skip style/layout/paint until they get close to the viewport.
		   That containment also clips painting to the <li>, so it gets room around the
		   item (cancelled by negative margins, the layout doesn't change) for the hover
		   zoom, the shadows, the card marks and the tag row hanging below grid cards.
		   The placeholder height is only used until an item has rendered once ("auto"). */
		content-visibility: auto;
		contain-intrinsic-size: auto 11.5em;
		padding: 2em 1em;
		margin: -2em -1em;
	}
	#posts.grid > li {
		contain-intrinsic-size: auto 13rem auto 20em;
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
