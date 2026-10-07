<script>
	/**
	 * La ubicación de un lugar según su privacidad (lo que llega ya viene filtrado por el
	 * servidor: `venueView` en src/lib/utils/venues.js). En la página de un evento dice "Sucede en";
	 * en la del lugar, solo la dirección.
	 * Props: `view` (VenueView), `context` ('event' | 'venue'), `compact` (la versión chica para la
	 * tarjeta del evento: lo mismo que se ve en cada nivel, sin el "Sucede en" ni márgenes; la
	 * tarjeta ya dice «en»), `part` ('all': todo junto; en la página de un evento se parte en
	 * 'where', la dirección y «Ver en Google Maps» en la tarjeta, y 'more', el mapa, «Cómo llegar» y
	 * «Accesibilidad», que van después del botón de comprar), `mapsLink` (false: sin «Ver en Google
	 * Maps», para quien lo pone en otro lado, como «Cuándo y dónde» del evento, abajo del mapa).
	 */
	import { MapPin } from '@lucide/svelte';
	import { ADDRESS_FOR_BUYERS, googleMapsLink, showsAddress } from '$lib/utils/venues.js';
	import VenueMap from './VenueMap.svelte';
	import Self from './VenueLocation.svelte';

	/** @type {import('$lib/utils/venues.js').VenueView} */
	export let view;
	/** @type {'event' | 'venue'} */
	export let context = 'event';
	export let compact = false;
	/** @type {'all' | 'where' | 'more'} */
	export let part = 'all';
	export let mapsLink = true;

	$: place = [view.area, view.city].filter(Boolean).join(', ');
	/* "Ver en Google Maps": solo en los niveles que muestran la dirección (pedido de gorrite). */
	$: gmaps = googleMapsLink(view);
</script>

{#if part !== 'more'}
	<section class="venue" class:compact aria-label={context === 'event' ? 'Dónde' : 'Ubicación'}>
		<p class="where">
			<MapPin size="1.1em" aria-hidden="true" />
			{#if context === 'event'}
				{#if view.level === 'public' || view.level === 'name'}
					{#if !compact}Sucede en{/if}
					<a href={view.href} class="p-location">{view.name}</a
					>{#if view.level === 'public' && view.address}{compact ? ' · ' : ': '}<span
							class="address">{view.address}</span
						>{/if}
					{#if view.level === 'public' && place}<span class="place">({place})</span>{/if}
				{:else if view.level === 'address' && (view.address || place)}
					{#if !compact}Sucede en{/if}
					<span class="p-location"
						>{#if view.address}<span class="address">{view.address}</span>{/if}
						{#if place}<span class="place">{view.address ? `(${place})` : place}</span>{/if}</span
					>
				{:else if view.level === 'area' && place}
					{#if !compact}Sucede en{/if}
					<span class="p-location">{place}</span>
				{:else}
					Lugar a confirmar
				{/if}
			{:else if view.level === 'public' && (view.address || place)}
				<span class="address">{view.address ?? ''}</span>
				{#if place}<span class="place">{view.address ? `(${place})` : place}</span>{/if}
			{:else if view.level === 'area' && place}
				<span class="place">{place}</span>
			{:else}
				La dirección se comparte con quienes compran entrada para sus eventos.
			{/if}
		</p>
		{#if context === 'event' && !showsAddress(view.level)}
			<p class="note">{ADDRESS_FOR_BUYERS}</p>
		{/if}
		{#if gmaps && mapsLink}
			<p class="gmaps">
				<a href={gmaps} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>
			</p>
		{/if}
		{#if part === 'all'}
			<Self {view} {context} {compact} part="more" />
		{/if}
	</section>
{:else}
	<div class="venue-more" class:compact>
		<!-- El mapa, también en "Sólo dirección" (decisión de gorrite); ahí sin el nombre. -->
		{#if showsAddress(view.level) && view.lat !== undefined && view.lng !== undefined}
			<VenueMap lat={view.lat} lng={view.lng} label={view.name ?? view.address ?? ''} />
		{/if}
		{#if view.level === 'public' && view.howTo}
			<h4>Cómo llegar</h4>
			<p class="text">{view.howTo}</p>
		{/if}
		{#if view.level === 'public' && view.accessibility}
			<h4>Accesibilidad</h4>
			<p class="text">{view.accessibility}</p>
		{/if}
	</div>
{/if}

<style>
	.venue {
		max-width: 70ch;
		margin: 1em auto;
		padding-inline: var(--space-xs);
	}
	.where {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3em;
		font-size: var(--step-0);
	}
	.place,
	.note {
		opacity: 0.8;
	}
	.note {
		font-size: var(--step--1);
		margin-top: 0.2em;
	}
	.text {
		white-space: pre-line;
	}
	.gmaps {
		margin: 0.4em 0;
	}
	.gmaps a {
		display: inline-block;
		padding: 0.3em 0.8em;
		border: 1px solid currentColor;
		border-radius: var(--radius-pill);
		font-size: var(--step--1);
		text-decoration: none;
	}
	h4 {
		margin: 1em 0 0.3em;
	}
	/* En la tarjeta del evento: el texto corre seguido (con el ícono al principio) y hereda el
	   tamaño y el color de la tarjeta. */
	.compact {
		max-width: none;
		margin: 0;
		padding: 0;
	}
	.compact .where {
		display: block;
		margin: 0;
		font-size: inherit;
	}
	.compact .where :global(svg) {
		vertical-align: -0.15em;
	}
	.compact :global(a) {
		color: inherit;
	}
	.compact .note,
	.compact .gmaps {
		margin: 0.3em 0 0;
	}
	.compact :global(.venue-map) {
		margin: 0.6em 0 0.2em;
	}
	.compact :global(.venue-map .frame) {
		margin-inline: 0;
	}
	.compact :global(.venue-map figcaption) {
		text-align: start;
	}
	.compact h4 {
		margin: 0.6em 0 0.1em;
		font-size: var(--step-0);
	}
	.compact .text {
		margin: 0;
		font-size: var(--step-0);
	}
</style>
