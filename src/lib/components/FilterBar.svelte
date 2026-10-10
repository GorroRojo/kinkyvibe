<script>
	import '$lib/types.d.js';
	import { filteredTags, visibleTags, userConfig, tagManager } from '$lib/utils/stores';
	import TagGroup from './TagGroup.svelte';

	export let event_toggle = true;

	// ?tags= is read and written by PostList, which owns the URL sync

	// Tag tree open/closed on narrow screens (collapsed by default to keep the list close to the
	// top on mobile). On wide layouts it's always shown, see the @container rule below.
	let view_filters = false;
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

<div class="filterbar">
	<div class="option-group-wrapper">
		<div class="option-group-title">Ver como</div>
		<div id="display-type" class="option-group">
			<label class="tap-target">
				<input
					type="radio"
					name="display-type"
					id="display-type-list"
					bind:group={$userConfig.display_type}
					value="list"
				/>lista
			</label>
			<label class="tap-target">
				<input
					type="radio"
					name="display-type"
					id="display-type-grid"
					bind:group={$userConfig.display_type}
					value="grid"
				/>grilla
			</label>
		</div>
	</div>
	{#if event_toggle}
		<div class="option-group-wrapper">
			<div id="show-past-events" class="option-group">
				<label class="tap-target">
					<input
						type="radio"
						name="show-past-events"
						id="show-past-events-yes"
						bind:group={$userConfig.show_past_events}
						value={true}
					/>Mostrar
				</label>
				<label class="tap-target">
					<input
						type="radio"
						name="show-past-events"
						id="show-past-events-no"
						bind:group={$userConfig.show_past_events}
						value={false}
					/>Ocultar
				</label>
			</div>
			<div class="option-group-title">eventos pasados</div>
		</div>
	{/if}

	<!-- The toggle and "Despejar filtros" share a row, so picking the first tag (or clearing
	the last one) doesn't push the results down/up by a whole button on narrow screens. -->
	<div class="filter-actions">
		<button
			type="button"
			class="filters-toggle"
			aria-expanded={view_filters}
			aria-controls="tagfilters"
			on:click={() => (view_filters = !view_filters)}
		>
			{view_filters ? 'Ocultar etiquetas' : 'Filtrar por etiquetas'}
			{#if $filteredTags.length > 0}<span class="active-count">{$filteredTags.length}</span>{/if}
			<span class="chevron" class:open={view_filters} aria-hidden="true">▾</span>
		</button>
		{#if $filteredTags.length > 0}
			<button
				type="button"
				on:click={() => {
					$filteredTags = [];
				}}>Despejar filtros</button
			>
		{/if}
	</div>
	<div class="tagfilters" id="tagfilters" class:collapsed={!view_filters}>
		{#each tags as tag, i (tag.id)}
			<div class="tag-group-container">
				<TagGroup {tag} gap={tag?.getColor() != tags[i + 1]?.getColor()} nested={false} />
			</div>
		{/each}
	</div>
</div>

<style lang="scss">
	/* Segmented pills ("Ver como lista | grilla", "Mostrar | Ocultar eventos pasados") and the
	   buttons below share one look: white pill, pink ink with AA contrast, pink when active. */
	.option-group-wrapper {
		display: flex;
		align-items: center;
		gap: 0.5em;
		width: auto;
		min-width: 0;
		height: auto;
		min-height: 0;
		margin-bottom: 0.7em;
		font-size: var(--step--1);
	}
	.option-group-title {
		color: var(--1-ink);
	}
	.option-group {
		display: flex;
		align-items: stretch;
		justify-content: center;
		width: auto;
		min-width: 0;
		padding: 0.15em;
		background: var(--surface);
		border-radius: var(--round-pill);
		border: 1px solid var(--1);
		label {
			display: flex;
			align-items: center;
			cursor: pointer;
			color: var(--1-ink);
			padding: 0.2em 0.8em;
			border-radius: var(--round-pill);
			flex: 1 1;
			transition: 200ms;
			&:has(input:checked) {
				background: var(--1);
				color: white;
				font-weight: 700;
			}
			&:has(input:focus-visible) {
				outline: var(--focus-ring);
				outline-offset: 2px;
			}
		}
		/* visually hidden, but still focusable with the keyboard (display:none wasn't) */
		input {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
			pointer-events: none;
		}
	}
	.filterbar {
		display: flex;
		flex-direction: column;
		/* flex-wrap: wrap; */
		width: 100%;
		/* height: 10rem; */
		--gap: 1px;
		gap: var(--gap);
		justify-content: center;
		align-items: center;
		column-gap: calc(var(--gap) * 0.8);
		--tag-color: var(--1, indigo);
		max-width: min(100%, 100dvw);
		/* container-type: inline-size; */
	}
	.tagfilters {
		/* entre los chips (TagChip) de cada grupo */
		gap: var(--space-2xs) var(--space-3xs);
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
		max-width: min(100dvw, 100%);
	}
	.filter-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		column-gap: 0.6em;
	}
	.filter-actions button {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin-bottom: 0.5em;
		padding: 0.35em 1em;
		font-size: var(--step--1);
		color: var(--1-ink);
		background: var(--surface);
		border: 1px solid var(--1);
		border-radius: var(--round-pill);
		cursor: pointer;
		&:hover {
			background: var(--1-tint);
		}
	}
	.filters-toggle {
		font-weight: 700;
		.active-count {
			background: var(--1);
			color: white;
			border-radius: var(--radius-m);
			padding: 0 0.45em;
			font-size: 0.85em;
		}
		.chevron {
			transition: transform 200ms;
			&.open {
				transform: rotate(180deg);
			}
		}
	}
	/* 44 px de alto para el dedo */
	@media (max-width: 680px) {
		.option-group label {
			min-height: calc(var(--tap) - 0.3em - 2px);
		}
		.filter-actions button {
			min-height: var(--tap);
		}
	}
	.tagfilters.collapsed {
		display: none;
	}
	.tag-group-container {
		display: flex;
		flex-direction: column;
		/* arriba, no centrado: al lado de un grupo abierto, el chip queda en la línea de su madre */
		justify-content: flex-start;
		max-width: 100%;
	}
	@container (min-width: 1300px) {
		/* wide layout: the tree sits in its own column, always visible */
		.filter-actions .filters-toggle {
			display: none;
		}
		.tagfilters.collapsed {
			display: flex;
		}
		.tagfilters {
			flex-direction: column;
			max-width: 20rem;
		}
	}
</style>
