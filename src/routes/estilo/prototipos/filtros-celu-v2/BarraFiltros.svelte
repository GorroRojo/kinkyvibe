<script>
	/**
	 * La barra de filtros de la versión 2: lo que reemplazaría al botón «Filtrar por etiquetas» y
	 * al árbol desplegado de FilterBar en TODAS las listas (va adentro de PostList, que ya es la
	 * lista compartida de calendario, material, amigues y el inicio). Lee y escribe
	 * `$filteredTags`, el mismo store que usan el buscador (TagSearch), el árbol y la URL.
	 *
	 * Todos los controles de la barra miden lo mismo: alto 2rem (el `.pill-btn.small` del sitio),
	 * mismo padding, radio en píldora y `--text-xs` en negrita, con `.tap-target` para que el dedo
	 * tenga 44px. Los chips (TagChip) se ajustan a esa misma medida solo acá adentro.
	 *
	 * En pantallas angostas, «Filtros (N)» y «Más filtros» abren la hoja con el árbol de etiquetas
	 * (y nada más). En anchas (contenedor `lista` de 1300px o más, el mismo corte que PostList) el
	 * árbol está en su columna y esos dos botones no salen.
	 *
	 * Props: `posts` (lo que se ve ahora, ya filtrado: de ahí salen los chips y la cuenta).
	 */
	import { tick } from 'svelte';
	import { SlidersHorizontal, X } from '@lucide/svelte';
	import { Button, Sheet, TagChip } from '$lib/components/ui';
	import { filteredTags } from '$lib/utils/stores';
	import { barChips } from '../filtros-celu/filtros.js';
	import Arbol from './Arbol.svelte';

	/** @type {{ meta: { tags: string[] } }[]} */
	export let posts = [];

	let sheetOpen = false;

	$: selected = $filteredTags;
	$: chips = barChips(posts, selected, 8);
	$: active = selected.length;

	/** @type {HTMLElement | undefined} */
	let strip;
	/** @param {string} tag @param {boolean} on */
	async function toggle(tag, on) {
		filteredTags.update((tags) =>
			on ? [...tags.filter((t) => t !== tag), tag] : tags.filter((t) => t !== tag)
		);
		// Las elegidas pasan adelante: que se vean (si no, quedan corridas a la izquierda).
		await tick();
		strip?.scrollTo({ left: 0, behavior: 'smooth' });
	}
	function clear() {
		filteredTags.set([]);
	}
	const n = (/** @type {number} */ x, /** @type {string} */ one, /** @type {string} */ many) =>
		`${x} ${x === 1 ? one : many}`;
</script>

<div class="barra" role="region" aria-label="Filtros por etiqueta">
	<div class="fila">
		<button
			type="button"
			class="pill-btn ghost small tap-target control abre-hoja"
			class:on={active > 0}
			aria-haspopup="dialog"
			on:click={() => (sheetOpen = true)}
		>
			<SlidersHorizontal size={14} aria-hidden="true" />Filtros{active > 0 ? ` (${active})` : ''}
		</button>
		<ul class="chips" aria-label="Etiquetas más usadas" bind:this={strip}>
			{#each chips as tag (tag)}
				<li>
					<TagChip
						{tag}
						name="chip-barra"
						checkbox
						selected={selected.includes(tag)}
						on:change={(e) => toggle(tag, /** @type {any} */ (e.target).checked)}
					/>
				</li>
			{/each}
			<li class="abre-hoja">
				<button
					type="button"
					class="pill-btn ghost small tap-target control mas"
					aria-haspopup="dialog"
					on:click={() => (sheetOpen = true)}
				>
					Más filtros
				</button>
			</li>
		</ul>
	</div>
	<!-- Siempre ocupa su línea: elegir o sacar el primer filtro no mueve la lista. -->
	<div class="estado">
		<span aria-live="polite">{n(posts.length, 'resultado', 'resultados')}</span>
		{#if active > 0}
			<button type="button" class="pill-btn ghost small tap-target control" on:click={clear}>
				<X size={14} aria-hidden="true" />Limpiar ({active})
			</button>
		{/if}
	</div>
</div>

<Sheet bind:open={sheetOpen} title="Filtrar por etiquetas">
	{#if sheetOpen}
		<!-- Se arma recién al abrir: con la hoja cerrada no hay árbol de etiquetas en la página. -->
		<div class="hoja">
			<Arbol />
			<div class="pie">
				<Button surface="sitio" variant="secondary" disabled={active === 0} on:click={clear}>
					Limpiar{active > 0 ? ` (${active})` : ''}
				</Button>
				<Button surface="sitio" on:click={() => (sheetOpen = false)}>
					Ver {n(posts.length, 'resultado', 'resultados')}
				</Button>
			</div>
		</div>
	{/if}
</Sheet>

<style>
	.barra {
		/* Una sola medida para todo lo que se toca en la barra (a gorrite le parecía feo
		   que tuvieran tamaños distintos). 2rem = `.pill-btn.small`. */
		--control-h: 2rem;
		--control-px: 0.85em;
		position: sticky;
		top: 0;
		z-index: 5;
		padding: 0 var(--space-xs);
		margin: 0 calc(-1 * var(--space-xs));
		background: var(--bg);
		box-shadow: 0 0.4em 0.6em -0.6em rgba(0, 0, 0, 0.25);
	}
	.fila {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	/* Botones de la barra: `.pill-btn.ghost.small` del sitio, con la medida de arriba y el borde
	   de 1px de los chips (el ghost trae 2px). */
	.control {
		box-sizing: border-box;
		flex: none;
		min-height: var(--control-h);
		padding: 0 var(--control-px);
		box-shadow: inset 0 0 0 1px var(--1);
		font-size: var(--text-xs);
		line-height: 1.2;
		white-space: nowrap;
	}
	.control.on {
		background: var(--1-tint);
		color: var(--1-ink);
	}
	.mas {
		box-shadow: none;
		border: 1px dashed var(--1);
	}
	/* Los chips, a la misma medida que los botones (solo en la barra). */
	.chips :global(.kv-tag) {
		box-sizing: border-box;
		min-height: var(--control-h);
		padding: 0 var(--control-px);
		line-height: 1.2;
	}
	.chips {
		list-style: none;
		margin: 0;
		/* Lugar arriba y abajo para el `.tap-target` de 44px (el desplazamiento de costado recorta
		   lo que se sale). */
		padding: calc((var(--tap) - var(--control-h)) / 2) var(--space-xs)
			calc((var(--tap) - var(--control-h)) / 2) 0;
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		overflow-x: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		/* fundido a la derecha: hay más de costado */
		mask-image: linear-gradient(to right, black calc(100% - 2em), transparent);
	}
	.chips li {
		flex: none;
	}
	.estado {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: var(--tap);
		font-size: var(--text-sm);
		color: var(--muted);
	}
	.hoja {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.pie {
		position: sticky;
		bottom: calc(-1 * var(--space-s));
		display: flex;
		justify-content: space-between;
		gap: var(--space-2xs);
		padding: var(--space-2xs) 0 var(--space-s);
		margin-bottom: calc(-1 * var(--space-s));
		background: var(--surface);
		border-top: 1px solid var(--line);
	}
	/* Pantalla ancha: el árbol está en su columna; la hoja no hace falta. */
	@container lista (min-width: 1300px) {
		.abre-hoja {
			display: none;
		}
		.barra {
			margin: 0;
			padding: 0;
		}
	}
</style>
