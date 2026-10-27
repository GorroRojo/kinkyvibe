<script>
	/**
	 * Barrita de carga arriba de todo mientras llega la página siguiente al navegar dentro del sitio
	 * (`$navigating`). Aparece recién si la navegación tarda más de `delay` ms (150), así una rápida
	 * no parpadea. En el rosa de la marca (`--1`, docs/estilo.md). Con «reducir movimiento», una
	 * barra quieta. Para lectores de pantalla es un `progressbar` sin valor («Cargando la página»).
	 * El panel tiene la suya (admin/+layout.svelte).
	 * Props: `delay` (ms antes de aparecer).
	 */
	import { onDestroy } from 'svelte';
	import { navigating } from '$app/stores';

	export let delay = 150;

	let visible = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;

	$: toggle(Boolean($navigating));

	/** @param {boolean} active */
	function toggle(active) {
		if (!active) {
			clearTimeout(timer);
			timer = undefined;
			visible = false;
			return;
		}
		// Una navegación que sigue en otra (una redirección): la barra no vuelve a empezar.
		if (visible || timer) return;
		timer = setTimeout(() => {
			timer = undefined;
			visible = true;
		}, delay);
	}

	onDestroy(() => clearTimeout(timer));
</script>

{#if visible}
	<div class="loading-bar" role="progressbar" aria-label="Cargando la página"></div>
{/if}

<style>
	.loading-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 100;
		pointer-events: none;
		overflow: hidden;
	}
	.loading-bar::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--pink);
		transform-origin: left;
		/* Crece rápido al principio y cada vez más lento, sin llegar al final: no promete cuánto falta. */
		animation: loading-bar-grow 8s cubic-bezier(0.1, 0.7, 0.3, 1) forwards;
	}
	@keyframes loading-bar-grow {
		from {
			transform: scaleX(0.05);
		}
		to {
			transform: scaleX(0.92);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		/* Sin movimiento: una barra quieta, entera y a medio tono. */
		.loading-bar::before {
			animation: none;
			transform: none;
			opacity: 0.6;
		}
	}
</style>
