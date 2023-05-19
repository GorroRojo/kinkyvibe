<script>
	import Calendar from '$lib/components/Calendar.svelte';
	import { isSameDay, setDate } from 'date-fns';
	const data = [
		{
			date: setDate(new Date(), 21),
			events: [
				{ color: '#f00', name: 'picantearla' },
				{ color: '#0ff', name: 'durx' }
			]
		},
		{ date: setDate(new Date(), 2), events: [{ color: '#ff0', name: 'dissidir' }] },
		{ date: setDate(new Date(), 3), events: [{ color: '#f0f', name: 'taller dominaciónismo' }] }
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
					<a class="bar" style:--evt-color={event.color || null}>
						<span>{event.name ?? ' '}</span>
					</a>
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
		}
		.bar {
			display: grid;
			place-content: center;
			height: 0.2em;
			margin-inline: -0.2em;
			background: white;
			border-radius: 0.3em;
			font-size: 1.5em;
			z-index: 1;
			word-break: break-word;
			outline: 3px solid var(--evt-color);
			outline-offset: -2px;
			overflow: hidden;
			transition: 200ms ease-in;
			span {
				text-transform: capitalize;
				color: #555;
			}
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
			}
		}
	}
</style>
