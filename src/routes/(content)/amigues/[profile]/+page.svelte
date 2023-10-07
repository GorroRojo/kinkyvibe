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
	<title
		>{data.meta.title} | {data.meta.pronoun.startsWith('https')
			? (data.meta.pronoun + '').split('/').pop()?.split(',')[0].replaceAll('&', '/')
			: data.meta.pronoun}
	</title>
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
<a href={$page.url.href} hidden aria-hidden class="u-url">Link</a>
<article class="h-entry h-resume">
	<div class="profile-header h-card p-contact">
		<img src={data.meta.featured + ''} class="profile-pic u-photo" alt="" />
		<h1 id="title" class="profile-name p-name">
			{data.meta.title}
			{#if data.meta.pronoun}
				{#if (data.meta.pronoun + '').startsWith('https')}
					<a target="_blank" class="u-pronouns" href={data.meta.pronoun + ''}>
						{@html (data.meta.pronoun + '')
							.split('/')
							.pop()
							?.split(',')[0]
							.replaceAll('&', '&nbsp;/&nbsp;')}
					</a>
				{:else}
					<span class="u-pronouns">{data.meta.pronoun}</span>
				{/if}
			{/if}
		</h1>
	</div>
	{#if data.meta.authors && (data.meta.authors.length > 1 || (data.meta.authors.length == 1 && data.meta.authors[0] !== data.meta.postID))}
		{@const authors = data.meta.authors}
		<address>
			{#await data.authorsProfiles}
				{authors.slice(0, authors.length - 1).join(', ') + ' & ' + authors[authors.length - 1]}
			{:then authorsProfiles}
				{#each authors as author, i}
					{@const profile = authorsProfiles.find(
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
	<div class="content" use:processContent>
		<svelte:component this={data.content} />
		<a href={data.meta.link} target="_blank" class="cta">{data.meta.link_text ?? 'Ir a su página'}</a>
	</div>
</article>

{#if data.relatedPosts.length > 0}
	{@const relatedAuthors = [...new Set([data.meta.postID, ...data.meta.authors])]}
	<div class="content">
		<h3>
			Más cosas de
			{relatedAuthors.length == 1
				? relatedAuthors[0]
				: [relatedAuthors.slice(0, -1).join(', '), relatedAuthors.slice(-1)[0]].join(' o ')}
		</h3>
	</div>
	<PostList posts={data.relatedPosts} />
{/if}

<style lang="scss">
	#tags {
		margin-inline: auto;
		max-width: 70rem;
		width: 100%;
		margin-top: 2em;
		justify-content: center;
	}
	.u-pronouns {
		font-size: 0.5em;
		opacity: 0.7;
		text-decoration: none;
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
		object-fit: cover;
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

	@media (max-width: 630px) {
		.profile-header {
			grid-auto-flow: row;
		}
	}
</style>
