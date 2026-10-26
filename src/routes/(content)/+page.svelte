<script>
	import CardRow from '$lib/components/CardRow.svelte';
	import { parseSiteDate } from '$lib/utils/dates.js';
	import Carrousel from '$lib/components/Carrousel.svelte';
	import LDTag from '$lib/components/LDTag.svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import { linkPreviewOf } from '$lib/utils/seo.js';
	import PostList from '$lib/components/PostList.svelte';
	import { page } from '$app/stores';
	export let data;
	import { userConfig } from '$lib/utils/stores';
	import { fetchAllPostsClient } from '$lib/utils/allPosts';
	import { organizationSchema, websiteSchema } from '$lib/utils/jsonLd.js';
	// the server only sends upcoming events; load the rest if past events are shown
	let allPosts = data.posts;
	let loadedPast = false;
	$: if ($userConfig.show_past_events && !loadedPast) {
		loadedPast = true;
		fetchAllPostsClient()
			.then((posts) => (allPosts = posts))
			.catch(() => (loadedPast = false));
	}

	// Los textos de la vista previa (los del panel; docs/compartir.md).
	$: previewTexts = linkPreviewOf($page.data).texts;
	// La organización (schema.org, jsonLd.js): nombre, logo, contacto público y redes oficiales; y
	// el sitio (WebSite), con el nombre que muestran los buscadores.
	const organizationLd = /** @type {any} */ (organizationSchema());
	const websiteLd = /** @type {any} */ (websiteSchema());
	import kinkyProfilePic from '../logo.png';
</script>

<svelte:head>
	<title>{previewTexts['home.title']}</title>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />
</svelte:head>
<!-- La vista previa al compartir (docs/compartir.md): la tarjeta por defecto y los textos del panel
     (`home.title`, `home.description`: por defecto «Kinky Vibe» y la frase oficial del sitio). -->
<SeoHead
	title={previewTexts['home.title']}
	description={previewTexts['home.description']}
	canonical="/"
/>

<LDTag schema={websiteLd} />
<LDTag schema={organizationLd} />
<div class="profile-header h-card p-contact hidden">
	<a rel="me" href="https://web.brid.gy/r/https://kinkyvibe.ar/">fed bridgy</a>
	<a class="u-url u-uid" href="https://kinkyvibe.ar/">https://kinkyvibe.ar/</a>
	<img class="profile-pic u-photo" src={kinkyProfilePic} alt="" />
	<p class="profile-name p-name">Kinky Vibe</p>
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
	<!-- El logo del encabezado es la presentación (decisión de gorrite, 5/10): el h1 queda solo
	     para lectores de pantalla y buscadores. -->
	<h1 class="visually-hidden">Kinky Vibe</h1>
	{#if $page.url.searchParams.has('carrousel')}
		<Carrousel
			posts={allPosts.filter(
				(/** @type {{ meta: AnyPostData; }} */ p) =>
					p.meta.category == 'calendario' && parseSiteDate(p.meta.start).getTime() > Date.now()
			)}
		/>
	{/if}
	<div class="cardrow">
		<CardRow
			index="0"
			id="calendario"
			title="Talleres y eventos"
			eager={4}
			items={allPosts
				.filter(
					(/** @type {{ meta: AnyPostData; }} */ p) =>
						p.meta.category == 'calendario' && parseSiteDate(p.meta.start).getTime() > Date.now()
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
	<!-- el feed largo de a 20: así el pie de página queda a mano -->
	<PostList heading="Lo último publicado" posts={allPosts} limit={20} />
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
		gap: var(--space-xl);
		padding-top: var(--space-s);
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
