<script>
	//@ts-nocheck
	import { getDay, getDaysInMonth, setDate, format } from 'date-fns';
	import { scale } from 'svelte/transition';
	import { calendarDayFlags } from '$lib/utils/allPosts';

	export let start_on_sunday = true;
	/** @type {Date} first day of the month to show */
	export let view_date;
	/** «Ahora» en ms: hoy y los días pasados se calculan en hora de Argentina. */
	export let now = Date.now();
	const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
	if (start_on_sunday) {
		const s = WEEK_DAYS.splice(WEEK_DAYS.length - 1, 1);
		WEEK_DAYS.unshift(s[0]);
	}
	$: days_in_month = getDaysInMonth(view_date);
	$: first_week_day = getDay(setDate(view_date, 1)) || (start_on_sunday ? 0 : 7);
</script>

<!-- <CalendarHeader /> -->

{#key view_date}
	<div class="grid">
		<!-- in:fly={{ x: 100 * $month_change_direction, duration: 300, delay: 300 }}
	out:fly={{ x: -100 * $month_change_direction, duration: 300 }} -->
		{#each WEEK_DAYS as day, i}
			<div class="week-days" out:scale={{ duration: 300 }} in:scale={{ delay: 300 }}>
				{day}
			</div>
		{/each}
		{#each Array(start_on_sunday ? first_week_day : first_week_day - 1) as _, i}
			<div class="cell" out:scale={{ duration: 300 }} in:scale={{ delay: 300 }}></div>
		{/each}
		{#each Array(days_in_month) as _, i}
			{@const date_og = setDate(view_date, i + 1)}
			{@const date = format(date_og, 'yyyy-MM-dd')}
			{@const flags = calendarDayFlags(date, now)}
			{@const today = flags.today}
			{@const past = flags.past}
			<div class="cell" out:scale={{ duration: 300 }} in:scale={{ delay: 300 }}>
				<slot {date} {today} {past}>
					{date_og.toLocaleDateString(undefined, { day: 'numeric' })}
				</slot>
			</div>
		{/each}
	</div>
{/key}

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		align-items: center;
		justify-items: center;
		row-gap: 0em;

		/* width: 100%; */
		min-width: 0;
		max-width: 100%;

		height: 100%;
		/* max-height: 80vh; */
		min-height: 0;

		/* aspect-ratio: 7/5; */
	}

	.week-days {
		/* gris del sitio (≥ 4,5:1 sobre el fondo; `gray` daba 3,4:1) */
		color: var(--week-days-color, var(--muted));
		font-weight: var(--week-days-font-weight, 700);
		margin: var(--week-days-margin, 0 0 0rem 0);
	}

	.cell {
		text-align: center;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		/* aspect-ratio: 1/1; */
	}
</style>
