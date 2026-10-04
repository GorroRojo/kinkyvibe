<script>
	/**
	 * La serie, después del texto (pedido de gorrite): «Edición 4 de <serie>» con la anterior y la
	 * siguiente, y el calendario de la serie (EventSeries `nav` y `after`, los reales).
	 */
	import EventSeries from '$lib/components/series/EventSeries.svelte';
	import { series } from './datos.js';
</script>

<section class="serie" aria-label="La serie">
	<EventSeries {series} part="nav" />
	<EventSeries {series} part="after" origin="https://example.invalid" />
</section>

<style>
	.serie :global(.event-series .next),
	.serie :global(.event-series .cal) {
		width: 100%;
		margin-inline: 0;
	}
</style>
