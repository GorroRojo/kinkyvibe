<script>
	/**
	 * Talleres en varias partes en la página de un evento: «Parte 2 de 3 de <taller>» y la lista de
	 * las partes, juntas y pegadas al botón de comprar (o a la inscripción), con PartesTaller.
	 * Props: `partes` (lo que da `loadPartes` en calendario/[event]/+page.server.js).
	 */
	import PartesTaller from '$lib/components/PartesTaller.svelte';

	/** @type {any} */
	export let partes;
</script>

<div class="partes-compra">
	<PartesTaller {partes} part="nav" />
	<PartesTaller {partes} part="list" />
</div>

<style>
	.partes-compra {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.partes-compra :global(.part-nav) {
		margin: 0;
		text-align: start;
	}
	.partes-compra :global(.partes) {
		width: 100%;
		margin: 0;
	}
</style>
