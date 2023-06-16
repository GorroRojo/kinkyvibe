<script>
	//@ts-nocheck
	import { ArrowLeft } from 'lucide-svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import PostList from '$lib/components/PostList.svelte';
	import { addDays, format, isSameMonth } from 'date-fns';
	import { view_date } from '$lib/utils/stores.js';
	import CalendarHeader from '$lib/components/CalendarHeader.svelte';
	// const vd = writable(new Date());
	export let data;
	// let view_date;
	data.days = data.posts.reduce((dates, post, i) => {
		let start_date = new Date(post.meta.start);
		start_date = format(addDays(start_date, 1), 'yyyy-MM-dd');
		// post.meta.start_time = format(start_date, 'hh:mm');
		if (dates[start_date]) {
			dates[start_date].push({ i, ...post });
		} else {
			dates[start_date] = [{ i, ...post }];
		}

		return dates;
	}, {});
</script>

<a class="back" href="/"><ArrowLeft size="20" style="translate: 0 .3em" /> Volver</a>

<svelte:head>
	<title>KinkyVibe.ar - Calendario</title>
</svelte:head>
<div id="container">
	<div id="calendar">
		<CalendarHeader />
		<Calendar let:date let:today let:past>
			{@const events = data.days[date]}
			<button
				class:today
				class:past
				disabled={!events}
				on:click={() =>
					alert(
						`You selected the date ${date.toLocaleDateString(undefined)}.` +
							(today ? `\nThis date is today!` : '')
					)}
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
								<strong
									>{format(start, 'h')}{minutes == '00' ? '' : ':' + minutes}{format(
										start,
										'aaa'
									)}</strong
								>
								&sdot;
								{event.meta.title ?? ' '}
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
	@media (min-width: 1200px) {
		#container {
			display: grid;
			grid-template-areas: 'postlist calendar';
			grid-template-columns: 1fr 1fr;
			margin-inline: 1em 3em;
			gap: 1em;
			position: sticky;
			top: 0;
		}
		#calendar {
			grid-area: calendar;
			min-width: 0;
		}
		#postlist {
			grid-area: postlist;
			min-width: 0;
		}
	}
	strong {
		color: unset;
	}
	#calendar {
		max-width: 800px;
		margin-inline: auto;
		/* max-height: 80vh; */
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
	}
	a.back {
		display: block;
		width: 100%;
		max-width: 900px;
		margin: 1.5em auto -2em;
		padding-left: 1em;
		color: var(--2);
		text-decoration: none;
	}
</style>
