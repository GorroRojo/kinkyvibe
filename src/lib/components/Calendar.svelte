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
	/** El nombre entero de cada letra, para lectores de pantalla. */
	const WEEK_DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
	if (start_on_sunday) {
		const s = WEEK_DAYS.splice(WEEK_DAYS.length - 1, 1);
		WEEK_DAYS.unshift(s[0]);
		const n = WEEK_DAY_NAMES.splice(WEEK_DAY_NAMES.length - 1, 1);
		WEEK_DAY_NAMES.unshift(n[0]);
	}
	$: days_in_month = getDaysInMonth(view_date);
	$: first_week_day = getDay(setDate(view_date, 1)) || (start_on_sunday ? 0 : 7);
	$: leading = start_on_sunday ? first_week_day : first_week_day - 1;
	// La grilla es una tabla para los lectores de pantalla (mes → semanas → días). Las filas son
	// `display: contents`: las celdas siguen siendo hijas de la grilla CSS, así se ve igual.
	/** @type {(number | null)[][]} null = celda vacía antes del día 1 */
	$: weeks = Array.from({ length: Math.ceil((leading + days_in_month) / 7) }, (_, w) =>
		Array.from({ length: 7 }, (_, d) => w * 7 + d - leading + 1)
			.filter((n) => n <= days_in_month)
			.map((n) => (n >= 1 ? n : null))
	);
	$: month_label = view_date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
</script>

<!-- <CalendarHeader /> -->

{#key view_date}
	<div class="grid" role="table" aria-label={month_label}>
		<!-- in:fly={{ x: 100 * $month_change_direction, duration: 300, delay: 300 }}
	out:fly={{ x: -100 * $month_change_direction, duration: 300 }} -->
		<div class="row" role="row">
			{#each WEEK_DAYS as day, i}
				<div
					class="week-days"
					role="columnheader"
					aria-label={WEEK_DAY_NAMES[i]}
					out:scale={{ duration: 300 }}
					in:scale={{ delay: 300 }}
				>
					{day}
				</div>
			{/each}
		</div>
		{#each weeks as week}
			<div class="row" role="row">
				{#each week as n}
					{#if n === null}
						<div
							class="cell"
							role="cell"
							out:scale={{ duration: 300 }}
							in:scale={{ delay: 300 }}
						></div>
					{:else}
						{@const date_og = setDate(view_date, n)}
						{@const date = format(date_og, 'yyyy-MM-dd')}
						{@const flags = calendarDayFlags(date, now)}
						{@const today = flags.today}
						{@const past = flags.past}
						<div class="cell" role="cell" out:scale={{ duration: 300 }} in:scale={{ delay: 300 }}>
							<slot {date} {today} {past}>
								{date_og.toLocaleDateString(undefined, { day: 'numeric' })}
							</slot>
						</div>
					{/if}
				{/each}
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

	.row {
		display: contents;
	}

	.week-days {
		color: var(--week-days-color, gray);
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
