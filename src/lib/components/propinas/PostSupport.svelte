<script>
	/**
	 * Lo que va al pie de una publicación de Kinky Vibe para apoyarnos: el bloque de propina si el
	 * interruptor `propinas` está prendido, si no la nota del cafecito de siempre.
	 * Props: `propinas` (el interruptor, del servidor), `category` y `slug` (la publicación).
	 */
	import CafecitoNote from './CafecitoNote.svelte';
	import TipBlock from './TipBlock.svelte';

	export let propinas = false;
	/** @type {'material' | 'calendario'} */
	export let category;
	/** @type {string} */
	export let slug;
</script>

{#if propinas}
	<TipBlock {category} {slug} />
{:else}
	<CafecitoNote />
{/if}
