<script>
	/**
	 * Los extras de la compra de una entrada (decisión 0056) en la puerta y en la barra: «2 × Trago ·
	 * 0 entregados» con «Entregar 1» (evento `deliver` con el id del extra). Sin nada por entregar,
	 * el botón se apaga y dice «Entregados». El servidor nunca entrega de más (doorScreen.js,
	 * `deliverAction`). Usa los colores de la pantalla oscura de la puerta.
	 */
	import { createEventDispatcher } from 'svelte';
	import { extraDeliveryText } from '$lib/utils/extras.js';

	/** @type {{ id: string, name: string, quantity: number, delivered: number }[]} */
	export let extras = [];
	/** Un pedido en curso (apaga los botones). */
	export let busy = false;
	/** No se puede entregar (por ejemplo, una compra reembolsada). */
	export let disabled = false;

	const dispatch = createEventDispatcher();
</script>

<ul class="extras" aria-label="Extras de la compra">
	{#each extras as x (x.id)}
		{@const left = x.quantity - x.delivered}
		<li class:done={left <= 0}>
			<span class="what">{extraDeliveryText(x)}</span>
			<button
				type="button"
				class="deliver"
				disabled={busy || disabled || left <= 0}
				on:click|stopPropagation={() => dispatch('deliver', x.id)}
			>
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
		display: grid;
		gap: 0.4rem;
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.45rem 0.6rem;
		border-radius: 0.6rem;
		background: color-mix(in srgb, var(--surface-2, #2c2533) 85%, transparent);
		color: var(--text, #f1ecf4);
	}
	.what {
		font-weight: 700;
		font-size: var(--text-base, 1rem);
	}
	li.done .what {
		color: var(--muted, #a9a0b0);
	}
	.deliver {
		min-height: 44px;
		padding: 0 1rem;
		border: 0;
		border-radius: 999px;
		background: var(--accent, hsl(319, 90%, 60%));
		color: var(--accent-ink, white);
		font: inherit;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
	}
	.deliver:disabled {
		background: var(--line, #3a3242);
		color: var(--muted, #a9a0b0);
		cursor: default;
	}
</style>
