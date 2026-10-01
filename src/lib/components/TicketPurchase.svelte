<script>
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import SignupFieldInputs from '$lib/components/SignupFieldInputs.svelte';
	import { formatARS } from '$lib/utils/money.js';
	import {
		ORDER_MAX_MESSAGE,
		computePrice,
		defaultFondoOption,
		exceedsOrderMax,
		fondoOptionsFor,
		gorraQuickAmounts,
		mpSurcharge,
		parseAmount,
		formatSaleTime,
		leftText,
		purchaseConditions,
		saleWindowText,
		unitPrice
	} from '$lib/utils/tickets.js';

	/**
	 * Formulario de compra de entradas (página /calendario/<slug>/entradas). Funciona sin
	 * JavaScript (form actions `?/discount` y `?/buy`). Los precios, descuentos y recargos que se
	 * muestran son informativos: el servidor recalcula todo con el frontmatter del evento y la
	 * base de datos.
	 *
	 * Lo que se va completando se guarda en `sessionStorage` (solo esta pestaña; se borra al
	 * cerrarla) para no perderlo si la página se recarga, y se borra cuando la compra sale bien.
	 * Incluye el DNI a propósito: sessionStorage no se comparte con otras pestañas ni sobrevive a
	 * cerrar la pestaña, y es lo que la persona ya escribió en esta misma página. Nunca se usa
	 * localStorage para estos datos. No se guarda la casilla de +18 (hay que volver a marcarla).
	 *
	 * @type {{
	 *   tickets: import('$lib/server/tickets/checkout.js').TicketsView,
	 *   result?: {
	 *     error?: string | null,
	 *     errors?: Record<string, string>,
	 *     values?: { type?: string, quantity?: string, name?: string, pronouns?: string, email?: string, dni?: string, code?: string, method?: string, option?: string, amount?: string, holders?: HolderValues[], answers?: Record<string, string> },
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
	const firstAvailable = tickets.types.find((t) => t.available > 0 && !t.closed)?.id ?? '';
	let type = $state(initial.type || firstAvailable);
	let quantity = $state(Math.max(1, Math.trunc(Number(initial.quantity)) || 1));
	/** Lo que está escrito en el campo de cantidad (se puede tipear; se corrige al salir). */
	let quantityText = $state(String(Math.max(1, Math.trunc(Number(initial.quantity)) || 1)));
	let buyerName = $state(initial.name ?? '');
	let buyerPronouns = $state(initial.pronouns ?? '');
	let email = $state(initial.email ?? '');
	let dni = $state(initial.dni ?? '');
	let code = $state(initial.code ?? '');
	// svelte-ignore state_referenced_locally
	let method = $state(initial.method || tickets.methods[0] || 'mercadopago');
	/** @type {string} */
	let option = $state(initial.option ?? '');
	/** Monto "a la gorra" por entrada, como texto (vacío = el sugerido). */
	let amount = $state(initial.amount ?? '');
	/** @type {HolderValues[]} */
	// svelte-ignore state_referenced_locally
	let holders = $state(
		Array.from({ length: tickets.maxQuantity }, (_, i) => ({
			name: initial.holders?.[i]?.name ?? '',
			pronouns: initial.holders?.[i]?.pronouns ?? ''
		}))
	);
	// La entrada 1 copia el nombre y los pronombres de quien compra hasta que alguien los edite.
	// svelte-ignore state_referenced_locally
	let firstHolderEdited = $state(Boolean(initial.holders?.[0]?.name));
	// svelte-ignore state_referenced_locally
	let firstPronounsEdited = $state(Boolean(initial.holders?.[0]?.pronouns));
	$effect(() => {
		if (!firstHolderEdited) holders[0].name = buyerName;
	});
	$effect(() => {
		if (!firstPronounsEdited) holders[0].pronouns = buyerPronouns;
	});
	let pending = $state(false);

	let selected = $derived(tickets.types.find((t) => t.id === type));
	let gorra = $derived(selected?.gorra ?? null);
	// "¿Cómo querés pagar tu entrada?": sin fondo en este tipo, no se ofrece el descuento del
	// fondo y la opción por defecto es precio completo. No aplica a la gorra.
	// Sin la etiqueta KinkyVibe no hay Fondo: solo el precio de lista (el servidor hace lo mismo).
	let fondoOptions = $derived(
		tickets.fondoEnabled
			? fondoOptionsFor(selected?.fondo ?? 0)
			: fondoOptionsFor(0).filter((o) => o.id === 'completo')
	);
	let chosenOption = $derived(
		fondoOptions.find((o) => o.id === option) ??
			fondoOptions.find((o) => o.id === defaultFondoOption(selected?.fondo ?? 0)) ??
			fondoOptions[0]
	);
	let maxQuantity = $derived(Math.max(1, Math.min(tickets.maxQuantity, selected?.available ?? 1)));
	let count = $derived(Math.max(1, Math.min(quantity, maxQuantity)));
	let errors = $derived(result?.errors ?? {});
	// El descuento aplicado vale mientras el código escrito sea el mismo (y no a la gorra).
	let applied = $derived(
		!gorra && result?.discount && result.discount.code === code.trim().toUpperCase()
			? result.discount
			: null
	);
	/** Monto a la gorra por entrada que se va a cobrar (`null` si lo escrito no es válido). */
	let gorraAmount = $derived.by(() => {
		if (!gorra) return null;
		if (!amount.trim()) return gorra.suggested;
		const n = parseAmount(amount);
		return n !== null && n >= gorra.min && !exceedsOrderMax(n, count) ? n : null;
	});
	/** Lo escrito es un número válido pero pasa el tope técnico de la orden (¿un cero de más?). */
	let gorraTooHigh = $derived.by(() => {
		if (!gorra || !amount.trim()) return false;
		const n = parseAmount(amount);
		return n !== null && exceedsOrderMax(n, count);
	});
	/**
	 * Montos rápidos: el mínimo (si es mayor a 0), el mínimo recomendado, el sugerido, 1,5 × el
	 * sugerido y el doble.
	 */
	let gorraChips = $derived(
		gorra ? gorraQuickAmounts(gorra.min, gorra.suggested, gorra.recommended ?? null) : []
	);
	/** Eligió menos que el mínimo recomendado (se puede, pero se lo decimos con cariño). */
	let gorraBelowRecommended = $derived(
		Boolean(gorra?.recommended) && gorraAmount !== null && gorraAmount < (gorra?.recommended ?? 0)
	);
	let prices = $derived(
		computePrice({
			price: gorra ? (gorraAmount ?? 0) : (selected?.price ?? 0),
			fondo: selected?.fondo ?? 0,
			option: gorra ? 'gorra' : chosenOption.id,
			quantity: selected ? count : 0,
			discount: applied,
			method,
			feeBasisPoints: tickets.feeBasisPoints
		})
	);
	let free = $derived(
		Boolean(selected) && (!gorra || gorraAmount !== null) && prices.subtotal - prices.discount === 0
	);
	let conditions = $derived(
		purchaseConditions({
			contactEmail: tickets.contactEmail,
			transferHoldHours: tickets.transferHoldHours,
			methods: tickets.methods,
			online: tickets.online
		})
	);

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

	// Si cambia el tipo y hay menos disponibles, la cantidad baja al máximo nuevo.
	$effect(() => {
		if (quantity > maxQuantity) setQuantity(maxQuantity);
	});

	// --- Borrador en sessionStorage (ver arriba) ---
	const DRAFT_VERSION = 2;
	let draftKey = '';
	let draftReady = $state(false);

	function readDraft() {
		try {
			const raw = sessionStorage.getItem(draftKey);
			const d = raw ? JSON.parse(raw) : null;
			return d && d.v === DRAFT_VERSION ? d : null;
		} catch {
			return null;
		}
	}

	function clearDraft() {
		try {
			sessionStorage.removeItem(draftKey);
		} catch {
			// sin sessionStorage (modo privado estricto): no hay nada que borrar
		}
	}

	onMount(() => {
		draftKey = `kv-entradas:${location.pathname}`;
		// Si el servidor devolvió el formulario (con errores), eso manda.
		const d = result?.values ? null : readDraft();
		if (d) {
			if (tickets.types.some((t) => t.id === d.type && t.available > 0 && !t.closed)) type = d.type;
			if (Number(d.quantity) >= 1) setQuantity(Number(d.quantity));
			if (typeof d.option === 'string') option = d.option;
			if (typeof d.amount === 'string') amount = d.amount;
			if (typeof d.method === 'string' && tickets.methods.includes(d.method)) method = d.method;
			buyerName = String(d.name ?? '');
			buyerPronouns = String(d.pronouns ?? '');
			email = String(d.email ?? '');
			dni = String(d.dni ?? '');
			code = String(d.code ?? '');
			firstHolderEdited = Boolean(d.firstHolderEdited);
			firstPronounsEdited = Boolean(d.firstPronounsEdited);
			if (Array.isArray(d.holders)) {
				d.holders
					.slice(0, holders.length)
					.forEach((/** @type {any} */ h, /** @type {number} */ i) => {
						holders[i] = { name: String(h?.name ?? ''), pronouns: String(h?.pronouns ?? '') };
					});
			}
		}
		draftReady = true;
	});

	$effect(() => {
		if (!draftReady) return;
		const draft = JSON.stringify({
			v: DRAFT_VERSION,
			type,
			quantity,
			option,
			amount,
			method,
			name: buyerName,
			pronouns: buyerPronouns,
			email,
			dni,
			code,
			firstHolderEdited,
			firstPronounsEdited,
			holders: holders.slice(0, count).map((h) => ({ name: h.name, pronouns: h.pronouns }))
		});
		try {
			sessionStorage.setItem(draftKey, draft);
		} catch {
			// sin sessionStorage: el formulario funciona igual, solo no sobrevive a una recarga
		}
	});

	const closedText = {
		cancelled: 'El evento se canceló: no hay venta de entradas.',
		soldout: 'Entradas agotadas.',
		closed: 'Venta cerrada.',
		notyet: tickets.opensAt
			? `${saleWindowText({ opensAt: tickets.opensAt })}.`
			: 'La venta todavía no abrió.',
		unavailable: 'La venta online no está disponible en este momento.'
	};

	let submitText = $derived(
		pending
			? 'Un momento…'
			: free
				? 'Confirmar entradas sin cargo'
				: method === 'transferencia'
					? 'Reservar y ver cómo transferir'
					: 'Ir a pagar con Mercado Pago'
	);

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
				<li>
					<span>{t.name}</span>
					<strong
						>{t.gorra
							? `A la gorra (sugerido ${formatARS(t.gorra.suggested)})`
							: formatARS(t.price - t.fondo)}</strong
					>
				</li>
			{/each}
		</ul>
	{:else}
		<form
			method="POST"
			action="?/buy"
			use:enhance={({ submitter }) => {
				const applying = submitter?.getAttribute('formaction')?.includes('discount');
				if (!applying) pending = true;
				return async ({ result: res, update }) => {
					// La compra salió bien (vamos a pagar, a los datos para transferir o a las
					// entradas): ya no hace falta el borrador.
					if (res.type === 'redirect') clearDraft();
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
				<!-- Tramo de preventa que se está viendo: el servidor elige el precio, esto solo sirve
				     para avisar si cambió antes de cobrar. -->
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
								Pagás lo que quieras: sugerido {formatARS(
									t.gorra.suggested
								)}{#if t.gorra.recommended}, mínimo recomendado {formatARS(
										t.gorra.recommended
									)}{/if}{#if t.gorra.min}, mínimo
									{formatARS(t.gorra.min)}{/if}
							</small>
						{:else if t.fondo}
							<small class="type-fondo">
								💜 Con el descuento del Fondo KinkyVibe ({formatARS(t.fondo)} menos)
							</small>
						{/if}
						<small class="type-left">
							{#if t.closed}Venta cerrada{:else if t.waitingFor}Se habilita cuando se agote «{t.waitingFor}»{:else if t.available === 0}Agotada{:else if t.left !== null}{leftText(
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
							placeholder={String(gorra.suggested)}
							bind:value={amount}
							aria-describedby="entradas-monto-ayuda"
							aria-invalid={errors.amount || (amount.trim() && gorraAmount === null)
								? 'true'
								: undefined}
						/>
					</div>
					<div class="chips" role="group" aria-label="Montos rápidos">
						{#each gorraChips as n (n)}
							<button
								type="button"
								class="chip"
								aria-pressed={gorraAmount === n}
								onclick={() => (amount = String(n))}
								>{n === 0 ? 'Sin cargo' : formatARS(n)}{#if n === gorra?.suggested}&nbsp;· sugerido{:else if n === gorra?.recommended}&nbsp;·
									mínimo recomendado{/if}</button
							>
						{/each}
					</div>
					<small class="hint" id="entradas-monto-ayuda">
						Sugerido {formatARS(gorra.suggested)}{#if gorra.recommended}, mínimo recomendado {formatARS(
								gorra.recommended
							)}{/if}{#if gorra.min}, mínimo {formatARS(gorra.min)}{:else}. Si no podés pagar, poné
							0{/if}. En las entradas a la gorra no se aplican el descuento del Fondo KinkyVibe ni
						los códigos de descuento: pagás el monto que elijas{#if tickets.feeBasisPoints}{' '}(con
							Mercado Pago se suma el recargo de la comisión){/if}.
					</small>
					{#if errors.amount}
						<span class="field-error">{errors.amount}</span>
					{:else if gorraTooHigh}
						<span class="field-error">{ORDER_MAX_MESSAGE}</span>
					{:else if amount.trim() && gorraAmount === null}
						<span class="field-error"
							>Escribí un monto en pesos (sin centavos), desde {formatARS(gorra.min)}.</span
						>
					{:else if gorraBelowRecommended}
						<span class="hint soft" role="status"
							>Está por debajo del mínimo recomendado ({formatARS(gorra.recommended ?? 0)}). Si
							podés poner más, nos ayudás a sostener el espacio; si no, está bien así.</span
						>
					{/if}
				</div>
			{:else if selected && tickets.fondoEnabled}
				<fieldset class="options">
					<legend>¿Cómo querés pagar tu entrada?</legend>
					<small class="hint">
						El <a href="https://fondo.kinkyvibe.ar" target="_blank" rel="noopener"
							>Fondo KinkyVibe</a
						>
						baja el precio de todo lo que hacemos para todo el mundo{#if tickets.fondoPercent}{' '}(este
							mes, un {tickets.fondoPercent} %){/if}. Si podés, sumá un aporte: lo que pagás de más
						va entero al fondo.
					</small>
					{#each fondoOptions as o (o.id)}
						{@const u = unitPrice(selected.price, selected.fondo, o.id)}
						<label class="option">
							<input
								type="radio"
								name="option"
								value={o.id}
								checked={chosenOption.id === o.id}
								onchange={() => (option = o.id)}
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
									{formatARS(u.contribution)} por entrada van al Fondo KinkyVibe
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
						onclick={() => setQuantity(count - 1)}>−</button
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
						oninput={typedQuantity}
						onblur={() => setQuantity(count)}
						aria-invalid={errors.quantity ? 'true' : undefined}
					/>
					<button
						type="button"
						class="step"
						aria-label="Una entrada más"
						aria-controls="entradas-cantidad"
						disabled={count >= maxQuantity}
						onclick={() => setQuantity(count + 1)}>+</button
					>
				</div>
				{#if errors.quantity}<span class="field-error">{errors.quantity}</span>{/if}
			</div>

			<fieldset class="group">
				<legend>Tus datos</legend>
				<div class="row">
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
					<div class="field">
						<span class="label-row">
							<label for="entradas-tus-pronombres">Tus pronombres</label>
							<a
								class="help"
								href="https://pronombr.es"
								target="_blank"
								rel="noopener"
								title="¿Qué son los pronombres? (se abre en otra pestaña)"
								aria-label="¿Qué son los pronombres? (se abre en otra pestaña)">?</a
							>
						</span>
						<input
							id="entradas-tus-pronombres"
							type="text"
							name="pronouns"
							maxlength="40"
							placeholder="ella, él, elle…"
							autocomplete="off"
							required
							bind:value={buyerPronouns}
							aria-invalid={errors.pronouns ? 'true' : undefined}
						/>
						{#if errors.pronouns}<span class="field-error">{errors.pronouns}</span>{/if}
					</div>
				</div>
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
							<div class="field">
								<span class="label-row">
									<label for="entradas-pronombres-{i}">Pronombres</label>
									<a
										class="help"
										href="https://pronombr.es"
										target="_blank"
										rel="noopener"
										title="¿Qué son los pronombres? (se abre en otra pestaña)"
										aria-label="¿Qué son los pronombres? (se abre en otra pestaña)">?</a
									>
								</span>
								<input
									id="entradas-pronombres-{i}"
									type="text"
									name="holder_pronouns_{i}"
									maxlength="40"
									placeholder="ella, él, elle…"
									autocomplete="off"
									required={i > 0}
									bind:value={holders[i].pronouns}
									oninput={() => {
										if (i === 0) firstPronounsEdited = true;
									}}
									aria-invalid={errors[`holder_pronouns_${i}`] ? 'true' : undefined}
								/>
								{#if errors[`holder_pronouns_${i}`]}
									<span class="field-error">{errors[`holder_pronouns_${i}`]}</span>
								{/if}
							</div>
						</div>
					</fieldset>
				{/each}
			</fieldset>

			<!-- Preguntas de inscripción del evento (interruptor personas_eventos; si no hay, nada). -->
			<SignupFieldInputs
				fields={tickets.fields ?? []}
				values={result?.values?.answers ?? {}}
				{errors}
			/>

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

			{#if tickets.methods.length > 1 && !free}
				<fieldset class="methods">
					<legend>Medio de pago</legend>
					<div class="method-cards">
						{#each tickets.methods as m (m)}
							<label class="method">
								<input type="radio" name="method" value={m} bind:group={method} />
								<span>
									<strong>{m === 'mercadopago' ? 'Mercado Pago' : 'Transferencia'}</strong>
									<small
										>{m === 'mercadopago'
											? 'tarjeta o dinero en cuenta'
											: 'bancaria, sin recargo'}</small
									>
								</span>
							</label>
						{/each}
					</div>
					<!-- Las dos explicaciones ocupan el mismo lugar (la más larga define el alto): al
					     cambiar de medio no se mueve nada. -->
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
							<span
								>Entradas ({count} × {formatARS(prices.unit)}){#if gorra}&nbsp;a la gorra{/if}</span
							>
							<span>{formatARS(prices.subtotal)}</span>
						</p>
						{#if prices.fondo}
							<p class="line note">
								<span>💜 Ya descontado: el Fondo KinkyVibe cubre {formatARS(prices.fondo)}</span>
							</p>
						{/if}
						{#if prices.contribution}
							<p class="line note">
								<span>💜 Incluye {formatARS(prices.contribution)} de aporte al Fondo KinkyVibe</span
								>
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
						{:else if tickets.feeBasisPoints && tickets.methods.includes('mercadopago') && !free}
							<!-- Reserva el lugar de la línea del recargo para que el total no salte. Lleva el mismo
							     texto (invisible y fuera del DOM, en ::before) para que se corte en las mismas
							     líneas que la real cuando la columna es angosta. -->
							<p class="line placeholder" aria-hidden="true">
								<span data-text="Recargo Mercado Pago"></span>
								<span data-text="+{formatARS(mpSurcharge(prices.total, tickets.feeBasisPoints))}"
								></span>
							</p>
						{/if}
					{/if}
					<p class="total">Total: <strong>{formatARS(prices.total)}</strong></p>
				</div>
				<button
					type="submit"
					disabled={pending || !selected || (Boolean(gorra) && gorraAmount === null)}
					>{submitText}</button
				>
			</div>
			{#if tickets.closesAt}
				<small class="closes">{saleWindowText({ closesAt: tickets.closesAt })}.</small>
			{/if}
		</form>
	{/if}
</section>

<style>
	.tickets {
		max-width: 40rem;
		margin: 1.5em auto 0;
		padding: 1em 1.2em 1.2em;
		border-radius: var(--round);
		outline: 3px solid var(--1);
		background: color-mix(in srgb, var(--1) 6%, white);
		font-size: var(--step-0);
	}
	h2 {
		margin: 0 0 0.5em;
		font-size: var(--step-2);
		color: var(--1-ink);
	}
	.mock-note {
		background: var(--4-tint);
		color: var(--4-ink);
		padding: 0.4em 0.7em;
		border-radius: var(--round-sm);
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
	/* Tramo vigente de una preventa ("Preventa 1"): una etiqueta chica al lado del nombre. */
	.type-tier {
		display: inline-block;
		margin-left: 0.5em;
		padding: 0.05em 0.6em;
		border-radius: 1em;
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
		min-width: 0;
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
	.breakdown .placeholder {
		visibility: hidden;
	}
	.breakdown .placeholder span::before {
		content: attr(data-text);
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
		color: var(--muted);
		font-size: var(--step--2);
	}
	/* Por debajo del mínimo recomendado de la gorra: aviso amable, no es un error. */
	.hint.soft {
		display: block;
		color: var(--2-dark);
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

	input[type='text'],
	input[type='email'],
	input[type='number'] {
		font: inherit;
		padding: 0.55em 0.7em;
		border-radius: 0.5em;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		background: white;
		min-height: 2.8em;
		min-width: 0;
	}
	input:focus-visible {
		outline: 3px solid var(--2-light);
	}

	/* Cantidad: "Cantidad  [− n +]" en una línea, un stepper compacto (botones de 42 px: siguen
	   siendo cómodos para el dedo sin ocupar media pantalla). */
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
		height: 42px;
		border: 2px solid color-mix(in srgb, var(--2) 45%, transparent);
		border-radius: 999px;
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
		flex: 0 0 42px;
		width: 42px;
		min-width: 42px;
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
	button.chip[aria-pressed='true'] {
		box-shadow: inset 0 0 0 3px var(--2);
		font-weight: bold;
	}

	.conditions {
		font-size: var(--step--1);
	}
	.conditions summary {
		cursor: pointer;
		text-decoration: underline;
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
		border-radius: var(--round-pill);
		padding: 0.8em 1.3em;
		min-height: 3em;
		cursor: pointer;
		flex-grow: 1;
		max-width: 22em;
	}
	.pay button {
		/* Alto para dos líneas y ancho que no depende del texto: el texto cambia con el medio de
		   pago y no debería mover nada. */
		flex: 1 1 16em;
		min-height: 3.6em;
		line-height: 1.2;
	}
	.option {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-areas: 'radio name price' 'radio note note';
		align-items: center;
		column-gap: 0.7em;
		padding: 0.55em 0.9em;
		border-radius: 0.7em;
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
	.label-row {
		display: flex;
		align-items: baseline;
		gap: 0.3em;
		font-weight: bold;
		font-size: var(--step--1);
	}
	/* "?" de pronombres: discreto, está por las dudas. */
	.help {
		font-weight: normal;
		font-size: var(--step--2);
		color: var(--muted);
		text-decoration: underline dotted;
		text-underline-offset: 2px;
		/* bigger hit area without moving the label */
		padding: 0.5em 0.6em;
		margin: -0.5em -0.3em;
	}
	.help:hover,
	.help:focus-visible {
		color: var(--2-dark);
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
	.closes {
		color: var(--muted);
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
