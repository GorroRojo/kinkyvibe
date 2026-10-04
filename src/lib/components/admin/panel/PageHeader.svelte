<script>
	/**
	 * Obsoleto: importá PageHeader de `$lib/components/ui` (docs/estilo.md, «Componentes»). Este archivo
	 * queda solo para que los imports viejos sigan andando hasta que un PR los pase; no le agregues
	 * nada.
	 */
	import PageHeader from '../../ui/PageHeader.svelte';
	/** @type {string} */
	export let title;
</script>

{#if $$slots.actions}
	<PageHeader {...$$restProps} {title}
		><slot name="meta" slot="meta" /><slot /><slot name="actions" slot="actions" /></PageHeader
	>
{:else}
	<PageHeader {...$$restProps} {title}><slot name="meta" slot="meta" /><slot /></PageHeader>
{/if}
