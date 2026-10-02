<script>
	/**
	 * Un botón de guardar de los formularios de eventos y material (crear, editar y ContentEditor):
	 * mientras se guarda queda apagado y en gris, con una ruedita y «Guardando…» (o `savingLabel`)
	 * y `aria-busy`. La ruedita no gira con «reducir movimiento».
	 *
	 * Props: `saving`, `disabled`, `savingLabel`, `variant` (clase del botón: `button` en las
	 * páginas de eventos, `kv-btn` en el panel), `type`. El resto (id, name, value, title…) pasa al
	 * botón. El contenido normal va en el slot (texto, ícono).
	 */
	import { LoaderCircle } from '@lucide/svelte';

	export let saving = false;
	export let disabled = false;
	export let savingLabel = 'Guardando…';
	export let variant = 'button';
	/** @type {'submit' | 'button'} */
	export let type = 'submit';
</script>

<button
	{...$$restProps}
	{type}
	class="{variant} save-button"
	class:is-saving={saving}
	disabled={disabled || saving}
	aria-busy={saving ? 'true' : undefined}
	on:click
>
	{#if saving}<LoaderCircle size={18} class="save-spin" aria-hidden="true" />
		{savingLabel}{:else}<slot />{/if}
</button>

<style>
	.save-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4em;
	}
	.save-button.is-saving {
		cursor: progress;
		filter: grayscale(0.7);
		opacity: 0.75;
	}
	.save-button :global(.save-spin) {
		animation: save-spin 0.9s linear infinite;
		flex: none;
	}
	@keyframes save-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.save-button :global(.save-spin) {
			animation: none;
		}
	}
</style>
