<script>
	/**
	 * El bloque de compra de las maquetas: el mismo botón «Comprar entradas» de la página real
	 * (calendario/[event]/+page.svelte, `.buy-cta`; docs/estilo.md: «el botón de comprar entradas
	 * es otro y queda distinto»), copiado tal cual para no tocar la página. Solo el caso abierto,
	 * con precio, «Quedan N», cierre de la venta y puerta; cerrada, los mismos textos que la página
	 * real («Agotadas.», «Venta cerrada.», «Entradas: …», cancelado, no disponible).
	 * Props: `tickets` (resumen de la venta), `wide` (ocupa todo el ancho de su caja), `title`
	 * («Comprar entradas», o «Comprar entrada al taller» si una entrada vale para todas las partes).
	 */
	import { formatARS } from '$lib/utils/money.js';
	import { doorText, leftText, saleWindowText } from '$lib/utils/tickets.js';

	/** @type {any} */
	export let tickets;
	export let wide = false;
	export let title = 'Comprar entradas';

	$: price = [
		tickets.priceFrom !== null ? `desde ${formatARS(tickets.priceFrom)}` : '',
		tickets.gorraSuggested !== null ? 'a la gorra' : ''
	]
		.filter(Boolean)
		.join(' · ');
</script>

<section class="buy-cta" class:wide id="entradas" aria-label="Entradas">
	{#if tickets.open}
		<a class="buy-button" href="#entradas">
			<span class="buy-title">{title}</span>
			<span class="buy-meta"
				>{price}{#if tickets.left !== null}{' '}<strong class="buy-left"
						>· {leftText(tickets.left)}</strong
					>{/if}</span
			>
		</a>
		{#if tickets.closesAt}
			<p class="buy-when">{saleWindowText({ closesAt: tickets.closesAt })}.</p>
		{/if}
	{:else}
		<p class="buy-closed">
			{tickets.reason === 'soldout'
				? 'Agotadas.'
				: tickets.reason === 'closed'
					? 'Venta cerrada.'
					: tickets.reason === 'notyet' && tickets.opensAt
						? `Entradas: ${saleWindowText({ opensAt: tickets.opensAt })}.`
						: tickets.reason === 'cancelled'
							? 'El evento se canceló: no hay venta de entradas.'
							: 'La venta online de entradas no está disponible en este momento.'}
		</p>
	{/if}
	{#if tickets.reason !== 'cancelled' && doorText(tickets.door)}
		<p class="buy-when">{doorText(tickets.door)}</p>
	{/if}
</section>

<style>
	.buy-cta {
		max-width: 40rem;
		margin: 0 auto;
	}
	.buy-cta.wide {
		max-width: none;
		width: 100%;
		margin: 0;
	}
	.buy-button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15em;
		padding: 0.8em 1.2em;
		border-radius: var(--round);
		background: var(--1);
		color: white;
		text-decoration: none;
		text-align: center;
		box-shadow: 0 0.2em 0.8em color-mix(in srgb, var(--1) 40%, transparent);
	}
	.buy-button:hover,
	.buy-button:focus-visible {
		background: var(--1-dark);
		color: white;
		text-decoration: none;
	}
	.buy-title {
		font-size: var(--step-2);
		font-weight: 700;
		line-height: 1.2;
	}
	.buy-meta {
		font-size: var(--step-0);
	}
	.buy-left {
		white-space: nowrap;
	}
	.buy-closed {
		text-align: center;
		font-weight: 700;
		margin: 0;
	}
	.buy-when {
		text-align: center;
		margin: 0.4em 0 0;
		font-size: var(--step--1);
	}
</style>
