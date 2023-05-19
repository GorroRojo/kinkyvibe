<script>
	import Calendar from '$lib/components/Calendar.svelte';
	import { isSameDay, setDate } from 'date-fns';
	const data = [
		{ date: setDate(new Date(), 21), events: [{ color: '#f00' }] },
		{ date: setDate(new Date(), 21), events: [{ color: '#0ff' }] },
		{ date: setDate(new Date(), 2), events: [{ color: '#ff0' }] },
		{ date: setDate(new Date(), 3), events: [{ color: '#f0f' }] }
	];
</script>

<svelte:head>
	<title>KinkyVibe.ar - Calendario</title>
</svelte:head>
<div id="calendar">
	<Calendar let:date let:today let:past>
		{@const day = data.find((a) => isSameDay(a.date, date))}
		<button
			class:today
			class:past
			disabled={!day}
			on:click={() =>
				alert(
					`You selected the date ${date.toLocaleDateString(undefined)}.` +
						(today ? `\nThis date is today!` : '')
				)}
		>
			<div class="date" class:today>
				{date.toLocaleDateString('es-AR', { day: 'numeric' })}
			</div>
			{#if day}
				<div class="dot" />
				{#each day.events as event}
					 <div class="bar" style:background-color={event.color || null} />
				{/each}
			{/if}
		</button>
	</Calendar>
</div>

<!-- <style>
    /* --header-margin
--month-font-weight
--month-font-size
--week-days-color
--week-days-font-weight
--week-days-margin
--cell-height */
</style> -->

<style lang="scss">
	#calendar {
		max-width: 800px;
		margin-inline: auto;
		height: 30em;
	}
	.date {
		display: grid;
		place-content: center;
		border-radius: 99999px;
		aspect-ratio: 1/1;
		width: 1.3em;
		margin: auto;
		font-size: 2em;
		color: rgba(1, 1, 1, 0.5);
	}

	.date.today {
		/* background-color: #ff6f00; */
		scale: 1.2;
	}
	button.past:not(:has(.dot)) {
		background: rgba(250, 250, 250, 0.5);
		cursor: unset;
	}
	button.past .date {
		color: rgba(1, 1, 1, 0.2);
	}

	.bar {
		height: 1em;
		position: absolute;
		top: 0;
		z-index: 3;
		left: 0;
		right: 0;
	}

	.dot {
		/* height: 1.4em; */
	}

	button {
		width: 100%;
		height: 100%;
		border: 0;
		background-color: white;
		border-radius: 1em;
		transition: all 0.1s ease-in;
		/* border-bottom: 1px solid gray; */
		padding: 0;
		scale: 0.9;
		position: relative;
	}

	button:not(.past):hover {
	}
	button.today {
		outline: 2px solid var(--1);
	}
	button:has(.dot) {
		cursor: pointer;
		background: var(--1);
		.date {
			color: white;
		}
		&:hover {
			scale: 1;
		}
	}
</style>
