<script>
	/**
	 * Obsoleto: importá Card de `$lib/components/ui` (docs/estilo.md, «Componentes»). Este archivo
	 * queda solo para que los imports viejos sigan andando hasta que un PR los pase; no le agregues
	 * nada.
	 */
	import Card from '../../ui/Card.svelte';
</script>

{#if $$slots.actions}
	<Card {...$$restProps}><slot /><slot name="actions" slot="actions" /></Card>
{:else}
	<Card {...$$restProps}><slot /></Card>
{/if}
