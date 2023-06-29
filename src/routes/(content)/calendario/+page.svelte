<script>
	// @ts-nocheck
	import { ArrowLeft } from 'lucide-svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { addDays, format, isSameMonth, isPast } from 'date-fns';
	import { view_date } from '$lib/utils/stores.js';
	import CalendarHeader from '$lib/components/CalendarHeader.svelte';
	import CardRow from '$lib/components/CardRow.svelte';
	// const vd = writable(new Date());
	export let data;
	// let view_date;
	let days = data.posts.reduce((dates, post, i) => {
		let start_date = new Date(post.meta.start);
		start_date = format(addDays(start_date, 0), 'yyyy-MM-dd');
		// post.meta.start_time = format(start_date, 'hh:mm');
		if (dates[start_date]) {
			dates[start_date].push({ i, ...post });
		} else {
			dates[start_date] = [{ i, ...post }];
		}

		return dates;
	}, {});
</script>

<svelte:head>
	<title>KinkyVibe.ar - Calendario</title>
</svelte:head>

<div class="cardrow">
	<CardRow
		items={data.posts.filter((p) => !isPast(new Date(p.meta.start)))}
		--color-1="transparent"
	/>
</div>

<div id="container">
	<div id="calendar">
		<CalendarHeader />
		<Calendar let:date let:today let:past>
			{@const events = days ? days[date] : []}
			<button
				class:today
				class:past
				disabled={!events}
				style={events && events.length > 0 && events[0].meta.featured
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
						<a href={'#' + event.path} class="bar" style:--evt-color={event.color || 'var(--1)'}>
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
	</div>
</div>

<style lang="scss">
	
	.cardrow {
		max-width: 1200px;
		margin-inline: auto;
	}
	strong {
		color: unset;
	}
	#calendar {
		max-width: 800px;
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
		background-image: var(--event-image, none);
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
