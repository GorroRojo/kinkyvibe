<script>
	import { enhance } from '$app/forms';
	import { formatARS } from '$lib/utils/money.js';

	/**
	 * Bloque "Comprar entradas" de la página de un evento. Funciona sin JavaScript (form action
	 * `?/buy`, que redirige al checkout de Mercado Pago). Los precios que se muestran son
	 * informativos: el servidor recalcula todo con el frontmatter del evento.
	 *
	 * @type {{
	 *   tickets: import('$lib/server/tickets/checkout.js').TicketsView,
	 *   result?: { error?: string, errors?: Record<string, string>, values?: Record<string, string> } | null
	 * }}
	 */
	let { tickets, result = null } = $props();

	// Valores iniciales del formulario (a propósito no reactivos: después los maneja la persona).
	// svelte-ignore state_referenced_locally
	const firstAvailable = tickets.types.find((t) => t.available > 0)?.id ?? '';
	// svelte-ignore state_referenced_locally
	let type = $state(result?.values?.type || firstAvailable);
	// svelte-ignore state_referenced_locally
	let quantity = $state(Number(result?.values?.quantity) || 1);
	let pending = $state(false);

	let selected = $derived(tickets.types.find((t) => t.id === type));
	let maxQuantity = $derived(Math.max(1, Math.min(tickets.maxPerOrder, selected?.available ?? 1)));
	let total = $derived(selected ? selected.price * Math.min(quantity, maxQuantity) : 0);
	let errors = $derived(result?.errors ?? {});

	const closedText = {
		cancelled: 'El evento se canceló: no hay venta de entradas.',
		soldout: 'Entradas agotadas.',
		closed: 'La venta online ya cerró.',
		unavailable: 'La venta online no está disponible en este momento.'
	};

	/** @param {number | null} ms */
	function formatClose(ms) {
		if (!ms) return '';
		return new Date(ms).toLocaleString('es-AR', {
			dateStyle: 'long',
			timeStyle: 'short',
			hourCycle: 'h23',
			timeZone: 'America/Argentina/Buenos_Aires'
		});
	}
</script>

