<script>
	/**
	 * Paso «Entradas» de la compra: tipo de entrada (con preventas/tandas), cómo pagarla (opciones
	 * del Fondo) o cuánto pagar (a la gorra), cantidad y código de descuento. Los valores los
	 * maneja TicketPurchase.svelte (con `bind:`); acá solo se muestran y se editan.
	 */
	import { formatARS } from '$lib/utils/money.js';
	import { formatSaleTime, leftText, unitPrice } from '$lib/utils/tickets.js';
	import { gorraAmountError } from '$lib/utils/purchaseSteps.js';

	/** @type {import('$lib/server/tickets/checkout.js').TicketsView} */
	export let tickets;
	/** Id del tipo elegido. */
	export let type = '';
	/** Opción del Fondo elegida (vacío = la de por defecto). */
	export let option = '';
	/** Monto a la gorra por entrada, como texto (vacío = el sugerido). */
	export let amount = '';
	export let quantity = 1;
	export let code = '';

	/** @type {import('$lib/server/tickets/checkout.js').TicketsView['types'][number] | undefined} */
	export let selected = undefined;
	/** @type {{ value: number | null, tooHigh: boolean }} */
	export let gorraState = { value: null, tooHigh: false };
	/** @type {number[]} */
	export let gorraChips = [];
	/** @type {readonly { id: string, label: string, percent: number }[]} */
	export let fondoOptions = [];
	/** @type {{ id: string }} */
	export let chosenOption = { id: '' };
	export let maxQuantity = 1;
	export let count = 1;
	/** @type {Record<string, string>} */
	export let errors = {};
	/** @type {import('$lib/server/tickets/checkout.js').AppliedDiscount | null} */
	export let applied = null;

	$: gorra = selected?.gorra ?? null;

	/** Lo que está escrito en el campo de cantidad (se puede tipear; se corrige al salir). */
	let quantityText = String(quantity);
	let typingQuantity = false;
	// Si la cantidad cambia desde afuera (borrador, otro tipo con menos lugar), se muestra.
	$: if (!typingQuantity) quantityText = String(quantity);

	/** @param {number} n */
	function setQuantity(n) {
		quantity = Math.max(1, Math.min(maxQuantity, n));
		quantityText = String(quantity);
	}

	/** @param {Event & { currentTarget: HTMLInputElement }} e */
	function typedQuantity(e) {
		quantityText = e.currentTarget.value;
		const n = Math.trunc(Number(quantityText));
		if (quantityText.trim() && Number.isFinite(n) && n >= 1) quantity = Math.min(n, maxQuantity);
	}
</script>

