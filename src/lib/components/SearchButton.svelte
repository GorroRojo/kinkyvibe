<script>
	// Botón que abre el buscador global (SearchPalette, vía SearchLauncher).
	// variant="icon": círculo en la fila de redes del header (escritorio).
	// variant="fab": botón flotante abajo a la derecha, sobre la barra de navegación (celulares).
	import { onMount } from 'svelte';
	import { Search } from '@lucide/svelte';
	import { searchOpen } from '$lib/utils/stores';

	/** @type {'icon' | 'fab'} */
	export let variant = 'icon';

	let shortcut = ['Ctrl', 'K'];
	onMount(() => {
		if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = ['⌘', 'K'];
	});
</script>

<button
	type="button"
	class="search-btn {variant}"
	class:hidden={variant === 'fab' && $searchOpen}
	data-search-trigger={variant}
	aria-label="Buscar (Ctrl+K)"
	aria-haspopup="dialog"
	aria-keyshortcuts="Control+K Meta+K"
	on:click={() => searchOpen.set(true)}
>
	<Search size={variant === 'fab' ? 26 : '0.95em'} strokeWidth={2.75} aria-hidden="true" />
	{#if variant === 'icon'}
		<span class="tip" aria-hidden="true">
			Buscar en todo el sitio
			<span class="keys">
				{#each shortcut as key}<kbd>{key}</kbd>{/each}
			</span>
		</span>
	{/if}
</button>

<style>
	.search-btn {
		position: relative;
		display: grid;
		place-items: center;
		padding: 0;
		font: inherit;
		border: 0;
		border-radius: 50%;
		background: var(--1);
		color: white;
		cursor: pointer;
		transition:
			scale 120ms,
			box-shadow 120ms,
			opacity 150ms;
	}
	.search-btn:focus-visible {
		outline: 3px solid var(--2);
		outline-offset: 3px;
	}

	/* --- header (escritorio): único botón junto al logo --- */
	/* colores invertidos respecto del FAB (fondo blanco, lupa rosa) para que resalte
	   como acción principal junto al logo */
	.icon {
		width: 1.9em;
		height: 1.9em;
		font-size: 1.2em;
		background: white;
		color: var(--1);
		box-shadow:
			inset 0 0 0 2px var(--1),
			0 2px 6px rgba(0, 0, 0, 0.12);
	}
	.icon:hover {
		scale: 1.1;
		box-shadow:
			inset 0 0 0 2px var(--1),
			0 0 0.4em rgba(1, 1, 1, 0.2);
	}
	.icon:active {
		scale: 1;
	}
	.tip {
		position: absolute;
		top: calc(100% + 0.6rem);
		left: 50%;
		translate: -50% -0.25rem;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.35em 0.6em;
		border-radius: var(--radius-s);
		background: var(--2-dark);
		color: white;
		font-size: var(--text-xs);
		font-weight: bold;
		white-space: nowrap;
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 120ms,
			translate 120ms;
	}
	.tip::before {
		content: '';
		position: absolute;
		bottom: 100%;
		left: 50%;
		translate: -50% 0;
		border: 0.35rem solid transparent;
		border-bottom-color: var(--2-dark);
	}
	.keys {
		display: flex;
		gap: 0.2em;
	}
	kbd {
		font-family: inherit;
		font-size: 0.9em;
		line-height: 1.4;
		padding: 0 0.4em;
		border-radius: 0.3em;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.35);
	}
	.icon:hover .tip,
	.icon:focus-visible .tip {
		opacity: 1;
		translate: -50% 0;
	}

	/* --- FAB (sólo celulares): flota sobre la barra de navegación inferior --- */
	.fab {
		display: none;
	}
	@media screen and (max-width: 680px) {
		.fab {
			display: grid;
			position: fixed;
			z-index: 3;
			right: max(16px, env(safe-area-inset-right));
			bottom: calc(var(--bottom-nav-height, 6rem) + 16px + env(safe-area-inset-bottom));
			width: 56px;
			height: 56px;
			box-shadow:
				0 4px 12px rgba(0, 0, 0, 0.22),
				0 1px 3px rgba(0, 0, 0, 0.12);
			animation: fab-in 220ms ease-out backwards;
		}
		.fab:active {
			scale: 0.94;
		}
		.fab.hidden {
			opacity: 0;
			scale: 0.6;
			pointer-events: none;
		}
	}
	@keyframes fab-in {
		from {
			opacity: 0;
			scale: 0.6;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.search-btn,
		.tip {
			transition: none;
		}
		.fab {
			animation: none;
		}
	}
</style>
