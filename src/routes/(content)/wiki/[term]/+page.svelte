<script>
	import GlosarioItem from '$lib/components/GlosarioItem.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { tagManager, currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import MiniMarkup from '$lib/components/MiniMarkup.svelte';
	export let data;
	currentPostData.set({ category: 'wiki', path: $page.url.pathname });

	let haswiki = (/**@type string*/ n) => true || data.wiki?.some((e) => e.meta.wiki == n);
	/**@type {(termino:string, groups?: Group[], parents?: {name:string, disabled?: boolean}[])=>{name:string, disabled?: boolean}[][]}*/
	function getAscendance(termino) {
		/**@type {{name:string, disabled?: boolean}[][]}*/
		let branches = [];
		let tagParents = $tagManager.get(termino)?.parents?.filter((p) => p != 'root') ?? [];
		for (let p of tagParents) {
			let subbranch = [];
			let grandparents = getAscendance(p);
			if (grandparents.length > 0) {
				for (let g of grandparents) {
					subbranch.push([...g, { name: p, disabled: !haswiki(p) }]);
				}
			} else {
				subbranch.push([{ name: p, disabled: !haswiki(p) }]);
			}
			branches.push(...subbranch);
		}
		return branches.filter((branch) => branch.some((i) => !i.disabled));
	}

	/**@type {(termino:string, groups?: Group[], parents?: {name:string,disabled?:boolean}[])=>{name:string,disabled?:boolean}[][]}*/
	function getDescendance(termino) {
		/**@type {{name:string, disabled?: boolean}[][]}*/
		let branches = [];
		let tagChildren = $tagManager.get(termino)?.children ?? [];
		for (let c of tagChildren) {
			let grandchildren = getDescendance(c);
			if (grandchildren.length > 0) {
				for (let g of grandchildren) {
					branches.push([{ name: c, disabled: !haswiki(c) }, ...g]);
				}
			} else {
				branches.push([{ name: c, disabled: !haswiki(c) }]);
			}
		}
		return branches.filter((branch) => branch.some((i) => !i.disabled));
	}
	const guessedTitle = decodeURI($page.url.pathname.slice(6)).replaceAll('-', ' ');
	const ascendance = getAscendance(data?.meta?.wiki ?? guessedTitle ?? 'BDSM');
	const descendance = getDescendance(data?.meta?.wiki ?? guessedTitle ?? 'inglés');
	// const descendance = [[{ name: 'Shibari' }], [{ name: 'Momificación' }]];

	const style = `
	scale: .8;
	translate: 0 .5em;
	color: var(--1);
	`;

	const relatedPosts = data.allPosts.filter((p) => {
		if (p.meta.tags.includes(data?.meta?.wiki ?? data?.tag?.id ?? '')) return true;
		let children = $tagManager.get(data?.meta?.wiki ?? '')?.getAllChildren() ?? [];
		for (const c of children) {
			if (p.meta.tags.includes(c)) return true;
		}
		return false;
	});
</script>

<svelte:head>
	<title>{data?.meta?.title ?? data.tag?.visible_name} - KinkyVibe.ar</title>

	<meta property="og:title" content={data?.meta?.title} />
	<meta name="twitter:title" content={data?.meta?.title} />

	<meta name="description" content={data?.meta?.summary} />
	<meta name="twitter:description" content={data?.meta?.summary} />
	<meta property="og:description" content={data?.meta?.summary} />

	<meta property="og:image" content={data?.meta?.featured + ''} />
	<meta name="twitter:image" content={data?.meta?.featured + ''} />

	<meta name="twitter:site" content="@kinkyvibearg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="og:type" content="article" />

	<!-- <meta property="article:section" content="" /> -->
</svelte:head>

<article class="h-entry wiki" id="title">
	<div class="content">
		<GlosarioItem item={data?.tag?.id ?? data?.meta?.wiki} single title />
		{#if data.content}
			<svelte:component this={data.content} />
		{/if}
	</div>
	<hr />
	<div class="lineage">
		<div class="ascendance">
			{#each ascendance as line}
				<div>
					{#each line as { name, disabled = false }}
						<span class="line">
							{#if disabled}
							<ChevronLeft {style} /><span class="familiar-name">{name}</span>
						{:else}
							<ChevronLeft {style} /><a
								class="familiar-name"
								href={'/wiki/' + name.replaceAll(' ', '-')}>{name}</a
							>
						{/if}
						</span>
					{/each}
				</div>
			{/each}
		</div>
		<div class="descendance">
			{#each descendance as line}
				<div>
					{#each line as { name, disabled = false }}
						<span class="line">
							{#if disabled}
								<span class="familiar-name">{name}</span>
								<ChevronRight {style} />
							{:else}
								<a class="familiar-name" href={'/wiki/' + name.replaceAll(' ', '-')}>{name}</a>
								<ChevronRight {style} />
							{/if}
						</span>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</article>
{#if relatedPosts.length > 0}
	<PostList posts={relatedPosts}>
		<hr />
		<h2>Materiales, amigues y eventos relevantes</h2>
	</PostList>
{/if}

<style>
	h2 {
		text-align: center;
		width: 100%;
		font-size: var(--step-3);
	}

	.lineage {
		max-width: 45rem;
		width: 100%;
		margin-inline: auto;
		display: flex;
		justify-content: space-between;
		margin-top: 1em;
	}
	.ascendance,
	.descendance {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		flex-direction: column;
	}
	.ascendance div > *,
	.descendance div > * {
		position: relative;
	}
	.lineage a {
		background: white;
		padding: .2em .5em;
		border-radius: var(--round);
		text-decoration: none;
	}
	.ascendance div,
	.descendance div {
		display: flex;
		gap: 0.5em;
	}
</style>
