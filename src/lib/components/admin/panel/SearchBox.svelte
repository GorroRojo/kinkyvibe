<script>
	/**
	 * Lugar del buscador global en el marco del panel (barra de arriba y header del celu).
	 *
	 * Hoy abre un aviso de "próximamente". El PR del buscador (paleta de comandos) reemplaza el
	 * contenido de este archivo manteniendo la interfaz:
	 * - prop `compact` (texto corto, para el header del celu);
	 * - prop `hotkeys` (`/` y Ctrl/⌘+K abren el buscador; solo una instancia la tiene en `true`);
	 * - `open()` exportada, para abrirlo desde afuera (bind:this).
	 */
	import { onMount } from 'svelte';

	/** Texto corto para el header del celu. */
	export let compact = false;
	/** Si esta instancia escucha `/` y Ctrl/⌘+K. */
	export let hotkeys = true;

	let isOpen = false;
	/** @type {HTMLDialogElement | undefined} */
	let dialog;

	export function open() {
		isOpen = true;
		dialog?.showModal?.();
	}
	function close() {
		isOpen = false;
		dialog?.close?.();
	}

	onMount(() => {
		if (!hotkeys) return;
		/** @param {KeyboardEvent} e */
		const onKey = (e) => {
			const el = /** @type {HTMLElement | null} */ (document.activeElement);
			const typing = !!el && (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable);
			if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
				e.preventDefault();
				open();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<button type="button" class="search" class:compact on:click={open} aria-haspopup="dialog">
	<span aria-hidden="true">🔎</span>
	<span class="label">{compact ? 'Buscar o hacer…' : 'Buscar personas, eventos o acciones…'}</span>
	{#if !compact}<kbd>/</kbd>{/if}
</button>

<dialog
	bind:this={dialog}
	on:close={() => (isOpen = false)}
	on:click|self={close}
	aria-label="Buscar"
>
	{#if isOpen}
		<div class="box">
			<p><b>🔎 El buscador llega pronto.</b></p>
			<p class="muted">
				Vas a poder buscar eventos, personas, compras (KV-…) y acciones como "cargar evento" desde
				acá.
			</p>
			<button type="button" class="kv-btn ghost" on:click={close}>Cerrar</button>
		</div>
	{/if}
</dialog>

<style lang="scss">
	.search {
		flex: 1;
		min-width: 0;
		max-width: 34rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 2em;
		padding: 0.55rem 1rem;
		color: var(--muted);
		text-align: left;
		cursor: text;
		&.compact {
			padding: 0.5rem 0.8rem;
		}
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	kbd {
		font: inherit;
		font-size: 0.72rem;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 0.4em;
		padding: 0.05em 0.45em;
		margin-left: auto;
	}
	dialog {
		border: 0;
		padding: 0;
		border-radius: 1rem;
		background: var(--surface);
		color: var(--text);
		width: min(36rem, calc(100% - 32px));
		margin-top: 10vh;
		box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.25);
		&::backdrop {
			background: var(--scrim, rgba(30, 15, 40, 0.35));
		}
	}
	.box {
		padding: 1.1rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		align-items: flex-start;
		p {
			margin: 0;
		}
	}
</style>
