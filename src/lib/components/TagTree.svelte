<script>
	/**
	 * El árbol de etiquetas de las listas (TagGroup por cada madre de primer nivel con alguna hija
	 * a la vista, y las sueltas al final). Lee `$visibleTags` (lo calcula PostList) y cada chip
	 * tilda desde `?tags=`. Va en la columna de la izquierda en pantallas anchas (FilterBar) o en la
	 * hoja «Filtrar por etiquetas» del celu (TagBar). Ver docs/estilo.md, «Barra de filtros».
	 *
	 * Props: `column` (true: uno abajo del otro, para la columna de la izquierda).
	 */
	import '$lib/types.d.js';
	import { tagManager, visibleTags } from '$lib/utils/stores';
	import TagGroup from './TagGroup.svelte';

	export let column = false;

	$: tags = [
		...$tagManager
			.tagsData()
			.filter(
				(td) =>
					td?.parents?.includes('root') &&
					(td.getAllChildren().some((t) => $visibleTags.includes(t)) ||
						$visibleTags.includes(td.id))
			),
		$tagManager.get('misc', {
			children: $visibleTags
				.filter((v) => $tagManager.get(v).orphan)
				.sort((a, b) => a.localeCompare(b)),
			noname: true
		})
	];
</script>

<div class="tagtree" id="tagfilters" class:column>
	{#each tags as tag, i (tag.id)}
		<div class="tag-group-container">
			<TagGroup {tag} gap={tag?.getColor() != tags[i + 1]?.getColor()} nested={false} />
		</div>
	{/each}
</div>

<style>
	.tagtree {
		/* entre los chips (TagChip) de cada grupo */
		gap: var(--space-2xs) var(--space-3xs);
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
		max-width: min(100dvw, 100%);
	}
	.tagtree.column {
		flex-direction: column;
		flex-wrap: nowrap;
		/* contra la lista, que está a la derecha */
		align-items: flex-end;
		max-width: 100%;
	}
	/* En la columna (pantalla ancha) todo va contra la lista, que está a la derecha: también un
	   grupo abierto. Su chip va a la derecha, sus hijas se acomodan a la derecha y la línea de su
	   color pasa al costado derecho (TagGroup la pone a la izquierda). */
	.tagtree.column .tag-group-container {
		align-items: flex-end;
	}
	.tagtree.column :global(.filtergroup) {
		align-items: flex-end;
	}
	.tagtree.column :global(.groupitems) {
		justify-content: flex-end;
		padding-inline-start: 0;
		border-inline-start: 0;
		padding-inline-end: var(--space-2xs);
		border-inline-end: 2px solid var(--tag-color);
	}
	.tagtree.column :global(.noname > .groupitems) {
		padding-inline-end: 0;
		border-inline-end: 0;
	}
	.tag-group-container {
		display: flex;
		flex-direction: column;
		/* arriba, no centrado: al lado de un grupo abierto, el chip queda en la línea de su madre */
		justify-content: flex-start;
		max-width: 100%;
	}
</style>
