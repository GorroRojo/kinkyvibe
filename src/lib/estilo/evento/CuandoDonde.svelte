<script>
	/**
	 * Fecha, horario y lugar de las maquetas, en renglones con ícono. El lugar sale de
	 * VenueLocation (versión chica, `part="where"`), así respeta las reglas de cada nivel de
	 * privacidad igual que la página real.
	 * Props: `row` (en compu, fecha y lugar uno al lado del otro).
	 */
	import { CalendarDays, Clock } from '@lucide/svelte';
	import VenueLocation from '$lib/components/amigues/VenueLocation.svelte';
	import { fechaCorta, venue, START } from './datos.js';

	export let row = false;
	const f = fechaCorta();
</script>

<div class="cuando-donde" class:row>
	<p class="linea">
		<CalendarDays size="1.1em" aria-hidden="true" />
		<time datetime={START}><strong>{f.dia}</strong></time>
	</p>
	<p class="linea">
		<Clock size="1.1em" aria-hidden="true" />
		<span>{f.horas}</span>
	</p>
	<div class="linea lugar">
		<VenueLocation view={venue} context="event" compact part="where" />
	</div>
</div>

<style>
	.cuando-donde {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	.linea {
		display: flex;
		align-items: baseline;
		gap: var(--space-2xs);
		margin: 0;
	}
	.linea :global(svg) {
		flex: none;
		color: var(--2-dark);
		translate: 0 0.15em;
	}
	.lugar {
		display: block;
	}
	.lugar :global(.where svg) {
		margin-right: var(--space-2xs);
	}
	@media (min-width: 900px) {
		.row {
			flex-direction: row;
			flex-wrap: wrap;
			gap: var(--space-2xs) var(--space-m);
		}
	}
</style>
