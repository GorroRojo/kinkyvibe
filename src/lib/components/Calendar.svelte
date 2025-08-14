<script>
	//@ts-nocheck
	import {
		getDate,
		getDay,
		getDaysInMonth,
		isSameMonth,
		setDate,
		format,
		addDays,
		isPast
	} from 'date-fns';
	import { scale } from 'svelte/transition';
	import { view_date } from '$lib/utils/stores';

	/** @type {{start_on_sunday?: boolean, children?: import('svelte').Snippet<[any]>}} */
	let { start_on_sunday = true, children } = $props();
	let today_date = new Date();
	// export let view_date = today_date;
	const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
	if (start_on_sunday) {
		const s = WEEK_DAYS.splice(WEEK_DAYS.length - 1, 1);
		WEEK_DAYS.unshift(s[0]);
	}
	let view_is_same_month = $derived(isSameMonth($view_date, today_date));
	let days_in_month = $derived(getDaysInMonth($view_date));
	let first_week_day = $derived(getDay(setDate($view_date, 1)) || (start_on_sunday ? 0 : 7));
</script>

<!-- <CalendarHeader /> -->

{#key $view_date}
	<div class="grid">
		{#each WEEK_DAYS as day, i}
			<div class="week-days" out:scale|global={{ duration: 300 }} in:scale|global={{ delay: 300 }}>
				{day}
			</div>
		{/each}
		{#each Array(start_on_sunday ? first_week_day : first_week_day - 1) as _, i}
			<div class="cell" out:scale|global={{ duration: 300 }} in:scale|global={{ delay: 300 }}></div>
		{/each}
		{#each Array(days_in_month) as _, i}
			{@const date_og = setDate($view_date, i + 1)}
			{@const date = format(date_og, 'yyyy-MM-dd')}
			{@const today = view_is_same_month ? getDate(today_date) === i + 1 : false}
			{@const past = isPast(addDays(date_og, 1))}
			<div class="cell" out:scale|global={{ duration: 300 }} in:scale|global={{ delay: 300 }}>
				{#if children}
					{@render children({ date, today, past, })}
				{:else}
					{date_og.toLocaleDateString(undefined, { day: 'numeric' })}
				{/if}
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
		color: var(--week-days-color, gray);
		font-weight: var(--week-days-font-weight, 600);
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
