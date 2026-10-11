<script>
	/**
	 * Barra de filtros de las listas (adentro de PostList, en todas: calendario, material,
	 * amigues, el inicio…), fija arriba al bajar. «Filtros (N)», los chips de las etiquetas más
	 * usadas en lo que se ve (las elegidas primero, hasta 8; `barChips` de tagBar.js), «Más
	 * filtros» al final y, abajo, cuántos resultados hay y «Limpiar (N)».
	 *
	 * En el celu, «Filtros» y «Más filtros» abren una hoja con el árbol de etiquetas (TagTree) y
	 * nada más; la hoja se arma recién al abrirla. Con la lista de 1300px o más (`@container`, el
	 * mismo corte que PostList) el árbol está en la columna de la izquierda (FilterBar) y esos dos
	 * botones no salen; los chips quedan como atajo.
	 *
	 * Lee y escribe `$filteredTags`, el store que comparten el buscador (TagSearch), el árbol y la
	 * URL (`?tags=`, que escribe PostList). Todos los controles miden lo mismo: 2rem de alto (el
	 * `.pill-btn.small`), el mismo padding, radio en píldora y `--text-xs`, con `.tap-target` para
	 * los 44px del dedo. Ver docs/estilo.md, «Barra de filtros de las listas».
	 *
	 * Props: `posts` (lo que se ve, ya filtrado), `amount` (lo que dice arriba de los resultados),
	 * `wide` (la lista mide 1300px o más: cierra la hoja si quedó abierta).
	 */
	import { tick } from 'svelte';
	import { SlidersHorizontal, X } from '@lucide/svelte';
	import Button from './ui/Button.svelte';
	import Sheet from './ui/Sheet.svelte';
	import TagChip from './ui/TagChip.svelte';
	import TagTree from './TagTree.svelte';
	import { filteredTags } from '$lib/utils/stores';
	import { barChips, toggleTag } from '$lib/utils/tagBar.js';

	/** @type {{ meta: { tags?: string[] } }[]} */
	export let posts = [];
	/** @type {string} */
	export let amount = '';
	export let wide = false;

	let sheetOpen = false;
	$: if (wide) sheetOpen = false;

	$: chips = barChips(posts, $filteredTags);
	$: active = $filteredTags.length;
	$: seeLabel = `Ver ${posts.length} ${posts.length == 1 ? 'resultado' : 'resultados'}`;

	/** @type {HTMLElement | undefined} */
	let strip;
	/** @param {string} tag @param {boolean} on */
	async function toggle(tag, on) {
		filteredTags.update((tags) => toggleTag(tags, tag, on));
		// las elegidas pasan adelante: que se vean (si no, quedan corridas a la izquierda)
		await tick();
		strip?.scrollTo?.({ left: 0, behavior: 'smooth' });
	}
	function clear() {
		filteredTags.set([]);
	}
</script>

<div class="tagbar" role="region" aria-label="Filtrar por etiquetas">
	<div class="row">
		<button
			type="button"
			class="pill-btn ghost small tap-target control opens-sheet filters-toggle"
			class:on={active > 0}
			aria-haspopup="dialog"
			aria-expanded={sheetOpen}
			on:click={() => (sheetOpen = true)}
		>
			<SlidersHorizontal size={14} aria-hidden="true" />Filtros{active > 0 ? ` (${active})` : ''}
		</button>
		<ul class="chips" aria-label="Etiquetas más usadas" bind:this={strip}>
			{#each chips as tag (tag)}
				<li>
					<TagChip
						{tag}
						name="tagbar-chip"
						checkbox
						selected={$filteredTags.includes(tag)}
						on:change={(e) => toggle(tag, /** @type {any} */ (e.target).checked)}
					/>
				</li>
			{/each}
			<li class="opens-sheet">
				<button
					type="button"
					class="pill-btn ghost small tap-target control more"
					aria-haspopup="dialog"
					on:click={() => (sheetOpen = true)}>Más filtros</button
				>
			</li>
		</ul>
	</div>
	<!-- Siempre ocupa su línea: elegir o sacar el primer filtro no mueve la lista. -->
	<div class="status">
		<p class="post-amount" aria-live="polite">{amount}</p>
		{#if active > 0}
			<button type="button" class="pill-btn ghost small tap-target control clear" on:click={clear}>
				<X size={14} aria-hidden="true" />Limpiar ({active})
			</button>
		{/if}
	</div>
</div>

<Sheet bind:open={sheetOpen} title="Filtrar por etiquetas">
	{#if sheetOpen}
		<!-- Se arma recién al abrir: con la hoja cerrada no hay árbol de etiquetas en la página. -->
		<div class="sheet-body">
			<TagTree />
			<div class="sheet-foot">
				<Button surface="sitio" variant="secondary" disabled={active == 0} on:click={clear}>
					Limpiar{active > 0 ? ` (${active})` : ''}
				</Button>
				<Button surface="sitio" on:click={() => (sheetOpen = false)}>{seeLabel}</Button>
			</div>
		</div>
	{/if}
</Sheet>

<style>
	.tagbar {
		/* una sola medida para todo lo que se toca en la barra: 2rem = `.pill-btn.small` */
		--control-h: 2rem;
		--control-px: 0.85em;
		position: sticky;
		top: 0;
		/* Arriba de la lista (cada ítem es su propio contexto de apilado, a nivel 0) pero debajo de
		   la barra de navegación del celu (fija abajo, z-index 2), del botón de buscar (3) y de los
		   avisos: al bajar, la barra pasa por detrás de la navegación, nunca por encima. */
		z-index: 1;
		max-width: 50rem;
		margin: 0 auto var(--space-s);
		background: var(--bg);
		box-shadow: 0 0.4em 0.6em -0.6em rgba(0, 0, 0, 0.25);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	/* `.pill-btn.ghost.small` del sitio, con la medida de arriba y el borde de 1px de los chips */
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
	.more {
		box-shadow: none;
		border: 1px dashed var(--1);
	}
	/* los chips, a la misma medida que los botones (solo en la barra) */
	.chips :global(.kv-tag) {
		box-sizing: border-box;
		min-height: var(--control-h);
		padding: 0 var(--control-px);
		line-height: 1.2;
	}
	.chips {
		list-style: none;
		margin: 0;
		/* lugar arriba y abajo para el `.tap-target` de 44px (el desplazamiento recorta lo que se
		   sale) */
		padding: calc((var(--tap) - var(--control-h)) / 2) var(--space-xs)
			calc((var(--tap) - var(--control-h)) / 2) 0;
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
		/* fundido a la derecha: hay más de costado */
		mask-image: linear-gradient(to right, black calc(100% - 2em), transparent);
	}
	.chips li {
		flex: none;
	}
	.status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		min-height: var(--tap);
	}
	.post-amount {
		margin: 0;
		color: var(--muted);
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-s);
	}
	.sheet-foot {
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
	/* Pantalla ancha: el árbol está en la columna de la izquierda; la hoja no hace falta. */
	@container (min-width: 1300px) {
		.opens-sheet {
			display: none;
		}
	}
</style>
