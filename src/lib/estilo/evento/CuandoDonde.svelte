<script>
	/**
	 * «Cuándo y dónde» de la maqueta: fecha, horario y lugar, y siempre un mapa chico (las
	 * baldosas estáticas de VenueMap) debajo del lugar y ARRIBA de «Ver en Google Maps» (pedido de
	 * gorrite). El lugar sale de VenueLocation (`part="where"`), así respeta las reglas de cada
	 * nivel de privacidad; el mapa y el link a Google Maps, solo en los niveles que muestran la
	 * dirección (`showsAddress`, `googleMapsLink`), como en la página real.
	 */
	import { CalendarDays, Clock } from '@lucide/svelte';
	import VenueLocation from '$lib/components/amigues/VenueLocation.svelte';
	import VenueMap from '$lib/components/amigues/VenueMap.svelte';
	import { googleMapsLink, showsAddress } from '$lib/utils/venues.js';
	import { fechaCorta, venue, START } from './datos.js';

	const f = fechaCorta();
	const gmaps = googleMapsLink(venue);
	const map = showsAddress(venue.level) && venue.lat !== undefined && venue.lng !== undefined;
</script>

<section class="cuando-donde surface-card" aria-labelledby="cuando-donde-titulo">
	<h2 id="cuando-donde-titulo">Cuándo y dónde</h2>
	<p class="linea">
		<CalendarDays size="1.1em" aria-hidden="true" />
		<time datetime={START}><strong>{f.dia}</strong></time>
	</p>
	<p class="linea">
		<Clock size="1.1em" aria-hidden="true" />
		<span>{f.horas}</span>
	</p>
	<div class="lugar">
		<VenueLocation view={venue} context="event" compact part="where" />
	</div>
	{#if map && venue.lat !== undefined && venue.lng !== undefined}
		<div class="mini-mapa">
			<VenueMap lat={venue.lat} lng={venue.lng} label={venue.name ?? venue.address ?? ''} />
		</div>
	{/if}
	{#if gmaps}
		<p class="gmaps">
			<a href={gmaps} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>
		</p>
	{/if}
</section>

<style>
	.cuando-donde {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
		line-height: 1.35;
	}
	h2 {
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-lg);
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
	.lugar :global(.where svg) {
		margin-right: var(--space-2xs);
		color: var(--2-dark);
	}
	/* El «Ver en Google Maps» de VenueLocation va abajo del mapa (el de acá). */
	.lugar :global(.gmaps) {
		display: none;
	}
	.mini-mapa {
		margin-top: var(--space-2xs);
	}
	.mini-mapa :global(figure) {
		margin: 0;
	}
	/* El mismo «Ver en Google Maps» de VenueLocation (píldora con borde). */
	.gmaps {
		margin: var(--space-2xs) 0 0;
	}
	.gmaps a {
		display: inline-block;
		padding: 0.3em 0.8em;
		border: 1px solid currentColor;
		border-radius: var(--radius-pill);
		font-size: var(--step--1);
		text-decoration: none;
	}
</style>
