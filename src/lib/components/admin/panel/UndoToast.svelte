<script>
	/**
	 * Aviso de "Guardaste X" con un botón Deshacer (la planilla y el calendario de la agenda).
	 * Props: `message`, `busy` (deshaciendo: el botón se apaga), `floating` (default false: va en
	 * el flujo de la página; true: flota abajo, como un toast), `canUndo` (default true: muestra el
	 * botón), `error` (el aviso es un error: en rosa). Eventos: `undo`, `close` (solo con `floating`).
	 */
	import { createEventDispatcher } from 'svelte';
	import { Undo2, X } from '@lucide/svelte';

	export let message = '';
	export let busy = false;
	export let floating = false;
	export let error = false;
	export let canUndo = true;

	const dispatch = createEventDispatcher();
</script>

<div class="undo" class:floating class:error role="status">
	<span>{message}</span>
	<span class="actions">
		{#if canUndo}
			<button class="kv-btn ghost" on:click={() => dispatch('undo')} disabled={busy}
				><Undo2 size={16} aria-hidden="true" /> {busy ? 'Deshaciendo…' : 'Deshacer'}</button
			>
		{/if}
		{#if floating}
			<button class="close" on:click={() => dispatch('close')} aria-label="Cerrar el aviso"
				><X size={16} aria-hidden="true" /></button
			>
		{/if}
	</span>
</div>

<style>
	.undo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
		background: var(--ok-bg);
		color: var(--text);
		border-radius: var(--card-round);
		padding: 0.5rem 0.6rem 0.5rem 1rem;
		margin-bottom: 1rem;
	}
	.undo.error {
		background: var(--bad-bg);
	}
	.floating {
		position: fixed;
		z-index: 30;
		left: 50%;
		transform: translateX(-50%);
		bottom: calc(env(safe-area-inset-bottom, 0px) + 5rem);
		width: min(34rem, calc(100vw - 32px));
		box-sizing: border-box;
		margin: 0;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
		border: 1px solid var(--line);
	}
	@media (min-width: 900px) {
		.floating {
			bottom: 1.5rem;
		}
	}
	.actions {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.close {
		border: 0;
		background: transparent;
		color: var(--muted);
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 50%;
		cursor: pointer;
		display: inline-grid;
		place-items: center;
	}
	.close:hover {
		background: var(--surface-2);
	}
</style>
