<script>
	/**
	 * Una lista como PostList (la compartida de calendario, material, amigues y el inicio), con
	 * la barra de la versión 2 en lugar del botón «Filtrar por etiquetas». Todo lo demás queda
	 * donde está hoy: el buscador arriba (el TagSearch de verdad), «Ver como lista | grilla» y
	 * «Mostrar | Ocultar eventos pasados» abajo del buscador (en pantalla ancha, en la columna de
	 * la izquierda, arriba del árbol).
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
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button, Segmented } from '$lib/components/ui';
	import Card from '$lib/components/Card.svelte';
	import PostListItem from '$lib/components/PostListItem.svelte';
	import TagSearch from '$lib/components/TagSearch.svelte';
	import { filterPosts, writeSearchParams } from '$lib/utils/postSearch.js';
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

	function reset() {
		filteredTags.set([]);
		searchText.set('');
	}
	reset();
	onMount(() =>
		// Como PostList con `syncUrl`: ?tags= en la URL, sin sumar pasos al historial.
		filteredTags.subscribe((tags) => {
			const next = writeSearchParams(new URL(location.href), { tags, text: '' });
			if (next.search === location.search) return;
			goto(next.pathname + next.search + next.hash, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		})
	);
	onDestroy(() => {
		reset();
		visibleTags.set([]);
	});
</script>

<div class="lista" bind:clientWidth={width}>
	<div class="disposicion">
		<div class="buscar">
			<TagSearch posts={base} />
		</div>

		<div class="izq">
			<div class="opciones">
				<div class="opcion">
					<span>Ver como</span>
					<Segmented
						options={[
							{ value: 'list', label: 'lista' },
							{ value: 'grid', label: 'grilla' }
						]}
						bind:value={display}
						label="Ver como"
					/>
				</div>
				{#if eventos}
					<div class="opcion">
						<Segmented
							options={[
								{ value: 'mostrar', label: 'Mostrar' },
								{ value: 'ocultar', label: 'Ocultar' }
							]}
							bind:value={showPast}
							label="Eventos pasados"
						/>
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
		flex-direction: column;
		align-items: center;
		gap: var(--space-2xs);
		margin-bottom: var(--space-2xs);
	}
	.opcion {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		font-size: var(--text-sm);
		color: var(--1-ink);
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
			align-items: flex-start;
		}
		.centro {
			grid-column: 2;
			grid-row: 2;
		}
	}
</style>
