<script>
	/**
	 * Opción C, «Tarjetas por sección»: una sola columna en todas las pantallas, cada cosa en su
	 * tarjeta blanca con título («Cuándo y dónde», «Cómo llegar», «Quiénes», «De qué se trata»).
	 * El afiche baja a una miniatura al lado del título. El texto largo se ve recortado con
	 * «Leer todo», así lo de abajo (partes, personas) no queda enterrado.
	 */
	import { Button, TagChip } from '$lib/components/ui';
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
	let leerTodo = false;
</script>

<article class="opcion-c">
	<header class="cabeza surface-card">
		<img class="miniatura" src={meta.featured} alt="Afiche del evento" />
		<div class="cabeza-texto">
			<p class="serie"><TagChip tag={s.id} href={s.href} /></p>
			<h1>{meta.title}</h1>
			<p class="por">por {meta.authors.join(' y ')}</p>
		</div>
		<div class="navs">
			<EventSeries {series} part="nav" />
			<PartesTaller {partes} part="nav" />
		</div>
	</header>

	{#if past}<NotaPasado />{/if}

	<section class="tarjeta surface-card cuando" aria-labelledby="c-cuando">
		<h2 id="c-cuando">Cuándo y dónde</h2>
		<div class="cuando-cuerpo">
			<CuandoDonde />
			{#if !past}<Compra {tickets} wide />{/if}
		</div>
	</section>

	<Acciones {past} />

	<section class="tarjeta surface-card" aria-labelledby="c-llegar">
		<h2 id="c-llegar">Cómo llegar</h2>
		<div class="mapa"><VenueLocation view={venue} context="event" compact part="more" /></div>
	</section>

	<PartesTaller {partes} part="list" />

	<section class="tarjeta surface-card" aria-labelledby="c-quienes">
		<h2 id="c-quienes">Quiénes</h2>
		<PersonasConRol groups={personas} />
	</section>

	<section class="tarjeta surface-card" aria-labelledby="c-que">
		<h2 id="c-que">De qué se trata</h2>
		<div class="content texto" class:recortado={!leerTodo}><ContenidoLargo /></div>
		{#if !leerTodo}
			<p class="leer">
				<Button surface="sitio" variant="secondary" on:click={() => (leerTodo = true)}
					>Leer todo</Button
				>
			</p>
		{/if}
		<div class="etiquetas"><Tags tags={meta.tags} /></div>
	</section>

	<EventSeries {series} part="after" origin="https://example.invalid" />
</article>

<style>
	.opcion-c {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--space-s) var(--space-xs) var(--space-xl);
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.opcion-c > :global(*) {
		margin-block: 0;
	}
	.cabeza {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		grid-template-areas: 'mini texto' 'navs navs';
		gap: var(--space-xs) var(--space-s);
		align-items: start;
	}
	.miniatura {
		grid-area: mini;
		width: 100%;
		aspect-ratio: 4 / 5;
		object-fit: cover;
		border-radius: var(--radius-s);
	}
	.cabeza-texto {
		grid-area: texto;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		min-width: 0;
	}
	.cabeza-texto > * {
		margin: 0;
	}
	h1 {
		font-size: var(--text-xl);
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
		grid-area: navs;
		min-width: 0;
	}
	.navs {
		text-align: start;
	}
	.navs :global(.edition-nav),
	.navs :global(.part-nav) {
		margin-inline: 0;
		text-align: start;
	}
	.tarjeta {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}
	.tarjeta h2 {
		margin: 0;
		font-size: var(--text-lg);
	}
	.tarjeta :global(.personas) {
		margin: 0;
	}
	.cuando-cuerpo {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.mapa {
		font-size: var(--text-sm);
	}
	.texto {
		margin-top: 0;
		padding-inline: 0;
	}
	.texto > :global(*) {
		margin-inline: 0;
	}
	.recortado {
		max-height: 22rem;
		overflow: hidden;
		mask-image: linear-gradient(to bottom, black 70%, transparent);
	}
	.leer {
		margin: 0;
		text-align: center;
	}
	@media (min-width: 900px) {
		.cabeza {
			grid-template-columns: 8rem 1fr;
		}
		.cuando-cuerpo {
			display: grid;
			grid-template-columns: 1fr 20rem;
			align-items: center;
			gap: var(--space-m);
		}
	}
	/* Las tarjetas de los componentes reales (partes, calendario de la serie), al ancho de la
	   columna de la maqueta. */
	.opcion-c :global(.partes),
	.opcion-c :global(.event-series .next),
	.opcion-c :global(.event-series .cal) {
		width: 100%;
		margin-inline: 0;
	}
</style>
