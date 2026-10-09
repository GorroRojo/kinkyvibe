<script>
	/**
	 * La página pública de un evento (/calendario/<evento>), con el diseño de la maqueta final que
	 * aprobó gorrite. Regla de oro: **el texto del evento se lee antes de comprar**: en todas las
	 * pantallas, «Comprar entradas» (o el link de inscripción) va DESPUÉS de «De qué se trata».
	 *
	 * Celu (una columna): afiche cuadrado grande → chip de la serie, título, resumen y «por…» →
	 * aviso (cancelado o ya pasó) → «Cuándo y dónde» (mapa chico arriba de «Ver en Google Maps») →
	 * el texto entero → comprar (o inscripción) con las partes del taller → compartir → cómo
	 * llegar → quiénes y etiquetas → la serie → propina (eventos gratis de KinkyVibe) → tarjetas
	 * de les autores y «Más cosas de…».
	 *
	 * Compu (dos columnas): a la derecha todo eso menos el afiche y «Cuándo y dónde», que van a
	 * la izquierda (el afiche al ancho de la columna), fijos si la columna entra en la pantalla.
	 *
	 * Lo que se ve del lugar y de las personas ya viene filtrado por el servidor (+page.server.js).
	 */
	import { onMount } from 'svelte';
	import { userConfig } from '$lib/utils/stores.js';
	import { relatedPostsFor } from '$lib/utils';
	import { fetchAllPostsClient } from '$lib/utils/allPosts';
	import LDTag from '$lib/components/LDTag.svelte';
	import ContentParts from '$lib/components/ContentParts.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import AuthorCallout from '$lib/components/AuthorCallout.svelte';
	import TipBlock from '$lib/components/propinas/TipBlock.svelte';
	import { showEventTip } from '$lib/utils/propinas.js';
	import { eventEnd } from '$lib/utils/dates.js';
	import { currentPostData } from '$lib/utils/stores.js';
	import { page } from '$app/stores';
	import { addMentionPronouns } from '$lib/utils/mentions';
	import ShareEventButton from '$lib/components/ShareEventButton.svelte';
	import { Button, TagChip } from '$lib/components/ui';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import AvisoEvento from '$lib/components/evento/AvisoEvento.svelte';
	import Compra from '$lib/components/evento/Compra.svelte';
	import CuandoDonde from '$lib/components/evento/CuandoDonde.svelte';
	import Partes from '$lib/components/evento/Partes.svelte';
	import Quienes from '$lib/components/evento/Quienes.svelte';
	import Serie from '$lib/components/evento/Serie.svelte';
	import { eventPlaceSchema } from '$lib/utils/eventPlace.js';
	import { isPastEvent, mainSeries, nextEdition, splitUpcomingPast } from '$lib/utils/eventPage.js';
	import { isWebLink, safeEventLink } from '$lib/utils/eventLink.js';
	import { hasVisibleHtml } from '$lib/utils/htmlStrip.js';
	export let data;
	// Los estilos propios del texto de la base (ya limitados al texto con @scope en el servidor).
	// La etiqueta se arma por partes para que el preprocesador de Svelte no la tome como el
	// bloque de estilos del componente.
	const STYLE_TAG = 'style';
	$: ownStyle = data.css ? `<${STYLE_TAG}>${data.css}</${STYLE_TAG}>` : '';
	// El link de inscripción (`link`): web, mail (`mailto:`), teléfono o página del sitio; con otro
	// esquema (`javascript:`…) no se muestra (eventLink.js). Solo un link web abre otra pestaña.
	$: actionLink = safeEventLink(data.meta.link);
	$: actionLinkTarget = isWebLink(actionLink) ? '_blank' : undefined;
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
	$: if ($userConfig.show_past_events) showPast();
	$: cancelled = data.meta.status == 'cancelado';
	// Un evento que ya terminó: «Este evento ya pasó» (con la próxima edición de la serie, si hay)
	// y sin la venta (ni «Venta cerrada.»: ya dice que pasó).
	$: past = isPastEvent(data.meta);
	$: series = mainSeries(data.series);
	$: next = nextEdition(data.series);
	$: buyTitle =
		data.partes && !data.partes.perPart ? 'Comprar entrada al taller' : 'Comprar entradas';
	$: showTickets = Boolean(data.tickets) && !cancelled && !(past && !data.tickets?.open);
	// Sin venta acá: el link de inscripción (`link`/`link_text`), después del texto.
	$: showLink = !data.tickets && Boolean(actionLink) && !cancelled && !past;
	// Con venta acá, el link (si tiene `link_text`) sigue al final del texto (docs/tickets.md).
	$: textLink = Boolean(data.tickets && actionLink && data.meta.link_text);
	// «De qué se trata» solo si el texto muestra algo: un texto vacío, o con solo espacios o
	// comentarios, no deja el título sin nada abajo (htmlStrip.js). El texto del .md
	// (`data.content`) y los interactivos (`data.parts`) siempre muestran algo.
	$: hasText =
		data.html === undefined
			? Boolean(data.content)
			: Boolean(data.parts?.length) || hasVisibleHtml(data.html);
	// «por …»: les autores (salvo cuando el evento es el perfil de su única autora).
	$: authors = /** @type {string[]} */ (data.meta.authors ?? []);
	$: showAuthors = authors.length > 1 || (authors.length == 1 && authors[0] !== data.meta.postID);
	// «Cómo llegar» y «Accesibilidad»: solo en el nivel que muestra todo (como VenueLocation).
	$: howTo =
		data.venue && data.venue.level === 'public' && (data.venue.howTo || data.venue.accessibility)
			? data.venue
			: null;
	// «Más cosas de…»: lo que viene en orden de fecha; lo que ya pasó, aparte («Pasados»).
	$: related = splitUpcomingPast(relatedPosts);
	/** Cuántos pasados se ven (de a 10, para no armar cientos de tarjetas de una). */
	let pastShown = 10;
	function showPast() {
		if (data.relatedPastCount > 0 && !loadedPast) {
			loadedPast = true;
			fetchAllPostsClient()
				.then((posts) => (relatedPosts = relatedPostsFor(data.meta, posts)))
				.catch(() => (loadedPast = false));
		}
	}

	// La columna lateral (compu, a la izquierda): si es más alta que la pantalla, `top` negativo (queda fija
	// mostrando su final), así nada de la columna queda escondido debajo del borde de la pantalla.
	/** @type {HTMLElement} */
	let fixed;
	let top = '';
	onMount(() => {
		if (typeof ResizeObserver === 'undefined') return;
		const MARGIN = 20;
		const measure = () => {
			const h = fixed.getBoundingClientRect().height;
			top = h + 2 * MARGIN > innerHeight ? `${innerHeight - h - MARGIN}px` : '';
		};
		const ro = new ResizeObserver(measure);
		ro.observe(fixed);
		addEventListener('resize', measure);
		return () => {
			ro.disconnect();
			removeEventListener('resize', measure);
		};
	});
