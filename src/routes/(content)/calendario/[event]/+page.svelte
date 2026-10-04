<script>
	import { userConfig } from '$lib/utils/stores.js';
	import { relatedPostsFor } from '$lib/utils';
	import { fetchAllPostsClient } from '$lib/utils/allPosts';
	import LDTag from '$lib/components/LDTag.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import AuthorCallout from '$lib/components/AuthorCallout.svelte';
	import PersonasConRol from '$lib/components/PersonasConRol.svelte';
	import PostSupport from '$lib/components/propinas/PostSupport.svelte';
	import { showEventTip } from '$lib/utils/propinas.js';
	import { formatARS } from '$lib/utils/money.js';
	import { doorText, leftText, saleWindowText } from '$lib/utils/tickets.js';
	import { format } from 'date-fns';
	import { toArgentina, eventEnd, argDateTimeLong } from '$lib/utils/dates.js';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { processContent } from '$lib/utils';
	import ShareEventButton from '$lib/components/ShareEventButton.svelte';
	import AddToCalendarButton from '$lib/components/AddToCalendarButton.svelte';
	import { Globe, MapPin } from '@lucide/svelte';
	import EventSeries from '$lib/components/series/EventSeries.svelte';
	import VenueLocation from '$lib/components/amigues/VenueLocation.svelte';
	import { venueSchema } from '$lib/utils/venues.js';
	import { eventPlace } from '$lib/utils/eventPlace.js';
	import { isWebLink, safeEventLink } from '$lib/utils/eventLink.js';
	import { MAP_LABEL } from '$lib/utils/icsFeed.js';
	export let data;
	// Los estilos propios del texto de la base (ya limitados al texto con @scope en el servidor).
	// La etiqueta se arma por partes para que el preprocesador de Svelte no la tome como el
	// bloque de estilos del componente.
	const STYLE_TAG = 'style';
	$: ownStyle = data.css ? `<${STYLE_TAG}>${data.css}</${STYLE_TAG}>` : '';
	// "Sucede en" (interruptor `perfiles_publicos`): si el evento tiene lugar, su privacidad manda
	// sobre el «Dónde» del .md (`location` y su link al mapa `location_map`; docs/amigues.md).
	// Lo mismo que el .ics (eventPlace.js). En la tarjeta, el lugar va una sola vez: con lugar,
	// VenueLocation en su versión chica (con las reglas de cada nivel); sin lugar, el «Dónde».
	$: place = eventPlace(data.meta, data.venue);
	// El link de inscripción (`link`): web, mail (`mailto:`), teléfono o página del sitio; con otro
	// esquema (`javascript:`…) no se muestra (eventLink.js). Solo un link web abre otra pestaña.
	$: actionLink = safeEventLink(data.meta.link);
	$: actionLinkTarget = isWebLink(actionLink) ? '_blank' : undefined;
	$: where = place.text;
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
	/** «Agregar a mi calendario» (add-to-calendar-button, en hora argentina). */
	/** @type {import('svelte').ComponentProps<typeof AddToCalendarButton>['event']} */
	let calendarEvent;
	$: calendarEvent = {
		name: data.meta.title,
		description: data.meta.summary,
		startDate: format(toArgentina(data.meta.start), 'yyyy-MM-dd'),
		startTime: format(toArgentina(data.meta.start), 'HH:mm'),
		endDate: format(toArgentina(end), 'yyyy-MM-dd'),
		endTime: format(toArgentina(end), 'HH:mm'),
		status:
			/** @type {Record<string, 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE'>} */ ({
				abierto: 'CONFIRMED',
				cancelado: 'CANCELLED',
				anunciado: 'TENTATIVE',
				agotadas: 'CONFIRMED'
			})[data.meta.status] ?? 'CONFIRMED',
		timeZone: 'America/Buenos_Aires',
		options: ['iCal', 'Apple', 'Outlook.com', 'Google', 'MicrosoftTeams', 'Microsoft365', 'Yahoo'],
		language: 'es',
		iCalFileName: 'Sample Event',
		listStyle: 'overlay',
		organizer: 'Mel|kinkyvibe@gmail.com'
	};
</script>

