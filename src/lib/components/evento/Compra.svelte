<script>
	/**
	 * El bloque «Comprar entradas» de la página de un evento: el botón grande (docs/estilo.md: «el
	 * botón de comprar entradas es otro y queda distinto») que lleva a la página de compra
	 * (/calendario/<slug>/entradas), con precio, «Quedan N», cierre de la venta y puerta; con la
	 * venta cerrada, por qué («Agotadas.», «Venta cerrada.», «Entradas: …», no disponible).
	 *
	 * Props: `tickets` (el resumen de la venta, `summarizeTickets`, con su `slug`: en una parte de
	 * un taller con una sola entrada es el del taller), `slug` (el evento, si `tickets` no trae el
	 * suyo), `title` («Comprar entradas», o «Comprar entrada al taller» si una entrada vale para
	 * todas las partes).
	 */
	import { formatARS } from '$lib/utils/money.js';
	import { doorText, leftText, saleWindowText } from '$lib/utils/tickets.js';

	/** @type {any} */
	export let tickets;
	export let slug = '';
	export let title = 'Comprar entradas';

	$: price = [
		tickets.priceFrom !== null ? `desde ${formatARS(tickets.priceFrom)}` : '',
		tickets.gorraSuggested !== null ? 'a la gorra' : ''
	]
		.filter(Boolean)
		.join(' · ');
</script>

<section class="buy-cta" id="entradas" aria-label="Entradas">
	{#if tickets.open}
		<a class="buy-button" href="/calendario/{tickets.slug ?? slug}/entradas">
			<span class="buy-title">{title}</span>
			<!-- Los espacios van explícitos ({' '}): Svelte saca los del borde de cada {#if},
			     y salía «desde $ 6.400· Quedan 5». -->
			<span class="buy-meta"
				>{price}{#if tickets.left !== null}{#if price}{' '}<strong class="buy-left"
							>· {leftText(tickets.left)}</strong
						>{:else}<strong class="buy-left">{leftText(tickets.left)}</strong>{/if}{/if}</span
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
		<p class="buy-when buy-door">{doorText(tickets.door)}</p>
	{/if}
</section>

<style>
	.buy-cta {
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
