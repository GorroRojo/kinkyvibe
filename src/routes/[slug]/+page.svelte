<script>
	import { aliaserFactory } from '$lib/utils/index.js';
	import PostList from '$lib/components/PostList.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import { tagsConfig, currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	//@ts-nocheck
	export let data;
	import { onMount } from 'svelte';
	currentPostData.set({ category: data.category, path: $page.url.pathname });
</script>

<svelte:head>
	<title>{data.title} - KinkyVibe.ar</title>
	<link rel="icon" href="favicon.png" />

	<meta name="theme-color" content="hsl(319, 90%, 60%)" />

	<meta property="og:title" content={data.title} />
	<meta name="twitter:title" content={data.title} />

	<meta name="description" content={data.summary} />
	<meta name="twitter:description" content={data.summary} />
	<meta property="og:description" content={data.summary} />

	<meta property="og:image" content={data.featured} />
	<meta name="twitter:image" content={data.featured} />

	<meta name="twitter:site" content="@kinkyvibearg" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta property="og:type" content="article" />

	<meta property="article:published_time" content={data.published_date} />
	<meta property="article:modified_time" content={data.updated_date} />
	<meta property="article:author" content={data.authors} />
	<!-- <meta property="article:section" content="" /> -->
	<meta property="article:tag" content={data.tags} />
</svelte:head>

<article>
	<h1>{data.title}</h1>
	{#if data.authors && (data.layout != 'amigues' || data.authors.length > 1)}
		<address>
			{#if data.layout == 'calendario'}Organizado{/if}
			{#if data.layout == 'amigues'}Integrado{/if}
			{#await data.authorsData}
				por {data.authors.length > 1
					? data.authors.slice(0, data.authors.length - 1).join(', ') +
					  ' & ' +
					  data.authors[data.authors.length - 1]
					: data.authors}
			{:then authorsData}
				por
				{#each data.authors as author, i}
					{@const authorData = authorsData.find(
						(/** @type {{ path: any; }} */ a) => a.path == author
					)}
					{#if i == data.authors.length - 1 && i > 0}
						&nbsp;&
					{:else if i > 0}
						,
					{/if}
					{#if authorData}
						<a href={authorData.path}>{author}</a>
					{:else}
						{author}
					{/if}
				{/each}
				<!-- promise was fulfilled -->
			{/await}
			{#if data.layout != 'amigues'}
				&ThickSpace;-&ThickSpace;
				<time datetime={data.layout == 'calendario' ? data.start : data.published_date}
					>{new Date(
						data.layout == 'calendaio' ? data.start : data.published_date
					).toLocaleDateString('es-AR', { dateStyle: 'long' })}</time
				>
			{/if}
		</address>
	{/if}
	{#if data?.tags}
		<div id="tags">
			<Tags tags={data.tags?.map(aliaserFactory($tagsConfig))} />
		</div>
	{/if}

	{#if !data.error}
		<!-- <p>Published: {new Date(data.date)}</p> -->
		<div class="content">
			<svelte:component this={data.content} />
		</div>
	{:else}
		<div class="content">
			{data.content}
		</div>
	{/if}
</article>
{#if data.tags.includes("KinkyVibe")}
<div id="cafecito">
Este material fue proporcionado por <a href="/nosotres">nosotres</a> ✨. Si te resultó valioso, <a href="https://cafecito.app/kinkyvibe">considerá apoyarnos con algún cafecito</a>. 🤗
</div>
{/if}
<hr />

{#if data.layout != 'amigues' || data.authors.length > 1}
	{#await data.authorsData then authorsData}
		{#if JSON.stringify(data.authorsData) != '[]' && data.authorsData != undefined && data.authorsData[0] != undefined}
			{#each authorsData as author}
				<a class="author-callout" href={author.path}>
					<img class="author-image" src={author.logo ?? author.photo} alt="" />
					<span class="author-title">{author.title}</span>
					<span class="author-summary">{author.summary}</span>
				</a>
			{/each}
		{/if}
	{/await}
{/if}
{#if data.posts && data.posts.filter((/** @type {{meta: {title: any; }; }}*/ p) => p.meta.title != data.title).length > 0}
	{@const posts = data.posts.filter(
		(/** @type {{meta: {title: any; }; }}*/ p) => p.meta.title != data.title
	)}
	<div class="content">
		<h3>{data.authors.length > 1 ? 'También escribieron' : 'También escribió'}</h3>
	</div>
	<PostList {posts} />
{/if}

<style>
	#cafecito {
		max-width: 50rem;
		margin-inline: auto;
		width: 100%;
		font-size: var(--step-1);
		padding: 1em;
		background: var(--2-light);
		color: white;
		margin-top: 1em;
		border-radius: 0.3em;
	}
	#cafecito a {
		--color: var(--4-light);
	}
	#tags {
		margin-inline: auto;
		max-width: 50rem;
		width: 100%;
		margin-top: 2em;
	}
	.author-summary {
		text-decoration: none;
		grid-area: summary;
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
		gap: 1rem;
		max-width: 50rem;
		margin: 1em auto;
	}
	.author-callout > * {
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
	}
	h3,
	hr {
		max-width: 50rem;
		margin: 2rem auto;
	}
	hr {
		margin-block: 3rem;
	}
</style>
