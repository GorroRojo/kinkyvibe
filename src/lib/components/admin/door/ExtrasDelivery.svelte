<script>
	/**
	 * Los extras de la compra de una entrada (decisión 0056) en el resultado de la puerta y de la
	 * barra (dentro del bloque de color de `DoorResult`): «2 × Trago · 0 entregados» con
	 * «Entregar 1» (evento `deliver` con el id del extra). El botón es la misma píldora que
	 * «Deshacer» de DoorResult (`.pill`, mismos valores). Sin nada por entregar, se apaga y dice
	 * «Entregados». El servidor nunca entrega de más (doorScreen.js, `deliverAction`).
	 */
	import { createEventDispatcher } from 'svelte';
	import { Gift } from '@lucide/svelte';
	import { extraDeliveryText } from '$lib/utils/extras.js';

	/** @type {{ id: string, name: string, quantity: number, delivered: number }[]} */
	export let extras = [];
	/** Un pedido en curso (apaga los botones). */
	export let busy = false;
	/** No se puede entregar (por ejemplo, una compra reembolsada o sin conexión). */
	export let disabled = false;

	const dispatch = createEventDispatcher();
</script>

<ul class="extras" aria-label="Extras de la compra">
	{#each extras as x (x.id)}
		{@const left = x.quantity - x.delivered}
		<li>
			<span class="what" class:done={left <= 0}>{extraDeliveryText(x)}</span>
			<button
				type="button"
				class="pill"
				disabled={busy || disabled || left <= 0}
				on:click|stopPropagation={() => dispatch('deliver', x.id)}
			>
				<Gift size={18} aria-hidden="true" />
				{left <= 0 ? 'Entregados' : 'Entregar 1'}
			</button>
		</li>
	{/each}
</ul>

<style>
	.extras {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
	}
	.what {
		font-weight: 700;
		font-size: var(--text-base);
	}
	.what.done {
		opacity: 0.7;
	}
	/* La píldora de «Deshacer» (DoorResult.svelte, `.pill`). */
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3xs);
		border: 0;
		border-radius: 2em;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		color: inherit;
		background: rgba(255, 255, 255, 0.6);
		padding: var(--space-2xs) var(--space-xs);
		min-height: 2.75rem;
		white-space: nowrap;
	}
	.pill:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
