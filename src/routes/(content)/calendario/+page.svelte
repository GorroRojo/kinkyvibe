<script>
	import 'add-to-calendar-button';
	import Calendar from '$lib/components/Calendar.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { addDays, format, isSameMonth, isPast, addMonths, addHours } from 'date-fns';
	import { view_date } from '$lib/utils/stores.js';
	import CalendarHeader from '$lib/components/CalendarHeader.svelte';
	import CardRow from '$lib/components/CardRow.svelte';
	/** @type {{data: any}} */
	let { data } = $props();
	let calendarioPosts = data.allPosts.filter((p) => p.meta.layout == 'calendario');
	/** @type {Record<string, Array<ProcessedPost & {i: number}>>} */
	let days = calendarioPosts.reduce((dates, post, i) => {
		let start_date = format(addDays(new Date(post.meta.start), 0), 'yyyy-MM-dd');
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
	let skip_month_flag = true;

	Object.entries(days).forEach(([date, posts]) => {
		// if all the posts this month are inthe past, set view_date to next month
		if (isSameMonth(addHours(new Date(date), 3), $view_date) && !isPast(new Date(date))) {
			skip_month_flag = false;
		}
	});
	if (skip_month_flag) $view_date = addMonths(new Date(), 1);
</script>

<svelte:head>
	<title>KinkyVibe.ar - Calendario</title>
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
		<CalendarHeader />
		<Calendar   >
			{#snippet children({ date, today, past })}
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
						{addDays(new Date(date), 1).toLocaleDateString('es-AR', { day: 'numeric' })}
					</div>
					{#if events}
						<div class="dot"></div>
						{#each events.sort( (a, b) => (new Date(a.meta.start).getTime() > new Date(b.meta.start).getTime() ? 1 : -1) ) as event}
							{@const start = new Date(event.meta.start)}
							{@const minutes = format(start, 'mm')}
							<a
								href={'#' + event.path}
								class="bar"
								class:dim={event.meta.status == 'cancelado'}
								style:--evt-color={event?.meta?.tags?.includes('KinkyVibe') ? 'var(--1)' : 'var(--2)'}
							>
								<span>
									{event.meta.title ?? ' '}
									&sdot;
									<strong
										>{format(start, 'h')}{minutes == '00' ? '' : ':' + minutes}{format(
											start,
											'aaa'
										)}</strong
									>
								</span>
							</a>
						{/each}
					{/if}
				</button>
								{/snippet}
				</Calendar>
	</div>
	<div id="postlist">
		<PostList
			filter={{ prop: 'visible', value: true }}
			posts={calendarioPosts
				.map((p) => ({
					meta: {
						...p.meta,
						published_date: p.meta.start
					},
					visible: isSameMonth(new Date(p.meta.start), $view_date),
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
	</div>
</div>

<style lang="scss">
	.subscribe {
		font-size: var(--step-1);
		text-align: center;
		background: var(--1-dark);
		color: white;
		border-radius: 1em;
		padding: 1em 1.5em;
		/* max-width: max-content; */
		margin: 2em auto;
		a {
			background: var(--2);
			border: 1px solid var(--4);
			color: white;
			--font: 'Lato', sans-serif;
			text-decoration: none;
			padding: .3em;
			border-radius: .3em;
			&:hover {
				border-color: white;
				color: white;
				box-shadow: 0 0 1em var(--4-light);
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
		height: 40em;
		margin-bottom: 3em;
		padding-bottom: 3em;
		width: 100%;
		min-height: 0;
		min-width: 0;
	}
	button.past {
		opacity: 0.2 !important;
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
