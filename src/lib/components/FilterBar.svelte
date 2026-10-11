<script>
	/**
	 * Opciones de las listas, abajo del buscador (en pantalla ancha, en la columna de la izquierda):
	 * «Ver como» lista o grilla (íconos), «Mostrar | Ocultar eventos pasados» y, solo en pantalla
	 * ancha (`wide`), el árbol de etiquetas entero (TagTree). En el celu el árbol va en la hoja de
	 * TagBar. Los dos segmentados van a la escala de los chips (`.kv-segmented.small`). Ver
	 * docs/estilo.md, «Barra de filtros de las listas».
	 *
	 * Props: `event_toggle` (muestra «eventos pasados»), `wide` (la lista mide 1300px o más).
	 */
	import '$lib/types.d.js';
	import { LayoutGrid, LayoutList } from '@lucide/svelte';
	import { userConfig } from '$lib/utils/stores';
	import TagTree from './TagTree.svelte';

	export let event_toggle = true;
	export let wide = false;

	// ?tags= is read and written by PostList, which owns the URL sync
	const VIEWS = [
		{ value: 'list', label: 'Ver como lista', icon: LayoutList },
		{ value: 'grid', label: 'Ver como grilla', icon: LayoutGrid }
	];
	const PAST = [
		{ value: true, label: 'Mostrar' },
		{ value: false, label: 'Ocultar' }
	];
</script>

<div class="filterbar">
	<div class="options">
		<div id="display-type" class="kv-segmented small" role="group" aria-label="Ver como">
			{#each VIEWS as v (v.value)}
				<button
					type="button"
					class="icon-only tap-target"
					aria-label={v.label}
					title={v.label}
					aria-pressed={$userConfig.display_type == v.value}
					on:click={() => ($userConfig.display_type = /** @type {any} */ (v.value))}
					><svelte:component this={v.icon} size={16} aria-hidden="true" /></button
				>
			{/each}
		</div>
		{#if event_toggle}
			<div class="option">
				<div
					id="show-past-events"
					class="kv-segmented small"
					role="group"
					aria-label="Eventos pasados"
				>
					{#each PAST as o (o.label)}
						<button
							type="button"
							class="tap-target"
							aria-pressed={$userConfig.show_past_events == o.value}
							on:click={() => ($userConfig.show_past_events = o.value)}>{o.label}</button
						>
					{/each}
				</div>
				<span aria-hidden="true">eventos pasados</span>
			</div>
		{/if}
	</div>
	{#if wide}
		<TagTree column />
	{/if}
</div>

<style>
	.filterbar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-xs);
		width: 100%;
		max-width: min(100%, 100dvw);
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-2xs) var(--space-s);
	}
	.option {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--1-ink);
		white-space: nowrap;
	}
	@container (min-width: 1300px) {
		/* pantalla ancha: la columna de la izquierda, todo alineado a la izquierda */
		.filterbar,
		.options {
			align-items: flex-start;
			justify-content: flex-start;
		}
	}
</style>
