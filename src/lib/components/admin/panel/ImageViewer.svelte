<script>
	/**
	 * Ver una imagen grande, encima de la página (un `<dialog>` modal): tan grande como entra en
	 * la pantalla, sin agrandarla más que su tamaño real. Se cierra con Escape, con «Cerrar» o
	 * tocando la imagen o el fondo, y el foco vuelve a lo que la abrió. Lo usa «Fotos sin
	 * descripción» de Para revisar (ContentFix), para describir una foto viéndola entera.
	 *
	 * Props: `open` (bind:open), `src`, `title` (nombre del diálogo y texto de arriba), `alt`
	 * (texto alternativo de la imagen; vacío si todavía no tiene).
	 * Evento: `close`.
	 */
	import { createEventDispatcher } from 'svelte';
	import { X } from '@lucide/svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let open = false;
	/** @type {string} */
	export let src;
	/** @type {string} */
	export let title;
	export let alt = '';

	const dispatch = createEventDispatcher();
	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/** Lo que tenía el foco al abrir: ahí vuelve al cerrar. */
	/** @type {HTMLElement | null} */
	let opener = null;

	$: if (dialog) toggle(open);

	/** @param {boolean} show */
	function toggle(show) {
		if (!dialog) return;
		if (show && !dialog.open) {
			opener = /** @type {HTMLElement | null} */ (document.activeElement);
			dialog.showModal();
		} else if (!show && dialog.open) {
			dialog.close();
		}
	}

	function onClose() {
		open = false;
		dispatch('close');
		opener?.focus?.();
		opener = null;
	}

	/** Tocar el fondo (el diálogo mismo, fuera de la barra) o la imagen cierra. @param {MouseEvent} e */
	function onClick(e) {
		const t = /** @type {HTMLElement} */ (e.target);
		if (t === dialog || t.tagName === 'IMG' || t.classList.contains('stage')) open = false;
	}
</script>

<dialog
	bind:this={dialog}
	class="kv-image-viewer"
	aria-label={title}
	on:close={onClose}
	on:click={onClick}
>
	<div class="bar">
		<span class="title">{title}</span>
		<Button variant="secondary" size="small" icon={X} on:click={() => (open = false)}>Cerrar</Button
		>
	</div>
	<div class="stage">
		<!-- la imagen grande se baja recién al abrir -->
		{#if open}<img {src} {alt} decoding="async" />{/if}
	</div>
</dialog>

<style lang="scss">
	.kv-image-viewer {
		border: 0;
		padding: 0;
		margin: auto;
		background: transparent;
		color: var(--text);
		width: 100vw;
		height: 100dvh;
		max-width: 100vw;
		max-height: 100dvh;
		overflow: hidden;
		&::backdrop {
			background: color-mix(in srgb, black 82%, transparent);
		}
		&[open] {
			display: flex;
			flex-direction: column;
		}
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xs);
		padding: var(--space-2xs) var(--space-s);
		background: var(--surface);
		box-shadow: var(--shadow-1);
	}
	.title {
		font-weight: 700;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.stage {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-s);
		cursor: zoom-out;
	}
	img {
		display: block;
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: var(--radius-s);
		background: var(--surface);
	}
</style>
