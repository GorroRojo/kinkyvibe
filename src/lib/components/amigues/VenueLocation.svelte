<script>
	/**
	 * La ubicación de un lugar según su privacidad (lo que llega ya viene filtrado por el
	 * servidor: `venueView` en src/lib/utils/venues.js). En la página de un evento dice "Sucede en";
	 * en la del lugar, solo la dirección.
	 * Props: `view` (VenueView), `context` ('event' | 'venue').
	 */
	import { MapPin } from '@lucide/svelte';
	import { ADDRESS_FOR_BUYERS, showsAddress } from '$lib/utils/venues.js';
	import VenueMap from './VenueMap.svelte';

	/** @type {import('$lib/utils/venues.js').VenueView} */
	export let view;
	/** @type {'event' | 'venue'} */
	export let context = 'event';

	$: place = [view.area, view.city].filter(Boolean).join(', ');
</script>

<section class="venue" aria-label={context === 'event' ? 'Dónde' : 'Ubicación'}>
	<p class="where">
		<MapPin size="1.1em" aria-hidden="true" />
		{#if context === 'event'}
			{#if view.level === 'public' || view.level === 'name'}
				Sucede en <a href={view.href} class="p-location">{view.name}</a
				>{#if view.level === 'public' && view.address}: <span class="address">{view.address}</span
					>{/if}
				{#if view.level === 'public' && place}<span class="place">({place})</span>{/if}
			{:else if view.level === 'address' && (view.address || place)}
				Sucede en <span class="p-location"
					>{#if view.address}<span class="address">{view.address}</span>{/if}
					{#if place}<span class="place">{view.address ? `(${place})` : place}</span>{/if}</span
				>
			{:else if view.level === 'area' && place}
				Sucede en <span class="p-location">{place}</span>
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
</section>

<style>
	.venue {
		max-width: 70ch;
		margin: 1em auto;
		padding-inline: 16px;
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
	h4 {
		margin: 1em 0 0.3em;
	}
</style>
