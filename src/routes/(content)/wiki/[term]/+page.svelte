<script>
	import GlosarioItem from '$lib/components/GlosarioItem.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import SeriesTagBlock from '$lib/components/series/SeriesTagBlock.svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import ContentParts from '$lib/components/ContentParts.svelte';
	import { tagManager, currentPostData, userConfig } from '$lib/utils/stores.js';
	import { fetchAllPostsClient } from '$lib/utils/allPosts';
	import { page } from '$app/stores';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	/** @type {any} La página de la wiki (de la base) o la etiqueta sola (+page.js). */
	export let data;
	// Los estilos propios del texto (ya limitados al texto en el servidor). La etiqueta se arma por
	// partes para que el preprocesador de Svelte no la tome como el bloque de estilos del componente.
	const STYLE_TAG = 'style';
	$: ownStyle = data.css ? `<${STYLE_TAG}>${data.css}</${STYLE_TAG}>` : '';
	currentPostData.set({ category: 'wiki', path: $page.url.pathname });

	let haswiki = (/**@type string*/ n) =>
		true || data.wiki?.some((/** @type {ProcessedPost} */ e) => e.meta.wiki == n);
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
	const guessedTitle =
		data?.tag?.id ?? decodeURIComponent($page.url.pathname.slice(6)).replaceAll('-', ' ');
	const ascendance = getAscendance(data?.meta?.wiki ?? guessedTitle ?? 'BDSM');
	const descendance = getDescendance(data?.meta?.wiki ?? guessedTitle ?? 'inglés');
	// const descendance = [[{ name: 'Shibari' }], [{ name: 'Momificación' }]];

	const style = `
	scale: .8;
	translate: 0 .5em;
	color: var(--1);
	`;

	/** @param {ProcessedPost} p */
	const isRelated = (p) => {
		if (p.meta.tags.includes(data?.meta?.wiki ?? data?.tag?.id ?? '')) return true;
		let children = $tagManager.get(data?.meta?.wiki ?? '')?.getAllChildren() ?? [];
		for (const c of children) {
			if (p.meta.tags.includes(c)) return true;
		}
		return false;
	};
	// the server sends no past events; fetch them when the viewer chooses to see them
	let relatedPosts = data.relatedPosts;
	let loadedPast = false;
	$: if ($userConfig.show_past_events && data.relatedPastCount > 0 && !loadedPast) {
		loadedPast = true;
		fetchAllPostsClient()
			.then((posts) => (relatedPosts = posts.filter(isRelated)))
			.catch(() => (loadedPast = false));
	}
</script>

<svelte:head>
	<title>{data?.meta?.title ?? data.tag?.visible_name} · Kinky Vibe</title>

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
		{#if data.html}
			<!-- El texto de la wiki, de la base (src/lib/server/contenido/render.js): HTML libre con sus
			     estilos solo adentro, o la lista corta de HTML. -->
			<div class="kv-texto-libre">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html ownStyle}
				{#if data.parts}
					<ContentParts parts={data.parts} />
				{:else}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html data.html}
				{/if}
			</div>
		{/if}
	</div>
	<!-- «Lo que sigo» (interruptor `lo_que_sigo`): apagado, /api/sigo da 404 y no se ve -->
	<FollowButton
		kind="etiqueta"
		key={data?.tag?.id ?? data?.meta?.wiki ?? ''}
		name={data?.tag?.visible_name ?? data?.tag?.id ?? data?.meta?.wiki ?? ''}
	/>
	<!-- sin nada de series para esta etiqueta, /api/series da 404 y no se muestra nada -->
	<SeriesTagBlock tag={data?.tag?.id ?? data?.meta?.wiki ?? ''} />
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
									href={'/wiki/' + encodeURIComponent(name.replaceAll(' ', '-'))}>{name}</a
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
								<a
									class="familiar-name"
									href={'/wiki/' + encodeURIComponent(name.replaceAll(' ', '-'))}>{name}</a
								>
								<ChevronRight {style} />
							{/if}
						</span>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</article>
{#if relatedPosts.length > 0 || data.relatedPastCount > 0}
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
		padding: 0.2em 0.5em;
		border-radius: var(--round);
		text-decoration: none;
	}
	.ascendance div,
	.descendance div {
		display: flex;
		gap: 0.5em;
	}
</style>
