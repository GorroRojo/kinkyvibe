<script>
	import LDTag from '$lib/components/LDTag.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import ProfileHead from '$lib/components/amigues/ProfileHead.svelte';
	import ProfileHeader from '$lib/components/amigues/ProfileHeader.svelte';
	import RelatedPosts from '$lib/components/amigues/RelatedPosts.svelte';
	import DbProfile from '$lib/components/amigues/DbProfile.svelte';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { addMentionPronouns } from '$lib/utils/mentions';
	/** @type {any} */
	export let data;
	/** @type {any} */
	export let form;
	currentPostData.set({
		category: data.mode === 'db' ? 'amigues' : data.meta.category,
		path: $page.url.pathname
	});
	/**@type {(s:string|number|Date)=>(string)}*/
	let toISO = (s) => {
		try {
			return new Date(s).toISOString();
		} catch (e) {
			return s + '';
		}
	};
	$: ld = data.mode === 'db' ? data.profile : null;
	$: meta = data.mode === 'db' ? null : data.meta;
</script>

<LDTag
	schema={{
		'@context': 'https://schema.org',
		'@type': 'NewsArticle',
		headline: ld ? ld.title : meta.title,
		image: [(ld ? ld.image : meta.featured) + ''],
		datePublished: toISO((ld ? ld.publishedDate : meta.published_date) ?? ''),
		dateModified: toISO(
			(ld ? (ld.updatedDate ?? ld.publishedDate) : (meta.updated_date ?? meta.published_date)) ?? ''
		),
		author: (ld ? ld.authors : meta.authors)?.map((/** @type {string} */ a) => ({
			'@type': 'Person',
			name: a,
			url: 'https://kinkyvibe.ar/' + a
		}))
	}}
/>
{#if data.mode === 'db'}
	<a href={$page.url.href} hidden aria-hidden="true" class="u-url">Link</a>
	<DbProfile {data} claimResult={form?.claim} url={$page.url.href} />
{:else}
	<ProfileHead
		title={meta.title}
		pronoun={meta.pronoun}
		summary={meta.summary}
		image={meta.featured + ''}
		url={$page.url.href}
		published={meta.published_date}
		modified={meta.updated_date}
		authors={meta.authors ?? []}
		tags={meta.tags ?? []}
	/>
	<a href={$page.url.href} hidden aria-hidden="true" class="u-url">Link</a>
	<article class="h-entry h-resume">
		<ProfileHeader title={meta.title} image={meta.featured + ''} pronoun={meta.pronoun} />
		{#if meta.authors && (meta.authors.length > 1 || (meta.authors.length == 1 && meta.authors[0] !== meta.postID))}
			{@const authors = meta.authors}
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
			</address>
		{/if}
		{#if meta.tags}
			<div id="tags">
				<Tags tags={meta.tags} />
			</div>
		{/if}
		{#if meta.summary}
			<div class="content">
				<p class="p-summary">
					{meta.summary}
				</p>
			</div>
		{/if}
		<div class="content" use:addMentionPronouns={(name) => data.pronouns[name]}>
			<svelte:component this={data.content} />
			{#if meta.link}
				<a href={meta.link} target="_blank" class="cta">{meta.link_text ?? 'Ir a su página'}</a>
			{/if}
		</div>
	</article>

	<RelatedPosts {meta} relatedPosts={data.relatedPosts} relatedPastCount={data.relatedPastCount} />
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
