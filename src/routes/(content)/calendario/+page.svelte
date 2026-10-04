<script>
	import { userConfig } from '$lib/utils/stores.js';
	import { fetchAllPostsClient, isCurrent, monthHasPastEvents } from '$lib/utils/allPosts';
	import Calendar from '$lib/components/Calendar.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { format, isSameMonth, isPast, addMonths } from 'date-fns';
	import { page } from '$app/stores';
	import { toArgentina } from '$lib/utils/dates.js';
	import CalendarHeader from '$lib/components/CalendarHeader.svelte';
	import CardRow from '$lib/components/CardRow.svelte';
	import { partLabel, withPartLabel } from '$lib/utils/partes.js';
	export let data;
	let calendarioPosts = data.posts.filter((p) => p.meta.layout == 'calendario');
	// «Parte N de M» de los talleres en varias partes (lo agrega el servidor; los pasados que se
	// cargan después vienen sin ella y se les vuelve a poner).
	const partLabels = new Map(
		calendarioPosts
			.filter((p) => p.meta.parte)
			.map((p) => [String(p.meta.postID), /** @type {{ n: number, m: number }} */ (p.meta.parte)])
	);
	// past events come with just what the calendar grid needs; the list only gets
	// them once they've been loaded in full
	let loadedPast = false;
	let fullPosts = false;
	$: listPosts = fullPosts ? calendarioPosts : calendarioPosts.filter((p) => isCurrent(p));
	$: if ($userConfig.show_past_events && !loadedPast) {
		loadedPast = true;
		fetchAllPostsClient()
			.then((posts) => {
				calendarioPosts = posts
					.filter((p) => p.meta.layout == 'calendario')
					.map((p) => withPartLabel(p, partLabels));
				fullPosts = true;
			})
			.catch(() => (loadedPast = false));
	}
	/** @type {Record<string, Array<ProcessedPost & {i: number}>>} */
	let days = calendarioPosts.reduce((dates, post, i) => {
		let start_date = format(toArgentina(post.meta.start), 'yyyy-MM-dd');
		// @ts-ignore
		if (dates[start_date]) {
			// @ts-ignore
			dates[start_date].push({ i, ...post });
		} else {
			// @ts-ignore
			dates[start_date] = [{ i, ...post }];
		}
		return dates;
	}, {});

	// The viewed month lives in the URL (?viewdate=yyyy-MM), not in a module-level store:
	// a store shared by every request would leak one visitor's month into the next SSR.
	const now_date = new Date();
	// if all of this month's events are in the past, open on next month
	const skip_month = !Object.entries(days).some(
		([date, posts]) =>
			isSameMonth(new Date(date + 'T00:00'), now_date) &&
			posts.some((p) => !isPast(new Date(p.meta.start)))
	);
	const default_month = format(skip_month ? addMonths(now_date, 1) : now_date, 'yyyy-MM');
	/** @param {string | null} m */
	const validMonth = (m) =>
		!!m && /^\d{4}-\d{2}$/.test(m) && !isNaN(new Date(m + '-01T00:00').getTime());
	$: viewdate_param = $page.url.searchParams.get('viewdate');
	$: view_month = validMonth(viewdate_param)
		? /** @type {string} */ (viewdate_param)
		: default_month;
	// only recomputed when the month string changes, so the grid isn't re-keyed needlessly
	$: view_date = new Date(view_month + '-01T00:00');
	// "Mostrar/Ocultar eventos pasados" only when this month has past events (gorrite's call)
	$: month_has_past = monthHasPastEvents(calendarioPosts, view_month);
</script>

<svelte:head>
	<title>Calendario · Kinky Vibe</title>
</svelte:head>

<div class="cardrow">
	<CardRow
		items={calendarioPosts
			.filter((p) => !isPast(new Date(p.meta.start)))
			.sort((a, b) => (a.meta.start > b.meta.start ? 1 : -1))}
		--color-1="transparent"
		setId={false}
	/>
</div>

