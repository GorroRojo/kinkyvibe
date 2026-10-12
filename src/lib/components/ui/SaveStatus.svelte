<script>
	/**
	 * En qué quedó un guardado automático (interruptores, cambios que se guardan solos):
	 * «Guardando…» en gris, «Guardado» en verde con el ícono de Lucide (no un «✓» de texto;
	 * gorrite, 12/10), o el error en rojo. Sin estado, nada.
	 * (El de la barra de guardar del formulario de eventos es otro: event-form/SaveStatus.svelte.)
	 *
	 * Props: `status`: '' | 'saving' | 'saved' | 'error'; `error`: texto del error (default
	 * «No se pudo guardar»); `savingText` / `savedText` para cambiar las palabras.
	 */
	import { Check } from '@lucide/svelte';

	/** @type {'' | 'saving' | 'saved' | 'error'} */
	export let status = '';
	/** @type {string} */
	export let error = '';
	export let savingText = 'Guardando…';
	export let savedText = 'Guardado';
</script>

{#if status === 'saving'}
	<span class="save saving" role="status">{savingText}</span>
{:else if status === 'saved'}
	<span class="save saved" role="status"
		>{savedText}<Check class="save-icon" size="1.1em" aria-hidden="true" /></span
	>
{:else if status === 'error'}
	<span class="save failed" role="alert">{error || 'No se pudo guardar'}</span>
{/if}

<style>
	.save {
		font-size: var(--text-sm);
		font-weight: 400;
	}
	.saved {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
	}
	.saving {
		color: var(--muted);
	}
	.saved {
		color: var(--ok, var(--3-ink));
	}
	.failed {
		color: var(--error);
	}
</style>
