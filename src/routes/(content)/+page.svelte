<script>
	import CardRow from '$lib/components/CardRow.svelte';
	import Carrousel from '$lib/components/Carrousel.svelte';
	import LDTag from '$lib/components/LDTag.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { page } from '$app/state';
	/** @type {{data: any}} */
	let { data } = $props();
	let { allPosts } = data;

	const title = 'KinkyVibe.ar';
	const summary = 'Divulgación disidente, producción de eventos y talleres, gestión comunitaria y editorial. Información y encuentros cuir LGTBQIA+ kinky y de BDSM.';
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
	import kinkyProfilePic from '../logo.png';
	
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
<div class="profile-header h-card p-contact hidden">
	<a rel="me" href="https://web.brid.gy/r/https://kinkyvibe.ar/">fed bridgy</a>
	<a class="u-url u-uid" href="https://kinkyvibe.ar/">https://kinkyvibe.ar/</a>
	<img class="profile-pic u-photo" src={kinkyProfilePic} alt="" />
	<h1 class="profile-name p-name">KinkyVibe</h1>
	<a
		target="_blank"
		class="u-pronouns"
		href={'https://pronombr.es/elles,les,les,unes,elles,les,unos,les,es,co,'}
	>
		elles
	</a>
	<p class="p-note">
		Un proyecto de divulgación y acompañamiento disidente. Contamos con una tienda erótica y de
		cuidados, pro-sexo y kinky y trabajamos priorizando la educación sexual y los cuidados éticos
		comunitarios
	</p>
</div>
<main>
	{#if page.url.searchParams.has('carrousel')}
		<Carrousel
			posts={allPosts.filter(
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
			items={allPosts
				.filter(
					(/** @type {{ meta: AnyPostData; }} */ p) =>
						p.meta.category == 'calendario' && new Date(p.meta.start).getTime() > Date.now()
				)
				.sort((a, b) => (a.meta.start > b.meta.start ? 1 : -1))
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
			items={allPosts
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
			items={allPosts
				.filter((/** @type {{ meta: { category: string; }; }} */ p) => p.meta.category == 'amigues')
				.slice(0, 9)}
			--color-1="var(--2-dark)"
			--color-2="var(--1)"
			href="/amigues"
		/>
	</div>
	<div id="lista"></div>
	<PostList posts={allPosts} />
</main>

<style>
	.hidden {
		display: none !important;
	}
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
