<!--
	Start date for an event: a month already chosen (see prefillMonth) and a grid of its days,
	with NO day selected until someone clicks one. That keeps the "nobody publishes an old date by
	accident" rule while saving the month navigation. A plain date field is kept as an alternative.
	Keyboard: the grid is one tab stop; arrows move by day/week, Home/End go to the week's ends,
	PageUp/PageDown change month, Enter/Space choose.
-->
<script>
	import { tick } from 'svelte';
	import { describeDate, isValidDate, monthGrid, shiftMonth } from '$lib/utils/eventDraft.js';

	/** @type {string} YYYY-MM-DD or '' */
	export let value = '';
	/** @type {string} YYYY-MM shown */
	export let month;
	/** @type {string} YYYY-MM-DD, to mark past days */
	export let today;
	/** @type {number|undefined} 0 = Sunday … 6 = Saturday: the original event's weekday, highlighted */
	export let hintWeekday = undefined;
	export let id = 'ev-start-date';
	/** @type {string|undefined} */
	export let describedby = undefined;

	const WEEK = [
		['L', 'lunes'],
		['M', 'martes'],
		['M', 'miércoles'],
		['J', 'jueves'],
		['V', 'viernes'],
		['S', 'sábado'],
		['D', 'domingo']
	];

	// Month choices: from last month to 14 months ahead (plus the shown one, if outside).
	const base = today.slice(0, 7);
	$: months = [
		...new Set([...Array.from({ length: 16 }, (_, i) => shiftMonth(base, i - 1)), month])
	]
		.sort()
		.map((ym) => ({ ym, label: monthGrid(ym).label }));

	$: grid = monthGrid(month);
	/** @param {number} d */
	const dateOf = (d) => `${month}-${String(d).padStart(2, '0')}`;
	/** Monday-first weekday (0 = lunes) of day d. */
	/** @param {number} d */
	const colOf = (d) => (grid.offset + d - 1) % 7;
	/** 0 = Sunday… → Monday-first column */
	$: hintCol = hintWeekday === undefined ? -1 : (hintWeekday + 6) % 7;

	// Day that gets the tab stop: the chosen one if it's in this month, else the 1st.
	let focusDay = 1;
	$: if (value.startsWith(month + '-')) focusDay = Number(value.slice(8, 10));
	$: if (focusDay > grid.days) focusDay = grid.days;

	// A date typed in the plain field (or set from outside) moves the grid to its month.
	let lastValue = value;
	$: if (value !== lastValue) {
		lastValue = value;
		if (isValidDate(value)) month = value.slice(0, 7);
	}

	/** @type {HTMLElement} */
	let gridEl;

	/** @param {number} d */
	function choose(d) {
		value = dateOf(d);
		focusDay = d;
	}

	/** @param {number} n */
	async function changeMonth(n) {
		month = shiftMonth(month, n);
		await tick();
	}

	/** @param {number} d */
	async function focusOn(d) {
		if (d < 1) {
			await changeMonth(-1);
			d = monthGrid(month).days + d;
		} else if (d > grid.days) {
			d = d - grid.days;
			await changeMonth(1);
		}
		focusDay = d;
		await tick();
		/** @type {HTMLElement|null} */ (gridEl?.querySelector(`[data-day="${d}"]`))?.focus();
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		/** @type {Record<string, () => number>} */
		const moves = {
			ArrowLeft: () => focusDay - 1,
			ArrowRight: () => focusDay + 1,
			ArrowUp: () => focusDay - 7,
			ArrowDown: () => focusDay + 7,
			Home: () => focusDay - colOf(focusDay),
			End: () => focusDay + (6 - colOf(focusDay))
		};
		if (moves[e.key]) {
			e.preventDefault();
			focusOn(moves[e.key]());
		} else if (e.key === 'PageUp' || e.key === 'PageDown') {
			e.preventDefault();
			changeMonth(e.key === 'PageUp' ? -1 : 1).then(() => focusOn(Math.min(focusDay, grid.days)));
		}
	}
</script>

<div class="day-picker">
	<div class="head">
		<button type="button" class="nav" on:click={() => changeMonth(-1)} aria-label="Mes anterior"
			>‹</button
		>
		<select bind:value={month} aria-label="Mes" id="{id}-month">
			{#each months as m}<option value={m.ym}>{m.label}</option>{/each}
		</select>
		<button type="button" class="nav" on:click={() => changeMonth(1)} aria-label="Mes siguiente"
			>›</button
		>
	</div>
	<div
		class="days"
		role="group"
		aria-label="Días de {grid.label}"
		aria-describedby={describedby}
		bind:this={gridEl}
		on:keydown={onKeydown}
	>
		{#each WEEK as [short, long], col}
			<abbr class="wd" class:hint={col === hintCol} title={long}>{short}</abbr>
		{/each}
		{#each Array(grid.offset) as _}<span />{/each}
		{#each Array(grid.days) as _, i}
			{@const d = i + 1}
			{@const date = dateOf(d)}
			<button
				type="button"
				data-day={d}
				tabindex={d === focusDay ? 0 : -1}
				aria-pressed={value === date}
				aria-label={describeDate(date)}
				class:selected={value === date}
				class:past={date < today}
				class:today={date === today}
				class:hint={colOf(d) === hintCol}
				on:click={() => choose(d)}>{d}</button
			>
		{/each}
	</div>
	<label class="typed">
		<span>o escribila:</span>
		<input type="date" {id} bind:value />
	</label>
</div>

<style lang="scss">
	.day-picker {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		max-width: 22em;
	}
	.head {
		display: flex;
		gap: 0.4em;
		align-items: center;
		select {
			flex: 1;
		}
	}
	.nav {
		border: 0;
		background: var(--3-light, #f3eef6);
		border-radius: 50%;
		width: 2em;
		height: 2em;
		font-size: var(--step-0);
		cursor: pointer;
		flex: none;
	}
	.days {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.2em;
		text-align: center;
	}
	.wd {
		font-size: var(--step--1);
		opacity: 0.6;
		text-decoration: none;
		&.hint {
			opacity: 1;
			font-weight: bold;
			color: var(--1-dark);
		}
	}
	.days button {
		aspect-ratio: 1;
		min-height: 2.2em;
		border: 0;
		border-radius: 0.6em;
		background: white;
		outline: 1px solid #eee;
		outline-offset: -1px;
		font: inherit;
		font-size: var(--step--1);
		cursor: pointer;
		padding: 0;
		&.hint {
			background: #fff7fb;
		}
		&.past {
			opacity: 0.45;
		}
		&.today {
			outline: 2px solid var(--3, #999);
		}
		&.selected {
			background: var(--1);
			color: white;
			font-weight: bold;
			opacity: 1;
		}
		&:focus-visible {
			outline: 3px solid var(--2-dark, #333);
			outline-offset: 1px;
			position: relative;
			z-index: 1;
		}
	}
	.typed {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5em;
		font-size: var(--step--1);
		span {
			opacity: 0.75;
			color: inherit;
		}
		input {
			flex: 1;
			width: auto;
		}
	}
</style>
