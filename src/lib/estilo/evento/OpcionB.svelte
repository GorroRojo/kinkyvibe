<script>
	/**
	 * Opción B, «Dos columnas con lateral»: en compu, a la izquierda el título y enseguida el
	 * texto; a la derecha, una columna fija (sticky) con el afiche cuadrado chico, cuándo, dónde,
	 * comprar, las partes del taller y las acciones. En el celu, esa columna va entre el título y
	 * el texto. Mapa, personas, etiquetas y la serie, después del texto.
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

<article class="opcion-b">
	<header class="cabeza">
		<p class="serie-chip"><TagChip tag={s.id} href={s.href} /></p>
		<h1>{meta.title}</h1>
		<p class="por">por {meta.authors.join(' y ')}</p>
	</header>

	<aside class="lateral" aria-label="Cuándo, dónde y entradas">
		<div class="lateral-fijo">
			{#if past}<NotaPasado />{/if}
			<div class="info surface-card">
				<div class="arriba">
					<img class="miniatura" src={meta.featured} alt="Afiche del evento" />
					<CuandoDonde />
				</div>
				{#if !past}<Compra {tickets} wide />{/if}
				<Partes flat />
			</div>
			<Acciones {past} />
		</div>
	</aside>

	<div class="principal">
		<div class="content texto"><ContenidoLargo /></div>
		<Mapa title="Cómo llegar" />
		<PersonasConRol groups={personas} />
		<div class="etiquetas"><Tags tags={meta.tags} /></div>
		<Serie />
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
	/* Afiche cuadrado chico al lado de la fecha y el lugar. */
	.arriba {
		display: grid;
		grid-template-columns: 6rem 1fr;
		gap: var(--space-xs);
		align-items: start;
	}
	.miniatura {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius-m);
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
			grid-template-columns: minmax(0, 1fr) 24rem;
			grid-template-areas: 'cabeza lateral' 'principal lateral';
			grid-template-rows: auto 1fr;
			column-gap: var(--space-l);
		}
		.lateral-fijo {
			position: sticky;
			top: var(--space-s);
		}
	}
</style>
