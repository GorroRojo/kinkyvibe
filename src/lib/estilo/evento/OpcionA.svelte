<script>
	/**
	 * Opción A, «Afiche arriba»: el afiche cuadrado es la portada. Celu: afiche, título, cuándo y
	 * dónde, comprar con las partes del taller, acciones, el mapa plegado y enseguida el texto.
	 * Compu: afiche a la izquierda y todo lo de comprar a la derecha; abajo, el texto primero y
	 * después mapa, personas, etiquetas y la serie.
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

<article class="opcion-a">
	<header class="hero">
		<img class="afiche" src={meta.featured} alt="Afiche del evento" />
		<div class="hero-texto">
			<p class="serie-chip"><TagChip tag={s.id} href={s.href} /></p>
			<h1>{meta.title}</h1>
			<p class="por">por {meta.authors.join(' y ')}</p>
			{#if past}<NotaPasado />{/if}
			<div class="franja surface-card">
				<CuandoDonde />
			</div>
			{#if !past}<Compra {tickets} wide />{/if}
			<Partes />
			<Acciones {past} align="start" />
		</div>
	</header>

	<div class="cuerpo">
		<div class="mapa-celu"><Mapa /></div>
		<div class="content texto"><ContenidoLargo /></div>
		<div class="mapa-compu"><Mapa fold={false} /></div>
		<PersonasConRol groups={personas} />
		<div class="etiquetas"><Tags tags={meta.tags} /></div>
		<Serie />
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
		aspect-ratio: 1;
		object-fit: cover;
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
	.franja {
		padding: var(--space-xs) var(--space-s);
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
	.texto {
		margin-top: 0;
		padding-inline: 0;
	}
	.texto > :global(*) {
		margin-inline: 0;
	}
	/* El mapa: en el celu, plegado antes del texto; en compu, abierto después del texto. */
	.mapa-compu {
		display: none;
	}
	@media (min-width: 900px) {
		.mapa-celu {
			display: none;
		}
		.mapa-compu {
			display: block;
		}
		.hero {
			display: grid;
			grid-template-columns: minmax(18rem, 5fr) 6fr;
			align-items: start;
			gap: var(--space-l);
		}
		.afiche {
			position: sticky;
			top: var(--space-s);
		}
	}
</style>
