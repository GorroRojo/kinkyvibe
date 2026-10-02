<script>
	import { userConfig } from '$lib/utils/stores.js';
	import { fetchAllPostsClient, relatedPostsFor } from '$lib/utils/allPosts';
	import { addMentionPronouns } from '$lib/utils/mentions';
	import LDTag from '$lib/components/LDTag.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import AuthorCallout from '$lib/components/AuthorCallout.svelte';
	import PersonasConRol from '$lib/components/PersonasConRol.svelte';
	import Note from '$lib/components/Note.svelte';
	import PostSupport from '$lib/components/propinas/PostSupport.svelte';
	import { isKinkyVibePost } from '$lib/utils/propinas.js';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { TIMEZONE } from '$lib/utils/dates.js';
	export let data;
	// Los estilos propios del texto de la base (ya limitados al texto con @scope en el servidor).
	// La etiqueta se arma por partes para que el preprocesador de Svelte no la tome como el
	// bloque de estilos del componente.
	const STYLE_TAG = 'style';
	$: ownStyle = data.css ? `<${STYLE_TAG}>${data.css}</${STYLE_TAG}>` : '';
	currentPostData.set({ category: data.meta.category, path: $page.url.pathname });
	/**@type {(s:string|number|Date)=>(string)}*/
	let toISO = (s) => {
		try {
			return new Date(s).toISOString();
		} catch (e) {
			return s + '';
		}
	};
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

<LDTag
	schema={{
		'@context': 'https://schema.org',
		'@type': 'NewsArticle',
		headline: data.meta.title,
		image: [data.meta.featured + ''],
		datePublished: toISO(data.meta.published_date ?? ''),
		dateModified: toISO(data.meta.updated_date ?? data.meta.published_date ?? ''),
		author: data.meta.authors?.map((a) => ({
			'@type': 'Person',
			name: a,
			url: 'https://kinkyvibe.ar/' + a
		}))
	}}
/>
<svelte:head>
	<title>{data.meta.title} - KinkyVibe.ar</title>
	<link rel="icon" href="/favicon-32x32.png" />
	<meta name="theme-color" content="hsl(319, 90%, 60%)" />

	<meta property="og:url" content={$page.url.href} />

	<meta property="og:title" content={data.meta.title} />
	<meta name="twitter:title" content={data.meta.title} />

	<meta name="description" content={data.meta.summary} />
	<meta name="twitter:description" content={data.meta.summary} />
	<meta property="og:description" content={data.meta.summary} />

	<meta property="og:image" content={data.meta.featured + ''} />
	<meta name="twitter:image" content={data.meta.featured + ''} />

	<meta name="twitter:site" content="@kinkyvibearg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="og:type" content="article" />

	<meta property="article:published_time" content={data.meta.published_date?.toString()} />
	<meta property="article:modified_time" content={data.meta.updated_date?.toString()} />
	<meta property="article:author" content={data.meta.authors?.join(', ')} />
	<!-- <meta property="article:section" content="" /> -->
	<meta property="article:tag" content={data.meta.tags?.join(', ')} />
</svelte:head>
<article class="h-entry">
	<a href={$page.url.href} hidden aria-hidden="true" class="u-url">Link</a>
	<h1 id="title p-name">{data.meta.title}</h1>
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
			<time datetime={data.meta.published_date?.toString()} class="dt-published">
				{new Date(data.meta.published_date?.toString() ?? '').toLocaleDateString('es-AR', {
					dateStyle: 'long',
					timeZone: TIMEZONE
				})}
			</time>
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
				{new Date(data.meta.original_published_date?.toString() ?? '').toLocaleDateString('es-AR', {
					dateStyle: 'long',
					timeZone: TIMEZONE
				})}
			</span><br />
			{#if data.meta.link}
				<a href={data.meta.link} target="_blank" class="u-url">Link al original</a>
			{/if}
		</Note>
	{/if}
	<div class="content" use:addMentionPronouns={(name) => data.pronouns[name]}>
		{#if data.html !== undefined}
			<!-- Texto de la base, armado en el servidor (src/lib/server/contenido/render.js): HTML libre
			     de une superadmin, con sus estilos solo adentro, o la lista corta de HTML. -->
			<div class="kv-texto-libre">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html ownStyle}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html data.html}
			</div>
		{:else}
			<svelte:component this={data.content} />
		{/if}
	</div>
	{#if isKinkyVibePost(data.meta)}
		<PostSupport propinas={data.propinas} category="material" slug={$page.params.post ?? ''} />
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
		<h3>
			Más cosas de
			{data.meta.authors.length == 1
				? data.meta.authors[0]
				: [data.meta.authors.slice(0, -1).join(', '), data.meta.authors.slice(-1)[0]].join(' o ')}
		</h3>
	</div>
	<PostList posts={relatedPosts} />
{/if}

<style lang="scss">
	#tags {
		margin-inline: auto;
		max-width: 70rem;
		width: 100%;
		margin-top: 2em;
		justify-content: center;
	}
</style>
