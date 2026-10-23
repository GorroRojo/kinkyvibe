<script>
	/**
	 * El árbol de etiquetas de hoy (el de FilterBar, con los mismos TagGroup), sin el resto de
	 * FilterBar. En la versión 2 va en la hoja (pantallas angostas) o en su columna (anchas). Lee
	 * `$visibleTags` y tilda desde `?tags=` como en la lista de verdad: por eso ListaV2 escribe la
	 * URL igual que PostList.
	 *
	 * Props: `column` (true: en la columna de la izquierda, uno abajo del otro).
	 */
	import TagGroup from '$lib/components/TagGroup.svelte';
	import { tagManager, visibleTags } from '$lib/utils/stores';

	export let column = false;

	// Igual que FilterBar: las madres de primer nivel con alguna hija a la vista, y las sueltas.
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

<div class="arbol" class:column>
	{#each tags as tag, i (tag.id)}
		<div class="grupo">
			<TagGroup {tag} gap={tag?.getColor() != tags[i + 1]?.getColor()} nested={false} />
		</div>
	{/each}
</div>

<style>
	/* Como .tagfilters de FilterBar. */
	.arbol {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs) var(--space-3xs);
		justify-content: center;
		max-width: 100%;
	}
	.arbol.column {
		flex-direction: column;
		flex-wrap: nowrap;
		align-items: flex-start;
	}
	.grupo {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		max-width: 100%;
	}
</style>
