<script>
	/**
	 * La maqueta «final» de la página de un evento (pedidos de gorrite). Regla de oro: **el texto
	 * del evento se lee antes de comprar**: en todas las pantallas, «Comprar entradas» (o el link
	 * de inscripción) va DESPUÉS de «De qué se trata».
	 *
	 * Celu (una columna): afiche cuadrado grande → chip y título → resumen (`summary`) y «por…» →
	 * «Cuándo y dónde» (con mapa chico arriba de «Ver en Google Maps») → texto entero → comprar y
	 * las partes del taller → compartir → cómo llegar → quiénes y etiquetas → la serie → propina
	 * (eventos gratis de KinkyVibe) → tarjetas de les autores y «Más cosas de…».
	 *
	 * Compu (dos columnas): a la izquierda todo eso menos el afiche y «Cuándo y dónde», que van a
	 * la derecha, fijos (sticky) si la columna entra en la pantalla.
	 *
	 * Los estados se prueban por la URL (ver `Opciones` en datos.js y Mockup.svelte), y
	 * `compra` = 'lateral' prueba comprar en la columna fija, habilitado al llegar al final del
	 * texto.
	 */
	import { onMount } from 'svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { Button, TagChip } from '$lib/components/ui';
	import ShareEventButton from '$lib/components/ShareEventButton.svelte';
	import AuthorCallout from '$lib/components/AuthorCallout.svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import TipBlock from '$lib/components/propinas/TipBlock.svelte';
	import { showEventTip } from '$lib/utils/propinas.js';
	import { isWebLink, safeEventLink } from '$lib/utils/eventLink.js';
	import CuandoDonde from './CuandoDonde.svelte';
	import Compra from './Compra.svelte';
	import Partes from './Partes.svelte';
	import Quienes from './Quienes.svelte';
	import Serie from './Serie.svelte';
	import NotaPasado from './NotaPasado.svelte';
	import ContenidoLargo from './ContenidoLargo.svelte';
	import { escenario, perfiles, relacionados, POR_DEFECTO } from './datos.js';

	/** @type {import('./datos.js').Opciones} */
	export let opciones = POR_DEFECTO;
	/** @type {'texto' | 'lateral'} */
	export let compra = 'texto';

	$: d = escenario(opciones);
	$: meta = d.meta;
	$: past = opciones.pasado;
	$: cancelado = meta.status === 'cancelado';
	$: s = d.series?.list[0] ?? null;
	$: buyTitle = d.partes && !d.partes.perPart ? 'Comprar entrada al taller' : 'Comprar entradas';
	// Como la página real: un evento pasado no dice «Venta cerrada.» (ya dice que pasó).
	$: showTickets = Boolean(d.tickets) && !cancelado && !(past && !d.tickets?.open);
	$: actionLink = safeEventLink(meta.link);
	$: showLink = !d.tickets && Boolean(actionLink) && !cancelado && !past;
	$: autores = /** @type {string[]} */ (meta.authors).map((/** @type {string} */ a) => ({
		name: a,
		href: perfiles.find((p) => p.meta.postID === a)?.path ?? ''
	}));

	// La columna fija: si es más alta que la pantalla, `top` negativo (queda fija mostrando su
	// final), así nada de la columna queda escondido debajo del borde de la pantalla.
	/** @type {HTMLElement} */
	let fijo;
	let top = '';
	onMount(() => {
		const MARGEN = 20;
		const medir = () => {
			const h = fijo.getBoundingClientRect().height;
			top = h + 2 * MARGEN > innerHeight ? `${innerHeight - h - MARGEN}px` : '';
		};
		const ro = new ResizeObserver(medir);
		ro.observe(fijo);
		addEventListener('resize', medir);
		return () => {
			ro.disconnect();
			removeEventListener('resize', medir);
		};
	});

	// `compra` = 'lateral': comprar (en la columna fija) se habilita cuando se ve el final del texto.
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