<fieldset class="types" data-invalid={errors.type ? '' : undefined}>
	<legend>Tipo de entrada</legend>
	<!-- Tramo de preventa que se está viendo: el servidor elige el precio, esto solo sirve para
	     avisar si cambió antes de cobrar. -->
	<input type="hidden" name="tier" value={selected?.tier?.id ?? ''} />
	{#each tickets.types as t (t.id)}
		<label class="type" class:soldout={t.available === 0 || t.closed}>
			<input
				type="radio"
				name="type"
				value={t.id}
				bind:group={type}
				disabled={t.available === 0 || t.closed}
				required
			/>
			<span class="type-name"
				>{t.name}{#if t.tier}<span class="type-tier">{t.tier.name}</span>{/if}</span
			>
			<span class="type-price">
				{#if t.gorra}
					<strong>A la gorra</strong>
				{:else}
					{#if t.fondo}<s class="list-price" aria-label="precio completo {formatARS(t.price)}"
							>{formatARS(t.price)}</s
						>{/if}
					<strong>{formatARS(t.price - t.fondo)}</strong>
				{/if}
			</span>
			{#if t.gorra}
				<small class="type-fondo">
					Pagás lo que quieras: sugerido {formatARS(t.gorra.suggested)}{#if t.gorra.min}, mínimo
						{formatARS(t.gorra.min)}{/if}
				</small>
			{:else if t.fondo}
				<small class="type-fondo">
					💜 Con el descuento del Fondo Kinky Vibe ({formatARS(t.fondo)} menos)
				</small>
			{/if}
			<small class="type-left">
				{#if t.closed}Venta cerrada{:else if t.waitingFor}Se habilita cuando se agote «{t.waitingFor}»{:else if t.available === 0}Agotadas{:else if t.left !== null}{leftText(
						t.left
					)}{#if t.tierLeft}{' '}a este precio{/if}{:else if t.tier?.until}{t.tier.name} hasta el
					{formatSaleTime(t.tier.until)}{:else if t.closesAt}Hasta el {formatSaleTime(
						t.closesAt
					)}{/if}
			</small>
		</label>
	{/each}
	{#if errors.type}<p class="field-error">{errors.type}</p>{/if}
</fieldset>

{#if selected && gorra}
	<div class="field gorra">
		<label for="entradas-monto">¿Cuánto querés pagar por entrada?</label>
		<div class="amount-row">
			<span class="currency" aria-hidden="true">$</span>
			<input
				id="entradas-monto"
				type="text"
				name="amount"
				inputmode="numeric"
				autocomplete="off"
				maxlength="12"
				placeholder="Sugerido: {gorra.suggested}"
				bind:value={amount}
				aria-describedby="entradas-monto-ayuda"
				aria-invalid={errors.amount || (amount.trim() && gorraState.value === null)
					? 'true'
					: undefined}
			/>
		</div>
		<div class="chips" role="group" aria-label="Montos rápidos">
			{#each gorraChips as n (n)}
				<button
					type="button"
					class="chip"
					aria-pressed={gorraState.value === n}
					on:click={() => (amount = String(n))}
					>{n === 0 ? 'Sin cargo' : formatARS(n)}{#if n === gorra?.suggested}&nbsp;· sugerido{/if}</button
				>
			{/each}
		</div>
		<small class="hint" id="entradas-monto-ayuda">
			Sugerido {formatARS(gorra.suggested)}{#if gorra.min}, mínimo {formatARS(gorra.min)}{:else}. Si
				no podés pagar, poné 0{/if}. En las entradas a la gorra no se aplican el descuento del Fondo
			Kinky Vibe ni los códigos de descuento: pagás el monto que elijas{#if tickets.feeBasisPoints}{' '}(con
				Mercado Pago se suma el recargo de la comisión){/if}.
		</small>
		{#if errors.amount}
			<span class="field-error">{errors.amount}</span>
		{:else if amount.trim() && gorraState.value === null}
			<span class="field-error">{gorraAmountError(gorra, gorraState.tooHigh)}</span>
		{/if}
	</div>
{:else if selected && tickets.fondoEnabled}
	<fieldset class="options">
		<legend>¿Cómo querés pagar tu entrada?</legend>
		<small class="hint">
			El <a href="https://fondo.kinkyvibe.ar" target="_blank" rel="noopener">Fondo Kinky Vibe</a>
			baja el precio de todo lo que hacemos para todo el mundo{#if tickets.fondoPercent}{' '}(este
				mes, un {tickets.fondoPercent} %){/if}. Si podés, sumá un aporte: lo que pagás de más va
			entero al fondo.
		</small>
		{#each fondoOptions as o (o.id)}
			{@const u = unitPrice(
				selected.price,
				selected.fondo,
				/** @type {import('$lib/utils/tickets.js').FondoOption} */ (o.id)
			)}
			<label class="option">
				<input
					type="radio"
					name="option"
					value={o.id}
					checked={chosenOption.id === o.id}
					on:change={() => (option = o.id)}
				/>
				<span class="option-name">
					{o.label}{#if o.percent}{' '}<small>(+{o.percent} %)</small>{/if}
				</span>
				<strong class="option-price">{formatARS(u.price)}</strong>
				<small class="option-note">
					{#if o.id === 'fondo'}
						el fondo cubre {formatARS(u.fondo)} de cada entrada
					{:else if o.id === 'completo'}
						{selected.fondo ? 'sin usar el descuento del fondo' : 'precio de la entrada'}
					{:else}
						{formatARS(u.contribution)} por entrada van al Fondo Kinky Vibe
					{/if}
				</small>
			</label>
		{/each}
		{#if errors.option}<p class="field-error">{errors.option}</p>{/if}
	</fieldset>
{/if}

<div class="field qty">
	<label for="entradas-cantidad">Cantidad</label>
	<div class="stepper">
		<button
			type="button"
			class="step"
			aria-label="Una entrada menos"
			aria-controls="entradas-cantidad"
			disabled={count <= 1}
			on:click={() => setQuantity(count - 1)}>−</button
		>
		<input
			id="entradas-cantidad"
			type="number"
			name="quantity"
			inputmode="numeric"
			min="1"
			max={maxQuantity}
			step="1"
			required
			value={quantityText}
			on:focus={() => (typingQuantity = true)}
			on:input={typedQuantity}
			on:blur={() => {
				typingQuantity = false;
				setQuantity(count);
			}}
			aria-invalid={errors.quantity ? 'true' : undefined}
		/>
		<button
			type="button"
			class="step"
			aria-label="Una entrada más"
			aria-controls="entradas-cantidad"
			disabled={count >= maxQuantity}
			on:click={() => setQuantity(count + 1)}>+</button
		>
	</div>
	{#if errors.quantity}<span class="field-error">{errors.quantity}</span>{/if}
</div>

{#if !gorra}
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
				formaction="?/discount"
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
{/if}

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
	.type {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-areas: 'radio name price' 'radio fondo fondo' 'radio left left';
		align-items: center;
		column-gap: 0.7em;
		padding: 0.7em 0.9em;
		border-radius: var(--radius-s);
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
		min-width: 0;
		overflow-wrap: anywhere;
	}
	/* Tramo vigente de una preventa ("Preventa 1"): una etiqueta chica al lado del nombre. */
	.type-tier {
		display: inline-block;
		margin-left: 0.5em;
		padding: 0.05em 0.6em;
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--2) 15%, white);
		color: var(--2-dark);
		font-size: var(--step--1);
		font-weight: normal;
		white-space: nowrap;
	}
	.type-price {
		grid-area: price;
		text-align: right;
	}
	.list-price {
		color: var(--muted);
		font-size: var(--step--1);
		margin-right: 0.3em;
	}
	.type-fondo {
		grid-area: fondo;
		color: var(--2-dark);
	}
	.type-left {
		grid-area: left;
		color: var(--1-ink);
	}
	.type-left:empty {
		display: none;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}
	.field > label {
		font-weight: bold;
		font-size: var(--step--1);
	}
	.hint {
		color: var(--muted);
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
	button {
		font: inherit;
		font-weight: bold;
		border: 0;
		border-radius: var(--round-pill);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	button.secondary {
		flex-grow: 0;
		background: white;
		color: var(--1-dark);
		outline: 0;
		border: 2px solid var(--1);
		box-shadow: none;
		padding: 0.5em 1.1em;
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
	input[type='text'],
	input[type='number'] {
		font: inherit;
		padding: 0.55em 0.7em;
		border-radius: var(--radius-s);
		border: 1px solid var(--field);
		background: var(--surface);
		/* campo grande (~54px): solo en el flujo de compra (docs/estilo.md, «Piezas») */
		min-height: 3.375rem;
		min-width: 0;
	}

	/* Cantidad: "Cantidad  [− n +]" en una línea, un stepper compacto. Los botones miden 44 × 44
	   por dentro del borde (el mínimo para el dedo que usa todo el sitio). */
	.field.qty {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4em 0.8em;
	}
	.field.qty > label {
		font-size: var(--step-0);
	}
	.stepper {
		display: inline-flex;
		align-items: stretch;
		/* 44 px de botón + 2 px de borde arriba y abajo. */
		height: 48px;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		border-radius: var(--radius-pill);
		background: white;
		overflow: hidden;
	}
	.stepper:focus-within {
		border-color: var(--2);
	}
	.stepper input {
		width: 2.8em;
		min-height: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		text-align: center;
		font-size: var(--step-0);
		font-weight: bold;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.stepper input:focus-visible {
		outline: 2px solid var(--2-light);
		outline-offset: -2px;
	}
	.stepper input::-webkit-outer-spin-button,
	.stepper input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	button.step {
		flex: 0 0 44px;
		width: 44px;
		min-width: 44px;
		min-height: 0;
		height: auto;
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		box-shadow: none;
		font-size: var(--step-1);
		font-weight: bold;
		line-height: 1;
		background: transparent;
		color: var(--2-dark);
	}
	button.step:hover:not(:disabled) {
		background: color-mix(in srgb, var(--2) 10%, white);
	}
	button.step:disabled {
		color: color-mix(in srgb, var(--2-dark) 35%, transparent);
		background: transparent;
		opacity: 1;
	}

	/* A la gorra */
	.amount-row {
		display: flex;
		align-items: center;
		gap: 0.4em;
	}
	.amount-row .currency {
		font-size: var(--step-1);
		font-weight: bold;
	}
	.amount-row input {
		width: 9em;
		font-size: var(--step-1);
		font-weight: bold;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
	}
	button.chip {
		flex-grow: 0;
		min-height: 2.6em;
		padding: 0.3em 0.8em;
		font-weight: normal;
		font-size: var(--step--1);
		background: white;
		color: var(--2-dark);
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--2) 35%, transparent);
	}
	button.chip:hover:not(:disabled) {
		background: color-mix(in srgb, var(--2) 10%, white);
	}
	/* el elegido, lleno de su color (como los montos de las propinas) */
	button.chip[aria-pressed='true'],
	button.chip[aria-pressed='true']:hover:not(:disabled) {
		background: var(--2-dark);
		color: white;
		box-shadow: inset 0 0 0 2px var(--2-dark);
		font-weight: bold;
	}
	.option {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-areas: 'radio name price' 'radio note note';
		align-items: center;
		column-gap: 0.7em;
		padding: 0.55em 0.9em;
		border-radius: var(--radius-s);
		background: white;
		outline: 2px solid color-mix(in srgb, var(--2) 35%, transparent);
		cursor: pointer;
	}
	.option:has(input:checked) {
		outline: 3px solid var(--2);
	}
	.option input {
		grid-area: radio;
		width: 1.2em;
		height: 1.2em;
		accent-color: var(--2);
	}
	.option-name {
		grid-area: name;
		font-weight: bold;
		min-width: 0;
	}
	.option-price {
		grid-area: price;
		text-align: right;
		white-space: nowrap;
	}
	.option-note {
		grid-area: note;
		color: var(--muted);
		font-size: var(--step--1);
	}
	.field-error {
		color: var(--error);
		font-size: var(--step--1);
		margin: 0;
	}
</style>
