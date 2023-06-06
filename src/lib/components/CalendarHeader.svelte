<script>
	//@ts-nocheck
	import { isSameMonth, isSameYear, addMonths, isBefore } from 'date-fns';
	import { ArrowLeft, Home, ArrowRight } from 'lucide-svelte';
	import { view_date, month_change_direction } from '$lib/utils/stores';

	const today_date = new Date();
	// export let view_date = today_date;
	// export let set_next_month;
	// export let set_prev_month;
	// export let set_today;

	function capitalize(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}
	const set_next_month = () => {
		month_change_direction.update(() => 1);
		view_date.update((d) => addMonths(d, $month_change_direction));
	};
	const set_prev_month = () => {
		month_change_direction.update(() => -1);
		view_date.update((d) => addMonths(d, $month_change_direction));
	};
	const set_today = () => {
		month_change_direction.update(() => (isBefore($view_date, today_date) ? -1 : 1));
		view_date.update(() => new Date(today_date));
	};

	$: view_month_string = capitalize($view_date.toLocaleDateString('es-AR', { month: 'long' }));
	$: view_year_string = $view_date.toLocaleDateString('es-AR', { year: 'numeric' });
	$: view_is_different_year = !isSameYear($view_date, today_date);
	$: view_is_same_month = isSameMonth($view_date, today_date);
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

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: var(--header-margin, 0 0 2rem 0);
		min-width: 0;
		max-width: 100%;
		width: 100%;
		min-height: 0;
		max-height: 100%;
		margin-inline: auto;
	}

	.month {
		font-weight: var(--month-font-weight, 600);
		font-size: var(--month-font-size, 2rem);
	}
	button {
		background: transparent;
		color: #222;
		border: 0;
		border-radius: 0.6em;
		padding: 1em;
		cursor: pointer;
	}
</style>
