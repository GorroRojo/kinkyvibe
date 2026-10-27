<script>
	/**
	 * Los chips de etiqueta de una tarjeta de las listas (PostListItem y Card), como `<li>` para el
	 * `<ul class="tagrow">` de cada una: hasta 5 y un «+N» que despliega el resto en la tarjeta
	 * (cardTags.js; docs/seo.md, opción 1b). La tarjeta entera es un link: el «+N» es un botón de
	 * verdad que no navega (cancela el click antes de que llegue al link), se usa con Tab y
	 * Enter/Espacio y dice si está desplegado (`aria-expanded`). Las etiquetas que no se ven
	 * siguen en los datos: la búsqueda y los filtros no dependen de esto.
	 */
	import TagChip from './ui/TagChip.svelte';
	import { cardTags } from '$lib/utils/cardTags.js';

	/** Si todavía no están (undefined), la fila queda vacía, sin romperse.
	 * @type {string[] | undefined} */
	export let tags;
	/** Los chips son links recién después de hidratar (un <a> adentro del <a> de la tarjeta). */
	export let linked = false;
	/** Si se ven todas (la tarjeta lo usa para acomodar la fila). */
	export let expanded = false;

	$: view = cardTags(tags, expanded);

	/** @param {MouseEvent} e */
	function toggle(e) {
		// que el click no siga hasta el <a> de la tarjeta (no navega)
		e.preventDefault();
		e.stopPropagation();
		expanded = !expanded;
	}
</script>

{#each view.shown as tag}
	<!-- El chip compartido (TagChip, docs/estilo.md, «Chip de etiqueta»). -->
	<li>
		<TagChip {tag} href={linked ? `/todo?tags=${encodeURIComponent(tag)}` : undefined} />
	</li>
{/each}
{#if view.extra > 0}
	<li>
		<button
			type="button"
			class="kv-tag more tap-target"
			aria-expanded={expanded ? 'true' : 'false'}
			on:click={toggle}
		>
			{#if expanded}
				<span aria-hidden="true">−</span><span class="visually-hidden">Ver menos etiquetas</span>
			{:else}
				+{view.extra}<span class="visually-hidden">{' etiquetas más'}</span>
			{/if}
		</button>
	</li>
{/if}

<style>
	.more {
		font-family: inherit;
		cursor: pointer;
		/* sin color propio: el de la tarjeta */
		--tag-color: var(--post-color, var(--pink));
	}
	.more:hover {
		text-decoration: underline;
	}
	.more:focus-visible {
		outline: var(--focus-ring);
		outline-offset: 2px;
	}
</style>
