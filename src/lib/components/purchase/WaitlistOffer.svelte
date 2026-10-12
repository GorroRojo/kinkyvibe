<script>
	/**
	 * Aviso arriba de la compra para quien entra con el link de una oferta de la lista de espera
	 * (`?lista=<token>`, interruptor `lista_espera`, docs/tickets.md):
	 * - `valid`: hasta cuándo le guardamos el lugar (o, con el aviso a toda la lista, que se lo
	 *   queda quien compre primero). Lo que puede comprar ya viene en la compra de abajo;
	 * - `used`: ya compró con ese link;
	 * - `invalid`: el link no vale (venció la reserva, terminó o se cerró la lista).
	 * Props: `offer` = `{ state, holdUntil }` de la página.
	 */
	import { formatSaleTime } from '$lib/utils/tickets.js';
	import { BellRing } from '@lucide/svelte';

	/** @type {{ state: 'valid' | 'used' | 'invalid', holdUntil: number | null }} */
	export let offer;
</script>

{#if offer.state === 'valid'}
	<section class="offer ok surface-card" role="status" aria-labelledby="offer-title">
		<h2 id="offer-title"><BellRing size={20} aria-hidden="true" /> Lista de espera</h2>
		{#if offer.holdUntil}
			<p>
				<strong>¡Se liberó un lugar!</strong> Te lo guardamos hasta el
				<strong>{formatSaleTime(offer.holdUntil)}</strong>. Podés comprar todas las entradas que
				haya disponibles ahora.
			</p>
			<p class="small">
				Si no podés, no hagas nada: cuando venza, le pasamos el lugar a la próxima persona.
			</p>
		{:else}
			<p>
				<strong>¡Se liberaron lugares!</strong> Le avisamos a toda la lista a la vez: se los queda quien
				compre primero.
			</p>
		{/if}
	</section>
{:else}
	<section class="offer gone surface-card" role="status" aria-labelledby="offer-title">
		<h2 id="offer-title"><BellRing size={20} aria-hidden="true" /> Lista de espera</h2>
		{#if offer.state === 'used'}
			<p>
				Ya usaste este link para comprar. Tus entradas (o los datos para pagar) te llegan por mail.
			</p>
		{:else}
			<p>
				Este link de la lista de espera ya no vale: venció la reserva, ya no estás en la lista o la
				lista se cerró. Si quedan entradas, las podés comprar abajo como el resto.
			</p>
		{/if}
	</section>
{/if}

<style>
	.offer {
		display: grid;
		gap: 0.5em;
		margin-top: 1em;
		border-top: 0.3rem solid var(--2);
	}
	.offer.gone {
		border-top-color: var(--line);
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin: 0;
		font-size: var(--step-1);
	}
	p {
		margin: 0;
	}
	.small {
		font-size: var(--step--1);
	}
</style>
