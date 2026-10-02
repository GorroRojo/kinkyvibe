<script>
	/**
	 * Paso «Pagar» de la compra: medio de pago (Mercado Pago o transferencia), condiciones, la
	 * casilla de +18 y el botón que envía el formulario. El total está en el resumen de la compra
	 * (PurchaseSummary), siempre a la vista. El medio lo maneja TicketPurchase.svelte (`bind:`).
	 */
	/** @type {import('$lib/server/tickets/checkout.js').TicketsView} */
	export let tickets;
	export let method = '';
	/** Total 0: no se elige medio de pago (se emite sin pagar). */
	export let free = false;
	/** @type {string[]} */
	export let conditions = [];
	/** @type {Record<string, string>} */
	export let errors = {};
	export let submitText = '';
	export let submitDisabled = false;

	/** Porcentaje de comisión para mostrar (773 → "7,73 %"). */
	$: feeText =
		(tickets.feeBasisPoints / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' %';
</script>

{#if tickets.methods.length > 1 && !free}
	<fieldset class="methods" data-invalid={errors.method ? '' : undefined}>
		<legend>Medio de pago</legend>
		<div class="method-cards">
			{#each tickets.methods as m (m)}
				<label class="method">
					<input type="radio" name="method" value={m} bind:group={method} />
					<span>
						<strong>{m === 'mercadopago' ? 'Mercado Pago' : 'Transferencia'}</strong>
						<small
							>{m === 'mercadopago' ? 'tarjeta o dinero en cuenta' : 'bancaria, sin recargo'}</small
						>
					</span>
				</label>
			{/each}
		</div>
		<!-- Las dos explicaciones ocupan el mismo lugar (la más larga define el alto): al cambiar de
		     medio no se mueve nada. -->
		<div class="method-notes">
			{#each tickets.methods as m (m)}
				<p class="method-note" class:shown={method === m} aria-hidden={method !== m}>
					{#if m === 'mercadopago'}
						Pagás en Mercado Pago{#if tickets.feeBasisPoints}, con el recargo de la comisión ({feeText}){/if}.
						Te reservamos el lugar 20 minutos mientras pagás.
					{:else}
						Sin recargo. Confirmando la reserva desde el mail, te guardamos el lugar {tickets.transferHoldHours}
						horas mientras mandás el comprobante por mail.
					{/if}
				</p>
			{/each}
		</div>
		{#if errors.method}<p class="field-error">{errors.method}</p>{/if}
	</fieldset>
{:else}
	<input type="hidden" name="method" value={free ? '' : (tickets.methods[0] ?? '')} />
{/if}

<details class="conditions">
	<summary>Condiciones de compra y devoluciones</summary>
	<ul>
		{#each conditions as c, i (i)}
			<li>{c}</li>
		{/each}
	</ul>
</details>

<label class="accept">
	<input type="checkbox" name="accept" required aria-invalid={errors.accept ? 'true' : undefined} />
	<span>Tengo 18 años o más y acepto las condiciones de compra.</span>
</label>
{#if errors.accept}<p class="field-error">{errors.accept}</p>{/if}

<div class="pay">
	<slot name="back" />
	<button type="submit" class="submit" disabled={submitDisabled}>{submitText}</button>
</div>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		min-width: 0;
	}
	legend {
		font-weight: bold;
		margin-bottom: 0.4em;
	}
	/* Medio de pago: tarjetas del mismo alto, una al lado de la otra, y la explicación debajo en
	   un lugar reservado (ver .method-notes). Elegir una no cambia el tamaño de nada. */
	.method-cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6em;
	}
	.method {
		display: flex;
		gap: 0.6em;
		align-items: center;
		min-height: 3.6em;
		min-width: 0;
		padding: 0.55em 0.8em;
		border-radius: 0.7em;
		background: white;
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--2) 35%, transparent);
		cursor: pointer;
	}
	.method:has(input:checked) {
		box-shadow: 0 0 0 3px var(--2);
		background: color-mix(in srgb, var(--2) 6%, white);
	}
	.method input {
		flex-shrink: 0;
		width: 1.2em;
		height: 1.2em;
		margin: 0;
		accent-color: var(--2);
	}
	.method span {
		min-width: 0;
	}
	.method small {
		display: block;
		color: var(--muted);
		font-size: var(--step--1);
		line-height: 1.25;
	}
	.method-notes {
		display: grid;
	}
	.method-note {
		grid-area: 1 / 1;
		margin: 0;
		font-size: var(--step--1);
		color: var(--muted);
		visibility: hidden;
	}
	.method-note.shown {
		visibility: visible;
	}
	.conditions {
		font-size: var(--step--1);
	}
	.conditions summary {
		cursor: pointer;
		text-decoration: underline;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.conditions ul {
		margin: 0.5em 0 0;
		padding: 0.6em 0.8em 0.6em 2em;
		border-radius: 0.5em;
		background: white;
	}
	.conditions li {
		margin: 0.25em 0;
	}
	.accept {
		display: flex;
		gap: 0.6em;
		align-items: flex-start;
		font-size: var(--step--1);
	}
	.accept input {
		width: 1.4em;
		height: 1.4em;
		flex-shrink: 0;
		accent-color: var(--1);
	}
	.pay {
		display: flex;
		flex-wrap: wrap-reverse;
		align-items: center;
		justify-content: space-between;
		gap: 0.6em;
	}
	button.submit {
		font: inherit;
		font-weight: bold;
		color: white;
		background: var(--1);
		border: 0;
		border-radius: var(--round-pill);
		padding: 0.8em 1.3em;
		cursor: pointer;
		/* Alto para dos líneas y ancho que no depende del texto: el texto cambia con el medio de
		   pago y no debería mover nada. Dos líneas = 2 × 1,2em de texto + 2 × 0,8em de padding
		   (el botón cuenta el padding en su alto): 4em. Con 3,6em, «Reservar y ver cómo
		   transferir» en dos líneas lo estiraba 8 px al elegir Transferencia. */
		flex: 1 1 14em;
		max-width: 22em;
		min-height: calc(2 * 1.2em + 2 * 0.8em);
		line-height: 1.2;
	}
	button.submit:hover:not(:disabled) {
		background: var(--1-dark);
	}
	button.submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.field-error {
		color: hsl(0, 75%, 40%);
		font-size: var(--step--1);
		margin: 0;
	}
	/* Celu: una tarjeta debajo de la otra (una al lado de la otra no entran sin cortar
	   «Transferencia»). Siguen del mismo alto: elegir una no mueve nada. */
	@container compra (max-width: 26rem) {
		.method-cards {
			grid-template-columns: 1fr;
		}
	}
	@container compra (max-width: 30rem) {
		button.submit {
			max-width: none;
			width: 100%;
		}
	}
</style>
