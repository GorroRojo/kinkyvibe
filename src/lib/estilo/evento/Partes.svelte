<script>
	/**
	 * «Parte 2 de 3 de <taller>» y la lista de las partes, pegadas al botón de comprar (cada parte
	 * tiene su entrada). PartesTaller real; `flat` le saca la tarjeta propia cuando ya está
	 * adentro de otra.
	 */
	import PartesTaller from '$lib/components/PartesTaller.svelte';
	import { partes } from './datos.js';

	export let flat = false;
</script>

<div class="partes-compra" class:flat>
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
	.flat :global(.partes) {
		padding: 0;
		background: none;
		box-shadow: none;
	}
</style>
