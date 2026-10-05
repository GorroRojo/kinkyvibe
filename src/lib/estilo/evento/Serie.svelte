<script>
	/**
	 * La serie, después del texto (pedido de gorrite): «Edición 4 de <serie>» con la anterior y la
	 * siguiente, «Seguir la serie» y el calendario de la serie («Suscribite a las fechas»), con
	 * los componentes reales.
	 * Props: `past` (el evento ya pasó: «Seguir la serie» en vez de «Seguir <serie>»).
	 */
	import EventSeries from '$lib/components/series/EventSeries.svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import { series } from './datos.js';

	export let past = false;
	const s = series.list[0];
</script>

<section class="serie" aria-label="La serie">
	<EventSeries {series} part="nav" />
	<div class="seguir">
		<FollowButton
			kind="etiqueta"
			key={s.id}
			name={s.name}
			label={past ? 'Seguir la serie' : `Seguir ${s.name}`}
			inline
		/>
	</div>
	<EventSeries {series} part="after" origin="https://example.invalid" />
</section>

<style>
	.seguir {
		display: flex;
		justify-content: center;
	}
	.serie :global(.edition-nav) {
		margin-inline: 0;
	}
	.serie :global(.event-series .next),
	.serie :global(.event-series .cal) {
		width: 100%;
		margin-inline: 0;
	}
</style>
