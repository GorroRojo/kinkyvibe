<script>
	import CardRow from '$lib/components/CardRow.svelte';
	import Carrousel from '$lib/components/Carrousel.svelte';
	import LDTag from '$lib/components/LDTag.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { page } from '$app/stores';
	export let data;
	let { posts, err } = data;

	const title = 'KinkyVibe.ar';
	const summary = 'Red de información y encuentros BDSM-kinky-queer-lgbt';
	const canonical = 'https://kinkyvibe.ar';
	/**@type {LD.Schema}*/
	const websiteSchema = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		'@id': canonical + '#organization',
		url: canonical,
		name: title,
		description: summary,
		sameAs: ['https://twitter.com/kinkyvibearg'],
		logo: 'https://KinkyVibe.ar/favicon-32x32.png'
	};
</script>

<svelte:head>
	<title>KinkyVibe.ar</title>
	<link rel="icon" href="/favicon-32x32.png" />
	<link rel="canonical" href={canonical} />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />

	<meta property="og:url" content="/" />

	<meta property="og:title" content={title} />
	<meta name="twitter:title" content={title} />

	<meta name="description" content={summary} />
	<meta name="twitter:description" content={summary} />
	<meta property="og:description" content={summary} />

	<!-- <meta property="og:image" content={data.featured + ''} /> -->
	<!-- <meta name="twitter:image" content={data.featured + ''} /> -->

	<!-- <meta name="twitter:site" content="@kinkyvibearg" /> -->
	<!-- <meta name="twitter:card" content="summary_large_image" /> -->
	<!-- <meta property="og:type" content="article" /> -->

	<!-- <meta property="article:published_time" content={data.published_date?.toString()} /> -->
	<!-- <meta property="article:modified_time" content={data.updated_date?.toString()} /> -->
	<!-- <meta property="article:author" content={data.authors?.join(', ')} /> -->
	<!-- <meta property="article:section" content="" /> -->
	<!-- <meta property="article:tag" content={data.tags?.join(', ')} /> -->
</svelte:head>

<LDTag schema={websiteSchema} />

<main>
	{#if !err}
		{#if $page.url.searchParams.has('carrousel')}
			<Carrousel
				posts={posts.filter(
					(/** @type {{ meta: AnyPostData; }} */ p) =>
						p.meta.category == 'calendario' && new Date(p.meta.start).getTime() > Date.now()
				)}
			/>
		{/if}
		<div class="cardrow">
			<CardRow
				index="0"
				id="calendario"
				title="Talleres y eventos"
				items={posts
					.filter(
						(/** @type {{ meta: AnyPostData; }} */ p) =>
							p.meta.category == 'calendario' && new Date(p.meta.start).getTime() > Date.now()
					)
					.slice(0, 9)}
				--color-1="var(--2-dark)"
				--color-2="var(--1)"
				href="/calendario"
			/>
		</div>
		<div class="cardrow">
			<CardRow
				index="0"
				id="informacion"
				title="Artículos, links y descargables"
				items={posts
					.filter(
						(/** @type {{ meta: { category: string; }; }} */ p) => p.meta.category == 'material'
					)
					.slice(0, 9)}
				--color-1="var(--1)"
				--color-2="var(--2-dark)"
				href="/material"
			/>
		</div>
		<div class="cardrow">
			<CardRow
				index="1"
				id="amigues"
				title="Profesionales y emprendimientos"
				items={posts
					.filter(
						(/** @type {{ meta: { category: string; }; }} */ p) => p.meta.category == 'amigues'
					)
					.slice(0, 9)}
				--color-1="var(--2-dark)"
				--color-2="var(--1)"
				href="/amigues"
			/>
		</div>
		<div id="lista" />
		<PostList {posts} />
	{:else}
		posts: {JSON.stringify(posts)}
		err: {JSON.stringify(err)}
	{/if}
</main>

<style>
	#lista {
		display: none;
	}
	main {
		/* width: 100%; */
		/* max-width: 50rem; */
		margin: auto;
		display: grid;
		gap: 3rem;
		padding-top: 3rem;
	}
	.cardrow {
		width: 100%;
		max-width: 50rem;
		margin-inline: auto;
	}
	main > * {
		min-width: 0;
		min-height: 0;
	}
</style>
