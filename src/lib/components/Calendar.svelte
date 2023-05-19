<script>
	import {
		getYear,
		addMonths,
		getMonth,
		getDate,
		getDay,
		getDaysInMonth,
		isSameMonth,
		isSameYear,
		setDate
	} from 'date-fns';
	import { ArrowLeft, Home, ArrowRight } from 'lucide-svelte';
	import { fly } from 'svelte/transition';

	export let start_on_sunday = true;
	export let view_date = new Date();
	let today_date = new Date();
	let month_change_direction = 1;

	const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
	const set_next_month = () => {
		month_change_direction = 1;
		view_date = addMonths(view_date, month_change_direction);
	};
	const set_prev_month = () => {
		month_change_direction = -1;
		view_date = addMonths(view_date, month_change_direction);
	};
	const set_today = () => {
		month_change_direction = getYear(today_date)==getYear(view_date)
		? Math.sign(getMonth(today_date) - getMonth(view_date))
		: Math.sign(getYear(today_date) - getYear(view_date))*12;
		view_date = new Date(today_date);
	};

	if (start_on_sunday) {
		const s = WEEK_DAYS.splice(WEEK_DAYS.length - 1, 1);
		WEEK_DAYS.unshift(s[0]);
	}

	function capitalize(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}

	$: view_month_string = capitalize(view_date.toLocaleDateString('es-AR', { month: 'long' }));
	$: view_year_string = view_date.toLocaleDateString('es-AR', { year: 'numeric' });
	$: view_is_different_year = !isSameYear(view_date, today_date);
	$: view_is_same_month = isSameMonth(view_date, today_date);
	$: days_in_month = getDaysInMonth(view_date);
	$: first_week_day = getDay(setDate(view_date, 1)) || (start_on_sunday ? 0 : 7);
</script>

<div class="header">
	<span class="month">
		{view_month_string}
		{#if view_is_different_year}
			{view_year_string}
		{/if}
	</span>

	<div>
		<button on:click={set_prev_month} aria-label="Previous Month"> <ArrowLeft /> </button>
		<button on:click={set_today} aria-label="today" disabled={view_is_same_month}>
			<Home />
		</button>
		<button on:click={set_next_month} aria-label="Next Month"> <ArrowRight /> </button>
	</div>
</div>
{#key view_date}
	<div
		class="grid"
		in:fly={{ x: 100 * month_change_direction, duration: 200, delay: 200 }}
		out:fly={{ x: -100 * month_change_direction, duration: 200 }}
	>
		{#each WEEK_DAYS as day}
			<div class="week-days">
				{day}
			</div>
		{/each}
		{#each Array(start_on_sunday ? first_week_day : first_week_day - 1) as _}
			<div class="cell" />
		{/each}
		{#each Array(days_in_month) as _, i}
			{@const date = setDate(view_date, i + 1)}
			{@const today = view_is_same_month ? getDate(today_date) === i + 1 : false}
			{@const past =
				getDate(today_date) > i + 1
					? getMonth(view_date) < getMonth(today_date) + 1
					: today_date > view_date}
			<div class="cell">
				<slot {date} {today} {past}>
					{date.toLocaleDateString(undefined, { day: 'numeric' })}
				</slot>
			</div>
		{/each}
	</div>
{/key}

<style>
	.today {
		background: orange;
	}
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: var(--header-margin, 0 0 2rem 0);
	}

	.month {
		font-weight: var(--month-font-weight, 600);
		font-size: var(--month-font-size, 2rem);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		align-items: center;
		justify-items: center;
		height: 100%;
	}

	.week-days {
		color: var(--week-days-color, gray);
		font-weight: var(--week-days-font-weight, 600);
		margin: var(--week-days-margin, 0 0 0.5rem 0);
	}

	.cell {
		height: var(--cell-height, clamp(4rem, 7vw, 8rem));
		text-align: center;
		width: 100%;
		height: 100%;
		aspect-ratio: 1/1;
	}
	button {
		background: transparent;
		color: #222;
		border: 0;
		border-radius: .6em;
		padding: 1em;
		cursor: pointer;
	}
</style>
