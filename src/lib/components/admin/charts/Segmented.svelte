<script>
	/**
	 * Obsoleto: importá Segmented de `$lib/components/ui` (docs/estilo.md, «Componentes»). Este archivo
	 * queda solo para que los imports viejos sigan andando hasta que un PR los pase; no le agregues
	 * nada.
	 */
	import Segmented from '../../ui/Segmented.svelte';
	/** @type {string} */
	export let value = '';
	/** @type {string} */
	export let label;
</script>

<Segmented {...$$restProps} {label} bind:value />
