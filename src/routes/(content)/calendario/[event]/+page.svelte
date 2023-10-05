<script>
	import LDTag from '$lib/components/LDTag.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import 'add-to-calendar-button';
	import { format } from 'date-fns';
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
	schema={/**@type LD.Event & {"@context":"https://schema.org"}*/ {
		'@context': 'https://schema.org',
		'@type': 'Event',
		name: data.meta.title,
		startDate: toISO(data.meta.start ?? ''),
		endDate: toISO(data.meta.end ?? (data.meta.start ?? '') + (data.meta.duration ?? '')),
		eventAttendanceMode: data.meta.location
			? 'https://schema.org/OnlineEventAttendanceMode'
			: 'https://schema.org/OfflineEventAttendanceMode',
		eventStatus:
			data.meta.status == 'cancelado'
				? 'https://schema.org/EventCancelled'
				: 'https://schema.org/EventScheduled',
		location: data.meta.location
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
<a href={$page.url.href} hidden aria-hidden class="u-url">Link</a>
<article class="h-entry h-event">
	<h1 id="title p-name">{data.meta.title}</h1>
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
	<div class="event-header">
		{#if data.meta.featured}<img src={data.meta.featured + ''} alt="poster" />{/if}
		<p class="event-times">
			<small>desde</small><time class="dt-start" datetime={data.meta.start}
				>{new Date(data.meta.start).toLocaleString('es-AR', {
					dateStyle: 'long',
					timeStyle: 'short'
				})}hs</time
			>
			<small>hasta</small><time
				class="dt-end"
				datetime={data.meta.end ?? data.meta.start + data.meta.duration}
				>{new Date(data.meta.end ?? data.meta.start + data.meta.duration).toLocaleString('es-AR', {
					dateStyle: 'long',
					timeStyle: 'short'
				})}hs</time
			>
			<small>en</small>
			<span class="p-location">
				{data.meta.location ?? 'Online'}
			</span>
		</p>
		<div class="event-atcb">
			{#if data.meta.link}
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
					--btn-background-hover: var(--1-light);
					--btn-border-hover: white;
					--btn-text-hover: white;
					--btn-shadow-hover: 0 0 1em var(--1-light);
					--font: 'Lato', sans-serif;
					`}
				trigger="click"
				name={data.meta.title}
				description={data.meta.summary}
				startDate={format(new Date(data.meta.start), 'yyyy-MM-dd')}
				startTime={format(new Date(data.meta.start), 'HH:mm')}
				endDate={format(
					new Date(data.meta.end ?? data.meta.start + data.meta.duration),
					'yyyy-MM-dd'
				)}
				endTime={format(new Date(data.meta.end ?? data.meta.start + data.meta.duration), 'HH:mm')}
				timeZone="America/Buenos_Aires"
				options="'iCal','Apple','Outlook.com','Google','MicrosoftTeams','Microsoft365','Yahoo'"
				language="es"
				iCalFileName="Sample Event"
				listStyle="overlay"
				label="Agregar a mi calendario"
				buttonStyle="3d"
				organizer="Mel|kinkyvibe@gmail.com"
				size="8"
			/>
		</div>
	</div>
	{#if data.meta.tags}
		<div id="tags">
			<Tags tags={data.meta.tags} />
		</div>
	{/if}
	<div class="content" use:processContent>
		<svelte:component this={data.content} />
		{#if data.meta.link && data.meta.link_text}
			<a href={data.meta.link} class="cta">{data.meta.link_text}</a>
		{/if}
	</div>
	{#if data.meta.tags.includes('KinkyVibe')}
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
		max-width: 40rem;
		outline: 3px solid var(--2-dark);
		/* outline: 2px dotted var(--2); */
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
			background: white;
			width: 100%;
			flex-wrap: wrap;
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
				border-radius: 6px;
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
					background: var(--1-light);
					color: unset;
					text-decoration: unset;
					box-shadow: 0 0 0.5em var(--1-light);
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
