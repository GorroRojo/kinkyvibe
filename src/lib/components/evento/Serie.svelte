<script>
	/**
	 * La serie del evento, al final de la página (pedido de gorrite): «Edición 4 de <serie>» con la
	 * anterior y la siguiente, «Seguir <serie>» («Lo que sigo»: sus fechas nuevas por mail y en tu
	 * calendario) y, con EventSeries `after`, la próxima edición y «Avisame si se repite» si el
	 * evento ya pasó, y el calendario de la serie.
	 * Props: `series` (como `loadSeries`), `past` («Seguir la serie» en vez de «Seguir <serie>»),
	 * `origin` (origen del sitio, para el link del calendario).
	 */
	import EventSeries from '$lib/components/series/EventSeries.svelte';
	import FollowButton from '$lib/components/FollowButton.svelte';
	import { mainSeries } from '$lib/utils/eventPage.js';

	/** @type {any} */
	export let series;
	export let past = false;
	export let origin = '';
	$: s = mainSeries(series);
</script>

<section class="serie" aria-label="La serie">
	<EventSeries {series} part="nav" />
	{#if s}
		<div class="seguir">
			<FollowButton
				kind="etiqueta"
				key={s.id}
				name={s.name}
				label={past ? 'Seguir la serie' : `Seguir ${s.name}`}
				inline
			/>
		</div>
	{/if}
	<EventSeries {series} part="after" {origin} />
</section>

<style>
	.serie {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
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
