<script>
	/**
	 * Lista de ediciones de una serie: número, título (link al evento) y fecha.
	 * Props: `editions` (Edition[] de $lib/utils/series.js), `current` (slug a marcar, opcional).
	 */
	import { editionDateLabel } from '$lib/utils/series.js';

	/** @type {readonly import('$lib/utils/series.js').Edition[]} */
	export let editions = [];
	export let current = '';
	/** Cuántas mostrar a la vista; las demás, plegadas en «Ver las N anteriores» (0 = todas). */
	export let visible = 0;
	$: shown = visible > 0 ? editions.slice(0, visible) : editions;
	$: rest = visible > 0 ? editions.slice(visible) : [];
</script>

<ol class="editions">
	{#each shown as e (e.slug)}
		<li class:current={e.slug === current} class:cancelled={e.status === 'cancelado'}>
			<span class="n" aria-label="Edición {e.number}">#{e.number}</span>
			<a href={e.path} aria-current={e.slug === current ? 'page' : undefined}>{e.title}</a>
			<time datetime={e.start}>{editionDateLabel(e.start)}</time>
		</li>
	{/each}
</ol>
{#if rest.length}
	<details class="more">
		<summary>Ver {rest.length === 1 ? 'la anterior' : `las ${rest.length} anteriores`}</summary>
		<ol class="editions">
			{#each rest as e (e.slug)}
				<li class:current={e.slug === current} class:cancelled={e.status === 'cancelado'}>
					<span class="n" aria-label="Edición {e.number}">#{e.number}</span>
					<a href={e.path} aria-current={e.slug === current ? 'page' : undefined}>{e.title}</a>
					<time datetime={e.start}>{editionDateLabel(e.start)}</time>
				</li>
			{/each}
		</ol>
	</details>
{/if}

<style>
	.editions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.15em;
	}
	li {
		display: grid;
		grid-template-columns: 3.2em 1fr auto;
		gap: 0.6em;
		align-items: baseline;
		padding: 0.45em 0.2em;
		border-bottom: 1px solid var(--line);
		min-width: 0;
	}
	li:last-child {
		border-bottom: 0;
	}
	.n {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		font-size: var(--step--1);
	}
	a {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--2-dark);
	}
	time {
		color: var(--muted);
		font-size: var(--step--1);
		white-space: nowrap;
	}
	.current a {
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
	}
	.cancelled a {
		text-decoration: line-through;
	}
	.more summary {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		cursor: pointer;
		color: var(--2-dark);
		font-weight: 700;
		font-size: var(--step--1);
	}
</style>
