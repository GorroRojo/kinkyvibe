<script>
	import { userConfig } from '$lib/utils/stores.js';
	import { fetchAllPostsClient, relatedPostsFor } from '$lib/utils/allPosts';
	import { addMentionPronouns } from '$lib/utils/mentions';
	import LDTag from '$lib/components/LDTag.svelte';
	import { materialSchema } from '$lib/utils/jsonLd.js';
	import Tags from '$lib/components/Tags.svelte';
	import ContentParts from '$lib/components/ContentParts.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import AuthorCallout from '$lib/components/AuthorCallout.svelte';
	import PersonasConRol from '$lib/components/PersonasConRol.svelte';
	import Note from '$lib/components/Note.svelte';
	import TipBlock from '$lib/components/propinas/TipBlock.svelte';
	import { isKinkyVibePost } from '$lib/utils/propinas.js';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { argDateLong, isoDateTime, isoDay } from '$lib/utils/dates.js';
	import ReadingTime from '$lib/components/ReadingTime.svelte';
	import { readingTimeLabel } from '$lib/utils/readingTime.js';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import { linkPreviewOf, materialDescription } from '$lib/utils/seo.js';
	import { tagManager } from '$lib/utils/stores.js';
	export let data;
	// «X min de lectura» (del texto guardado; '' si es corto): src/lib/utils/readingTime.js.
	$: readingTime = readingTimeLabel(data.readingMinutes);
	// Los estilos propios del texto de la base (ya limitados al texto con @scope en el servidor).
	// La etiqueta se arma por partes para que el preprocesador de Svelte no la tome como el
	// bloque de estilos del componente.
	const STYLE_TAG = 'style';
	$: ownStyle = data.css ? `<${STYLE_TAG}>${data.css}</${STYLE_TAG}>` : '';
	currentPostData.set({ category: data.meta.category, path: $page.url.pathname });
	// the server sends no past events; fetch them when the viewer chooses to see them
	let relatedPosts = data.relatedPosts;
	let loadedPast = false;
	$: if ($userConfig.show_past_events && data.relatedPastCount > 0 && !loadedPast) {
		loadedPast = true;
		fetchAllPostsClient()
			.then((posts) => (relatedPosts = relatedPostsFor(data.meta, posts)))
			.catch(() => (loadedPast = false));
	}
</script>

<!-- Datos estructurados (schema.org): solo lo que la página muestra (jsonLd.js). -->
<LDTag schema={materialSchema(data.meta)} />
<svelte:head>
	<title>{data.meta.title} · Kinky Vibe</title>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />

	<meta property="article:published_time" content={isoDateTime(data.meta.published_date)} />
	{#if data.meta.updated_date}
		<meta property="article:modified_time" content={isoDateTime(data.meta.updated_date)} />
	{/if}
	<meta property="article:author" content={data.meta.authors?.join(', ')} />
	<!-- <meta property="article:section" content="" /> -->
	<meta property="article:tag" content={data.meta.tags?.join(', ')} />
</svelte:head>
<!-- La vista previa al compartir (docs/compartir.md): «Guía descargable · resumen». -->
<SeoHead
	title={data.meta.title}
	description={materialDescription(data.meta, $tagManager, linkPreviewOf($page.data).texts)}
	image={data.meta.featured}
	imageInfo={data.cover}
	imageAlt={data.meta.title}
	type="article"
	noindex={Boolean(data.meta.force_unlisted || data.meta.force_unpublished)}
/>
<article class="h-entry">
	<a href={$page.url.href} hidden aria-hidden="true" class="u-url">Link</a>
	<h1 id="title" class="p-name">{data.meta.title}</h1>
	{#if data.meta.authors && data.meta.authors.length > 0}
		{@const authors = data.meta.authors}
		<address>
			{#await data.authorsProfiles}
				{authors.slice(0, authors.length - 1).join(', ') + ' & ' + authors[authors.length - 1]}
			{:then authorsProfiles}
				{#each authors as author, i}
					{@const profile = authorsProfiles?.find(
						(/** @type {ProcessedPost} */ a) => a.meta.postID == author
					)}
					{#if i == authors.length - 1 && i > 0}
						&nbsp;&
					{:else if i > 0},
					{/if}
					{#if profile}
						<a rel="author" class="p-author u-url" href={profile.path}>{author}</a>
					{:else}
						<span class="p-author">{author}</span>
					{/if}
				{/each}
			{/await}
			&ThickSpace;-&ThickSpace;
			<time datetime={isoDay(data.meta.published_date)} class="dt-published">
				{argDateLong(data.meta.published_date?.toString())}
			</time>
			{#if readingTime}
				<!-- El «·» va con el texto: en el celu bajan juntos de línea. -->
				<span class="reading-time"
					>·&ThickSpace;<ReadingTime
						minutes={data.readingMinutes}
						words={data.readingWords}
					/></span
				>
			{/if}
		</address>
	{:else if readingTime}
		<address>
			<ReadingTime minutes={data.readingMinutes} words={data.readingWords} />
		</address>
	{/if}
	{#if data.meta.tags}
		<div id="tags">
			<Tags tags={data.meta.tags} />
		</div>
	{/if}
	{#if data.personas}
		<div class="content"><PersonasConRol groups={data.personas} /></div>
	{/if}
	{#if data.meta.summary}
		<div class="content">
			<p class="p-summary">
				{data.meta.summary}
			</p>
		</div>
	{/if}
	{#if data.meta.original_published_date}
		<Note id="via" className="h-cite">
			Fecha de publicación original:
			<span class="dt-published">
				{argDateLong(data.meta.original_published_date?.toString())}
			</span><br />
			{#if data.meta.link}
				<a href={data.meta.link} target="_blank" class="u-url">Link al original</a>
			{/if}
		</Note>
	{/if}
	<div class="content" use:addMentionPronouns={(name) => data.pronouns[name]}>
		<!-- Texto de la base, armado en el servidor (src/lib/server/contenido/render.js): HTML libre
		     de une superadmin, con sus estilos solo adentro, o la lista corta de HTML. -->
		<div class="kv-texto-libre">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html ownStyle}
			{#if data.parts}
				<!-- Con interactivos registrados (decisión 0004): ContentParts. -->
				<ContentParts parts={data.parts} />
			{:else}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html data.html}
			{/if}
		</div>
	</div>
	{#if isKinkyVibePost(data.meta)}
		<TipBlock category="material" slug={$page.params.post ?? ''} />
	{/if}
</article>

<hr />

{#if data.meta.authors.length > 0}
	{#await data.authorsProfiles then authorsData}
		{#each authorsData ?? [] as { path, meta: author }}
			<AuthorCallout
				href={path}
				image={(author.logo ?? author.photo ?? author.featured) + ''}
				title={author.title}
				summary={author.summary}
			/>
		{/each}
	{/await}
{/if}

{#if relatedPosts.length > 0 || data.relatedPastCount > 0}
	<div class="content">
		<h2 class="like-h3">
			Más cosas de
			{data.meta.authors.length == 1
				? data.meta.authors[0]
				: [data.meta.authors.slice(0, -1).join(', '), data.meta.authors.slice(-1)[0]].join(' o ')}
		</h2>
	</div>
	<PostList posts={relatedPosts} />
{/if}

<style lang="scss">
	.reading-time {
		color: var(--muted);
		white-space: nowrap;
	}
	#tags {
		margin-inline: auto;
		max-width: 70rem;
		width: 100%;
		margin-top: 2em;
		justify-content: center;
	}
</style>
