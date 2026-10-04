<script>
	/**
	 * Formulario de compra de entradas (página /calendario/<slug>/entradas), en tres pasos:
	 * **Entradas → Tus datos → Pagar**, con el resumen de la compra siempre a la vista (columna al
	 * costado en pantallas anchas, barra desplegable arriba en el celu).
	 *
	 * Es UN solo formulario: los pasos que no se ven quedan en la página (con `hidden`), así lo
	 * escrito no se pierde al ir y volver, y se manda todo junto como siempre (form actions
	 * `?/discount` y `?/buy`). Sin JavaScript se ven los tres pasos juntos (ver el <noscript> de
	 * abajo) y funciona como antes. Con JavaScript, cada paso se valida antes de avanzar con las
	 * mismas reglas que el servidor ($lib/utils/purchaseSteps.js); si el servidor devuelve
	 * errores, se vuelve al primer paso que los tiene. Los precios, descuentos y recargos que se
	 * muestran son informativos: el servidor recalcula todo con el frontmatter del evento y la
	 * base de datos.
	 *
	 * Lo que se va completando (y el paso) se guarda en `sessionStorage` (solo esta pestaña; se
	 * borra al cerrarla) para no perderlo si la página se recarga, y se borra cuando la compra sale
	 * bien. Incluye el DNI a propósito: sessionStorage no se comparte con otras pestañas ni
	 * sobrevive a cerrar la pestaña, y es lo que la persona ya escribió en esta misma página. Nunca
	 * se usa localStorage para estos datos. No se guarda la casilla de +18 (hay que volver a
	 * marcarla).
	 *
	 * Con cuenta (`account`), «Tus datos» arranca con el nombre, los
	 * pronombres y el DNI guardados y el mail de la cuenta, y muestra las casillas «Guardar mis
	 * datos para la próxima» y «Recordar mi DNI» (docs/cuentas.md, «Datos guardados»). Si el
	 * servidor devolvió el formulario o hay un borrador, mandan esos. Sin cuenta, nada cambia.
	 */
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { formatARS } from '$lib/utils/money.js';
	import { fieldsForTicketType } from '$lib/utils/signupFields.js';
	import {
		computePrice,
		defaultFondoOption,
		fondoOptionsFor,
		gorraQuickAmounts,
		purchaseConditions,
		saleWindowText
	} from '$lib/utils/tickets.js';
	import {
		PURCHASE_STEPS,
		STEP_BUYER,
		STEP_PAY,
		STEP_TICKETS,
		buyerStepErrors,
		errorsOutsideStep,
		firstStepWithErrors,
		furthestReachable,
		gorraAmountFor,
		payStepErrors,
		purchaseSummary,
		stepOfField,
		ticketsStepErrors
	} from '$lib/utils/purchaseSteps.js';
	import StepIndicator from '$lib/components/purchase/StepIndicator.svelte';
	import PurchaseSummary from '$lib/components/purchase/PurchaseSummary.svelte';
	import TicketsStep from '$lib/components/purchase/TicketsStep.svelte';
	import BuyerStep from '$lib/components/purchase/BuyerStep.svelte';
	import PayStep from '$lib/components/purchase/PayStep.svelte';
	import { sendFunnelStep } from '$lib/utils/funnelBeacon.js';

	/** @typedef {{ name: string, pronouns: string }} HolderValues */
	/**
	 * @typedef {{
	 *   error?: string | null,
	 *   errors?: Record<string, string>,
	 *   values?: { type?: string, quantity?: string, name?: string, pronouns?: string, email?: string, dni?: string, code?: string, method?: string, option?: string, amount?: string, holders?: HolderValues[], answers?: Record<string, string>, accountForm?: boolean, remember?: boolean, rememberDni?: boolean },
	 *   discount?: import('$lib/server/tickets/checkout.js').AppliedDiscount | null
	 * } | null} BuyResult
	 */

	/** @type {import('$lib/server/tickets/checkout.js').TicketsView} */
	export let tickets;
	/** Lo que devolvió la última form action (`form.buy`). @type {BuyResult | undefined} */
	export let result = null;
	/**
	 * Con cuenta: lo que se completa en «Tus datos» y cómo arrancan las casillas (purchasePrefill).
	 * @type {ReturnType<typeof import('$lib/utils/savedBuyer.js').purchasePrefill> | null}
	 */
	export let account = null;
	/** Slug del evento: solo para el aviso anónimo de los pasos (docs/analiticas.md). */
	export let slug = '';

	// Valores iniciales del formulario (a propósito no reactivos: después los maneja la persona).
	const initial = result?.values ?? {};
	const firstAvailable = tickets.types.find((t) => t.available > 0 && !t.closed)?.id ?? '';
	let type = initial.type || firstAvailable;
	let quantity = Math.max(1, Math.trunc(Number(initial.quantity)) || 1);
	let buyerName = initial.name ?? account?.name ?? '';
	let buyerPronouns = initial.pronouns ?? account?.pronouns ?? '';
	let email = initial.email ?? account?.email ?? '';
	let dni = initial.dni ?? account?.dni ?? '';
	// Casillas de los datos guardados (solo con cuenta). Si el servidor devolvió el formulario
	// que las mostraba, como quedaron; si no, como arrancan para esta cuenta.
	let remember = initial.accountForm ? Boolean(initial.remember) : (account?.remember ?? false);
	let rememberDni = initial.accountForm
		? Boolean(initial.rememberDni)
		: (account?.rememberDni ?? false);
	let code = initial.code ?? '';
	let method = initial.method || tickets.methods[0] || 'mercadopago';
	let option = initial.option ?? '';
	/** Monto "a la gorra" por entrada, como texto (vacío = el sugerido). */
	let amount = initial.amount ?? '';
	/** @type {HolderValues[]} */
	let holders = Array.from({ length: tickets.maxQuantity }, (_, i) => ({
		name: initial.holders?.[i]?.name ?? '',
		pronouns: initial.holders?.[i]?.pronouns ?? ''
	}));
	// La entrada 1 copia el nombre y los pronombres de quien compra hasta que alguien los edite.
	let firstHolderEdited = Boolean(initial.holders?.[0]?.name);
	let firstPronounsEdited = Boolean(initial.holders?.[0]?.pronouns);
	let pending = false;

	// Solo dependen de lo que escribe quien compra (las funciones no se siguen como dependencias).
	$: copyBuyerName(buyerName);
	$: copyBuyerPronouns(buyerPronouns);
	/** @param {string} name */
	function copyBuyerName(name) {
		if (firstHolderEdited || !holders[0]) return;
		holders[0].name = name;
		holders = holders;
	}
	/** @param {string} pronouns */
	function copyBuyerPronouns(pronouns) {
		if (firstPronounsEdited || !holders[0]) return;
		holders[0].pronouns = pronouns;
		holders = holders;
	}

	// --- Pasos ---
	/** Errores que se muestran: los del servidor y los de cada paso al querer avanzar. */
	/** @type {Record<string, string>} */
	let errors = result?.errors ?? {};
	/** Paso actual (0, 1, 2). Si el servidor devolvió errores, el primero que los tiene. */
	let step = firstStepWithErrors(errors) ?? (result?.error ? STEP_PAY : STEP_TICKETS);
	/** Hasta dónde se llegó (para saltar con el indicador). */
	let reached = result?.values ? STEP_PAY : step;
	/** Pasos en los que ya se quiso avanzar: ahí los errores se actualizan mientras se escribe. */
	let tried = [false, false, false];
	/** Con JavaScript: valida cada paso (en lugar de los avisos del navegador). */
	let enhanced = false;
	/** @type {HTMLFormElement | undefined} */
	let formEl;
	/** @type {(HTMLElement | null)[]} */
	let headings = [];

	$: selected = tickets.types.find((t) => t.id === type);
	// Preguntas de inscripción que aplican al tipo elegido: las de una vez por compra van al
	// final; las de una vez por entrada, dentro de cada entrada.
	$: typeFields = fieldsForTicketType(tickets.fields ?? [], type);
	$: purchaseFields = typeFields.filter((f) => !f.perTicket);
	$: ticketFields = typeFields.filter((f) => f.perTicket);
	$: gorra = selected?.gorra ?? null;
	// "¿Cómo querés pagar tu entrada?": sin fondo en este tipo, no se ofrece el descuento del
	// fondo y la opción por defecto es precio completo. No aplica a la gorra.
	// Sin la etiqueta KinkyVibe no hay Fondo: solo el precio de lista (el servidor hace lo mismo).
	$: fondoOptions = tickets.fondoEnabled
		? fondoOptionsFor(selected?.fondo ?? 0)
		: fondoOptionsFor(0).filter((o) => o.id === 'completo');
	$: chosenOption =
		fondoOptions.find((o) => o.id === option) ??
		fondoOptions.find((o) => o.id === defaultFondoOption(selected?.fondo ?? 0)) ??
		fondoOptions[0];
	$: maxQuantity = Math.max(1, Math.min(tickets.maxQuantity, selected?.available ?? 1));
	$: count = Math.max(1, Math.min(quantity, maxQuantity));
	// Si cambia el tipo y hay menos disponibles, la cantidad baja al máximo nuevo.
	$: if (quantity > maxQuantity) quantity = maxQuantity;
	// El descuento aplicado vale mientras el código escrito sea el mismo (y no a la gorra).
	$: applied =
		!gorra && result?.discount && result.discount.code === code.trim().toUpperCase()
			? result.discount
			: null;
	/** Monto a la gorra por entrada que se va a cobrar (`value: null` si lo escrito no sirve). */
	$: gorraState = gorraAmountFor(gorra, amount, count);
	$: gorraAmount = gorraState.value;
	/** Montos rápidos: el mínimo (si es mayor a 0), el sugerido, 1,5 × el sugerido y el doble. */
	$: gorraChips = gorra ? gorraQuickAmounts(gorra.min, gorra.suggested) : [];
	$: prices = computePrice({
		price: gorra ? (gorraAmount ?? 0) : (selected?.price ?? 0),
		fondo: selected?.fondo ?? 0,
		option: gorra ? 'gorra' : chosenOption.id,
		quantity: selected ? count : 0,
		discount: applied,
		method,
		feeBasisPoints: tickets.feeBasisPoints
	});
	$: free =
		Boolean(selected) &&
		(!gorra || gorraAmount !== null) &&
		prices.subtotal - prices.discount === 0;
	$: conditions = purchaseConditions({
		contactEmail: tickets.contactEmail,
		transferHoldHours: tickets.transferHoldHours,
		methods: tickets.methods,
		online: tickets.online
	});
	$: summary = purchaseSummary({
		type: selected,
		count,
		prices,
		gorra: Boolean(gorra),
		showOption: tickets.fondoEnabled,
		discountCode: applied?.code ?? null,
		free,
		feeBasisPoints: tickets.feeBasisPoints,
		methods: tickets.methods
	});

	/**
	 * Respuestas a las preguntas de inscripción, como están escritas en el formulario (esos campos
	 * no se guardan en variables: ver SignupFieldInputs).
	 * @returns {Record<string, string>}
	 */
	function readAnswers() {
		if (!formEl) return {};
		/** @type {Record<string, string>} */
		const out = {};
		for (const [name, value] of new FormData(formEl)) {
			if (name.startsWith('campo_') && typeof value === 'string') out[name] = value;
		}
		return out;
	}

	/**
	 * Errores de un paso con lo que hay escrito ahora.
	 * @param {number} s
	 * @returns {Record<string, string>}
	 */
	function stepErrors(s) {
		if (s === STEP_TICKETS) {
			return ticketsStepErrors({ type: selected, count, maxQuantity, amount });
		}
		if (s === STEP_BUYER) {
			return buyerStepErrors({
				buyer: { name: buyerName, pronouns: buyerPronouns, email, dni },
				holders,
				count,
				fields: typeFields,
				typeId: type,
				answers: readAnswers()
			});
		}
		const accept = /** @type {HTMLInputElement | null | undefined} */ (
			formEl?.querySelector('input[name="accept"]')
		);
		return payStepErrors({
			method,
			methods: tickets.methods,
			free,
			accept: Boolean(accept?.checked)
		});
	}

	/**
	 * Muestra los errores de un paso (reemplaza los que había de ese paso). Devuelve si tiene.
	 * @param {number} s
	 */
	function checkStep(s) {
		const found = stepErrors(s);
		errors = { ...errorsOutsideStep(errors, s), ...found };
		return Object.keys(found).length > 0;
	}

	/**
	 * Cambia de paso y lleva el foco a su título (así un lector de pantalla anuncia dónde está).
	 * @param {number} s
	 * @param {{ focus?: 'heading' | 'error' }} [o] `error`: al primer campo marcado del paso
	 */
	async function showStep(s, o = {}) {
		step = s;
		if (s > reached) reached = s;
		// Aviso anónimo (una vez por paso): solo el paso y el evento, nada del formulario.
		if (s === STEP_BUYER) sendFunnelStep('datos', slug);
		if (s === STEP_PAY) sendFunnelStep('pagar', slug);
		await tick();
		const section = headings[s]?.closest('section');
		/** @type {HTMLElement | null | undefined} */
		const target =
			o.focus === 'error'
				? (section?.querySelector('[aria-invalid="true"], [data-invalid] input:not(:disabled)') ??
					headings[s])
				: headings[s];
		target?.focus({ preventScroll: true });
		target?.scrollIntoView?.({ block: o.focus === 'error' ? 'center' : 'start' });
	}

	/**
	 * Ir a un paso: para atrás siempre; para adelante, solo si los pasos del medio están bien (si
	 * no, se queda en el primero con errores y los muestra).
	 * @param {number} target
	 */
	function goTo(target) {
		if (target <= step) {
			showStep(target);
			return;
		}
		const byStep = PURCHASE_STEPS.map((_, s) => (s >= step && s < target ? stepErrors(s) : {}));
		const stop = furthestReachable(byStep, target);
		if (stop < target) {
			tried[stop] = true;
			checkStep(stop);
			showStep(stop, { focus: 'error' });
			return;
		}
		for (let s = step; s < target; s++) errors = errorsOutsideStep(errors, s);
		showStep(target);
	}

	/** Mientras se completa un paso en el que ya se quiso avanzar, los errores se actualizan. */
	/** @param {number} s */
	async function revalidate(s) {
		if (!tried[s]) return;
		await tick();
		checkStep(s);
	}

	// Si el servidor devolvió el formulario (errores, o el código aplicado), se muestran sus
	// errores y se vuelve al primer paso que los tiene.
	let lastResult = result;
	$: onResult(result);
	/** @param {BuyResult | undefined} r */
	function onResult(r) {
		if (r === lastResult) return;
		lastResult = r;
		errors = r?.errors ?? {};
		tried = [false, false, false];
		const s = firstStepWithErrors(errors);
		if (s !== null) showStep(s, { focus: 'error' });
		else if (r?.error) showStep(STEP_PAY, { focus: 'error' });
	}

	// --- Borrador en sessionStorage (ver arriba) ---
	const DRAFT_VERSION = 2;
	let draftKey = '';
	let draftReady = false;

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

	onMount(async () => {
		enhanced = true;
		draftKey = `kv-entradas:${location.pathname}`;
		// Si el servidor devolvió el formulario (con errores), eso manda.
		const d = result?.values ? null : readDraft();
		if (d) {
			if (tickets.types.some((t) => t.id === d.type && t.available > 0 && !t.closed)) type = d.type;
			if (Number(d.quantity) >= 1) quantity = Math.trunc(Number(d.quantity));
			if (typeof d.option === 'string') option = d.option;
			if (typeof d.amount === 'string') amount = d.amount;
			if (typeof d.method === 'string' && tickets.methods.includes(d.method)) method = d.method;
			buyerName = String(d.name ?? '');
			buyerPronouns = String(d.pronouns ?? '');
			email = String(d.email ?? '');
			dni = String(d.dni ?? '');
			code = String(d.code ?? '');
			if (account && typeof d.remember === 'boolean') remember = d.remember;
			if (account && typeof d.rememberDni === 'boolean') rememberDni = d.rememberDni;
			firstHolderEdited = Boolean(d.firstHolderEdited);
			firstPronounsEdited = Boolean(d.firstPronounsEdited);
			if (Array.isArray(d.holders)) {
				d.holders
					.slice(0, holders.length)
					.forEach((/** @type {any} */ h, /** @type {number} */ i) => {
						holders[i] = { name: String(h?.name ?? ''), pronouns: String(h?.pronouns ?? '') };
					});
			}
			// El paso donde estaba, si los anteriores siguen bien (sin mover el foco).
			const saved = Math.max(0, Math.min(STEP_PAY, Math.trunc(Number(d.step)) || 0));
			if (saved > 0) {
				await tick();
				const byStep = PURCHASE_STEPS.map((_, s) => (s < saved ? stepErrors(s) : {}));
				step = furthestReachable(byStep, saved);
				reached = step;
			}
		}
		draftReady = true;
	});

	$: draft = {
		v: DRAFT_VERSION,
		step,
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
		...(account ? { remember, rememberDni } : {}),
		holders: holders.slice(0, count).map((h) => ({ name: h.name, pronouns: h.pronouns }))
	};
	$: if (draftReady) saveDraft(draft);

	/** @param {Record<string, unknown>} d */
	function saveDraft(d) {
		try {
			sessionStorage.setItem(draftKey, JSON.stringify(d));
		} catch {
			// sin sessionStorage: el formulario funciona igual, solo no sobrevive a una recarga
		}
	}

	const closedText = {
		cancelled: 'El evento se canceló: no hay venta de entradas.',
		soldout: 'Agotadas.',
		closed: 'Venta cerrada.',
		notyet: tickets.opensAt
			? `${saleWindowText({ opensAt: tickets.opensAt })}.`
			: 'La venta todavía no abrió.',
		unavailable: 'La venta online no está disponible en este momento.'
	};

	$: submitText = pending
		? 'Un momento…'
		: free
			? 'Confirmar entradas sin cargo'
			: method === 'transferencia'
				? 'Reservar y ver cómo transferir'
				: 'Ir a pagar con Mercado Pago';

	$: closesText = tickets.closesAt ? `${saleWindowText({ closesAt: tickets.closesAt })}.` : '';
	/** Pasos que tienen algún error a la vista. */
	$: stepsWithErrors = new Set(
		Object.keys(errors)
			.filter((k) => errors[k])
			.map(stepOfField)
	);