<article class="final h-entry h-event" class:lateral-compra={compra === 'lateral'}>
	<header class="cabeza">
		{#if s}<p class="serie-chip"><TagChip tag={s.id} href={s.href} /></p>{/if}
		<h1 class="p-name">{meta.title}</h1>
		{#if meta.summary}<p class="resumen p-summary">{meta.summary}</p>{/if}
		{#if autores.length}
			<p class="por">
				por {#each autores as a, i (a.name)}{#if i > 0}{i === autores.length - 1
							? ' y '
							: ', '}{/if}{#if a.href}<a rel="author" class="p-author" href={a.href}>{a.name}</a
						>{:else}<span class="p-author">{a.name}</span>{/if}{/each}
			</p>
		{/if}
	</header>

	{#if cancelado || past}
		<div class="nota"><NotaPasado {cancelado} next={cancelado ? null : (s?.next ?? null)} /></div>
	{/if}

	<aside class="lateral" aria-label="Afiche, cuándo y dónde">
		<div class="lateral-fijo" bind:this={fijo} style:--top={top || undefined}>
			{#if meta.featured}
				<img class="afiche u-photo" src={meta.featured} alt="Afiche de {meta.title}" />
			{/if}
			<CuandoDonde {meta} venue={d.venue} mapa={!cancelado} />
			{#if compra === 'lateral' && showTickets && d.tickets}
				<div class="compra-lateral">
					{#if leido}
						<Compra tickets={d.tickets} wide title={buyTitle} />
						{#if d.partes}<Partes partes={d.partes} />{/if}
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
		<div class="content texto e-content"><ContenidoLargo /></div>
		<span id="fin-del-texto" bind:this={finTexto}></span>
	</section>

	{#if showTickets && d.tickets}
		<section class="compra" aria-label="Entradas">
			<Compra tickets={d.tickets} wide title={buyTitle} />
			{#if d.partes}<Partes partes={d.partes} />{/if}
		</section>
	{:else if showLink || d.partes}
		<section class="compra" aria-label="Inscripción">
			{#if showLink}
				<p class="inscripcion">
					<Button
						surface="sitio"
						href={actionLink}
						target={isWebLink(actionLink) ? '_blank' : undefined}
						rel={isWebLink(actionLink) ? 'noopener' : undefined}
						>{meta.link_text || 'Inscripción'}</Button
					>
				</p>
			{/if}
			{#if d.partes}<Partes partes={d.partes} />{/if}
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

	{#if d.venue && d.venue.level === 'public' && (d.venue.howTo || d.venue.accessibility)}
		<section class="llegar surface-card" aria-labelledby="llegar-titulo">
			<h2 id="llegar-titulo">Cómo llegar</h2>
			{#if d.venue.howTo}<p>{d.venue.howTo}</p>{/if}
			{#if d.venue.accessibility}
				<h3>Accesibilidad</h3>
				<p>{d.venue.accessibility}</p>
			{/if}
		</section>
	{/if}

	<Quienes groups={d.personas} tags={meta.tags} />

	{#if d.series}<Serie series={d.series} {past} />{/if}

	<!-- La propina solo en eventos gratis de KinkyVibe (decisión de gorrite), como en la real. -->
	{#if showEventTip(meta)}
		<div class="propina"><TipBlock category="calendario" slug={meta.postID} /></div>
	{/if}
</article>

<div class="pie">
	<hr />
	{#each perfiles as p (p.path)}
		<AuthorCallout
			href={p.path}
			image={p.meta.featured}
			title={p.meta.title}
			summary={p.meta.summary}
		/>
	{/each}
	<section class="relacionados" aria-labelledby="mas-titulo">
		<h2 id="mas-titulo">Más cosas de {meta.authors.join(' o ')}</h2>
		<ul>
			{#each relacionados as post (post.path)}
				<li><PostListItem {post} /></li>
			{/each}
		</ul>
		<h3>Pasados</h3>
		<Button surface="sitio" variant="secondary">Ver 12 pasados</Button>
	</section>
</div>

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
	.inscripcion {
		margin: 0;
		text-align: center;
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
	.por {
		font-size: var(--text-sm);
	}
	.pie {
		max-width: 72rem;
		margin: 0 auto var(--space-xl);
		padding-inline: var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.pie hr {
		width: 100%;
	}
	.relacionados {
		width: 100%;
		max-width: 50rem;
		margin: var(--space-m) auto 0;
		text-align: center;
	}
	.relacionados h2 {
		font-size: var(--text-xl);
	}
	.relacionados h3 {
		margin: var(--space-l) 0 var(--space-s);
		font-size: var(--text-lg);
		color: var(--muted);
	}
	.relacionados ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-l);
		margin: 0;
		padding: 0;
		text-align: start;
		list-style: none;
	}
	@media (min-width: 900px) {
		.final {
			grid-template-columns: minmax(0, 1fr) 24rem;
			column-gap: var(--space-l);
			/* La columna fija ocupa 10 filas aunque haya menos cosas a la izquierda: sin espacio
			   entre filas (las filas vacías no suman nada); la separación va como margen. */
			row-gap: 0;
		}
		.final > :global(*) {
			grid-column: 1;
			margin-block: 0 var(--space-m);
		}
		.final > .lateral {
			display: block;
			grid-column: 2;
			grid-row: 1 / span 10;
		}
		.lateral-fijo {
			display: flex;
			flex-direction: column;
			gap: var(--space-s);
			/* Fija: arriba si entra en la pantalla; si es más alta, se desplaza con la página hasta
			   que se ve su final y ahí queda (`--top`, calculado en onMount). */
			position: sticky;
			top: var(--top, var(--space-s));
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
