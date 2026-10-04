<script>
	/**
	 * Hoja del modo puerta (un <dialog> modal: Escape y tocar afuera la cierran). En el celu sube
	 * desde abajo (se cierra con la X o deslizando el encabezado hacia abajo); en desktop es una
	 * ventana centrada. Props: `open` (bind), `title`.
	 */
	import { createEventDispatcher } from 'svelte';
	import { X } from '@lucide/svelte';
	import { sheetDrag } from '$lib/admin/sheetDragAction.js';

	export let open = false;
	export let title = '';

	const dispatch = createEventDispatcher();
	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/** @type {HTMLElement | undefined} */
	let sheetEl;

	$: if (dialog) {
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
	aria-label={title}
	on:close={onClose}
	on:click={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	<div class="sheet" bind:this={sheetEl}>
		<header
			use:sheetDrag={{
				sheet: sheetEl,
				media: '(max-width: 699.98px)',
				onClose: () => (open = false)
			}}
		>
			<span class="grab" aria-hidden="true"></span>
			<h2>{title}</h2>
			<button type="button" class="close" on:click={() => (open = false)} aria-label="Cerrar">
				<X size={22} />
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
		color: var(--text);
		width: 100%;
		max-width: 34rem;
		max-height: 92dvh;
		margin: auto auto 0;
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
	}
	.sheet {
		background: var(--surface);
		border-radius: 1.2rem 1.2rem 0 0;
		padding: 1rem 16px calc(env(safe-area-inset-bottom, 0px) + 1.2rem);
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		max-height: 92dvh;
		overflow: auto;
		box-sizing: border-box;
	}
	@media (min-width: 700px) {
		dialog {
			margin: auto;
		}
		.grab {
			display: none;
		}
		header {
			cursor: auto;
		}
		.sheet {
			border-radius: var(--radius-l);
			padding: var(--space-s) var(--space-s) var(--space-s);
		}
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
		top: -0.6rem;
		left: 50%;
		translate: -50% 0;
		width: 2.5rem;
		height: 0.3rem;
		border-radius: var(--radius-pill);
		background: var(--line);
	}
	.sheet {
		transition: transform 200ms;
	}
	h2 {
		margin: 0;
		flex: 1;
		font-size: var(--text-base);
	}
	.close {
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
		border: 0;
		background: var(--surface-2);
		color: var(--text);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
</style>
