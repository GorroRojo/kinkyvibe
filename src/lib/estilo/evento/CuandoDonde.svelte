<script>
	/**
	 * «Cuándo y dónde» de la maqueta: fecha, horario y lugar, y siempre un mapa chico (las
	 * baldosas estáticas de VenueMap) debajo del lugar y ARRIBA de «Ver en Google Maps» (pedido de
	 * gorrite). Con lugar vinculado, VenueLocation (`part="where"`) respeta las reglas de cada
	 * nivel de privacidad (y «Te mandamos la dirección con tu entrada.» cuando no se ve); el mapa
	 * y el link a Google Maps, solo en los niveles que muestran la dirección, como en la página
	 * real. Sin lugar vinculado, el «Dónde» del .md (`location`, con su link al mapa
	 * `location_map`) u «Online» (eventPlace.js, lo mismo que el .ics).
	 * Props: `meta`, `venue` (VenueView o null), `mapa` (false: sin el mapa chico, p. ej. cancelado).
	 */
	import { CalendarDays, Clock, Globe, MapPin } from '@lucide/svelte';
	import VenueLocation from '$lib/components/amigues/VenueLocation.svelte';
	import VenueMap from '$lib/components/amigues/VenueMap.svelte';
	import { googleMapsLink, showsAddress } from '$lib/utils/venues.js';
	import { eventPlace } from '$lib/utils/eventPlace.js';
	import { MAP_LABEL } from '$lib/utils/icsFeed.js';
	import { argDateTimeLong, argTime, eventEnd } from '$lib/utils/dates.js';

	/** @type {Record<string, any>} */
	export let meta;
	/** @type {import('$lib/utils/venues.js').VenueView | null} */
	export let venue;
	export let mapa = true;

	$: end = eventEnd(meta.start, meta.end);
	$: dia = argDateTimeLong(meta.start, { time: false });
	// Si termina otro día (pasada la medianoche o eventos de varios días), con el día del final.
	$: diaFin = argDateTimeLong(end, { time: false });
	$: horas =
		diaFin === dia
			? `${argTime(meta.start)} a ${argTime(end)}`
			: `${argTime(meta.start)} a ${argTime(end)} del ${diaFin}`;
	$: place = eventPlace(meta, venue);
	$: gmaps = venue ? googleMapsLink(venue) : undefined;
	$: map =
		mapa && venue && showsAddress(venue.level) && venue.lat !== undefined && venue.lng !== undefined
			? { lat: venue.lat, lng: venue.lng, label: venue.name ?? venue.address ?? '' }
			: null;
</script>

<section class="cuando-donde surface-card" aria-labelledby="cuando-donde-titulo">
	<h2 id="cuando-donde-titulo">Cuándo y dónde</h2>
	<p class="linea">
		<CalendarDays size="1.1em" aria-hidden="true" />
		<time class="dt-start" datetime={meta.start}><strong>{dia}</strong></time>
	</p>
	<p class="linea">
		<Clock size="1.1em" aria-hidden="true" />
		<span>{horas}</span>
	</p>
	{#if venue}
		<div class="lugar">
			<VenueLocation view={venue} context="event" compact part="where" />
		</div>
	{:else}
		<p class="linea">
			<svelte:component
				this={place.text === 'Online' ? Globe : MapPin}
				size="1.1em"
				aria-hidden="true"
			/>
			<span class="p-location">{place.text}</span>
		</p>
	{/if}
	{#if map}
		<div class="mini-mapa">
			<VenueMap lat={map.lat} lng={map.lng} label={map.label} />
		</div>
	{/if}
	{#if gmaps}
		<p class="map-link">
			<a href={gmaps} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>
		</p>
	{:else if place.mapUrl}
		<p class="map-link">
			<a href={place.mapUrl} target="_blank" rel="noopener noreferrer">{MAP_LABEL}</a>
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
	.map-link {
		margin: var(--space-2xs) 0 0;
	}
	.map-link a {
		display: inline-block;
		padding: 0.3em 0.8em;
		border: 1px solid currentColor;
		border-radius: var(--radius-pill);
		font-size: var(--step--1);
		text-decoration: none;
	}
</style>
