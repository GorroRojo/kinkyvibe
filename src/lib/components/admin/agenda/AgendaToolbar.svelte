<script>
	/**
	 * Barra de la agenda: anterior / hoy / siguiente, el período que se ve y el selector de vista.
	 * Props: `view` (la vista elegida), `title` (período, ej. "octubre de 2026"), `nav` (default
	 * true: muestra anterior / hoy / siguiente; la planilla no los usa).
	 * Eventos: `prev`, `next`, `today`, `view` (detail: id de la vista).
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
	<div class="views" role="group" aria-label="Vista">
		{#each CALENDAR_VIEWS as v (v.id)}
			<button
				class:on={view === v.id}
				aria-pressed={view === v.id}
				on:click={() => dispatch('view', v.id)}>{v.label}</button
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
		gap: 0.6rem;
		margin-bottom: 0.8rem;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
	}
	h2 {
		margin: 0 0 0 0.5rem;
		font-size: 1.15rem;
		text-transform: capitalize;
		white-space: nowrap;
	}
	.today {
		padding: 0.35rem 0.9rem;
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
	.views {
		display: inline-flex;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 2rem;
		padding: 0.2rem;
	}
	.views button {
		border: 0;
		background: transparent;
		color: var(--text);
		border-radius: 2rem;
		padding: 0.4rem 0.8rem;
		min-height: 2.2rem;
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
	}
	.views button.on {
		background: var(--surface);
		color: var(--link);
		font-weight: 700;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}
	.icon:focus-visible,
	.views button:focus-visible {
		outline: 2px solid var(--link);
		outline-offset: 1px;
	}
</style>
