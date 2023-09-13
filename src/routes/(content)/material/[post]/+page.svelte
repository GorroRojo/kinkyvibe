<script>
	import LDTag from '$lib/components/LDTag.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { processContent } from '$lib/utils';
	export let data;
	currentPostData.set({ category: data.meta.category, path: $page.url.pathname });
	/**@type {(s:string|number|Date)=>(string)}*/
	let toISO = (s) => {
		try {
			return new Date(s).toISOString();
		} catch (e) {
			return s + '';
		}
	};
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
	<a href={$page.url.href} hidden aria-hidden class="u-url">Link</a>
	<h1 id="title p-name">{data.meta.title}</h1>
	{#if data.meta.authors && data.meta.authors.length > 0}
		{@const authors = data.meta.authors}
		<address>
			{#await data.authorsProfiles}
				{authors.slice(0, authors.length - 1).join(', ') + ' & ' + authors[authors.length - 1]}
			{:then authorsProfiles}
				{#each authors as author, i}
					{@const profile = authorsProfiles.find(
						(/** @type {ProcessedPost} */ a) => (a.path + '').split('/').pop() == author
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
					dateStyle: 'long'
				})}
			</time>
		</address>
	{/if}
	{#if data.meta.tags}
		<div id="tags">
			<Tags tags={data.meta.tags} />
		</div>
	{/if}
	{#if data.meta.summary}
		<div class="content">
			<p class="p-summary">
				{data.meta.summary}
			</p>
		</div>
	{/if}
	{#if data.meta.original_published_date}
		<div id="via" class="h-cite">
			Fecha de publicación original:
			<span class="dt-published">
				{new Date(data.meta.original_published_date?.toString() ?? '').toLocaleDateString('es-AR', {
					dateStyle: 'long'
				})}
			</span><br />
			Link: <a href={data.meta.link} class="u-url">{data.meta.link}</a>
		</div>
	{/if}
	<div class="content" use:processContent>
		<svelte:component this={data.content} />
	</div>
	{#if data.meta.tags?.includes('KinkyVibe')}
		<div id="cafecito">
			Este material fue proporcionado por <a rel="author" href="/amigues/nosotres">nosotres</a> ✨. Si te
			resultó valioso,
			<a href="https://cafecito.app/kinkyvibe" target="_blank"
				>considerá apoyarnos con algún cafecito</a
			>. 🤗
		</div>
	{/if}
</article>

<hr />

{#if data.meta.authors.length > 0}
	{#await data.authorsProfiles then authorsData}
		{#each authorsData as { path, meta: author }}
			<a class="author-callout" rel="author" href={path}>
				<img
					class="author-image"
					src={(author.logo ?? author.photo ?? author.featured) + ''}
					alt=""
				/>
				<span class="author-title">{author.title}</span>
				<span class="author-summary">{author.summary}</span>
			</a>
		{/each}
	{/await}
{/if}

{#if data.relatedPosts.length > 0}
	<div class="content">
		<h3>
			Más cosas de
			{data.meta.authors.length == 1
				? data.meta.authors[0]
				: [data.meta.authors.slice(0, -1).join(', '), data.meta.authors.slice(-1)[0]].join(' o ')}
		</h3>
	</div>
	<PostList posts={data.relatedPosts} />
{/if}

<style lang="scss">
	#cafecito,
	#via {
		max-width: 50rem;
		margin: 2em auto;
		width: 100%;
		padding: 1em;
		color: white;
		border-radius: 0.3em;
	}
	#via {
		background: var(--2-light);
		font-size: var(--step-0);
		a {
			--color: var(--4-light);
		}
	}
	#cafecito {
		margin-top: 1em;
		font-size: var(--step-1);
		background: var(--2-light);
		a {
			--color: var(--4-light);
		}
	}
	#tags {
		margin-inline: auto;
		max-width: 70rem;
		width: 100%;
		margin-top: 2em;
		justify-content: center;
	}
	.author-callout {
		text-decoration: none;
		font-style: italic;
		font-size: 1.5em;
		padding: 0.4rem;
		border-radius: 999em;
		background: color-mix(in srgb, var(--2) 10%, transparent);
		outline: 2px solid var(--2);
		color: var(--2);
		display: grid;
		grid-template-areas: 'img title' 'img summary';
		grid-template-columns: 7rem 1fr;
		align-items: center;
		gap: 0.6rem;
		max-width: 50rem;
		margin: 1em auto;
		& > * {
			min-height: 0;
			min-width: 0;
		}
		.author-image {
			/* height: 1.5em; */
			border-radius: 999em;
			/* display: inline-block; */
			grid-area: img;
			max-height: 100%;
			max-width: 100%;
		}
		.author-title {
			grid-area: title;
			font-size: 1.5em;
			text-decoration: underline var(--1);
			color: black;
			line-height: 1;
		}
		.author-summary {
			padding-right: 1em;
		}
	}

	@media (max-width: 500px) {
		.author-callout {
			grid-template-areas: 'img title' 'summary summary';
			border-radius: 2.6em;
			.author-image {
				z-index: 1;
			}
			.author-title {
				padding-right: 0.5em;
			}
			.author-summary {
				padding: 2em;
				padding-top: 0;
			}
		}
	}
</style>
