<script>
	/**
	 * «⚠️ Para revisar»: algo que tiene que decidir una persona (gorrite, la organización o une
	 * abogade) antes de publicar. El ícono de alerta lo pone `Notice`. Slot default: qué hay que
	 * decidir. docs/legales.md junta la lista entera.
	 */
	import Notice from '$lib/components/ui/Notice.svelte';
</script>

<div class="revisar" data-revisar>
	<Notice tone="warn" compact role={null}>
		<strong>Para revisar:</strong>
		<slot />
	</Notice>
</div>

<style>
	.revisar {
		margin: var(--space-xs) 0;
	}
</style>
