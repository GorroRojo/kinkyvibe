<script>
	/**
	 * Obsoleto: importá EmptyState de `$lib/components/ui` (docs/estilo.md, «Componentes»). Este archivo
	 * queda solo para que los imports viejos sigan andando hasta que un PR los pase; no le agregues
	 * nada.
	 */
	import EmptyState from '../../ui/EmptyState.svelte';
	/** @type {string} */
	export let title;
</script>

{#if $$slots.default}
	<EmptyState {...$$restProps} {title}><slot /></EmptyState>
{:else}
	<EmptyState {...$$restProps} {title} />
{/if}
