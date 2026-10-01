<script>
	/**
	 * La página de un perfil guardado en la base (interruptor `perfiles_publicos`): persona, grupo
	 * o lugar. Todo lo que llega ya pasó por las reglas del servidor (src/lib/server/amigues/):
	 * lista blanca de campos, HTML del texto ya limpio, integrantes visibles, privacidad del lugar.
	 * Props: `data` (lo que arma `profilePageData`), `claimResult` (la respuesta de "Es mi perfil").
	 */
	import ProfileTags from '$lib/components/amigues/ProfileTags.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { addMentionPronouns } from '$lib/utils/mentions';
	import ProfileHead from './ProfileHead.svelte';
	import ProfileHeader from './ProfileHeader.svelte';
	import RelatedPosts from './RelatedPosts.svelte';
	import VenueLocation from './VenueLocation.svelte';
	import ClaimProfile from './ClaimProfile.svelte';

	/** @type {any} */
	export let data;
	/** @type {{ ok: boolean, message: string } | null | undefined} */
	export let claimResult = null;
	/** URL absoluta de la página (para compartir). */
	export let url = '';

	$: p = data.profile;
	$: showAuthors =
		p.authors.length > 1 ||
		(p.authors.length === 1 && p.authors[0].replaceAll(' ', '-') !== p.slug);
	/** @type {Record<string, string>} */
	const KIND_LABELS = { persona: 'Persona', grupo: 'Grupo', lugar: 'Lugar' };
</script>

<ProfileHead
	title={p.title}
	pronoun={p.pronoun}
	summary={p.bio}
	image={p.image}
	{url}
	published={p.publishedDate}
	modified={p.updatedDate ?? p.publishedDate}
	authors={p.authors}
	tags={p.tags}
	canonical={data.canonical}
/>

<article class="h-entry h-resume" data-kind={p.kind}>
	{#if data.badges.hidden || data.badges.pending || data.badges.membersOnly}
		<p class="badges">
			{#if data.badges.hidden}<span>Oculto: lo ven solo les admins</span>{/if}
			{#if data.badges.pending}<span
					>Todavía no aparece en Amigues: lo tiene que aprobar une admin. Lo ves porque lo gestionás
					o sos admin.</span
				>{/if}
			{#if data.badges.membersOnly}<span>Solo para personas con cuenta</span>{/if}
		</p>
	{/if}
	<ProfileHeader title={p.title} image={p.image} pronoun={p.pronoun} />
	<p class="kind">{KIND_LABELS[p.kind] ?? ''}</p>
	{#if showAuthors}
		<address>
			{#each data.authors as author, i (i)}
				{#if i == data.authors.length - 1 && i > 0}
					&nbsp;&
				{:else if i > 0},
				{/if}
				{#if author.href}
					<a rel="author" class="p-author u-url" href={author.href}>{author.name}</a>
				{:else}
					<span class="p-author">{author.name}</span>
				{/if}
			{/each}
		</address>
	{/if}
	{#if p.tags.length}
		<ProfileTags tags={p.tags} />
	{/if}
	{#if p.bio}
		<div class="content">
			<p class="p-summary">{p.bio}</p>
		</div>
	{/if}
	{#if data.location}
		<VenueLocation view={data.location} context="venue" />
	{/if}
	<div class="content" use:addMentionPronouns={(name) => data.pronouns[name]}>
		<!-- HTML limpiado en el servidor (src/lib/server/amigues/sanitize.js). -->
		{@html data.bodyHtml}
		{#if p.links[0]}
			<a href={p.links[0]} target="_blank" rel="noopener noreferrer" class="cta"
				>{p.linkText ?? 'Ir a su página'}</a
			>
		{/if}
	</div>
	{#if data.members}
		<section class="content members">
			<h3>Integrantes</h3>
			{#if data.members.length}
				<ul>
					{#each data.members as m (m.slug)}
						<li><a href="/amigues/{m.slug}">{m.title}</a></li>
					{/each}
				</ul>
			{:else}
				<p>Todavía no hay integrantes para mostrar.</p>
			{/if}
		</section>
	{/if}
</article>

{#if data.claim}
	<ClaimProfile state={data.claim.state} result={claimResult} />
{/if}

{#if data.location && data.venueEvents.length}
	<div class="content"><h3>Eventos en {p.title}</h3></div>
	<PostList posts={data.venueEvents} />
{/if}

<RelatedPosts
	meta={{ category: 'amigues', postID: p.slug, title: p.title, authors: p.authors }}
	relatedPosts={data.relatedPosts}
	relatedPastCount={data.relatedPastCount}
/>

<style lang="scss">
	.kind {
		text-align: center;
		font-size: var(--step--1);
		opacity: 0.7;
		margin: 0.3em 0 0;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		justify-content: center;
		padding-inline: 16px;
		span {
			font-size: var(--step--1);
			padding: 0.3em 0.8em;
			border-radius: 0.6em;
			background: color-mix(in srgb, gold 30%, transparent);
		}
	}
	.members ul {
		columns: 2 12em;
	}
</style>
