<script>
	/**
	 * Hoja del celu: sube desde abajo y se cierra **arrastrando hacia abajo y con la X** (las dos;
	 * decisión de gorrite), con `use:sheetDrag` de $lib/admin/sheetDragAction.js. En pantallas
	 * anchas es una ventana centrada. Es un <dialog> modal: Escape y tocar afuera también la cierran.
	 *
	 * Props: `open` (bind:open), `title`, `inline` (se muestra en el lugar, sin modal ni gesto: solo
	 * para la galería /estilo). Slot default: el contenido. Evento: `close`.
	 */
	import { createEventDispatcher } from 'svelte';
	import { X } from '@lucide/svelte';
	import { sheetDrag } from '$lib/admin/sheetDragAction.js';

	export let open = false;
	/** @type {string} */
	export let title;
	export let inline = false;

	const dispatch = createEventDispatcher();
	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/** @type {HTMLElement | undefined} */
	let sheetEl;

	$: if (dialog && !inline) {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	}

	function onClose() {
		open = false;
		dispatch('close');
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions (Escape ya cierra el <dialog>) -->
<dialog
	bind:this={dialog}
	class:inline
	open={inline || undefined}
	aria-label={title}
	on:close={onClose}
	on:click={(e) => {
		if (e.target === dialog && !inline) open = false;
	}}
>
	<div class="sheet" bind:this={sheetEl}>
		<header
			use:sheetDrag={{
				sheet: sheetEl,
				media: '(max-width: 699.98px)',
				enabled: !inline,
				onClose: () => (open = false)
			}}
		>
			<span class="grab" aria-hidden="true"></span>
			<h2>{title}</h2>
			<button type="button" class="close" on:click={() => (open = false)} aria-label="Cerrar">
				<X size={22} aria-hidden="true" />
			</button>
		</header>
		<slot />
	</div>
</dialog>

<style>
	dialog {
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text, var(--ink));
		width: 100%;
		max-width: 34rem;
		max-height: 92dvh;
		margin: auto auto 0;
	}
	dialog::backdrop {
		background: var(--scrim, rgba(0, 0, 0, 0.6));
	}
	dialog.inline {
		position: static;
		margin: 0;
	}
	.sheet {
		background: var(--surface);
		border-radius: var(--radius-l) var(--radius-l) 0 0;
		padding: var(--space-s) var(--space-xs) calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		max-height: 92dvh;
		overflow: auto;
		box-sizing: border-box;
		box-shadow: var(--shadow-3);
		transition: transform 200ms;
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		position: relative;
		cursor: grab;
	}
	/* manija de arrastre (solo en el celu, donde la hoja sube desde abajo) */
	.grab {
		position: absolute;
		top: calc(-1 * var(--space-xs));
		left: 50%;
		translate: -50% 0;
		width: var(--space-l);
		height: var(--space-3xs);
		border-radius: var(--radius-pill);
		background: var(--line);
	}
	h2 {
		margin: 0;
		flex: 1;
		font-size: var(--text-base);
	}
	.close {
		width: var(--tap);
		height: var(--tap);
		border-radius: 50%;
		border: 0;
		background: var(--surface-2, var(--hover));
		color: inherit;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	@media (min-width: 700px) {
		dialog:not(.inline) {
			margin: auto;
		}
		dialog:not(.inline) .grab {
			display: none;
		}
		dialog:not(.inline) header {
			cursor: auto;
		}
		dialog:not(.inline) .sheet {
			border-radius: var(--radius-l);
			padding: var(--space-s);
		}
	}
</style>
