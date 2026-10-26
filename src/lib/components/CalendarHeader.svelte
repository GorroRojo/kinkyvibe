<script>
	//@ts-nocheck
	import { addMonths, format } from 'date-fns';
	import { calendarMonthHref, currentMonth, isLinkedCalendarMonth } from '$lib/utils/allPosts';
	import { ArrowLeft, Home, ArrowRight } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	/** @type {Date} the month being shown */
	export let view_date;
	/** @type {string} yyyy-MM the page opens on without ?viewdate */
	export let default_month;
	/**
	 * yyyy-MM of the oldest and newest event. Between them the arrows are real links
	 * (`<a href="?viewdate=…">`) so search engines can reach every month with events; outside,
	 * they stay buttons (no links to endless empty months). docs/seo.md.
	 * @type {string | null | undefined}
	 */
	export let first_month = undefined;
	/** @type {string | null | undefined} */
	export let last_month = undefined;

	/** El mes de hoy en hora de Argentina (no la del navegador), yyyy-MM. */
	const this_month = currentMonth();

	/**
	 * Move to another month through the URL, so back/forward work and nothing global is written.
	 * The page's loads don't read the query string, so this doesn't refetch anything.
	 * @param {string} month yyyy-MM
	 * @param {boolean} [replaceState]
	 */
	const show_month = (month, replaceState = false) =>
		goto(calendarMonthHref($page.url, month, default_month), {
			replaceState,
			noScroll: true,
			keepFocus: true
		});

	function capitalize(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}
	$: next_month = format(addMonths(view_date, 1), 'yyyy-MM');
	$: prev_month = format(addMonths(view_date, -1), 'yyyy-MM');
	$: next_linked = isLinkedCalendarMonth(next_month, first_month, last_month);
	$: prev_linked = isLinkedCalendarMonth(prev_month, first_month, last_month);
	const set_next_month = () => show_month(next_month);
	const set_prev_month = () => show_month(prev_month);
	const set_today = () => show_month(this_month, true);

	$: view_month_string = capitalize(view_date.toLocaleDateString('es-AR', { month: 'long' }));
	$: view_year_string = view_date.toLocaleDateString('es-AR', { year: 'numeric' });
	$: view_month = format(view_date, 'yyyy-MM');
	$: view_is_different_year = view_month.slice(0, 4) !== this_month.slice(0, 4);
	$: view_is_same_month = view_month === this_month;
</script>

<div class="header">
	<span class="month">
		{view_month_string}
		{#if view_is_different_year}
			{view_year_string}
		{/if}
	</span>

	<div>
		{#if prev_linked}
			<a
				href={calendarMonthHref($page.url, prev_month, default_month)}
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				aria-label="Previous Month"
			>
				<ArrowLeft />
			</a>
		{:else}
			<button on:click={set_prev_month} aria-label="Previous Month"> <ArrowLeft /> </button>
		{/if}
		<button on:click={set_today} aria-label="today" disabled={view_is_same_month}>
			<Home />
		</button>
		{#if next_linked}
			<a
				href={calendarMonthHref($page.url, next_month, default_month)}
				data-sveltekit-noscroll
				data-sveltekit-keepfocus
				aria-label="Next Month"
			>
				<ArrowRight />
			</a>
		{:else}
			<button on:click={set_next_month} aria-label="Next Month"> <ArrowRight /> </button>
		{/if}
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
		font-weight: var(--month-font-weight, 700);
		font-size: var(--month-font-size, 2rem);
	}
	button,
	a {
		background: transparent;
		color: #222;
		border: 0;
		border-radius: var(--radius-s);
		padding: 1em;
		cursor: pointer;
	}
	/* The arrow links look exactly like the buttons: the browser's button font size (which the
	   1em padding is based on), its line height, no underline and no hover colour. */
	a {
		display: inline-block;
		font-size: 13.3333px;
		line-height: normal;
		text-decoration: none;
	}
	a:hover {
		color: #222;
	}
</style>
