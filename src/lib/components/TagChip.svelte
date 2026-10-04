<script>
	/**
	 * Obsoleto: importá TagChip de `$lib/components/ui` (docs/estilo.md, «Componentes»). Este archivo
	 * queda solo para que los imports viejos sigan andando hasta que un PR los pase; no le agregues
	 * nada.
	 */
	import TagChip from './ui/TagChip.svelte';
	/** @type {string} */
	export let tag;
</script>

<TagChip {...$$restProps} {tag} />