<LDTag
	schema={/**@type LD.Event & {"@context":"https://schema.org"}*/ {
		'@context': 'https://schema.org',
		'@type': 'Event',
		name: data.meta.title,
		startDate: toISO(data.meta.start ?? ''),
		endDate: toISO(end),
		// Con lugar o con «Dónde», presencial; sin ninguno de los dos, online.
		eventAttendanceMode:
			data.venue || data.meta.location
				? 'https://schema.org/OfflineEventAttendanceMode'
				: 'https://schema.org/OnlineEventAttendanceMode',
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
				: { '@type': 'VirtualLocation', url: isWebLink(actionLink) ? actionLink : undefined },
		image: [data.meta.featured + ''],
		description: data.meta.summary,
		organizer: {
			'@type': data.meta.tags?.includes('KinkyVibe') ? 'Organization' : 'Person',
			name: data.meta.tags?.includes('KinkyVibe')
				? 'KinkyVibe'
				: (data.meta.authors?.[0] ?? 'KinkyVibe'),
			url:
				'https://kinkyvibe.ar/' +
				(data.meta.tags?.includes('KinkyVibe')
					? 'KinkyVibe'
					: (data.meta.authors?.[0] ?? 'KinkyVibe'))
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
					>{argDateTimeLong(data.meta.start)}</time
				>
				<small>hasta</small><time class="dt-end" datetime={toISO(end)}>{argDateTimeLong(end)}</time>
			</p>
			<div class="event-place">
				<small>en</small>
				{#if data.venue}
					<VenueLocation view={data.venue} context="event" compact />
				{:else}
					<p class="md-place">
						<svelte:component
							this={where === 'Online' ? Globe : MapPin}
							size="1.1em"
							aria-hidden="true"
						/>
						<span class="p-location">{where}</span>
					</p>
					{#if place.mapUrl}
						<a class="map-link" href={place.mapUrl} target="_blank" rel="noopener noreferrer"
							>{MAP_LABEL}</a
						>
					{/if}
				{/if}
			</div>
			{#if actionLink && !data.tickets}
				<div class="event-cta">
					<div class="event-link-wrapper">
						<a href={actionLink}>{data.meta.link_text ?? 'Inscripción'}</a>
					</div>
				</div>
			{/if}
		</div>
		{#if data.tickets}
			{@const t = data.tickets}
			{@const price = [
				t.priceFrom !== null ? `desde ${formatARS(t.priceFrom)}` : '',
				t.gorraSuggested !== null ? 'a la gorra' : ''
			]
				.filter(Boolean)
				.join(' · ')}
			<section class="buy-cta" id="entradas" aria-label="Entradas">
				{#if t.open}
					<a class="buy-button" href="/calendario/{data.meta.postID}/entradas">
						<span class="buy-title">Comprar entradas</span>
						<!-- Los espacios van explícitos ({' '}): Svelte saca los del borde de cada {#if},
						y salía «desde $ 6.400· Quedan 5». -->
						<span class="buy-meta"
							>{price}{#if t.left !== null}{#if price}{' '}<strong class="buy-left"
										>· {leftText(t.left)}</strong
									>{:else}<strong class="buy-left">{leftText(t.left)}</strong>{/if}{/if}</span
						>
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
		{#if data.meta.status != 'cancelado'}
			<AddToCalendarButton event={calendarEvent} />
		{/if}
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
	{#if data.personas}
		<div class="content"><PersonasConRol groups={data.personas} /></div>
	{/if}
	<div class="content" use:processContent>
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
		{#if actionLink && data.meta.link_text}
			<a
				href={actionLink}
				target={actionLinkTarget}
				rel={actionLinkTarget ? 'noopener' : undefined}
				class="cta">{data.meta.link_text}</a
			>
		{/if}
	</div>
	{#if data.series}
		<EventSeries series={data.series} part="after" origin={$page.url.origin} />
	{/if}
	<!-- La propina solo en eventos gratis de KinkyVibe (decisión de gorrite). -->
	{#if showEventTip(data.meta)}
		<PostSupport propinas={data.propinas} category="calendario" slug={$page.params.event ?? ''} />
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
	/* «Agregar a mi calendario» y «Compartir», del mismo estilo; en pantallas angostas, uno
	   abajo del otro. */
	.share-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6em;
		margin-top: 1.2em;
		padding-inline: var(--space-xs);
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
		padding: 0 var(--space-xs);
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
		column-gap: 0.6em;
		/* Texto más chico que antes (--step-1): la fecha y el lugar entran en menos renglones. */
		font-size: var(--step-0);
		line-height: 1.35;
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
			/* La misma altura de antes, aunque el texto sea más chico. */
			height: 12rem;
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
			font-size: var(--step--1);
			text-transform: uppercase;
			letter-spacing: 0.06em;
			margin-top: 0.35em;
		}
		time {
			font-weight: 700;
		}
		.event-times {
			grid-area: time;
			display: flex;
			flex-direction: column;
			margin-block: 0;
			padding-top: 0.5em;
			padding-right: 0.5em;
		}
		.event-place {
			grid-area: location;
			display: flex;
			flex-direction: column;
			padding: 0 0.5em 0.6em 0;
		}
		.md-place {
			margin: 0;
			:global(svg) {
				vertical-align: -0.15em;
			}
		}
		/* Como el "Ver en Google Maps" de un lugar (VenueLocation). */
		.map-link {
			align-self: flex-start;
			margin-top: 0.3em;
			padding: 0.3em 0.8em;
			border: 1px solid currentColor;
			border-radius: var(--radius-pill);
			color: inherit;
			font-size: var(--step--1);
			text-decoration: none;
		}
		.event-cta {
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
				padding: var(--space-3xs);
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
			.event-place {
				padding-left: 0.5em;
			}
			img {
				display: none;
			}
		}
	}
</style>
