<script>
	/**
	 * Una lista como PostList (la compartida de calendario, material, amigues y el inicio), con
	 * la barra de la versión 2 en lugar del botón «Filtrar por etiquetas». Todo lo demás queda
	 * donde está hoy: el buscador arriba (el TagSearch de verdad), «Ver como» (lista o grilla, con
	 * íconos) y «Mostrar | Ocultar eventos pasados» abajo del buscador (en pantalla ancha, en la
	 * columna de la izquierda, arriba del árbol), a la misma escala que los chips de la barra.
	 *
	 * Cómo entraría en PostList: `<BarraFiltros posts={tagFilteredPosts} />` en el lugar del
	 * botón y del árbol de FilterBar, y el árbol (`<Arbol column />`) en la columna de la izquierda
	 * solo con el contenedor de 1300px o más (el mismo corte que ya usa PostList). Como la barra
	 * lee y escribe `$filteredTags`, sirve igual en todas las listas sin tocar sus páginas.
	 *
	 * Filtra de verdad con `filterPosts` y los stores de siempre (`$filteredTags`, `$searchText`,
	 * `$visibleTags`, que no se guardan), y escribe `?tags=` en la URL como PostList (el árbol
	 * tilda desde ahí). «Ver como» y «Eventos pasados» son estado local: el prototipo no cambia
	 * la preferencia guardada de quien lo mira.
	 *
	 * Props: `posts` (publicaciones inventadas), `eventos` (si muestra «eventos pasados»).
	 */
	import { onDestroy, onMount, tick } from 'svelte';
	import { LayoutGrid, LayoutList } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui';
	import Card from '$lib/components/Card.svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import TagSearch from '$lib/components/TagSearch.svelte';
	import { filterPosts, readSearchParams, writeSearchParams } from '$lib/utils/postSearch.js';
	import { filteredTags, searchText, tagManager, visibleTags } from '$lib/utils/stores';
	import { visibleTagsFor } from '../filtros-celu/filtros.js';
	import Arbol from './Arbol.svelte';
	import BarraFiltros from './BarraFiltros.svelte';

	/** @type {any[]} */
	export let posts = [];
	export let eventos = false;

	let display = 'list';
	let showPast = 'ocultar';
	let width = 0;
	// El mismo corte que PostList (@container min-width 1300px): con lugar, el árbol en su columna.
	$: wide = width >= 1300;

	$: base = posts.filter(
		(p) =>
			p.meta.category !== 'calendario' ||
			showPast === 'mostrar' ||
			new Date(p.meta.start).getTime() > Date.now()
	);
	$: results = filterPosts(base, { tags: $filteredTags, text: $searchText }, $tagManager);
	$: visibleTags.set(
		visibleTagsFor(results, $filteredTags, (t) => $tagManager.get(t)?.parents ?? [])
	);

	/** @type {HTMLElement | undefined} */
	let buscarEl;
	// En el buscador, las elegidas se deslizan en su fila (ver el estilo): que se vea la última.
	$: ($filteredTags,
		tick().then(() => {
			const chips = buscarEl?.querySelector('.chips');
			if (chips) chips.scrollLeft = chips.scrollWidth;
		}));

	function reset() {
		filteredTags.set([]);
		searchText.set('');
	}
	reset();
	onMount(() => {
		// Como PostList con `syncUrl`: al entrar manda la URL (un link con ?tags= abre filtrado),
		// salvo etiquetas que esta lista no tiene (las de la otra lista, al cambiar de lista).
		const fromUrl = readSearchParams(new URL(location.href)).tags.filter((t) =>
			posts.some((p) => p.meta.tags.includes(t))
		);
		if (fromUrl.length > 0) filteredTags.set(fromUrl);
		// Después, ?tags= en la URL, sin sumar pasos al historial.
		return filteredTags.subscribe((tags) => {
			const next = writeSearchParams(new URL(location.href), { tags, text: '' });
			if (next.search === location.search) return;
			goto(next.pathname + next.search + next.hash, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		});
	});
	onDestroy(() => {
		reset();
		visibleTags.set([]);
	});
</script>

<div class="lista" bind:clientWidth={width}>
	<div class="disposicion">
		<div class="buscar" bind:this={buscarEl}>
			<TagSearch posts={base} />
		</div>

		<div class="izq">
			<!-- A la misma escala que los chips: alto, letra y padding de la barra (--control-*). -->
			<div class="opciones">
				<div class="kv-segmented compacto iconos" role="group" aria-label="Ver como">
					<button
						type="button"
						class="tap-target"
						aria-label="Ver como lista"
						title="Ver como lista"
						aria-pressed={display === 'list'}
						on:click={() => (display = 'list')}><LayoutList size={16} aria-hidden="true" /></button
					>
					<button
						type="button"
						class="tap-target"
						aria-label="Ver como grilla"
						title="Ver como grilla"
						aria-pressed={display === 'grid'}
						on:click={() => (display = 'grid')}><LayoutGrid size={16} aria-hidden="true" /></button
					>
				</div>
				{#if eventos}
					<div class="opcion">
						<div class="kv-segmented compacto" role="group" aria-label="Eventos pasados">
							{#each [{ value: 'mostrar', label: 'Mostrar' }, { value: 'ocultar', label: 'Ocultar' }] as o (o.value)}
								<button
									type="button"
									class="tap-target"
									aria-pressed={showPast === o.value}
									on:click={() => (showPast = o.value)}>{o.label}</button
								>
							{/each}
						</div>
						<span>eventos pasados</span>
					</div>
				{/if}
			</div>
			{#if wide}
				<Arbol column />
			{/if}
		</div>

		<div class="centro">
			<BarraFiltros posts={results} />

			{#if results.length === 0}
				<div class="vacio">
					<p>No encontramos nada con esa búsqueda.</p>
					<Button surface="sitio" variant="secondary" on:click={reset}>Despejar búsqueda</Button>
				</div>
			{:else}
				<ul class="posts {display}">
					{#each results as post (post.path)}
						<li>
							{#if display === 'list'}
								<PostListItem {post} />
							{:else}
								<Card {post} setId={false} />
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<style>
	.lista {
		container: lista / inline-size;
		/* La medida de los controles, la misma que en BarraFiltros (alto de `.pill-btn.small`). */
		--control-h: 2rem;
		--control-px: 0.85em;
	}
	/* El buscador (el TagSearch de verdad) no se deforma con muchas etiquetas elegidas: queda en
	   una sola línea con su forma de píldora y las elegidas se deslizan de costado en su propia
	   fila, con un fundido a la izquierda (la última queda a la vista). Para hacerlo de verdad,
	   estas reglas van en TagSearch.svelte. */
	.buscar :global(.tag-search .field) {
		flex-wrap: nowrap;
	}
	.buscar :global(.tag-search .chips) {
		display: flex;
		align-items: center;
		gap: 0.3em;
		flex: 0 1 auto;
		min-width: 0;
		margin: 0;
		padding: 0;
		overflow-x: auto;
		scrollbar-width: none;
		mask-image: linear-gradient(to left, black calc(100% - 1.5em), transparent);
	}
	.buscar :global(.tag-search .chip) {
		flex: none;
	}
	/* el campo de texto nunca se achica tanto que se corte «Sumar otra etiqueta…» */
	.buscar :global(.tag-search input) {
		flex: 1 0 10.5em;
		min-width: 10.5em;
		text-overflow: ellipsis;
	}
	.disposicion {
		max-width: 40rem;
		margin: 0 auto;
	}
	.buscar {
		margin-bottom: var(--space-xs);
	}
	.opciones {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-2xs) var(--space-s);
		margin-bottom: var(--space-2xs);
	}
	.opcion {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--1-ink);
	}
	/* `.kv-segmented` del sitio, achicado a la medida de los chips. */
	.compacto {
		box-sizing: border-box;
		flex: none;
		flex-wrap: nowrap;
		height: var(--control-h);
		padding: 2px;
		gap: 2px;
	}
	.compacto > button {
		min-height: 0;
		height: 100%;
		padding: 0 var(--control-px);
		font-size: var(--text-xs);
		line-height: 1.2;
	}
	/* Elegido: lleno también con el mouse encima (el hover de `.kv-segmented` le gana al
	   elegido, y en el celu el hover queda pegado después de tocar). */
	.compacto > button[aria-pressed='true'] {
		background: var(--1);
		color: white;
		font-weight: 700;
	}
	.iconos > button {
		width: 2.5rem;
		padding: 0;
	}
	.posts {
		list-style: none;
		margin: var(--space-2xs) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-m);
	}
	.posts.grid {
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
	}
	.vacio {
		text-align: center;
		padding: var(--space-m) 0;
		color: var(--1-ink);
	}
	/* Pantalla ancha, como PostList: buscador arriba de los resultados y, a la izquierda, «Ver
	   como», «Eventos pasados» y el árbol entero. */
	@container lista (min-width: 1300px) {
		.disposicion {
			max-width: none;
			display: grid;
			grid-template-columns: 1fr 50rem 1fr;
			/* el árbol largo de la izquierda no estira la fila del buscador */
			grid-template-rows: auto 1fr;
			column-gap: var(--space-s);
			align-items: start;
		}
		.buscar {
			grid-column: 2;
			grid-row: 1;
		}
		.izq {
			grid-column: 1;
			grid-row: 1 / span 2;
			display: flex;
			flex-direction: column;
			gap: var(--space-xs);
			max-width: 20rem;
			justify-self: end;
		}
		.opciones {
			justify-content: flex-start;
		}
		.centro {
			grid-column: 2;
			grid-row: 2;
		}
	}
</style>
