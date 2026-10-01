<script>
	/**
	 * Confirmación en la página (nunca `window.confirm`): una pregunta con dos botones, fija abajo
	 * como la barra de cambios sin guardar. La agenda la usa antes de cargar un evento en un día
	 * vacío ("¿Cargar un evento el …?" · Cargar / Cancelar).
	 * Props: `message`, `confirmLabel`, `cancelLabel`. Eventos: `confirm`, `cancel` (también con
	 * Escape). Al aparecer, el foco va al botón que confirma.
	 */
	import { createEventDispatcher } from 'svelte';
	import { CalendarPlus, X } from '@lucide/svelte';

	export let message = '';
	export let confirmLabel = 'Cargar';
	export let cancelLabel = 'Cancelar';

	const dispatch = createEventDispatcher();
	const id = `kv-confirm-${Math.random().toString(36).slice(2, 8)}`;

	/** @param {HTMLElement} el */
	function focusOnMount(el) {
		el.focus();
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			dispatch('cancel');
		}
	}
</script>

<div class="confirm-prompt" role="alertdialog" aria-labelledby={id} on:keydown={onKeydown}>
	<p {id} class="question">{message}</p>
	<div class="btns">
		<button class="kv-btn ghost" type="button" on:click={() => dispatch('cancel')}
			><X size={16} aria-hidden="true" /> {cancelLabel}</button
		>
		<button class="kv-btn" type="button" use:focusOnMount on:click={() => dispatch('confirm')}
			><CalendarPlus size={16} aria-hidden="true" /> {confirmLabel}</button
		>
	</div>
</div>

<style>
	.confirm-prompt {
		position: sticky;
		/* En el celu, arriba de la barra de navegación de abajo (como la barra de pendientes). */
		bottom: calc(env(safe-area-inset-bottom, 0px) + 5rem);
		z-index: 6;
		margin-top: 1rem;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		background: var(--surface);
		color: var(--text);
		border: 2px solid var(--link);
		border-radius: var(--card-round);
		box-shadow: var(--shadow);
		padding: 0.6rem 0.8rem;
	}
	@media (min-width: 900px) {
		.confirm-prompt {
			bottom: 0.75rem;
		}
	}
	.question {
		margin: 0;
		font-weight: 600;
	}
	.btns {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-left: auto;
	}
</style>
