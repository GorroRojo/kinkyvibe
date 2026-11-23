<script>
	/**
	 * Los filtros de Ventas › Órdenes, vista Compras: el estado (una sola opción, con «🧾 compras ·
	 * 👥 personas»), «Filtros» con los interruptores que se suman, el filtro por una respuesta
	 * (un chip que se saca con ✕), «Ordenar» y el buscador. En un evento chico (`small`) no hay
	 * estado, interruptores ni orden: solo el buscador.
	 *
	 * Props: `status`, `toggles`, `orderBy` y `query` (con bind:), `statuses` y `toggleOptions`
	 * ({ id, label, tally }[], solo las que tienen algo), `answer` (el filtro por respuesta o null),
	 * `onClearAnswer`, `onSortChange` y `small`.
	 */
	import { Search, X } from '@lucide/svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import { ORDER_SORTS } from '$lib/admin/orderSort.js';

	export let status = '';
	/** @type {string[]} */
	export let toggles = [];
	export let orderBy = '';
	export let query = '';
	/** @type {{ id: string, label: string, tally: string }[]} */
	export let statuses = [];
	/** @type {{ id: string, label: string, tally: string }[]} */
	export let toggleOptions = [];
	/** @type {import('$lib/admin/ordersView.js').AnswerFilter | null} */
	export let answer = null;
	export let small = false;
	export let onClearAnswer = () => {};
	export let onSortChange = () => {};

	/** @param {string} id */
	function flip(id) {
		toggles = toggles.includes(id) ? toggles.filter((t) => t !== id) : [...toggles, id];
	}
</script>

<div class="filters">
	{#if !small}
		<div class="statuses" role="group" aria-label="Estado (🧾 compras · 👥 personas)">
			{#each statuses as s (s.id)}
				<Chip
					pressable
					selected={status === s.id}
					color={s.id === 'transferencias' ? 'var(--4)' : undefined}
					on:click={() => (status = s.id)}>{s.label} · {s.tally}</Chip
				>
			{/each}
		</div>
	{/if}
	<div class="tools">
		{#if !small && (toggleOptions.length || toggles.length)}
			<details class="more-filters" open={toggles.length > 0}>
				<summary class="kv-btn ghost small"
					>Filtros{#if toggles.length}&nbsp;· {toggles.length}{/if}</summary
				>
				<div class="toggles" role="group" aria-label="Filtros (se suman al estado)">
					{#each toggleOptions as t (t.id)}
						<Chip pressable selected={toggles.includes(t.id)} on:click={() => flip(t.id)}
							>{t.label} · {t.tally}</Chip
						>
					{/each}
				</div>
			</details>
		{/if}
		{#if !small}
			<label class="sort">
				<span>Ordenar</span>
				<select class="kv-input" bind:value={orderBy} on:change={onSortChange}>
					{#each ORDER_SORTS as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
				</select>
			</label>
		{/if}
		<label class="search">
			<Search size={16} aria-hidden="true" />
			<span class="sr-only">Buscar una orden</span>
			<input
				type="search"
				bind:value={query}
				placeholder="Nombre, email, DNI, KV-… o respuesta"
				autocomplete="off"
			/>
		</label>
	</div>
	{#if answer}
		<p class="answer-filter">
			<span class="kv-tag on"
				>{answer.label}
				<button type="button" class="clear" on:click={onClearAnswer}
					><X size={14} aria-hidden="true" /><span class="sr-only">Sacar el filtro</span></button
				></span
			>
		</p>
	{/if}
</div>

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		margin-bottom: var(--space-2xs);
	}
	.statuses,
	.toggles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs);
	}
	.toggles {
		margin-top: var(--space-2xs);
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
	}
	.more-filters[open] {
		flex-basis: 100%;
	}
	.more-filters > summary {
		cursor: pointer;
		list-style: none;
	}
	.more-filters > summary::-webkit-details-marker {
		display: none;
	}
	.more-filters > summary::after {
		content: ' ▾';
	}
	.more-filters[open] > summary::after {
		content: ' ▴';
	}
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
		min-height: 2.5rem;
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--field);
		border-radius: 3em;
		padding: 0 var(--space-xs);
		flex: 1 1 14rem;
		max-width: 24rem;
		color: var(--muted);
		background: var(--surface);
	}
	.search input {
		border: 0;
		background: transparent;
		min-height: 2.5rem;
		width: 100%;
		min-width: 0;
		color: var(--text);
	}
	.search input:focus {
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--link);
		outline-offset: 2px;
	}
	.answer-filter {
		margin: 0;
	}
	.answer-filter .kv-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.clear {
		display: inline-flex;
		align-items: center;
		background: none;
		border: 0;
		padding: 0.1rem;
		color: inherit;
		cursor: pointer;
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
