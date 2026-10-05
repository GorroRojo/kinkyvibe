<script>
	/**
	 * La maqueta «final» de la página de un evento (3.ª vuelta, pedidos de gorrite). Regla de oro:
	 * **el texto del evento se lee antes de comprar**: en todas las pantallas, «Comprar entradas»
	 * va DESPUÉS de «De qué se trata».
	 *
	 * Celu (una columna): afiche cuadrado grande → chip y título → resumen (`summary`) → «Cuándo y
	 * dónde» (con mapa chico arriba de «Ver en Google Maps») → texto entero → comprar y las partes
	 * del taller → compartir → cómo llegar → quiénes y etiquetas → la serie.
	 *
	 * Compu (dos columnas): a la izquierda título, resumen, texto, comprar (después del texto),
	 * compartir, cómo llegar, quiénes y etiquetas, la serie; a la derecha, fija, el afiche al ancho
	 * de la columna y «Cuándo y dónde».
	 *
	 * Variantes por la URL: `?entrada=unica` (una sola entrada para todas las partes),
	 * `?compra=lateral` (en compu, comprar en la columna fija, que se habilita recién al llegar al
	 * final del texto), `?pasado=1` (el evento ya pasó).
	 */
	import { onMount } from 'svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { TagChip } from '$lib/components/ui';
	import ShareEventButton from '$lib/components/ShareEventButton.svelte';
	import CuandoDonde from './CuandoDonde.svelte';
	import Compra from './Compra.svelte';
	import Partes from './Partes.svelte';
	import Quienes from './Quienes.svelte';
	import Serie from './Serie.svelte';
	import NotaPasado from './NotaPasado.svelte';
	import ContenidoLargo from './ContenidoLargo.svelte';
	import { meta, venue, tickets, series, personas, partesFor } from './datos.js';

	export let past = false;
	export let unica = false;
	/** @type {'texto' | 'lateral'} */
	export let compra = 'texto';

	const s = series.list[0];
	$: partes = partesFor(unica);
	$: buyTitle = partes.perPart ? 'Comprar entradas' : 'Comprar entrada al taller';

	// `?compra=lateral`: comprar (en la columna fija) se habilita cuando se ve el final del texto.
	let leido = false;
	/** @type {HTMLElement} */
	let finTexto;
	onMount(() => {
		if (compra !== 'lateral' || !('IntersectionObserver' in window)) {
			leido = true;
			return;
		}
		const io = new IntersectionObserver((entries) => {
			if (entries.some((e) => e.isIntersecting)) {
				leido = true;
				io.disconnect();
			}
		});
		io.observe(finTexto);
		return () => io.disconnect();
	});
</script>

<article class="final" class:lateral-compra={compra === 'lateral'}>
	<header class="cabeza">
		<p class="serie-chip"><TagChip tag={s.id} href={s.href} /></p>
		<h1>{meta.title}</h1>
		<p class="resumen">{meta.summary}</p>
	</header>

	<aside class="lateral" aria-label="Afiche, cuándo y dónde">
		<div class="lateral-fijo">
			<img class="afiche" src={meta.featured} alt="Afiche del evento" />
			{#if past}<NotaPasado />{/if}
			<CuandoDonde />
			{#if compra === 'lateral' && !past}
				<div class="compra-lateral">
					{#if leido}
						<Compra {tickets} wide title={buyTitle} />
						<Partes {partes} />
					{:else}
						<p class="leer-antes surface-card">
							Para comprar, leé primero de qué se trata.
							<a class="kv-link" href="#fin-del-texto"
								><ArrowDown size="1em" aria-hidden="true" /> Ir al final del texto</a
							>
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</aside>

	<section class="texto-evento" aria-labelledby="que-titulo">
		<h2 id="que-titulo">De qué se trata</h2>
		<div class="content texto"><ContenidoLargo /></div>
		<span id="fin-del-texto" bind:this={finTexto}></span>
	</section>

	{#if !past}
		<section class="compra" aria-label="Entradas">
			<Compra {tickets} wide title={buyTitle} />
			<Partes {partes} />
		</section>
	{/if}

	<div class="compartir">
		<ShareEventButton
			url={'https://example.invalid/calendario/' + meta.postID}
			title={meta.title}
			text={meta.summary}
			imagesHref="#compartir"
		/>
	</div>

	{#if venue.level === 'public' && (venue.howTo || venue.accessibility)}
		<section class="llegar surface-card" aria-labelledby="llegar-titulo">
			<h2 id="llegar-titulo">Cómo llegar</h2>
			{#if venue.howTo}<p>{venue.howTo}</p>{/if}
			{#if venue.accessibility}
				<h3>Accesibilidad</h3>
				<p>{venue.accessibility}</p>
			{/if}
		</section>
	{/if}

	<Quienes groups={personas} tags={meta.tags} />

	<Serie {past} />
</article>

<style>
	.final {
		max-width: 72rem;
		margin: 0 auto;
		padding: var(--space-s) var(--space-xs) var(--space-xl);
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-m);
	}
	.final > :global(*) {
		margin-block: 0;
	}
	/* En el celu la columna fija se desarma: el afiche va primero (arriba del título) y «Cuándo
	   y dónde» después del título, cada uno como una fila más. */
	.lateral,
	.lateral-fijo {
		display: contents;
	}
	.afiche {
		order: -1;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: var(--radius-l);
		box-shadow: var(--shadow-1);
	}
	.compra-lateral {
		display: none;
	}
	.cabeza {
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
	.resumen {
		font-size: var(--text-base);
		color: var(--muted);
	}
	.texto-evento h2,
	.llegar h2 {
		margin: 0 0 var(--space-xs);
		font-size: var(--text-xl);
	}
	.llegar h2 {
		font-size: var(--text-lg);
	}
	.texto {
		margin-top: 0;
		padding-inline: 0;
	}
	.texto > :global(*) {
		margin-inline: 0;
	}
	.compra {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.compartir {
		display: flex;
		justify-content: center;
	}
	.llegar {
		font-size: var(--text-sm);
	}
	.llegar h3 {
		margin: var(--space-xs) 0 var(--space-3xs);
		font-size: var(--text-sm);
	}
	.llegar p {
		margin: 0;
		white-space: pre-line;
	}
	.leer-antes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		margin: 0;
		font-size: var(--text-sm);
	}
	@media (min-width: 900px) {
		.final {
			grid-template-columns: minmax(0, 1fr) 24rem;
			column-gap: var(--space-l);
		}
		.final > :global(*) {
			grid-column: 1;
		}
		.final > .lateral {
			display: block;
			grid-column: 2;
			grid-row: 1 / span 7;
		}
		.lateral-fijo {
			display: flex;
			flex-direction: column;
			gap: var(--space-s);
			position: sticky;
			top: var(--space-s);
		}
		.afiche {
			order: 0;
		}
		/* `?compra=lateral`: comprar en la columna fija (y no después del texto). */
		.lateral-compra .compra-lateral {
			display: flex;
			flex-direction: column;
			gap: var(--space-s);
		}
		.lateral-compra .compra {
			display: none;
		}
	}
</style>
