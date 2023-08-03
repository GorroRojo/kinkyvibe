<script>
	import { aliaserFactory } from '$lib/utils/index.js';
	import PostList from '$lib/components/PostList.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import { tagsConfig, currentPostData } from '$lib/utils/stores.js';
	import { CornerRightUp } from 'lucide-svelte';
	import { page } from '$app/stores';
	export let data;
	import { onMount } from 'svelte';
	currentPostData.set({ category: data.category, path: $page.url.pathname });

	/**@type {(n: Element)=>void}*/
	function addWikiLinks(n) {
		const regex = /\[\[([^\]]*)\]\]/g;
		n.innerHTML = n.innerHTML
			.split(regex)
			.map((piece, index) =>
				index % 2 == 0
					? piece
					: '<a href="/wiki/' + piece.replaceAll(' ', '-') + '">' + piece + '</a>'
			)
			.join('');
	}

	/** @type {import('svelte/action').Action} */
	function process(node) {
		[...node.children].forEach((n, i) => {
			// addWikiLinks(n);
		});
		return {
			destroy() {}
		};
	}
</script>

<svelte:head>
	<title>{data.title} - KinkyVibe.ar</title>
	<link rel="icon" href="favicon.png" />

	<meta name="theme-color" content="hsl(319, 90%, 60%)" />

	<meta property="og:url" content={$page.url.href} />

	<meta property="og:title" content={data.title} />
	<meta name="twitter:title" content={data.title} />

	<meta name="description" content={data.summary} />
	<meta name="twitter:description" content={data.summary} />
	<meta property="og:description" content={data.summary} />

	<meta property="og:image" content={data.featured + ''} />
	<meta name="twitter:image" content={data.featured + ''} />

	<meta name="twitter:site" content="@kinkyvibearg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="og:type" content="article" />

	<meta property="article:published_time" content={data.published_date?.toString()} />
	<meta property="article:modified_time" content={data.updated_date?.toString()} />
	<meta property="article:author" content={data.authors?.join(', ')} />
	<!-- <meta property="article:section" content="" /> -->
	<meta property="article:tag" content={data.tags?.join(', ')} />
</svelte:head>

<article class="wiki" id="title">
	{#if !data.error}
		<h1>{data.title}</h1>
		{#if data.summary}
			<div class="content">
				<p>
					{data.summary}
				</p>
			</div>
		{/if}
		<div class="content">
			<svelte:component this={data.content} />
		</div>
	{:else if data.content.includes('Unknown variable dynamic import')}
		<h1>Esta wiki todavía no existe!</h1>
		<div class="content">
			<p>Podés comunicarte con <a href="/Gorro_Rojo">@Gorro_Rojo</a> para pedir que se agregue :D</p>
		</div>
	{:else}
		<h1>{data.title}</h1>
		<div class="content">
			{data.content}
		</div>
	{/if}
</article>

{#if !data.error}
	<hr />
	<h2>Materiales, amigues y eventos relevantes</h2>
	<PostList posts={data.posts} />
{/if}

<style>
	h2 {
		text-align: center;
		width: 100%;
		font-size: var(--step-3);
	}
</style>
