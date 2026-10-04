<script>
	/**
	 * Barra de la agenda: anterior / hoy / siguiente, el período que se ve y el selector de vista.
	 * Props: `view` (la vista elegida), `title` (período, ej. "octubre de 2026"), `nav` (default
	 * true: muestra anterior / hoy / siguiente; la planilla no los usa).
	 * Eventos: `prev`, `next`, `today`, `view` (detail: id de la vista).
	 * Slot `filters`: filtros que valen para todas las vistas (la agenda pone «A confirmar»).
	 */
	import { createEventDispatcher } from 'svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { CALENDAR_VIEWS } from '$lib/utils/calendario.js';

	/** @type {import('$lib/utils/calendario.js').CalendarView | null} */
	export let view = null;
	export let title = '';
	export let nav = true;

	const dispatch = createEventDispatcher();
</script>

<div class="toolbar">
	{#if nav}
		<div class="nav">
			<button class="icon" on:click={() => dispatch('prev')} aria-label="Período anterior"
				><ChevronLeft size={20} aria-hidden="true" /></button
			>
			<button class="kv-btn ghost today" on:click={() => dispatch('today')}>Hoy</button>
			<button class="icon" on:click={() => dispatch('next')} aria-label="Período siguiente"
				><ChevronRight size={20} aria-hidden="true" /></button
			>
			<h2 aria-live="polite">{title}</h2>
		</div>
	{/if}
	<slot name="filters" />
	<div class="kv-segmented" role="group" aria-label="Vista">
		{#each CALENDAR_VIEWS as v (v.id)}
			<button type="button" aria-pressed={view === v.id} on:click={() => dispatch('view', v.id)}
				>{v.label}</button
			>
		{/each}
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		margin-bottom: 0.8rem;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		min-width: 0;
	}
	h2 {
		margin: 0 0 0 0.5rem;
		font-size: var(--text-base);
		white-space: nowrap;
	}
	h2::first-letter {
		text-transform: uppercase;
	}
	.today {
		padding: var(--space-3xs) var(--space-xs);
	}
	.icon {
		border: 0;
		background: transparent;
		color: var(--text);
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 50%;
		cursor: pointer;
		display: inline-grid;
		place-items: center;
	}
	.icon:hover {
		background: var(--surface-2);
	}
	.icon:focus-visible {
		outline: 2px solid var(--link);
		outline-offset: 1px;
	}
</style>
