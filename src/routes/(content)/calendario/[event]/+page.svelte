<script>
	import { userConfig } from '$lib/utils/stores.js';
	import { relatedPostsFor } from '$lib/utils';
	import { fetchAllPostsClient } from '$lib/utils/allPosts';
	import LDTag from '$lib/components/LDTag.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import AuthorCallout from '$lib/components/AuthorCallout.svelte';
	import PostSupport from '$lib/components/propinas/PostSupport.svelte';
	import { isKinkyVibePost } from '$lib/utils/propinas.js';
	import { onMount } from 'svelte';
	import { formatARS } from '$lib/utils/money.js';
	import { doorText, leftText, saleWindowText } from '$lib/utils/tickets.js';
	import { format } from 'date-fns';
	import { toArgentina, TIMEZONE, eventEnd } from '$lib/utils/dates.js';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { processContent } from '$lib/utils';
	import ShareEventButton from '$lib/components/ShareEventButton.svelte';
	import EventSeries from '$lib/components/series/EventSeries.svelte';
	import VenueLocation from '$lib/components/amigues/VenueLocation.svelte';
	import { venueLine, venueSchema } from '$lib/utils/venues.js';
	export let data;
	// "Sucede en" (interruptor `perfiles_publicos`): si el evento tiene lugar, su privacidad manda
	// sobre `location` del .md (docs/amigues.md).
	$: where = data.venue ? venueLine(data.venue) : (data.meta.location ?? 'Online');
	currentPostData.set({ category: data.meta.category, path: $page.url.pathname });
	$: end = eventEnd(data.meta.start, data.meta.end);
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
	// loaded after hydration so the calendar button (~290 KB) doesn't delay the page
	onMount(() => import('add-to-calendar-button'));
</script>

