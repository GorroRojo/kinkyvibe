<script>
	import 'add-to-calendar-button';
	import Calendar from '$lib/components/Calendar.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { addDays, format, isSameMonth, isPast, addMonths, addHours } from 'date-fns';
	import { view_date } from '$lib/utils/stores.js';
	import CalendarHeader from '$lib/components/CalendarHeader.svelte';
	import CardRow from '$lib/components/CardRow.svelte';
	export let data;
	/** @type {Record<string, Array<ProcessedPost & {i: number}>>} */
	let days = data.posts.reduce((dates, post, i) => {
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
	data.posts.sort((a, b) => new Date(a.meta.start).getTime() - new Date(b.meta.start).getTime());
	let skip_month_flag = true;

	Object.entries(days).forEach(([date, posts]) => {
		// if all the posts this month are inthe past, set view_date to next month
		if (isSameMonth(addHours(new Date(date),3), $view_date) && !isPast(new Date(date))) {
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
		items={data.posts.filter((p) => !isPast(new Date(p.meta.start)))}
		--color-1="transparent"
		setId={false}
	/>
</div>

<div id="container">
	<div id="calendar">
		<CalendarHeader />
		<Calendar let:date let:today let:past>
			{@const events = days?.[date]}
			<button
				class:today
				class:past
				disabled={!events}
				style={events && events?.length > 0 && events[0].meta.featured
					? `--event-image: url("${events[0].meta.featured}");`
					: ''}
			>
				<div class="date" class:today>
					{addDays(new Date(date), 1).toLocaleDateString('es-AR', { day: 'numeric' })}
				</div>
				{#if events}
					<div class="dot" />
					{#each events as event}
						{@const start = new Date(event.meta.start)}
						{@const minutes = format(start, 'mm')}
						<!-- {(() => {
							data.posts[event.i].meta.visible = true;
							return '';
						})()} -->
						<a
							href={'#' + event.path}
							class="bar"
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
		</Calendar>
	</div>
	<div id="postlist">
		<PostList
			filter={{ prop: 'visible', value: true }}
			posts={data.posts.map((p) => ({
				meta: {
					published_date: p.meta.start,
					...p.meta
				},
				visible: isSameMonth(new Date(p.meta.start), $view_date),
				path: p.path
			}))}
		/>
		<!-- style={`
							--btn-text: white;
							--keyboard-focus: var(--post-color, var(--2));
							--btn-background: transparent;
							--btn-shadow: none;
							--btn-shadow-hover: none;
							--list-background: white;
							--list-background-hover: var(--1-light) ;
							--list-text-hover: white;
							--list-shadow: 0 0 1em 0 var(--1-light);
							`} -->
		<p class="subscribe">
			También podés <add-to-calendar-button
				style={`
				--btn-background: var(--2);
				--btn-border: var(--3);
				--btn-text: white;
				--btn-shadow: none;
				--btn-background-hover: var(--2);
				--btn-border-hover: white;
				--btn-text-hover: white;
				--btn-shadow-hover: 0 0 1em var(--3-light);
				--font: 'Lato', sans-serif;
				`}
				startDate={format(new Date(), 'yyyy-MM-dd')}
				options="'iCal','Apple','Outlook.com','Google','MicrosoftTeams','Microsoft365','Yahoo'"
				language="es"
				listStyle="overlay"
				buttonStyle="3d"
				size="10"
				inline
				subscribe
				trigger="click"
				icsFile="https://kinkyvibe.ar/calendario.ics"
				name="Calendario Kinky"
				label="suscribirte a este calendario"
			/> para nunca perderte de nada!
		</p>
		<!-- lightMode="bodyScheme" -->
		<!-- size="1" -->
	</div>
</div>

<style lang="scss">
	.subscribe {
		font-size: var(--step-1);
		text-align: center;
		/* outline: 2px dashed var(--3); */
		/* outline-offset: -4px; */
		background: var(--1-dark);
		color: white;
		border-radius: 1em;
		padding: 1em 1.5em;
		/* max-width: max-content; */
		margin: 2em auto;
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
		/* max-height: 80vh; */
		height: 40em;
		margin-bottom: 3em;
		padding-bottom: 3em;
		width: 100%;
		min-height: 0;
		min-width: 0;
		/* overflow: hidden; */
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
			/* word-break: break-all; */
			text-align: left;
			text-overflow: ellipsis;
			text-transform: capitalize;
			text-decoration: none !important;
			white-space: nowrap;
			/* overflow: visible; */
			background: var(--evt-color);
			transition: 100ms;
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
			/* height: min(max(60vw, 30em), 60em); */
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
