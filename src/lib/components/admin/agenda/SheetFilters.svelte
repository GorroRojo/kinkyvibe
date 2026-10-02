<script>
	/**
	 * Filtros rápidos de la planilla de la agenda (en el navegador, sin recargar): texto (título,
	 * lugar o slug), región y estado. Props: `filter` (bind, ver `SheetFilter` en agendaSheet.js),
	 * `places` (regiones), `shown` / `total` (cuántos eventos se ven de cuántos).
	 */
	import { Search, X } from '@lucide/svelte';
	import { AGENDA_STATES } from '$lib/utils/agenda.js';
	import { EMPTY_SHEET_FILTER, isFiltering } from '$lib/utils/agendaSheet.js';

	/** @type {import('$lib/utils/agendaSheet.js').SheetFilter} */
	export let filter = { ...EMPTY_SHEET_FILTER };
	/** @type {string[]} */
	export let places = [];
	export let shown = 0;
	export let total = 0;

	$: active = isFiltering(filter);
</script>

<div class="filters" role="search" aria-label="Filtrar la planilla">
	<label class="field grow">
		<span>Buscar</span>
		<span class="search">
			<Search size={16} aria-hidden="true" />
			<input
				class="kv-input"
				type="search"
				bind:value={filter.q}
				placeholder="Evento, lugar…"
				autocomplete="off"
			/>
		</span>
	</label>
	<label class="field">
		<span>Región</span>
		<select class="kv-input" bind:value={filter.place}>
			<option value="">Todas</option>
			{#each places as p (p)}<option value={p}>{p}</option>{/each}
		</select>
	</label>
	<label class="field">
		<span>Estado</span>
		<select class="kv-input" bind:value={filter.state}>
			<option value="">Todos</option>
			{#each AGENDA_STATES as st (st.value)}<option value={st.value}>{st.label}</option>{/each}
		</select>
	</label>
	<p class="count" aria-live="polite">
		{#if active}
			{shown === 1 ? '1 evento' : `${shown} eventos`} de {total}
			<button
				type="button"
				class="kv-btn ghost small"
				on:click={() => (filter = { ...EMPTY_SHEET_FILTER })}
				><X size={14} aria-hidden="true" /> Limpiar</button
			>
		{:else}
			{total === 1 ? '1 evento próximo' : `${total} eventos próximos`}
		{/if}
	</p>
</div>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem 0.8rem;
		margin-bottom: 0.8rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.field > span:first-child {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted);
	}
	.grow {
		flex: 1 1 14rem;
	}
	.search {
		position: relative;
		display: flex;
	}
	.search :global(svg) {
		position: absolute;
		left: 0.8rem;
		top: 50%;
		translate: 0 -50%;
		color: var(--muted);
		pointer-events: none;
	}
	.search input {
		width: 100%;
		padding-left: 2.2rem;
		box-sizing: border-box;
	}
	select {
		min-height: 2.75rem;
	}
	.count {
		margin: 0 0 0.6rem auto;
		font-size: 0.85rem;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
	}
</style>