<LDTag
	schema={/**@type LD.Event & {"@context":"https://schema.org"}*/ {
		'@context': 'https://schema.org',
		'@type': 'Event',
		name: data.meta.title,
		startDate: toISO(data.meta.start ?? ''),
		endDate: toISO(end),
		eventAttendanceMode: data.meta.location
			? 'https://schema.org/OnlineEventAttendanceMode'
			: 'https://schema.org/OfflineEventAttendanceMode',
		eventStatus:
			data.meta.status == 'cancelado'
				? 'https://schema.org/EventCancelled'
				: 'https://schema.org/EventScheduled',
		location: data.venue
			? venueSchema(data.venue)
			: data.meta.location
			? {
					'@type': 'Place',
					name: data.meta.location_name ?? data.meta.title,
					address: { '@type': 'PostalAddress', name: data.meta.location }
			  }
			: { '@type': 'VirtualLocation', url: data.meta.link },
		image: [data.meta.featured + ''],
		description: data.meta.summary,
		organizer: {
			'@type': data.meta.tags?.includes('KinkyVibe') ? 'Organization' : 'Person',
			name: data.meta.tags?.includes('KinkyVibe')
				? 'KinkyVibe'
				: data.meta.authors?.[0] ?? 'KinkyVibe',
			url:
				'https://kinkyvibe.ar/' +
				(data.meta.tags?.includes('KinkyVibe')
					? 'KinkyVibe'
					: data.meta.authors?.[0] ?? 'KinkyVibe')
		}
		//   "offers": {
		//     "@type": "Offer",
		//     "url": "https://www.example.com/event_offer/12345_201803180430",
		//     "price": "30",
		//     "priceCurrency": "USD",
		//     "availability": "https://schema.org/InStock",
		//     "validFrom": "2024-05-21T12:00"
		//   },
		//   "performer": {
		//     "@type": "PerformingGroup",
		//     "name": "Kira and Morrison"
		//   },
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
<a href={$page.url.href} hidden aria-hidden="true" class="u-url">Link</a>
<article class="h-entry h-event">
	<h1 id="title p-name">{data.meta.title}</h1>
	{#if data.series}<EventSeries series={data.series} part="nav" />{/if}
	
	{#if data.meta.authors && (data.meta.authors.length > 1 || (data.meta.authors.length == 1 && data.meta.authors[0] !== data.meta.postID))}
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
		</address>
	{/if}

	{#if data.meta.status == 'cancelado'}
	<h1 id="title p-name"><u>CANCELADO</u></h1>
	{:else}
	<div class="event-header">
		{#if data.meta.featured}<img src={data.meta.featured + ''} alt="poster" />{/if}
		<p class="event-times">
			<small>desde</small><time class="dt-start" datetime={data.meta.start}
				>{new Date(data.meta.start).toLocaleString('es-AR', {
					dateStyle: 'long',
					timeStyle: 'short',
					timeZone: TIMEZONE
				})}hs</time
			>
			<small>hasta</small><time
				class="dt-end"
				datetime={toISO(end)}
				>{end.toLocaleString('es-AR', {
					dateStyle: 'long',
					timeStyle: 'short',
					timeZone: TIMEZONE
				})}hs</time
			>
			<small>en</small>
			<span class="p-location">
				{where}
			</span>
		</p>
		<div class="event-atcb">
			{#if data.meta.link && !data.tickets}
				<div class="event-link-wrapper">
					<a href={data.meta.link}>{data.meta.link_text ?? 'Inscripción'}</a>
				</div>
			{/if}
			<add-to-calendar-button
				style={`
					--btn-background: var(--1);
					--btn-border: var(--1);
					--btn-text: white;
					--btn-shadow: none;
					--btn-background-hover: var(--1-dark);
					--btn-border-hover: var(--1-dark);
					--btn-text-hover: white;
					--btn-shadow-hover: none;
					--font: 'Lato', sans-serif;
					`}
				trigger="click"
				name={data.meta.title}
				description={data.meta.summary}
				startDate={format(toArgentina(data.meta.start), 'yyyy-MM-dd')}
				startTime={format(toArgentina(data.meta.start), 'HH:mm')}
				endDate={format(
					toArgentina(end),
					'yyyy-MM-dd'
				)}
				status={{
					abierto: 'CONFIRMED',
					cancelado: 'CANCELLED',
					anunciado: 'TENTATIVE',
					agotadas: 'CONFIRMED'
				}[data.meta.status] ?? 'CONFIRMED'}
				endTime={format(toArgentina(end), 'HH:mm')}
				timeZone="America/Buenos_Aires"
				options="'iCal','Apple','Outlook.com','Google','MicrosoftTeams','Microsoft365','Yahoo'"
				language="es"
				iCalFileName="Sample Event"
				listStyle="overlay"
				label="Agregar a mi calendario"
				buttonStyle="round"
				organizer="Mel|kinkyvibe@gmail.com"
				size="8"
			></add-to-calendar-button>
		</div>
	</div>
	{#if data.venue}
		<VenueLocation view={data.venue} context="event" />
	{/if}
	{#if data.tickets}
		{@const t = data.tickets}
		<section class="buy-cta" id="entradas" aria-label="Entradas">
			{#if t.open}
				<a class="buy-button" href="/calendario/{data.meta.postID}/entradas">
					<span class="buy-title">Comprar entradas</span>
					<span class="buy-meta">
						{#if t.priceFrom !== null}desde {formatARS(
								t.priceFrom
							)}{/if}{#if t.priceFrom !== null && t.gorraSuggested !== null}
							·
						{/if}{#if t.gorraSuggested !== null}a la gorra{/if}{#if t.left !== null}
							<strong class="buy-left">· {leftText(t.left)}</strong>{/if}
					</span>
				</a>
				{#if t.closesAt}
					<p class="buy-when">{saleWindowText({ closesAt: t.closesAt })}.</p>
				{/if}
			{:else}
				<p class="buy-closed">
					{t.reason === 'soldout'
						? 'Entradas agotadas.'
						: t.reason === 'closed'
							? 'Venta cerrada.'
							: t.reason === 'notyet' && t.opensAt
								? `Entradas: ${saleWindowText({ opensAt: t.opensAt })}.`
								: t.reason === 'cancelled'
									? 'El evento se canceló: no hay venta de entradas.'
									: 'La venta online de entradas no está disponible en este momento.'}
				</p>
			{/if}
			{#if t.reason !== 'cancelled' && doorText(t.door)}
				<p class="buy-when buy-door">{doorText(t.door)}</p>
			{/if}
		</section>
	{/if}
	{/if}
	<div class="share-row">
		<ShareEventButton
			url={$page.url.origin + '/calendario/' + data.meta.postID}
			title={data.meta.title}
			text={data.meta.summary}
			imagesHref={'/calendario/' + data.meta.postID + '/compartir'}
		/>
	</div>
	{#if data.meta.tags}
		<div id="tags">
			<Tags tags={data.meta.tags} />
		</div>
	{/if}
	<div class="content" use:processContent>
		<svelte:component this={data.content} />
		{#if data.meta.link && data.meta.link_text}
			<a href={data.meta.link} target="_blank" class="cta">{data.meta.link_text}</a>
		{/if}
	</div>
	{#if data.series}
		<EventSeries series={data.series} part="after" origin={$page.url.origin} />
	{/if}
	{#if isKinkyVibePost(data.meta)}
		<PostSupport
			propinas={data.propinas}
			category="calendario"
			slug={$page.params.event ?? ''}
		/>
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
	.share-row {
		display: flex;
		justify-content: center;
		margin-top: 1.2em;
	}
	#tags {
		margin-inline: auto;
		max-width: 70rem;
		width: 100%;
		margin-top: 2em;
		justify-content: center;
	}
	/* Botón "Comprar entradas" (el formulario está en /calendario/<slug>/entradas). */
	.buy-cta {
		max-width: 40rem;
		margin: 1.2em auto 0;
		padding: 0 16px;
	}
	.buy-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15em;
		padding: 0.8em 1.2em;
		border-radius: var(--round);
		background: var(--1);
		color: white;
		text-decoration: none;
		text-align: center;
		box-shadow: 0 0.2em 0.8em color-mix(in srgb, var(--1) 40%, transparent);
		&:hover,
		&:focus-visible {
			background: var(--1-dark);
			color: white;
			text-decoration: none;
		}
	}
	.buy-title {
		font-size: var(--step-2);
		font-weight: bold;
		line-height: 1.2;
	}
	.buy-meta {
		font-size: var(--step-0);
	}
	.buy-left {
		white-space: nowrap;
	}
	.buy-when {
		text-align: center;
		margin: 0.4em 0 0;
		font-size: var(--step--1);
	}
	.buy-closed {
		text-align: center;
		font-weight: bold;
		margin: 0;
	}
	/* ------------------------------------- */
	.event-header {
		background: var(--2-dark);
		color: white;

		--radius: 1em;
		border-radius: var(--radius);
		/* overflow: hidden; */
		display: grid;
		grid-template-areas: 'title title' 'pic time' 'pic location' 'button button';
		grid-template-columns: auto 4fr;
		column-gap: 0.3em;
		font-size: var(--step-1);
		margin-inline: auto;
		margin-top: 1.4em;
		max-width: min(40rem, calc(100% - 32px));
		overflow: hidden;
		box-shadow: var(--shadow);
		& > * {
			min-width: 0;
		}

		img {
			max-width: 100%;
			max-height: 100%;
			height: 10em;
			min-width: 0;
			min-height: 0;
			grid-area: pic;
			border-top-left-radius: var(--radius);
		}
		/* h1 {
			grid-area: title;
		} */
		small {
			opacity: 0.7;
		}
		.event-times {
			grid-area: time;
			display: flex;
			flex-direction: column;
			margin-block: 0;
			padding-top: 0.2em;
		}
		.event-atcb {
			align-self: center;
			justify-self: center;
			grid-area: button;

			display: flex;
			flex-direction: row;
			justify-content: center;
			background: var(--surface);
			width: 100%;
			flex-wrap: wrap;
			padding: 0.4em;
			.event-link-wrapper {
				--base-font-size-l: 18px;
				--base-font-size-m: 18px;
				--base-font-size-s: 18px;
				display: block;
				padding: 5px;
				position: relative;
				font-size: var(--base-font-size-m);
			}
			a {
				align-items: center;
				background-color: var(--1);
				border: 1px solid var(--1);
				border-radius: var(--round-pill);
				color: white;
				display: flex;
				font-weight: bold;
				justify-content: center;
				line-height: 1.5em;
				max-width: 350px;
				min-width: 10em;
				padding: 0.65em 1em;
				position: relative;
				touch-action: manipulation;
				user-select: none;
				-webkit-user-select: none;
				width: 100%;
				z-index: 1;
				&:hover {
					background: var(--1-dark);
					color: white;
					text-decoration: unset;
				}
			}
		}
	}
	@media (max-width: 500px) {
		.event-header {
			grid-template-areas: 'title' 'time' 'location' 'button';
			column-gap: 0;
			.event-times {
				padding-left: 0.5em;
				padding-bottom: 0.5em;
			}
			img {
				display: none;
			}
		}
	}
</style>