<section class="tickets" id="entradas" aria-labelledby="entradas-titulo">
	<h2 id="entradas-titulo">Comprar entradas</h2>
	{#if tickets.mock}
		<p class="mock-note">🧪 Modo de prueba: el pago es simulado, no se cobra nada.</p>
	{/if}

	{#if !tickets.open}
		<p class="closed" role="status">{closedText[tickets.reason ?? 'unavailable']}</p>
		<ul class="types readonly">
			{#each tickets.types as t (t.id)}
				<li><span>{t.name}</span> <strong>{formatARS(t.price)}</strong></li>
			{/each}
		</ul>
	{:else}
		<form
			method="POST"
			action="?/buy#entradas"
			use:enhance={() => {
				pending = true;
				return async ({ result: res, update }) => {
					if (res.type === 'redirect') {
						// El checkout de Mercado Pago es otro sitio: navegación completa.
						window.location.href = res.location;
						return;
					}
					await update({ reset: false });
					pending = false;
				};
			}}
		>
			<fieldset class="types">
				<legend>Tipo de entrada</legend>
				{#each tickets.types as t (t.id)}
					<label class="type" class:soldout={t.available === 0}>
						<input
							type="radio"
							name="type"
							value={t.id}
							bind:group={type}
							disabled={t.available === 0}
							required
						/>
						<span class="type-name">{t.name}</span>
						<strong class="type-price">{formatARS(t.price)}</strong>
						<small class="type-left">
							{#if t.available === 0}Agotada{:else if t.available <= 5}¡Quedan {t.available}!{/if}
						</small>
					</label>
				{/each}
				{#if errors.type}<p class="field-error">{errors.type}</p>{/if}
			</fieldset>

			<label class="field">
				<span>Cantidad</span>
				<select name="quantity" bind:value={quantity}>
					{#each Array.from({ length: maxQuantity }, (_, i) => i + 1) as n (n)}
						<option value={n}>{n}</option>
					{/each}
				</select>
				{#if errors.quantity}<span class="field-error">{errors.quantity}</span>{/if}
			</label>

			<label class="field">
				<span>Nombre (como figura en tu documento o como te conocen en la puerta)</span>
				<input
					type="text"
					name="name"
					autocomplete="name"
					minlength="2"
					maxlength="80"
					required
					value={result?.values?.name ?? ''}
					aria-invalid={errors.name ? 'true' : undefined}
				/>
				{#if errors.name}<span class="field-error">{errors.name}</span>{/if}
			</label>

			<label class="field">
				<span>Email (ahí te mandamos las entradas)</span>
				<input
					type="email"
					name="email"
					autocomplete="email"
					maxlength="254"
					required
					value={result?.values?.email ?? ''}
					aria-invalid={errors.email ? 'true' : undefined}
				/>
				{#if errors.email}<span class="field-error">{errors.email}</span>{/if}
			</label>

			<details class="conditions">
				<summary>Condiciones de compra</summary>
				<ul>
					<li>
						Evento solo para personas mayores de 18 años. Puede pedirse documento en la puerta.
					</li>
					<li>Cada entrada tiene un QR que sirve para una sola persona y un solo ingreso.</li>
					<li>Te mandamos las entradas por email apenas se acredita el pago.</li>
					<li>
						Reservamos tu lugar por 20 minutos mientras pagás; si no se completa el pago, el lugar
						se libera.
					</li>
					<li>Para cambios o devoluciones escribinos respondiendo el email de tus entradas.</li>
				</ul>
			</details>

			<label class="accept">
				<input type="checkbox" name="accept" required />
				<span>Tengo 18 años o más y acepto las condiciones de compra.</span>
			</label>
			{#if errors.accept}<p class="field-error">{errors.accept}</p>{/if}

			{#if result?.error}
				<p class="form-error" role="alert">{result.error}</p>
			{/if}

			<div class="pay">
				<p class="total">Total: <strong>{formatARS(total)}</strong></p>
				<button type="submit" disabled={pending || !selected}>
					{pending ? 'Un momento…' : 'Ir a pagar con Mercado Pago'}
				</button>
			</div>
			{#if tickets.closesAt}
				<small class="closes">La venta online cierra el {formatClose(tickets.closesAt)} hs.</small>
			{/if}
			<small class="privacy">
				Solo guardamos tu nombre y email para mandarte las entradas y controlar el ingreso.
			</small>
		</form>
	{/if}
</section>

<style>
	.tickets {
		max-width: 40rem;
		margin: 1.5em auto 0;
		padding: 1em 1.2em 1.2em;
		border-radius: 1em;
		outline: 3px solid var(--1);
		background: color-mix(in srgb, var(--1) 6%, white);
		font-size: var(--step-0);
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-2);
		color: var(--1-dark);
	}
	.mock-note {
		background: var(--4-light);
		padding: 0.4em 0.7em;
		border-radius: 0.5em;
		margin: 0 0 0.8em;
		font-size: var(--step--1);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.9em;
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	legend {
		font-weight: bold;
		margin-bottom: 0.4em;
	}
	.type {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-areas: 'radio name price' 'radio left left';
		align-items: center;
		column-gap: 0.7em;
		padding: 0.7em 0.9em;
		border-radius: 0.7em;
		background: white;
		outline: 2px solid color-mix(in srgb, var(--2) 35%, transparent);
		cursor: pointer;
	}
	.type:has(input:checked) {
		outline: 3px solid var(--2);
	}
	.type.soldout {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.type input {
		grid-area: radio;
		width: 1.3em;
		height: 1.3em;
		accent-color: var(--2);
	}
	.type-name {
		grid-area: name;
		font-weight: bold;
	}
	.type-price {
		grid-area: price;
	}
	.type-left {
		grid-area: left;
		color: var(--1-dark);
	}
	.type-left:empty {
		display: none;
	}
	.readonly {
		list-style: none;
		padding: 0;
	}
	.readonly li {
		display: flex;
		justify-content: space-between;
		padding: 0.3em 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
	}
	.field span:first-child {
		font-weight: bold;
		font-size: var(--step--1);
	}
	input[type='text'],
	input[type='email'],
	select {
		font: inherit;
		padding: 0.55em 0.7em;
		border-radius: 0.5em;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: white;
		min-height: 2.8em;
	}
	select {
		max-width: 7em;
	}
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--2-light);
	}
	.conditions {
		font-size: var(--step--1);
	}
	.conditions summary {
		cursor: pointer;
		text-decoration: underline;
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
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6em;
	}
	.total {
		margin: 0;
		font-size: var(--step-1);
	}
	button {
		font: inherit;
		font-weight: bold;
		color: white;
		background: var(--1);
		border: 0;
		border-radius: 0.6em;
		padding: 0.8em 1.3em;
		min-height: 3em;
		cursor: pointer;
		flex-grow: 1;
		max-width: 22em;
	}
	button:hover:not(:disabled) {
		background: var(--1-dark);
	}
	button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.field-error,
	.form-error {
		color: hsl(0, 75%, 40%);
		font-size: var(--step--1);
		margin: 0;
	}
	.form-error {
		font-weight: bold;
	}
	.closed {
		font-weight: bold;
	}
	.closes,
	.privacy {
		color: #555;
		font-size: var(--step--2);
	}
	@media (max-width: 500px) {
		.tickets {
			padding: 0.9em;
		}
		button {
			max-width: none;
			width: 100%;
		}
	}
</style>
