<script>
	import { aliaserFactory } from '$lib/utils/index.js';
	import PostList from '$lib/components/PostList.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import { tagsConfig, currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	export let data;
	import { onMount } from 'svelte';
	currentPostData.set({ category: data.category, path: $page.url.pathname });
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

<article>
	{#if data.layout == 'amigues'}
		<div class="profile-header">
			<img src={data.featured + ''} class="profile-pic" alt="" />
			<h1 id="title" class="profile-name">{data.title}</h1>
		</div>
	{:else}
		<h1 id="title">{data.title}</h1>
	{/if}
	{#if data.authors && (data.layout != 'amigues' || data.authors.length > 1)}
		<address>
			{#await data.authorsData}
				{data.authors.length > 1
					? data.authors.slice(0, data.authors.length - 1).join(', ') +
					  ' & ' +
					  data.authors[data.authors.length - 1]
					: data.authors}
			{:then authorsData}
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
				<time datetime={data.layout == 'calendario' ? data.start : data.published_date?.toString()}
					>{new Date(
						data.layout == 'calendario' ? data.start : data.published_date?.toString() ?? ''
					).toLocaleDateString('es-AR', { dateStyle: 'long' })}</time
				>
			{/if}
		</address>
	{/if}
	{#if data?.tags}
		<div id="tags">
			<Tags tags={data.tags} />
		</div>
	{/if}
	{#if !data.error}
		{#if data.summary}
			<div class="content">
				<p>
					{data.summary}
				</p>
			</div>
		{/if}

		{#if data.original_published_date}
			<div id="via">
				Fecha de publicación original: {new Date(
					data.layout == 'calendario' ? data.start : data.original_published_date?.toString() ?? ''
				).toLocaleDateString('es-AR', { dateStyle: 'long' })} <br />
				Link: <a href={data.link}>{data.link}</a>
			</div>
		{/if}
		<!-- <p>Published: {new Date(data.date)}</p> -->
		<div class="content">
			<svelte:component this={data.content} />
		</div>

		{#if data.layout == 'amigues'}
			<a href={data.link} class="cta">{data.link_text ?? "Ir a su página"}</a>
		{:else if data.layout == 'calendario' && data.link && data.link_text}
			<a href={data.link} class="cta">{data.link_text}</a>
		{/if}

		{#if data.tags?.includes('KinkyVibe')}
			<div id="cafecito">
				Este material fue proporcionado por <a href="/nosotres">nosotres</a> ✨. Si te resultó
				valioso,
				<a href="https://cafecito.app/kinkyvibe" target="_blank">considerá apoyarnos con algún cafecito</a>. 🤗
			</div>
		{/if}
	{:else}
		<div class="content">
			{data.content}
		</div>
	{/if}
</article>

<hr />

{#if data.layout != 'amigues' || data.authors.length > 1}
	{#await data.authorsData then authorsData}
		{#if JSON.stringify(authorsData) != '[]' && authorsData != undefined && authorsData[0] != undefined}
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
		<h3>
			Más cosas de
			{data.authors.length > 1
				? data.authors.slice(0, -1).join(', ') + ' o ' + data.authors[data.authors.length - 1]
				: data.authors[0]}
		</h3>
	</div>
	<PostList {posts} />
{/if}

<style>
	address {
		text-align: center;
	}
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
	}
	#via a {
		--color: var(--4-light);
	}
	#cafecito {
		margin-top: 1em;
		font-size: var(--step-1);
		background: var(--2-light);
	}
	#cafecito a {
		--color: var(--4-light);
	}
	#tags {
		margin-inline: auto;
		max-width: 70rem;
		width: 100%;
		margin-top: 2em;
		justify-content: center;
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
		line-height: 0.5;
	}
	h3,
	hr {
		max-width: 50rem;
		margin: 2rem auto;
	}
	hr {
		margin-block: 3rem;
	}

	.profile-header {
		display: grid;
		grid-template-columns: 4em 1fr;
		gap: 1em;
		align-items: center;
		font-size: var(--step-3);
		justify-content: center;
		justify-items: start;
		width: max-content;
		margin-inline: auto;
		max-width: 100%;
	}
	.profile-pic {
		display: block;
		border-radius: 9999em;
		object-fit: contain;
		object-position: right;
		max-height: 4em;
		width: auto;
		justify-self: right;
		aspect-ratio: 1;
		translate: 0 -0.2em;
	}
	.profile-name {
		justify-self: left;
		text-align: left;
		max-width: 100%;
	}
	.cta {
		background: var(--1);
		padding: 0.5em 1em;
		color: white;
		font-weight: bold;
		border-radius: 0.3em;
		margin-inline: auto;
		display: block;
		width: max-content;
		text-align: center;
		/* translate: 6em; */
		font-size: var(--step-3);
		text-decoration: none;
		margin-block: 2em;
		transition: 200ms;
		box-shadow: 0 0 0 0;
	}
	.cta:hover {
		scale: 1.1;
		/* filter: brightness(1.05); */
		box-shadow: 0.6em 0.6em 1em rgba(0, 0, 0, 0.1);
	}
	@media (max-width: 630px) {
		.profile-header {
			grid-auto-flow: row;
		}
	}
</style>
