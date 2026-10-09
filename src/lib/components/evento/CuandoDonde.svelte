<script>
	/**
	 * «Cuándo y dónde» de la página de un evento (maqueta final aprobada por gorrite): fecha y hora
	 * de comienzo, hasta cuándo, el lugar y un mapa chico ARRIBA de «Ver en Google Maps».
	 *
	 * - Con lugar vinculado, VenueLocation (`part="where"`) con las reglas de cada nivel de
	 *   privacidad (lo que llega ya viene filtrado por el servidor). Cuando no se ve la dirección:
	 *   «Te mandamos la dirección con tu entrada.» si el evento vende entradas acá (`entradas`); si
	 *   no, «La dirección exacta no se publica.» (no hay entrada que la lleve). El mapa chico y «Ver en Google Maps», solo en los niveles que
	 *   muestran la dirección y si el lugar tiene coordenadas.
	 * - Sin lugar vinculado, el «Dónde» del evento (`location`, con su link al mapa `location_map`)
	 *   y su nombre (`location_name`), u «Online» si el evento es online (eventPlace.js, lo mismo
	 *   que el .ics); sin nada de eso, sin renglón del lugar. Sin coordenadas no hay mapa chico:
	 *   nunca se geocodifica ni se inventa una ubicación.
	 *
	 * La hora va en 24 h a la argentina, con el día de la semana (`argDateTimeLong`).
	 *
	 * Props: `meta` (la del evento), `venue` (VenueView o null), `mapa` (false: sin el mapa chico,
	 * p. ej. un evento cancelado), `entradas` (true: se venden entradas en el sitio).
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
	export let venue = null;
	export let mapa = true;
	export let entradas = false;

	/** @param {string | number | Date} s */
	const toISO = (s) => {
		try {
			return new Date(s).toISOString();
		} catch {
			return String(s);
		}
	};

	$: end = eventEnd(meta.start, meta.end);
	// Si termina el mismo día, solo la hora; si no (pasada la medianoche o varios días), con el día.
	$: sameDay =
		argDateTimeLong(end, { time: false }) === argDateTimeLong(meta.start, { time: false });
	$: place = eventPlace(meta, venue);
	$: gmaps = venue ? googleMapsLink(venue) : undefined;
	$: map =
		mapa &&
		venue &&
		showsAddress(venue.level) &&
		typeof venue.lat === 'number' &&
		typeof venue.lng === 'number'
			? { lat: venue.lat, lng: venue.lng, label: venue.name ?? venue.address ?? '' }
			: null;
</script>

<section class="cuando-donde surface-card" aria-labelledby="cuando-donde-titulo">
	<h2 id="cuando-donde-titulo">Cuándo y dónde</h2>
	<p class="linea">
		<CalendarDays size="1.1em" aria-hidden="true" />
		<strong
			><time class="dt-start" datetime={meta.start}>{argDateTimeLong(meta.start)}</time></strong
		>
	</p>
	<p class="linea">
		<Clock size="1.1em" aria-hidden="true" />
		<span
			>{sameDay ? 'hasta las' : 'hasta el'}
			<time class="dt-end" datetime={toISO(end)}
				>{sameDay ? argTime(end) : argDateTimeLong(end)}</time
			></span
		>
	</p>
	{#if venue}
		<div class="lugar">
			<VenueLocation
				view={venue}
				context="event"
				compact
				part="where"
				mapsLink={false}
				{entradas}
			/>
		</div>
	{:else if place.text}
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
	{:else if !venue && place.mapUrl}
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
	.mini-mapa {
		margin-top: var(--space-2xs);
	}
	.mini-mapa :global(figure) {
		margin: 0;
		width: 100%;
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