<div id="container">
	<div id="calendar">
		<CalendarHeader {view_date} {default_month} />
		<Calendar {view_date} let:date let:today let:past>
			{@const events = days?.[date]}
			{@const featuredEvent =
				events?.filter((e) => e.meta.tags.includes('KinkyVibe'))?.[0] ??
				events?.filter((e) => e.meta.featured)?.[0]}
			{@const background = featuredEvent?.meta?.featured}
			<button
				class:today
				class:past
				disabled={!events}
				style={background ? `--event-image: url("${background}");` : ''}
				style:--evt-color={featuredEvent?.meta?.tags?.includes('KinkyVibe')
					? 'var(--1)'
					: 'var(--2)'}
			>
				<div class="date" class:today>
					{Number(date.slice(8))}
				</div>
				{#if events}
					<div class="dot"></div>
					<!-- sort a copy: sorting `events` in place made featuredEvent depend on render order -->
					{#each [...events].sort( (a, b) => (new Date(a.meta.start).getTime() > new Date(b.meta.start).getTime() ? 1 : -1) ) as event}
						{@const start = toArgentina(event.meta.start)}
						<a
							href={'#' + event.path}
							class="bar"
							class:dim={event.meta.status == 'cancelado'}
							style:--evt-color={event?.meta?.tags?.includes('KinkyVibe') ? 'var(--1)' : 'var(--2)'}
						>
							<span>
								{event.meta.title ?? ' '}
								{#if event.meta.parte}
									&sdot; <em class="part">{partLabel(event.meta.parte.n, event.meta.parte.m)}</em>
								{/if}
								&sdot;
								<strong>{format(start, 'HH:mm')}</strong>
							</span>
						</a>
					{/each}
				{/if}
			</button>
		</Calendar>
	</div>
	<div id="postlist">
		<PostList
			filter={{ prop: 'visible', value: true }}
			pastEventsToggle={month_has_past}
			posts={listPosts
				.map((p) => ({
					meta: {
						...p.meta,
						published_date: p.meta.start
					},
					visible: isSameMonth(toArgentina(p.meta.start), view_date),
					path: p.path
				}))
				.sort((a, b) => (a.meta.start > b.meta.start ? 1 : -1))}
		/>
		<p class="subscribe">
			También podés
			<a
				href="https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fkinkyvibe.ar%2Fcalendario.ics"
				target="_blank"
			>
				suscribirte a este calendario en google
			</a>
			para nunca perderte de nada!
		</p>
		<p class="series-link">
			¿Te gusta algo que se repite? <a href="/wiki#series">Mirá todas las series</a> y seguí sus próximas
			ediciones.
		</p>
	</div>
</div>

<style lang="scss">
	.series-link {
		font-size: var(--step-1);
		line-height: 1.6;
		text-align: center;
		margin: -1em auto 2em;
		max-width: min(50rem, calc(100% - 32px));
		a {
			font-weight: 700;
		}
	}
	.subscribe {
		font-size: var(--step-1);
		text-align: center;
		background: var(--1-dark);
		color: white;
		border-radius: var(--round);
		padding: 1em 1.5em;
		margin: 2em auto;
		max-width: min(50rem, calc(100% - 32px));
		line-height: 1.6;
		a {
			background: var(--surface);
			color: var(--1-ink);
			font-weight: 700;
			text-decoration: none;
			padding: 0.1em 0.6em;
			border-radius: var(--round-pill);
			box-decoration-break: clone;
			-webkit-box-decoration-break: clone;
			&:hover {
				color: var(--1-ink);
				background: var(--1-tint);
			}
		}
	}
	.cardrow {
		max-width: 1200px;
		margin-inline: auto;
	}
	strong {
		color: unset;
	}
	#calendar {
		max-width: 50rem;
		margin-inline: auto;
		padding-inline: var(--space-xs);
		height: 40em;
		margin-bottom: 3em;
		padding-bottom: 3em;
		width: 100%;
		min-height: 0;
		min-width: 0;
	}
	button.past {
		opacity: 0.35 !important;
	}
	button.today {
		outline: 3px solid var(--1);
		opacity: 1;
		.date {
			scale: 1.2;
		}
	}
	button {
		opacity: 0.7;
		display: flex;
		padding: 0;
		position: relative;
		width: 100%;
		height: 100%;
		aspect-ratio: 1/1;
		min-height: 0;
		scale: 0.9;
		flex-direction: column;
		justify-content: start;
		align-items: stretch;
		gap: 0.2em;
		background-color: white;
		border: 0;
		border-radius: 0.1rem 0.1rem 1rem 1rem;
		transition: all 0.1s ease-in;
		.dot {
			display: none;
			min-height: 0;
		}
		.bar {
			width: 100%;
			height: auto;
			min-height: 0;
			z-index: 1;
			outline: 3px solid var(--evt-color);
			outline-offset: -2px;
			transition: 200ms ease-in;

			font-size: 1.3em;
			overflow: hidden;
			color: white;
			text-align: left;
			text-overflow: ellipsis;
			text-transform: capitalize;
			text-decoration: none !important;
			white-space: nowrap;
			background: var(--evt-color);
			transition: 100ms;
		}
		.dim {
			opacity: 0.5;
			pointer-events: none;
		}

		.date {
			display: grid;
			place-content: center;
			font-size: 2em;
			color: rgba(1, 1, 1, 0.5);
			position: absolute;
			top: 0;
			right: 0;
			left: 0;
			bottom: 0;
		}
	}

	button:has(.dot) {
		cursor: pointer;
		opacity: 1;
		&:hover {
			gap: 0.5em;
			.bar {
				height: 100%;
				white-space: normal;
			}
		}
		.date {
			display: none;
		}
		--post-color: var(--evt-color);
		background: var(
			--event-image,
			linear-gradient(
				to bottom right,
				color-mix(in srgb, var(--post-color, var(--2)) 70%, white) 0%,
				var(--post-color, var(--2)) 50%,
				color-mix(in srgb, var(--post-color, var(--2)) 70%, black) 100%
			)
		);
		background-position: center center;
		background-repeat: repeat;
		background-size: cover;
	}
	@media (min-width: 1200px) {
		#container {
			display: grid;
			grid-template-areas: 'postlist calendar';
			grid-template-columns: 1fr 1fr;
			margin-inline: 1em 3em;
			gap: 2em;
			position: sticky;
			top: 0;
		}
		#calendar {
			grid-area: calendar;
			min-width: 0;
			height: 90vh;
			position: sticky;
			top: 0;
		}
		#postlist {
			grid-area: postlist;
			min-width: 0;
		}
	}
</style>
