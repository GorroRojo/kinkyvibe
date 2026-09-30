<script>
	//@ts-nocheck
	import { isSameMonth, isSameYear, addMonths, format } from 'date-fns';
	import { ArrowLeft, Home, ArrowRight } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	/** @type {Date} the month being shown */
	export let view_date;
	/** @type {string} yyyy-MM the page opens on without ?viewdate */
	export let default_month;

	const today_date = new Date();

	/**
	 * Move to another month through the URL, so back/forward work and nothing global is written.
	 * The page's loads don't read the query string, so this doesn't refetch anything.
	 * @param {Date} d
	 * @param {boolean} [replaceState]
	 */
	const show_month = (d, replaceState = false) => {
		const month = format(d, 'yyyy-MM');
		const url = new URL($page.url);
		url.hash = '';
		if (month === default_month) url.searchParams.delete('viewdate');
		else url.searchParams.set('viewdate', month);
		goto(url, { replaceState, noScroll: true, keepFocus: true });
	};

	function capitalize(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}
	const set_next_month = () => show_month(addMonths(view_date, 1));
	const set_prev_month = () => show_month(addMonths(view_date, -1));
	const set_today = () => show_month(today_date, true);

	$: view_month_string = capitalize(view_date.toLocaleDateString('es-AR', { month: 'long' }));
	$: view_year_string = view_date.toLocaleDateString('es-AR', { year: 'numeric' });
	$: view_is_different_year = !isSameYear(view_date, today_date);
	$: view_is_same_month = isSameMonth(view_date, today_date);
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
		margin: var(--header-margin, 0 0 0rem 0);
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
