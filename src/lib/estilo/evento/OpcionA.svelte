<script>
	/**
	 * Opción A, «Afiche arriba»: el afiche manda. Celu: afiche, serie y título, franja de cuándo y
	 * dónde, comprar, acciones, mapa, y después el resto. Compu: afiche a la izquierda y título,
	 * franja y comprar a la derecha (todo lo importante sin bajar); el resto, en una columna.
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

<article class="opcion-a">
	<header class="hero">
		<img class="afiche" src={meta.featured} alt="Afiche del evento" />
		<div class="hero-texto">
			<p class="serie"><TagChip tag={s.id} href={s.href} /></p>
			<h1>{meta.title}</h1>
			<p class="por">por {meta.authors.join(' y ')}</p>
			<div class="navs">
				<EventSeries {series} part="nav" />
				<PartesTaller {partes} part="nav" />
			</div>
			{#if past}<NotaPasado />{/if}
			<div class="franja surface-card">
				<CuandoDonde />
			</div>
			{#if !past}<Compra {tickets} wide />{/if}
			<Acciones {past} align="start" />
		</div>
	</header>

	<section class="mapa surface-card" aria-label="Mapa y cómo llegar">
		<VenueLocation view={venue} context="event" compact part="more" />
	</section>

	<div class="cuerpo">
		<PartesTaller {partes} part="list" />
		<PersonasConRol groups={personas} />
		<div class="etiquetas"><Tags tags={meta.tags} /></div>
		<div class="content texto"><ContenidoLargo /></div>
		<EventSeries {series} part="after" origin="https://example.invalid" />
	</div>
</article>

<style>
	.opcion-a {
		max-width: 64rem;
		margin: 0 auto;
		padding: var(--space-s) var(--space-xs) var(--space-xl);
		display: flex;
		flex-direction: column;
		gap: var(--space-m);
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.afiche {
		width: 100%;
		max-height: 26rem;
		object-fit: cover;
		object-position: top;
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
	}
	.hero-texto {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		min-width: 0;
	}
	.hero-texto > * {
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
	.franja {
		padding: var(--space-xs) var(--space-s);
	}
	.mapa {
		width: 100%;
		max-width: 40rem;
		margin-inline: auto;
		padding: var(--space-xs) var(--space-s);
		font-size: var(--text-sm);
	}
	.cuerpo {
		display: flex;
		flex-direction: column;
		gap: var(--space-m);
		width: 100%;
		max-width: 44rem;
		margin-inline: auto;
	}
	.cuerpo > :global(*) {
		margin-block: 0;
	}
	.etiquetas :global(ul),
	.etiquetas :global(.tags) {
		justify-content: flex-start;
	}
	.texto {
		margin-top: 0;
		padding-inline: 0;
	}
	@media (min-width: 900px) {
		.hero {
			display: grid;
			grid-template-columns: minmax(16rem, 2fr) 3fr;
			align-items: start;
			gap: var(--space-l);
		}
		.afiche {
			max-height: none;
			aspect-ratio: 4 / 5;
		}
	}
	/* Las tarjetas de los componentes reales (partes, calendario de la serie), al ancho de la
	   columna de la maqueta. */
	.cuerpo :global(.partes),
	.cuerpo :global(.event-series .next),
	.cuerpo :global(.event-series .cal) {
		width: 100%;
		margin-inline: 0;
	}
</style>
