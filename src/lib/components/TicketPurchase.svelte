<script>
	import { enhance } from '$app/forms';
	import { formatARS } from '$lib/utils/money.js';
	import { computePrice, refundPolicy } from '$lib/utils/tickets.js';

	/**
	 * Bloque "Comprar entradas" de la página de un evento. Funciona sin JavaScript (form actions
	 * `?/discount` y `?/buy`). Los precios, descuentos y recargos que se muestran son
	 * informativos: el servidor recalcula todo con el frontmatter del evento y la base de datos.
	 *
	 * @type {{
	 *   tickets: import('$lib/server/tickets/checkout.js').TicketsView,
	 *   result?: {
	 *     error?: string | null,
	 *     errors?: Record<string, string>,
	 *     values?: { type?: string, quantity?: string, name?: string, email?: string, dni?: string, code?: string, method?: string, holders?: HolderValues[] },
	 *     discount?: import('$lib/server/tickets/checkout.js').AppliedDiscount | null
	 *   } | null
	 * }}
	 */
	let { tickets, result = null } = $props();

	/** @typedef {{ name: string, pronouns: string }} HolderValues */

	// Valores iniciales del formulario (a propósito no reactivos: después los maneja la persona).
	// svelte-ignore state_referenced_locally
	const initial = result?.values ?? {};
	// svelte-ignore state_referenced_locally
	const firstAvailable = tickets.types.find((t) => t.available > 0)?.id ?? '';
	let type = $state(initial.type || firstAvailable);
	let quantity = $state(Number(initial.quantity) || 1);
	let buyerName = $state(initial.name ?? '');
	let email = $state(initial.email ?? '');
	let dni = $state(initial.dni ?? '');
	let code = $state(initial.code ?? '');
	// svelte-ignore state_referenced_locally
	let method = $state(initial.method || tickets.methods[0] || 'mercadopago');
	/** @type {HolderValues[]} */
	// svelte-ignore state_referenced_locally
	let holders = $state(
		Array.from({ length: tickets.maxQuantity }, (_, i) => ({
			name: initial.holders?.[i]?.name ?? '',
			pronouns: initial.holders?.[i]?.pronouns ?? ''
		}))
	);
	// La entrada 1 copia el nombre de quien compra hasta que alguien la edite a mano.
	// svelte-ignore state_referenced_locally
	let firstHolderEdited = $state(Boolean(initial.holders?.[0]?.name));
	$effect(() => {
		if (!firstHolderEdited) holders[0].name = buyerName;
	});
	let pending = $state(false);

	let selected = $derived(tickets.types.find((t) => t.id === type));
	let maxQuantity = $derived(Math.max(1, Math.min(tickets.maxQuantity, selected?.available ?? 1)));
	let count = $derived(Math.min(quantity, maxQuantity));
	let errors = $derived(result?.errors ?? {});
	// El descuento aplicado vale mientras el código escrito sea el mismo.
	let applied = $derived(
		result?.discount && result.discount.code === code.trim().toUpperCase() ? result.discount : null
	);
	let prices = $derived(
		computePrice({
			price: selected?.price ?? 0,
			fondo: selected?.fondo ?? 0,
			quantity: selected ? count : 0,
			discount: applied,
			method,
			feeBasisPoints: tickets.feeBasisPoints
		})
	);
	let free = $derived(Boolean(selected) && prices.subtotal - prices.discount === 0);
	let policy = $derived(refundPolicy(tickets.contactEmail));

	const closedText = {
		cancelled: 'El evento se canceló: no hay venta de entradas.',
		soldout: 'Entradas agotadas.',
		closed: 'La venta online ya cerró.',
		unavailable: 'La venta online no está disponible en este momento.'
	};

	let submitText = $derived(
		pending
			? 'Un momento…'
			: free
				? 'Confirmar entradas sin cargo'
				: method === 'transferencia'
					? 'Reservar y ver los datos para transferir'
					: 'Ir a pagar con Mercado Pago'
	);

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

	/** Porcentaje de comisión para mostrar (773 → "7,73 %"). */
	let feeText = $derived(
		(tickets.feeBasisPoints / 100).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' %'
	);
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
				<li><span>{t.name}</span> <strong>{formatARS(t.price - t.fondo)}</strong></li>
			{/each}
		</ul>
	{:else}
		<form
			method="POST"
			action="?/buy#entradas"
			use:enhance={({ submitter }) => {
				const applying = submitter?.getAttribute('formaction')?.includes('discount');
				if (!applying) pending = true;
				return async ({ result: res, update }) => {
					if (res.type === 'redirect' && /^https?:/.test(res.location)) {
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
						<span class="type-price">
							{#if t.fondo}<s class="list-price">{formatARS(t.price)}</s>{/if}
							<strong>{formatARS(t.price - t.fondo)}</strong>
						</span>
						{#if t.fondo}
							<small class="type-fondo">
								💜 El Fondo KinkyVibe cubre {formatARS(t.fondo)} de tu entrada
							</small>
						{/if}
						<small class="type-left">
							{#if t.available === 0}Agotada{:else if t.available <= 5}¡Quedan {t.available}!{/if}
						</small>
					</label>
				{/each}
				{#if errors.type}<p class="field-error">{errors.type}</p>{/if}
			</fieldset>

			<div class="field">
				<label for="entradas-cantidad">Cantidad</label>
				<select id="entradas-cantidad" name="quantity" bind:value={quantity}>
					{#each Array.from({ length: maxQuantity }, (_, i) => i + 1) as n (n)}
						<option value={n}>{n}</option>
					{/each}
				</select>
				{#if (selected?.available ?? 0) > tickets.maxQuantity}
					<small class="hint">
						¿Necesitás más de {tickets.maxQuantity}? Escribinos a
						<a href="mailto:{tickets.contactEmail}">{tickets.contactEmail}</a>.
					</small>
				{/if}
				{#if errors.quantity}<span class="field-error">{errors.quantity}</span>{/if}
			</div>

			<fieldset class="group">
				<legend>Tus datos</legend>
				<label class="field">
					<span>Tu nombre</span>
					<input
						type="text"
						name="name"
						autocomplete="name"
						minlength="2"
						maxlength="80"
						required
						bind:value={buyerName}
						aria-invalid={errors.name ? 'true' : undefined}
					/>
					{#if errors.name}<span class="field-error">{errors.name}</span>{/if}
				</label>
				<div class="row">
					<label class="field">
						<span>Email (ahí mandamos {count === 1 ? 'la entrada' : 'las entradas'})</span>
						<input
							type="email"
							name="email"
							autocomplete="email"
							maxlength="254"
							required
							bind:value={email}
							aria-invalid={errors.email ? 'true' : undefined}
						/>
						{#if errors.email}<span class="field-error">{errors.email}</span>{/if}
					</label>
					<label class="field">
						<span>DNI (número de documento)</span>
						<input
							type="text"
							name="dni"
							inputmode="numeric"
							autocomplete="off"
							maxlength="12"
							required
							placeholder="12.345.678"
							bind:value={dni}
							aria-invalid={errors.dni ? 'true' : undefined}
						/>
						{#if errors.dni}<span class="field-error">{errors.dni}</span>{/if}
					</label>
				</div>
				<small class="hint">
					El email y el DNI son datos administrativos de la compra: el DNI no aparece en las
					entradas ni en los mails.
				</small>
			</fieldset>

			<fieldset class="group">
				<legend>{count === 1 ? 'Tu entrada' : 'Las entradas'}</legend>
				<small class="hint">
					Nombre y pronombres de cada persona, para el evento. El nombre es como le conocen: no
					tiene que ser el del documento.
				</small>
				{#each Array.from({ length: count }, (v, n) => n) as i (i)}
					<fieldset class="holder">
						<legend
							>Entrada {i + 1}{#if i === 0}&nbsp;(vos){/if}</legend
						>
						<div class="row">
							<label class="field">
								<span>Nombre</span>
								<input
									type="text"
									name="holder_name_{i}"
									autocomplete="off"
									maxlength="80"
									required={i > 0}
									bind:value={holders[i].name}
									oninput={() => {
										if (i === 0) firstHolderEdited = true;
									}}
									aria-invalid={errors[`holder_name_${i}`] ? 'true' : undefined}
								/>
								{#if errors[`holder_name_${i}`]}
									<span class="field-error">{errors[`holder_name_${i}`]}</span>
								{/if}
							</label>
							<label class="field">
								<span>Pronombres (opcional)</span>
								<input
									type="text"
									name="holder_pronouns_{i}"
									maxlength="30"
									placeholder="ella, él, elle…"
									autocomplete="off"
									bind:value={holders[i].pronouns}
								/>
								{#if errors[`holder_pronouns_${i}`]}
									<span class="field-error">{errors[`holder_pronouns_${i}`]}</span>
								{/if}
							</label>
						</div>
					</fieldset>
				{/each}
			</fieldset>

			<div class="field code">
				<label for="entradas-codigo">Código de descuento (opcional)</label>
				<div class="code-row">
					<input
						id="entradas-codigo"
						type="text"
						name="code"
						maxlength="32"
						autocomplete="off"
						autocapitalize="characters"
						spellcheck="false"
						bind:value={code}
						aria-invalid={errors.code ? 'true' : undefined}
					/>
					<button
						type="submit"
						class="secondary"
						formaction="?/discount#entradas"
						formnovalidate
						disabled={!code.trim()}>Aplicar</button
					>
				</div>
				{#if errors.code}
					<span class="field-error" role="alert">{errors.code}</span>
				{:else if applied}
					<span class="applied" role="status">✓ {applied.message}</span>
				{/if}
			</div>

			{#if tickets.methods.length > 1 && !free}
				<fieldset class="methods">
					<legend>Medio de pago</legend>
					{#each tickets.methods as m (m)}
						<label class="method">
							<input type="radio" name="method" value={m} bind:group={method} />
							{#if m === 'mercadopago'}
								<span>
									<strong>Mercado Pago</strong>
									<small>
										tarjeta o dinero en cuenta{#if tickets.feeBasisPoints}{' '}· suma el recargo de
											la comisión ({feeText}){/if}
									</small>
								</span>
							{:else}
								<span>
									<strong>Transferencia bancaria</strong>
									<small
										>sin recargo · te reservamos el lugar {tickets.transferHoldHours} horas</small
									>
								</span>
							{/if}
						</label>
					{/each}
					{#if errors.method}<p class="field-error">{errors.method}</p>{/if}
				</fieldset>
			{:else}
				<input type="hidden" name="method" value={free ? '' : (tickets.methods[0] ?? '')} />
			{/if}

			<details class="conditions">
				<summary>Condiciones de compra y devoluciones</summary>
				<ul>
					<li>
						Evento solo para personas mayores de 18 años. Puede pedirse documento en la puerta.
					</li>
					<li>Cada entrada tiene un QR que sirve para una sola persona y un solo ingreso.</li>
					<li>Te mandamos las entradas por email apenas se acredita el pago.</li>
					<li>
						Con Mercado Pago reservamos tu lugar por 20 minutos mientras pagás; con transferencia,
						{tickets.transferHoldHours} horas. Si no se completa el pago, el lugar se libera.
					</li>
				</ul>
				<div class="policy">
					<p><strong>{policy.title}</strong></p>
					{#each policy.paragraphs as paragraph, i (i)}
						<p>{paragraph}</p>
					{/each}
				</div>
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
				<div class="breakdown" aria-live="polite">
					{#if selected}
						<p class="line">
							<span>Entradas ({count} × {formatARS(selected.price - selected.fondo)})</span>
							<span>{formatARS(prices.subtotal)}</span>
						</p>
						{#if prices.fondo}
							<p class="line note">
								<span>💜 Ya descontado: el Fondo KinkyVibe cubre {formatARS(prices.fondo)}</span>
							</p>
						{/if}
						{#if prices.discount}
							<p class="line">
								<span>Código {applied?.code}</span>
								<span>−{formatARS(prices.discount)}</span>
							</p>
						{/if}
						{#if prices.surcharge}
							<p class="line">
								<span>Recargo Mercado Pago</span>
								<span>+{formatARS(prices.surcharge)}</span>
							</p>
						{/if}
					{/if}
					<p class="total">Total: <strong>{formatARS(prices.total)}</strong></p>
				</div>
				<button type="submit" disabled={pending || !selected}>{submitText}</button>
			</div>
			{#if tickets.closesAt}
				<small class="closes">La venta online cierra el {formatClose(tickets.closesAt)} hs.</small>
			{/if}
			<small class="privacy">
				Guardamos tu nombre, email y DNI, y el nombre y los pronombres de cada entrada, solo para
				mandarte las entradas y controlar el ingreso.
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
		grid-template-areas: 'radio name price' 'radio fondo fondo' 'radio left left';
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
		text-align: right;
	}
	.list-price {
		color: #777;
		font-size: var(--step--1);
		margin-right: 0.3em;
	}
	.type-fondo {
		grid-area: fondo;
		color: var(--2-dark);
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
	.field > span:first-child,
	.field > label {
		font-weight: bold;
		font-size: var(--step--1);
	}
	.group {
		gap: 0.6em;
	}
	.holder {
		padding: 0.6em 0.9em 0.8em;
		border-radius: 0.7em;
		background: white;
		outline: 2px solid color-mix(in srgb, var(--2) 25%, transparent);
	}
	.holder legend {
		float: left;
		margin: 0 0 0.3em;
		color: var(--2-dark);
		font-size: var(--step--1);
	}
	.holder .row {
		clear: both;
	}
	.policy {
		margin-top: 0.6em;
		padding: 0.6em 0.8em;
		border-radius: 0.5em;
		background: white;
	}
	.policy p {
		margin: 0.3em 0;
	}
	.breakdown {
		flex: 1 1 14em;
		font-size: var(--step--1);
	}
	.breakdown .line {
		display: flex;
		justify-content: space-between;
		gap: 1em;
		margin: 0.1em 0;
	}
	.breakdown .note {
		color: var(--2-dark);
	}
	.breakdown .total {
		margin-top: 0.3em;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6em;
	}
	.hint {
		color: #555;
		font-size: var(--step--2);
	}
	.code-row {
		display: flex;
		gap: 0.5em;
	}
	.code-row input {
		flex: 1;
		min-width: 0;
		text-transform: uppercase;
	}
	button.secondary {
		flex-grow: 0;
		background: white;
		color: var(--1-dark);
		outline: 2px solid var(--1);
		padding: 0.5em 1em;
		min-height: 2.8em;
	}
	button.secondary:hover:not(:disabled) {
		background: color-mix(in srgb, var(--1) 10%, white);
	}
	.applied {
		color: hsl(140, 60%, 28%);
		font-weight: bold;
		font-size: var(--step--1);
	}
	.method {
		display: flex;
		gap: 0.7em;
		align-items: center;
		padding: 0.6em 0.9em;
		border-radius: 0.7em;
		background: white;
		outline: 2px solid color-mix(in srgb, var(--2) 35%, transparent);
		cursor: pointer;
	}
	.method:has(input:checked) {
		outline: 3px solid var(--2);
	}
	.method input {
		width: 1.2em;
		height: 1.2em;
		accent-color: var(--2);
	}
	.method small {
		display: block;
		color: #555;
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
		cursor: not-allowed;
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
		.pay button {
			max-width: none;
			width: 100%;
		}
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>
