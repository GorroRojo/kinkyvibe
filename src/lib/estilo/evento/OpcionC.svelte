<script>
	/**
	 * Opción C, «Tarjetas por sección»: una sola columna en todas las pantallas, cada cosa en su
	 * tarjeta blanca con título. Arriba el afiche cuadrado chico con el título; después «Cuándo y
	 * dónde» con comprar y las partes del taller adentro; enseguida «De qué se trata», entero.
	 */
	import { TagChip } from '$lib/components/ui';
	import Tags from '$lib/components/Tags.svelte';
	import PersonasConRol from '$lib/components/PersonasConRol.svelte';
	import CuandoDonde from './CuandoDonde.svelte';
	import Compra from './Compra.svelte';
	import Partes from './Partes.svelte';
	import Acciones from './Acciones.svelte';
	import Mapa from './Mapa.svelte';
	import Serie from './Serie.svelte';
	import NotaPasado from './NotaPasado.svelte';
	import ContenidoLargo from './ContenidoLargo.svelte';
	import { meta, tickets, series, personas } from './datos.js';

	export let past = false;
	const s = series.list[0];
</script>

<article class="opcion-c">
	<header class="cabeza surface-card">
		<img class="miniatura" src={meta.featured} alt="Afiche del evento" />
		<div class="cabeza-texto">
			<p class="serie-chip"><TagChip tag={s.id} href={s.href} /></p>
			<h1>{meta.title}</h1>
			<p class="por">por {meta.authors.join(' y ')}</p>
		</div>
	</header>

	{#if past}<NotaPasado />{/if}

	<section class="tarjeta surface-card" aria-labelledby="c-cuando">
		<h2 id="c-cuando">Cuándo y dónde</h2>
		<div class="cuando-cuerpo">
			<CuandoDonde />
			{#if !past}<Compra {tickets} wide />{/if}
		</div>
		<Partes flat />
	</section>

	<Acciones {past} />

	<section class="tarjeta surface-card" aria-labelledby="c-que">
		<h2 id="c-que">De qué se trata</h2>
		<div class="content texto"><ContenidoLargo /></div>
	</section>

	<Mapa title="Cómo llegar" />

	<section class="tarjeta surface-card" aria-labelledby="c-quienes">
		<h2 id="c-quienes">Quiénes</h2>
		<PersonasConRol groups={personas} />
		<div class="etiquetas"><Tags tags={meta.tags} /></div>
	</section>

	<section class="tarjeta surface-card" aria-labelledby="c-serie">
		<h2 id="c-serie">La serie</h2>
		<Serie />
	</section>
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
		grid-template-columns: 6rem 1fr;
		gap: var(--space-s);
		align-items: center;
	}
	.miniatura {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius-s);
	}
	.cabeza-texto {
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
	/* Dentro de su tarjeta, la serie sin tarjetas propias ni márgenes de más. */
	.tarjeta :global(.edition-nav) {
		margin: 0;
	}
	.tarjeta :global(.event-series .cal) {
		padding: 0;
		box-shadow: none;
	}
	.cuando-cuerpo {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.texto {
		margin-top: 0;
		padding-inline: 0;
	}
	.texto > :global(*) {
		margin-inline: 0;
	}
	@media (min-width: 900px) {
		.cabeza {
			grid-template-columns: 9rem 1fr;
		}
		.cuando-cuerpo {
			display: grid;
			grid-template-columns: 1fr 20rem;
			align-items: center;
			gap: var(--space-m);
		}
	}
</style>
