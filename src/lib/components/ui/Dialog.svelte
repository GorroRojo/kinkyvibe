<script>
	/**
	 * Diálogo centrado propio (`<dialog class="kv-dialog">` del panel), con título, texto y una fila
	 * de botones a la derecha. Escape lo cierra. Para «¿Seguro?» no armes uno: usá
	 * `askConfirm({ title, text, confirmLabel, tone })` (lo muestra `ConfirmDialog`, que monta el
	 * layout del panel). Nunca `window.confirm`.
	 *
	 * Props: `open` (bind:open), `title`, `icon` (componente de Lucide, opcional, al lado del
	 * título), `tone`: 'primary' | 'danger' | 'permanent' (color del ícono), `inline` (se muestra
	 * en el lugar, sin modal: solo para la galería /estilo).
	 * Slots: default (el contenido), `buttons` (los botones, en `.kv-dialog-btns`).
	 * Evento: `close`.
	 */
	import { createEventDispatcher } from 'svelte';

	export let open = false;
	/** @type {string} */
	export let title;
	/** @type {any} */
	export let icon = null;
	/** @type {'primary' | 'danger' | 'permanent'} */
	export let tone = 'primary';
	export let inline = false;

	const dispatch = createEventDispatcher();
	/** @type {HTMLDialogElement | undefined} */
	let dialog;

	$: if (dialog && !inline) {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	}

	function onClose() {
		open = false;
		dispatch('close');
	}
</script>

<dialog
	bind:this={dialog}
	class="kv-dialog {tone}"
	class:inline
	open={inline || undefined}
	aria-label={title}
	on:close={onClose}
>
	<h2>
		{#if icon}<svelte:component this={icon} size={22} aria-hidden="true" />{/if}
		{title}
	</h2>
	<slot />
	{#if $$slots.buttons}<div class="kv-dialog-btns"><slot name="buttons" /></div>{/if}
</dialog>

<style>
	h2 :global(svg) {
		color: var(--accent);
	}
	.danger h2 :global(svg) {
		color: var(--bad);
	}
	.permanent h2 :global(svg) {
		color: var(--error);
	}
	.inline {
		position: static;
		margin: 0;
	}
</style>
