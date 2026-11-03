<script>
	/**
	 * La página de un perfil guardado en la base: persona, proyecto
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
	import { KIND_LABELS, contactItems } from '$lib/utils/perfiles.js';
	import { absoluteUrl } from '$lib/utils/jsonLd.js';

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
	// El primer link ya va como botón.
	$: contact = contactItems(p, { skipFirstLink: true });
	// Para la h-card: todo el contacto público, con el primer link (el botón).
	$: hcardContact = contactItems(p);
</script>

<!-- «No aparecer en buscadores» (data.noindex): `noindex` y una vista previa reducida, sin la foto
     ni la presentación (la tarjeta del sitio y «<nombre> en Amigues de Kinky Vibe»). La página de
     abajo no cambia. -->
<ProfileHead
	title={p.title}
	pronoun={p.pronoun}
	summary={data.noindex ? null : p.bio}
	image={data.noindex ? null : p.image}
	{url}
	canonical={data.canonical}
	noindex={Boolean(data.unlisted || data.noindex)}
/>

<article class="h-entry h-resume" data-kind={p.kind}>
	{#if data.badges.hidden || data.badges.pending || data.badges.membersOnly || data.badges.noindex}
		<p class="badges">
			{#if data.badges.hidden}<span>Oculto: lo ven solo les admins</span>{/if}
			{#if data.badges.pending}<span
					>Todavía no aparece en Amigues: lo tiene que aprobar une admin. Lo ves porque lo gestionás
					o sos admin.</span
				>{/if}
			{#if data.badges.membersOnly}<span>Solo para personas con cuenta</span>{/if}
			{#if data.badges.noindex}<span
					>No aparece en buscadores: se ve en el sitio, pero les pedimos a Google y compañía que no
					lo muestren. Lo ves porque lo gestionás o sos admin.</span
				>{/if}
		</p>
	{/if}
	<ProfileHeader title={p.title} image={p.image} pronoun={p.pronoun}>
		<!-- Microformats (h-card): la dirección, la bio y el contacto público que la página ya
		     muestra más abajo, dentro de la tarjeta para que los lectores de h-card los encuentren. -->
		<data hidden class="u-url u-uid" value={absoluteUrl(data.canonical) ?? data.canonical}></data>
		{#if p.bio}<data hidden class="p-note" value={p.bio}></data>{/if}
		{#each hcardContact as c (c.href)}
			<data
				hidden
				class={c.kind === 'email' ? 'u-email' : c.kind === 'tel' ? 'p-tel' : 'u-url'}
				value={c.kind === 'tel' ? c.href.slice('tel:'.length) : c.href}
			></data>
		{/each}
	</ProfileHeader>
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
		<ProfileTags tags={p.tags} wikiTags={data.wikiTags ?? []} />
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
			<a href={p.links[0]} target="_blank" rel="nofollow ugc noopener noreferrer" class="cta"
				>{p.linkText ?? 'Ir a su página'}</a
			>
		{/if}
	</div>
	{#if contact.length}
		<section class="content contact">
			<h2 class="like-h3">Contacto</h2>
			<ul>
				{#each contact as c (c.href)}
					<li>
						{#if c.kind === 'link'}
							<a class="u-url" href={c.href} target="_blank" rel="nofollow ugc noopener noreferrer"
								>{c.label}</a
							>
						{:else if c.kind === 'email'}
							<a class="u-email" href={c.href}>{c.label}</a>
						{:else}
							<a class="p-tel" href={c.href}>{c.label}</a>
						{/if}
					</li>
				{/each}
			</ul>
			<!-- La misma información como tarjeta de contacto (contacto.vcf/+server.js). -->
			<p class="vcard">
				<a href="{data.canonical}/contacto.vcf" download>Guardar en tus contactos</a>
			</p>
		</section>
	{/if}
	{#if data.members}
		<section class="content members">
			<h2 class="like-h3">Integrantes</h2>
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
	<div class="content"><h2 class="like-h3">Eventos en {p.title}</h2></div>
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
		padding-inline: var(--space-xs);
		span {
			font-size: var(--step--1);
			padding: 0.3em 0.8em;
			border-radius: var(--radius-s);
			background: color-mix(in srgb, gold 30%, transparent);
		}
	}
	.members ul {
		columns: 2 12em;
	}
	.contact a {
		overflow-wrap: anywhere;
	}
	.vcard {
		font-size: var(--step--1);
	}
</style>
