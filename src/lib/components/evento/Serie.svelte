<script>
	/**
	 * La serie del evento, al final de la página (pedido de gorrite): «Edición 4 de <serie>» con la
	 * anterior y la siguiente y, con EventSeries `after`, la próxima edición si el evento ya pasó y
	 * una sola tarjeta «Próximas fechas de <serie>» (SeriesFollowCard: «Seguir la serie»
	 * con cuenta, el mail de «Avisame si se repite» sin cuenta, y el calendario de la serie; la de
	 * la primera serie lleva el ancla `#seguir`).
	 * Props: `series` (como `loadSeries`), `origin` (origen del sitio, para el link del calendario).
	 */
	import EventSeries from '$lib/components/series/EventSeries.svelte';

	/** @type {any} */
	export let series;
	export let origin = '';
</script>

<section class="serie" aria-label="La serie">
	<EventSeries {series} part="nav" />
	<EventSeries {series} part="after" {origin} />
</section>

<style>
	.serie {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.serie :global(.edition-nav) {
		margin-inline: 0;
	}
	.serie :global(.event-series .next),
	.serie :global(.event-series .serie-card) {
		width: 100%;
		margin-inline: 0;
	}
</style>
