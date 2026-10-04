<script>
	/**
	 * Opción B, «Dos columnas con lateral»: en compu, el texto a la izquierda y a la derecha una
	 * columna fija (sticky) con cuándo, dónde, comprar, acciones y el mapa, que acompaña mientras
	 * se lee. En el celu, la columna de la derecha se mete entre el encabezado y el texto.
	 */
	import { TagChip } from '$lib/components/ui';
	import Tags from '$lib/components/Tags.svelte';
	import PersonasConRol from '$lib/components/PersonasConRol.svelte';
	import EventSeries from '$lib/components/series/EventSeries.svelte';
	import PartesTaller from '$lib/components/PartesTaller.svelte';
	import VenueLocation from '$lib/components/amigues/VenueLocation.svelte';
	import CuandoDonde from './CuandoDonde.svelte';
	import Compra from './Compra.svelte';
	import Acciones from './Acciones.svelte';
	import NotaPasado from './NotaPasado.svelte';
	import ContenidoLargo from './ContenidoLargo.svelte';
	import { meta, venue, tickets, series, partes, personas } from './datos.js';

	export let past = false;
	const s = series.list[0];
</script>

<article class="opcion-b">
	<header class="cabeza">
		<p class="serie"><TagChip tag={s.id} href={s.href} /></p>
		<h1>{meta.title}</h1>
		<p class="por">por {meta.authors.join(' y ')}</p>
		<div class="navs">
			<EventSeries {series} part="nav" />
			<PartesTaller {partes} part="nav" />
		</div>
	</header>

	<aside class="lateral" aria-label="Cuándo, dónde y entradas">
		<div class="lateral-fijo">
			{#if past}<NotaPasado />{/if}
			<div class="info surface-card">
				<img class="miniatura" src={meta.featured} alt="Afiche del evento" />
				<CuandoDonde />
				{#if !past}<Compra {tickets} wide />{/if}
			</div>
			<Acciones {past} />
			<section class="mapa surface-card" aria-label="Mapa y cómo llegar">
				<VenueLocation view={venue} context="event" compact part="more" />
			</section>
		</div>
	</aside>

	<div class="principal">
		<PersonasConRol groups={personas} />
		<div class="content texto"><ContenidoLargo /></div>
		<PartesTaller {partes} part="list" />
		<div class="etiquetas"><Tags tags={meta.tags} /></div>
		<EventSeries {series} part="after" origin="https://example.invalid" />
	</div>
</article>

<style>
	.opcion-b {
		max-width: 72rem;
		margin: 0 auto;
		padding: var(--space-s) var(--space-xs) var(--space-xl);
		display: grid;
		grid-template-areas: 'cabeza' 'lateral' 'principal';
		gap: var(--space-m);
	}
	.cabeza {
		grid-area: cabeza;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.cabeza > * {
		margin: 0;
	}
	h1 {
		font-size: var(--text-2xl);
		line-height: 1.15;
		text-align: start;
		max-width: none;
		margin: 0;
	}
	.por {
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.navs {
		text-align: start;
	}
	.navs :global(.edition-nav),
	.navs :global(.part-nav) {
		margin-inline: 0;
		text-align: start;
	}
	.lateral {
		grid-area: lateral;
		min-width: 0;
	}
	.lateral-fijo {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.info {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
		padding: var(--space-s);
	}
	.miniatura {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		object-position: top;
		border-radius: var(--radius-m);
	}
	.mapa {
		padding: var(--space-xs) var(--space-s);
		font-size: var(--text-sm);
	}
	.principal {
		grid-area: principal;
		display: flex;
		flex-direction: column;
		gap: var(--space-m);
		min-width: 0;
	}
	.principal > :global(*) {
		margin-block: 0;
	}
	.texto {
		margin-top: 0;
		padding-inline: 0;
	}
	.texto > :global(*) {
		margin-inline: 0;
	}
	@media (min-width: 900px) {
		.opcion-b {
			grid-template-columns: minmax(0, 1fr) 22rem;
			grid-template-areas: 'cabeza lateral' 'principal lateral';
			grid-template-rows: auto 1fr;
			column-gap: var(--space-l);
		}
		.lateral-fijo {
			position: sticky;
			top: var(--space-s);
			/* Si no entra en la pantalla, la columna se desplaza sola. */
			max-height: calc(100vh - 2 * var(--space-s));
			overflow-y: auto;
			padding: var(--space-3xs);
		}
	}
	/* Las tarjetas de los componentes reales (partes, calendario de la serie), al ancho de la
	   columna de la maqueta. */
	.principal :global(.partes),
	.principal :global(.event-series .next),
	.principal :global(.event-series .cal) {
		width: 100%;
		margin-inline: 0;
	}
</style>
