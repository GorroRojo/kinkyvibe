<script>
	/**
	 * Aviso de una sola vez «¿Sabías que hay atajos?», abajo a la derecha. Aparece la primera vez
	 * que alguien entra al panel desde una compu con mouse y pantalla ancha (`hintsDevice`), nunca
	 * en el celu ni la tablet. «Ver atajos» abre la hoja de `?`; las dos opciones lo cierran para
	 * siempre (localStorage con versión, ver `$lib/admin/shortcutHints.js`).
	 * Props: `onShowShortcuts` (abre la hoja de atajos), `show` (para los tests: arranca visible).
	 */
	import { onMount } from 'svelte';
	import { Keyboard } from '@lucide/svelte';
	import { dismissTip, hintsDevice, tipDismissed } from '$lib/admin/shortcutHints.js';

	/** @type {() => void} */
	export let onShowShortcuts = () => {};
	export let show = false;

	onMount(() => {
		if (!show) show = hintsDevice() && !tipDismissed();
	});

	function close() {
		show = false;
		dismissTip();
	}
	function showShortcuts() {
		close();
		onShowShortcuts();
	}
</script>

{#if show}
	<aside class="tip" aria-labelledby="kv-tip-title">
		<p class="title" id="kv-tip-title">
			<Keyboard size={20} aria-hidden="true" /> ¿Sabías que hay atajos?
		</p>
		<p class="body">
			Apretá <kbd>g</kbd> y una letra para ir a una sección (<kbd>g</kbd> <kbd>e</kbd> Eventos),
			<kbd>/</kbd> para buscar y <kbd>?</kbd> para verlos todos.
		</p>
		<div class="actions">
			<button type="button" class="kv-btn small" on:click={showShortcuts}>Ver atajos</button>
			<button type="button" class="kv-btn ghost small" on:click={close}>Entendido</button>
		</div>
	</aside>
{/if}

<style>
	.tip {
		position: fixed;
		right: var(--space-m);
		bottom: var(--space-m);
		z-index: 15;
		width: min(22rem, calc(100vw - 32px));
		background: var(--surface);
		color: var(--text);
		border-radius: var(--card-round, 1.25rem);
		border-left: 6px solid var(--link);
		box-shadow: var(--shadow-3, var(--shadow-2));
		padding: var(--space-xs) var(--space-s);
		animation: tip-in 200ms ease-out;
	}
	.title {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		margin: 0;
		font-weight: 700;
		color: var(--link);
	}
	.body {
		margin: var(--space-2xs) 0 var(--space-xs);
		font-size: var(--text-sm);
	}
	kbd {
		font: inherit;
		font-size: var(--text-xs);
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 0.4em;
		padding: 0.05em 0.4em;
		color: var(--muted);
	}
	.actions {
		display: flex;
		gap: var(--space-2xs);
		flex-wrap: wrap;
	}
	@keyframes tip-in {
		from {
			transform: translateY(1rem);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tip {
			animation: none;
		}
	}
</style>