</script>

<svelte:head>
	<!-- Sin JavaScript: los tres pasos juntos, como un formulario común (sin botones de paso). -->
	<noscript>
		<style>
			.purchase-step[hidden] {
				display: flex !important;
			}
			.js-only {
				display: none !important;
			}
		</style>
	</noscript>
</svelte:head>

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
		<div class="js-only">
			<StepIndicator
				steps={PURCHASE_STEPS}
				current={step}
				reachable={reached}
				on:select={(e) => goTo(e.detail)}
			/>
		</div>
		{#if result?.error}
			<p class="form-error" role="alert">{result.error}</p>
		{/if}
		<div class="layout">
			<PurchaseSummary {summary} {closesText} collapseKey={step} />
			<form
				method="POST"
				action="?/buy"
				novalidate={enhanced}
				bind:this={formEl}
				use:enhance={({ submitter, cancel }) => {
					const applying = submitter?.getAttribute('formaction')?.includes('discount');
					if (!applying) {
						// En «Entradas» el botón de pagar no se ve: lo que envía el formulario es un
						// Enter en un campo (envío implícito, p. ej. en la lista de tipos de entrada).
						// Eso no cambia de paso: solo «Continuar» (o el indicador) sale de «Entradas».
						// Antes saltaba a «Tus datos» marcando errores apenas se elegía una entrada con
						// el teclado. (En «Tus datos», Enter sigue llevando a «Pagar» si está todo bien.)
						if (step === STEP_TICKETS) {
							cancel();
							return;
						}
						// Todos los pasos, por si algo cambió al volver atrás.
						const byStep = PURCHASE_STEPS.map((_, s) => stepErrors(s));
						const stop = furthestReachable(byStep, PURCHASE_STEPS.length);
						if (stop < PURCHASE_STEPS.length) {
							cancel();
							tried[stop] = true;
							checkStep(stop);
							showStep(stop, { focus: 'error' });
							return;
						}
						pending = true;
					}
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
				{#each PURCHASE_STEPS as s, i (s.id)}
					<section
						class="purchase-step"
						id="paso-{s.id}"
						hidden={step !== i}
						aria-labelledby="paso-{s.id}-titulo"
						on:input={() => revalidate(i)}
						on:change={() => revalidate(i)}
					>
						<h3 id="paso-{s.id}-titulo" tabindex="-1" bind:this={headings[i]}>
							<span class="step-of">Paso {i + 1} de {PURCHASE_STEPS.length}</span>
							{s.label}
						</h3>
						{#if tried[i] && stepsWithErrors.has(i)}
							<p class="step-error js-only" role="alert">Revisá lo marcado para seguir.</p>
						{/if}
						{#if i === STEP_TICKETS}
							<TicketsStep
								{tickets}
								bind:type
								bind:option
								bind:amount
								bind:quantity
								bind:code
								{selected}
								{gorraState}
								{gorraChips}
								{fondoOptions}
								{chosenOption}
								{maxQuantity}
								{count}
								{errors}
								{applied}
							/>
						{:else if i === STEP_BUYER}
							<BuyerStep
								bind:buyerName
								bind:buyerPronouns
								bind:email
								bind:dni
								bind:holders
								bind:firstHolderEdited
								bind:firstPronounsEdited
								bind:remember
								bind:rememberDni
								signedIn={Boolean(account)}
								{count}
								{ticketFields}
								{purchaseFields}
								answers={result?.values?.answers ?? {}}
								{errors}
							/>
						{:else}
							<PayStep
								{tickets}
								bind:method
								{free}
								{conditions}
								{errors}
								{submitText}
								submitDisabled={pending || !selected || (Boolean(gorra) && gorraAmount === null)}
							>
								<button
									slot="back"
									type="button"
									class="back js-only"
									on:click={() => goTo(STEP_BUYER)}
									>Volver a {PURCHASE_STEPS[STEP_BUYER].label}</button
								>
							</PayStep>
						{/if}
						{#if i < STEP_PAY}
							<div class="step-nav js-only">
								{#if i > 0}
									<button type="button" class="back" on:click={() => goTo(i - 1)}
										>Volver a {PURCHASE_STEPS[i - 1].label}</button
									>
								{/if}
								<button type="button" class="next" on:click={() => goTo(i + 1)}
									>Continuar<span class="next-to">: {PURCHASE_STEPS[i + 1].label}</span></button
								>
							</div>
						{/if}
					</section>
				{/each}
			</form>
		</div>
	{/if}
</section>

<style>
	.tickets {
		/* Las piezas de la compra se acomodan según el ancho de este bloque (container queries). */
		container: compra / inline-size;
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
	/* Celu: el resumen arriba (barra) y el formulario abajo. */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'summary' 'form';
		gap: 0.9em;
	}
	form {
		grid-area: form;
		min-width: 0;
	}
	.purchase-step {
		display: flex;
		flex-direction: column;
		gap: 0.9em;
		min-width: 0;
	}
	.purchase-step[hidden] {
		display: none;
	}
	h3 {
		margin: 0;
		font-size: var(--step-1);
		color: var(--1-ink);
		line-height: 1.2;
		/* Al cambiar de paso se lleva el título arriba sin taparlo con la barra del resumen (celu)
		   y dejando ver el indicador de pasos. */
		scroll-margin-top: 8rem;
	}
	h3:focus {
		outline: none;
	}
	h3:focus-visible {
		outline: 3px solid var(--2-light);
		outline-offset: 3px;
		border-radius: 0.3em;
	}
	.step-of {
		display: block;
		font-size: var(--step--1);
		font-weight: normal;
		color: var(--muted);
	}
	.step-nav {
		display: flex;
		flex-wrap: wrap-reverse;
		justify-content: space-between;
		gap: 0.6em;
		margin-top: 0.3em;
	}
	button {
		font: inherit;
		font-weight: bold;
		border: 0;
		border-radius: var(--round-pill);
		padding: 0.8em 1.3em;
		min-height: 3em;
		cursor: pointer;
	}
	button.next {
		margin-left: auto;
		color: white;
		background: var(--1);
		flex: 0 1 auto;
	}
	button.next:hover {
		background: var(--1-dark);
	}
	button.back {
		background: none;
		color: var(--2-dark);
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--2) 35%, transparent);
	}
	button.back:hover {
		background: color-mix(in srgb, var(--2) 10%, white);
	}
	button:focus-visible {
		outline: 3px solid var(--2-light);
		outline-offset: 2px;
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
	.step-error,
	.form-error {
		color: var(--error);
		font-size: var(--step--1);
		font-weight: bold;
		margin: 0;
	}
	.form-error {
		margin-bottom: 0.8em;
	}
	.closed {
		font-weight: bold;
	}
	@container compra (max-width: 30rem) {
		.next-to {
			display: none;
		}
		.step-nav button {
			flex: 1 1 auto;
		}
	}
	/* Pantallas anchas: el formulario y, al costado, el resumen. */
	@container compra (min-width: 46rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr) minmax(15rem, 18rem);
			grid-template-areas: 'form summary';
			gap: 1.4em;
			align-items: start;
		}
	}
	@media (max-width: 500px) {
		.tickets {
			padding: 0.9em;
		}
	}
</style>
