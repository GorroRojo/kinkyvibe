<script context="module">
	let counter = 0;
</script>

<script>
	/**
	 * «¿Querés duplicar un evento que ya existe?»: un buscador sobre los eventos que se pueden
	 * duplicar (ya ordenados: los que se repiten y lo más reciente primero, ver quickDraft.js), cada
	 * uno con su título y su última fecha.
	 * Props: `candidates` (DuplicateCandidate[]), `prefill` ({ date, startTime, endTime }: el día
	 * elegido), `compact` (plegado, para el formulario de evento nuevo: empezar de cero sigue siendo
	 * completar el formulario), `pick` (en vez de links al formulario, cada evento es un botón que
	 * manda el evento `pick` { slug, title }: la carga rápida de la agenda), `busy`.
	 */
	import { createEventDispatcher } from 'svelte';
	import { CopyPlus, Repeat, Search } from '@lucide/svelte';
	import { dayLabel } from '$lib/admin/eventFormat.js';
	import { newEventHref } from '$lib/utils/calendario.js';
	import { searchDuplicates } from '$lib/utils/quickDraft.js';

	/** @type {import('$lib/utils/quickDraft.js').DuplicateCandidate[]} */
	export let candidates = [];
	/** @type {{ date?: string, startTime?: string, endTime?: string }} */
	export let prefill = {};
	export let compact = false;
	export let pick = false;
	export let busy = false;
	export let limit = 6;

	const dispatch = createEventDispatcher();
	const id = `kv-dup-${++counter}`;
	let query = '';

	$: results = searchDuplicates(candidates, query, limit);

	/** @param {string} date */
	function when(date) {
		if (!date) return 'sin fecha';
		return `${dayLabel(date)} ${date.slice(0, 4)}`;
	}
</script>

{#if compact}
	<details class="dup compact">
		<summary
			><CopyPlus size={16} aria-hidden="true" /> ¿Es otra edición de un evento que ya existe? Duplicalo</summary
		>
		<div class="body">{@render body()}</div>
	</details>
{:else}
	<section class="dup" aria-labelledby="{id}-q">
		<p id="{id}-q" class="question">¿Querés duplicar un evento que ya existe?</p>
		{@render body()}
	</section>
{/if}

{#snippet body()}
	<label class="search" for="{id}-search">
		<Search size={16} aria-hidden="true" />
		<span class="sr-only">Buscar un evento para duplicar</span>
		<input
			id="{id}-search"
			type="search"
			bind:value={query}
			placeholder="Buscá por título (Picantearla, taller…)"
			autocomplete="off"
			spellcheck="false"
		/>
	</label>
	{#if results.length}
		<ul class="results" aria-label="Eventos para duplicar">
			{#each results as c (c.slug)}
				<li>
					{#if pick}
						<button
							type="button"
							class="result"
							disabled={busy}
							on:click={() => dispatch('pick', { slug: c.slug, title: c.title })}
						>
							{@render item(c)}
						</button>
					{:else}
						<a
							class="result"
							href={newEventHref({ ...prefill, from: c.slug })}
							data-sveltekit-reload
						>
							{@render item(c)}
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted empty">
			{candidates.length
				? `No encontramos eventos con «${query.trim()}».`
				: 'Todavía no hay eventos para duplicar.'}
		</p>
	{/if}
{/snippet}

{#snippet item(/** @type {import('$lib/utils/quickDraft.js').DuplicateCandidate} */ c)}
	<span class="title">{c.title}</span>
	<span class="meta">
		Última: {when(c.date)}{#if c.series}
			· <Repeat size={12} aria-hidden="true" /> {c.series}{:else if c.editions > 1}
			· {c.editions} ediciones{/if}
	</span>
{/snippet}

<style>
	.dup {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.question {
		margin: 0;
		font-weight: 700;
	}
	.compact {
		border: 1px solid var(--line, #ddd);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-xs);
		margin: 0 0 1rem;
	}
	.compact summary {
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 700;
	}
	.compact .body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		margin-top: 0.6rem;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--field, var(--line, #ccc));
		border-radius: 3em;
		padding: 0 var(--space-xs);
		background: var(--surface, #fff);
	}
	.search:focus-within {
		outline: 2px solid var(--link);
		outline-offset: 1px;
	}
	.search input {
		flex: 1;
		min-width: 0;
		min-height: 2.6rem;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		outline: none;
	}
	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.result {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		width: 100%;
		text-align: left;
		padding: 0.45rem var(--space-2xs);
		border: 1px solid var(--line, #ddd);
		border-radius: var(--radius-s);
		background: var(--surface, #fff);
		color: inherit;
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}
	.result:hover:not(:disabled),
	.result:focus-visible {
		border-color: var(--link);
		background: var(--surface-2, #f5f5f5);
	}
	.result:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.title {
		font-weight: 700;
	}
	.meta {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3xs);
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.empty {
		margin: 0;
		font-size: var(--text-sm);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
