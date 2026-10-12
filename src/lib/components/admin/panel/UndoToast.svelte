<script>
	/**
	 * Aviso de "Guardaste X" con un botón Deshacer (la planilla y el calendario de la agenda).
	 * Props: `message`, `busy` (deshaciendo: el botón se apaga), `floating` (default false: va en
	 * el flujo de la página; true: flota abajo, como un toast), `canUndo` (default true: muestra el
	 * botón), `error` (el aviso es un error: en rojo). Eventos: `undo`, `close` (solo con `floating`).
	 * Se ve como `Notice` (gorrite, 12/10): su ícono de Lucide, el mismo radio, texto en negrita y
	 * sin margen propio (el espacio lo pone la página, como con los avisos).
	 */
	import { createEventDispatcher } from 'svelte';
	import { CircleAlert, CircleCheck, Undo2, X } from '@lucide/svelte';

	export let message = '';
	export let busy = false;
	export let floating = false;
	export let error = false;
	export let canUndo = true;

	const dispatch = createEventDispatcher();
</script>

<div class="undo" class:floating class:error role="status">
	<span class="msg"
		><svelte:component
			this={error ? CircleAlert : CircleCheck}
			class="undo-icon"
			size="1.1em"
			aria-hidden="true"
		/><span>{message}</span></span
	>
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
		gap: var(--space-2xs);
		background: var(--ok-bg);
		color: var(--ok);
		font-weight: 700;
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-2xs) var(--space-2xs) var(--space-xs);
		margin: 0;
	}
	/* El ícono a la altura del primer renglón, como en Notice. */
	.msg {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3xs) var(--space-2xs);
		flex: 1 1 12rem;
		min-width: 0;
	}
	.msg > :global(.undo-icon) {
		flex: none;
		margin-block-start: 0.15em;
	}
	/* Malas noticias en rojo; «Guardado» y «Deshacer» siguen en verde. */
	.undo.error {
		background: var(--error-bg);
		color: var(--error);
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
		box-shadow: var(--shadow-2);
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
		gap: var(--space-3xs);
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