</script>

<LDTag
	schema={/**@type LD.Event & {"@context":"https://schema.org"}*/ {
		'@context': 'https://schema.org',
		'@type': 'Event',
		name: data.meta.title,
		startDate: toISO(data.meta.start ?? ''),
		endDate: toISO(end),
		// Con lugar o con «Dónde», presencial; online solo si el evento lo es; sin nada, ni modo
		// ni lugar (eventPlace.js, lo mismo que «Cuándo y dónde»).
		...eventPlaceSchema(data.meta, data.venue, isWebLink(actionLink) ? actionLink : undefined),
		eventStatus:
			data.meta.status == 'cancelado'
				? 'https://schema.org/EventCancelled'
				: 'https://schema.org/EventScheduled',
		image: [data.meta.featured + ''],
		description: data.meta.summary,
		organizer: {
			'@type': data.meta.tags?.includes('KinkyVibe') ? 'Organization' : 'Person',
			name: data.meta.tags?.includes('KinkyVibe')
				? 'Kinky Vibe'
				: (data.meta.authors?.[0] ?? 'Kinky Vibe'),
			url:
				'https://kinkyvibe.ar/' +
				(data.meta.tags?.includes('KinkyVibe')
					? 'Kinky Vibe'
					: (data.meta.authors?.[0] ?? 'Kinky Vibe'))
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
	<title>{data.meta.title} · Kinky Vibe</title>
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
<article class="evento h-entry h-event">
	<header class="cabeza">
		{#if series}
			<p class="event-series-chip"><TagChip tag={series.id} href={series.href} /></p>
		{/if}
		<h1 class="p-name">{data.meta.title}</h1>
		{#if data.meta.summary}<p class="resumen p-summary">{data.meta.summary}</p>{/if}
		{#if showAuthors}
			<!-- Mientras llegan los perfiles, los nombres sin link. -->
			<address class="por">
				por {#await data.authorsProfiles}{#each authors as author, i (i)}{#if i > 0}{i ===
							authors.length - 1
								? ' y '
								: ', '}{/if}<span class="p-author">{author}</span
						>{/each}{:then authorsProfiles}{#each authors as author, i (i)}{@const profile =
							authorsProfiles?.find(
								(/** @type {ProcessedPost} */ a) => a.meta.postID == author
							)}{#if i > 0}{i === authors.length - 1 ? ' y ' : ', '}{/if}{#if profile}<a
								rel="author"
								class="p-author u-url"
								href={profile.path}>{author}</a
							>{:else}<span class="p-author">{author}</span>{/if}{/each}{/await}
			</address>
		{/if}
	</header>

	{#if cancelled || past}
		<div class="nota"><AvisoEvento cancelado={cancelled} next={cancelled ? null : next} /></div>
	{/if}

	<aside class="lateral" aria-label="Afiche, cuándo y dónde">
		<div class="lateral-fijo" bind:this={fixed} style:--top={top || undefined}>
			{#if data.meta.featured}
				<img
					class="afiche u-photo"
					src={data.meta.featured + ''}
					alt="Afiche de {data.meta.title}"
				/>
			{/if}
			<CuandoDonde meta={data.meta} venue={data.venue} mapa={!cancelled} entradas={showTickets} />
		</div>
	</aside>

	{#if hasText || textLink}
		<section class="texto-evento" aria-labelledby="que-titulo">
			<h2 id="que-titulo">De qué se trata</h2>
			<div
				class="content texto e-content"
				use:addMentionPronouns={(name) =>
					/** @type {Record<string, string>} */ (data.pronouns)?.[name]}
			>
				{#if data.html !== undefined}
					<!-- Texto de la base, armado en el servidor (src/lib/server/contenido/render.js): HTML
				     libre de une superadmin, con sus estilos solo adentro, o la lista corta de HTML. -->
					<div class="kv-texto-libre">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html ownStyle}
						{#if data.parts}
							<!-- Con interactivos registrados (decisión 0004): ContentParts. -->
							<ContentParts parts={data.parts} />
						{:else}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html data.html}
						{/if}
					</div>
				{:else}
					<svelte:component this={data.content} />
				{/if}
				{#if textLink}
					<a
						href={actionLink}
						target={actionLinkTarget}
						rel={actionLinkTarget ? 'noopener' : undefined}
						class="cta">{data.meta.link_text}</a
					>
				{/if}
			</div>
		</section>
	{/if}

	{#if showTickets && data.tickets}
		<section class="compra" aria-label="Comprar">
			<Compra tickets={data.tickets} slug={data.meta.postID} title={buyTitle} />
			{#if data.partes}<Partes partes={data.partes} />{/if}
		</section>
	{:else if showLink || data.partes}
		<section class="compra" aria-label="Inscripción">
			{#if showLink}
				<p class="inscripcion">
					<Button
						surface="sitio"
						href={actionLink}
						target={actionLinkTarget}
						rel={actionLinkTarget ? 'noopener' : undefined}
						>{data.meta.link_text || 'Inscripción'}</Button
					>
				</p>
			{/if}
			{#if data.partes}<Partes partes={data.partes} />{/if}
		</section>
	{/if}

	<div class="compartir">
		<ShareEventButton
			url={$page.url.origin + '/calendario/' + data.meta.postID}
			title={data.meta.title}
			text={data.meta.summary}
			imagesHref={'/calendario/' + data.meta.postID + '/compartir'}
		/>
	</div>

	{#if howTo}
		<section class="llegar surface-card" aria-labelledby="llegar-titulo">
			<h2 id="llegar-titulo">Cómo llegar</h2>
			{#if howTo.howTo}<p>{howTo.howTo}</p>{/if}
			{#if howTo.accessibility}
				<h3>Accesibilidad</h3>
				<p>{howTo.accessibility}</p>
			{/if}
		</section>
	{/if}

	<Quienes groups={data.personas} tags={data.meta.tags ?? []} />

	{#if data.series}<Serie series={data.series} {past} origin={$page.url.origin} />{/if}

	<!-- La propina solo en eventos gratis de KinkyVibe (decisión de gorrite). -->
	{#if showEventTip(data.meta)}
		<div class="propina"><TipBlock category="calendario" slug={$page.params.event ?? ''} /></div>
	{/if}
</article>

<div class="pie">
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
		<section class="relacionados" aria-labelledby="mas-titulo">
			<h2 id="mas-titulo">
				Más cosas de
				{data.meta.authors.length == 1
					? data.meta.authors[0]
					: [data.meta.authors.slice(0, -1).join(', '), data.meta.authors.slice(-1)[0]].join(' o ')}
			</h2>
			{#if related.upcoming.length}
				<PostList posts={related.upcoming} pastEventsToggle={false} />
			{/if}
			{#if data.relatedPastCount > 0 || related.past.length}
				<section class="related-past" aria-labelledby="related-past-title">
					<h3 id="related-past-title">Pasados</h3>
					{#if related.past.length}
						<ul class="past-list">
							{#each related.past.slice(0, pastShown) as post (post.path)}
								<li><PostListItem {post} /></li>
							{/each}
						</ul>
						{#if related.past.length > pastShown}
							<Button
								surface="sitio"
								variant="secondary"
								class="more-past"
								on:click={() => (pastShown += 10)}>Ver más pasados</Button
							>
						{/if}
					{:else}
						<Button surface="sitio" variant="secondary" on:click={showPast} busy={loadedPast}
							>{loadedPast ? 'Cargando…' : `Ver ${data.relatedPastCount} pasados`}</Button
						>
					{/if}
				</section>
			{/if}
		</section>
	{/if}
</div>

<style>
	.evento {
		max-width: 72rem;
		margin: 0 auto;
		padding: var(--space-s) var(--space-xs) var(--space-xl);
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-m);
	}
	.evento > :global(*) {
		margin-block: 0;
	}
	/* En el celu la columna lateral se desarma: el afiche va primero (arriba del título) y
	   «Cuándo y dónde» después del aviso, cada uno como una fila más. */
	.lateral,
	.lateral-fijo {
		display: contents;
	}
	.afiche {
		order: -1;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
	}
	.cabeza {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.cabeza > * {
		margin: 0;
	}
	.cabeza h1 {
		width: auto;
		max-width: none;
		margin: 0;
		font-size: var(--text-2xl);
		line-height: 1.15;
		text-align: start;
	}
	.resumen {
		font-size: var(--text-base);
		color: var(--muted);
	}
	.por {
		width: auto;
		max-width: none;
		font-size: var(--text-sm);
		font-style: normal;
		text-align: start;
	}
	.texto-evento h2,
	.llegar h2 {
		margin: 0 0 var(--space-xs);
		font-size: var(--text-xl);
	}
	.llegar h2 {
		font-size: var(--text-lg);
	}
	.texto {
		margin-top: 0;
		padding-inline: 0;
	}
	.texto > :global(*) {
		margin-inline: 0;
	}
	.compra {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.inscripcion {
		margin: 0;
		text-align: center;
	}
	.compartir {
		display: flex;
		justify-content: center;
	}
	.llegar {
		font-size: var(--text-sm);
	}
	.llegar h3 {
		margin: var(--space-xs) 0 var(--space-3xs);
		font-size: var(--text-sm);
	}
	.llegar p {
		margin: 0;
		white-space: pre-line;
	}
	.pie {
		max-width: 72rem;
		margin: 0 auto var(--space-xl);
		padding-inline: var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.pie hr {
		width: 100%;
	}
	.relacionados {
		width: 100%;
		margin: var(--space-m) auto 0;
		text-align: center;
	}
	.relacionados > h2 {
		font-size: var(--text-xl);
	}
	/* «Más cosas de…»: lo que ya pasó, aparte. */
	.related-past {
		max-width: 50rem;
		margin: var(--space-l) auto 0;
		text-align: center;
	}
	.related-past h3 {
		margin: 0 0 var(--space-s);
		font-size: var(--text-lg);
		color: var(--muted);
	}
	.related-past :global(.more-past) {
		margin-top: var(--space-m);
	}
	.past-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-l);
		margin: 0;
		padding: 0;
		text-align: start;
		list-style: none;
	}
	@media (min-width: 900px) {
		.evento {
			/* Afiche y «Cuándo y dónde» a la izquierda, el texto a la derecha (gorrite, 9/10). */
			grid-template-columns: 24rem minmax(0, 1fr);
			column-gap: var(--space-l);
			/* La columna lateral ocupa 10 filas aunque haya menos cosas en la otra: sin espacio entre
			   filas (las filas vacías no suman nada); la separación va como margen. */
			row-gap: 0;
		}
		.evento > :global(*) {
			grid-column: 2;
			margin-block: 0 var(--space-m);
		}
		.evento > .lateral {
			display: block;
			grid-column: 1;
			grid-row: 1 / span 10;
		}
		.lateral-fijo {
			display: flex;
			flex-direction: column;
			gap: var(--space-s);
			/* Fija: arriba si entra en la pantalla; si es más alta, se desplaza con la página hasta
			   que se ve su final y ahí queda (`--top`, calculado en onMount). */
			position: sticky;
			top: var(--top, var(--space-s));
		}
		.afiche {
			order: 0;
		}
	}
</style>
