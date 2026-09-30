<!--
	"Entradas" del editor de eventos: prende/apaga la venta por el sitio y edita los tipos de
	entrada, medios de pago, cierre, modalidad y recordatorios (ver $lib/utils/ticketsEditor.js,
	que lee y escribe el frontmatter). Nada del Fondo: es automático, solo avisa si aplica.
-->
<script>
	import { formatARS } from '$lib/utils/money.js';
	import { formatSaleTime, gorraQuickAmounts, parseAmount } from '$lib/utils/tickets.js';
	import {
		PAYMENT_METHOD_LABELS,
		emptyTicketType,
		isKinkyVibeEvent,
		isOnlineEvent
	} from '$lib/utils/ticketsEditor.js';

	/** @type {import('$lib/utils/ticketsEditor.js').TicketsForm} */
	export let state;
	/** Etiquetas actuales del evento (para el aviso del Fondo y la modalidad automática). */
	/** @type {string[]} */
	export let tags = [];
	/** Dirección actual del evento (modalidad automática). */
	export let location = '';
	/** Vendidas y reservadas por tipo (al editar); `null` = evento nuevo o sin datos. */
	/** @type {import('$lib/utils/ticketsEditor.js').SalesByType | null} */
	export let sales = null;
	/** No se pudo consultar la base de datos (no se sabe si ya vendió). */
	export let salesUnavailable = false;
	/** @type {string[]} */
	export let errors = [];
	/** @type {string[]} */
	export let warnings = [];
	export let idPrefix = 'ev';

	/** @type {Array<'mercadopago' | 'transferencia'>} */
	const METHODS = ['mercadopago', 'transferencia'];
	$: fondo = isKinkyVibeEvent({ tags });
	$: autoOnline = isOnlineEvent({ tags, location });
	/** @param {string | null} id */
	const salesFor = (id) => (id && sales ? sales[id] : undefined);
	/** @param {string | null} id */
	const takenFor = (id) => {
		const s = salesFor(id);
		return s ? s.sold + s.held : 0;
	};

	function addType() {
		state.types = [...state.types, emptyTicketType()];
	}
	/** @param {number} i */
	function removeType(i) {
		state.types = state.types.filter((_, j) => j !== i);
	}
	/** @param {number} i @param {number} delta */
	function move(i, delta) {
		const j = i + delta;
		if (j < 0 || j >= state.types.length) return;
		const next = [...state.types];
		[next[i], next[j]] = [next[j], next[i]];
		state.types = next;
	}
	/** @param {boolean} on */
	function setEnabled(on) {
		state.enabled = on;
		if (on && !state.types.length) state.types = [emptyTicketType()];
	}
	/** @param {string} v datetime-local */
	const validLocal = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v ?? '');
	/** @param {string} v datetime-local, hora de Argentina */
	const describe = (v) => formatSaleTime(new Date(`${v}-03:00`).getTime());
	/** @param {string} v */
	const money = (v) => {
		const n = parseAmount(v);
		return n === null ? '' : formatARS(n);
	};
</script>

<fieldset class="card tickets" id="{idPrefix}-tickets">
	<legend>🎟️ Entradas</legend>

	<label class="switch">
		<input
			type="checkbox"
			role="switch"
			id="{idPrefix}-tickets-on"
			checked={state.enabled}
			on:change={(e) => setEnabled(e.currentTarget.checked)}
		/>
		<span class="track" aria-hidden="true"></span>
		<span>
			<strong>Vender entradas por el sitio</strong>
			<small
				>Con Mercado Pago o transferencia; las entradas llegan por mail con QR. Apagado: se usa el
				link de inscripción de arriba.</small
			>
		</span>
	</label>

	<p class="note fondo" id="{idPrefix}-tickets-fondo" aria-live="polite">
		{#if fondo}
			💜 Tiene la etiqueta KinkyVibe: se aplica solo el <strong
				>descuento del Fondo KinkyVibe</strong
			>
			(el porcentaje del mes de fondo.kinkyvibe.ar) y se ofrecen las opciones solidarias. No hay nada
			que cargar.
		{:else}
			Sin la etiqueta KinkyVibe: este evento <strong>no usa el Fondo KinkyVibe</strong> (se cobra el precio
			de lista). Para usarlo, prendé «Lo organiza KinkyVibe» en Etiquetas.
		{/if}
	</p>

	{#if state.enabled}
		{#if salesUnavailable}
			<p class="warning">
				⚠️ No pudimos consultar las ventas de este evento: al guardar se vuelve a revisar que no se
				rompan compras hechas.
			</p>
		{/if}

		<ol class="types">
			{#each state.types as t, i (t.key)}
				{@const taken = takenFor(t.origId)}
				{@const s = salesFor(t.origId)}
				<li class="type">
					<div class="type-head">
						<strong>Entrada {i + 1}</strong>
						{#if t.origId}<small class="id">id: <code>{t.origId}</code></small>{/if}
						<span class="type-actions">
							<button
								type="button"
								class="icon"
								on:click={() => move(i, -1)}
								disabled={i === 0}
								aria-label="Subir «{t.name || `entrada ${i + 1}`}»">↑</button
							>
							<button
								type="button"
								class="icon"
								on:click={() => move(i, 1)}
								disabled={i === state.types.length - 1}
								aria-label="Bajar «{t.name || `entrada ${i + 1}`}»">↓</button
							>
							<button
								type="button"
								class="link remove"
								on:click={() => removeType(i)}
								disabled={taken > 0}
								title={taken > 0 ? 'Ya tiene entradas vendidas o reservadas' : undefined}
								>Quitar</button
							>
						</span>
					</div>
					{#if s && (s.sold || s.held)}
						<p class="sold">
							Ya vendidas: <strong>{s.sold}</strong>{#if s.held}{' '}· reservadas: {s.held}{/if}
						</p>
					{/if}
					<div class="grid">
						<label class="field">
							<span>Nombre <span class="req">*</span></span>
							<input
								id="{idPrefix}-ticket-name-{i}"
								bind:value={t.name}
								placeholder={i === 0 ? 'General' : 'Anticipada'}
								maxlength="60"
							/>
						</label>
						<label class="field">
							<span>Cupo <span class="req">*</span></span>
							<input
								id="{idPrefix}-ticket-capacity-{i}"
								bind:value={t.capacity}
								inputmode="numeric"
								placeholder="40"
							/>
							{#if taken}<small>Mínimo {taken} (lo ya vendido o reservado).</small>{/if}
						</label>
					</div>
					<div
						class="pills"
						role="radiogroup"
						aria-label="Cómo se cobra «{t.name || `entrada ${i + 1}`}»"
					>
						<label class="pill">
							<input
								type="radio"
								name="{idPrefix}-ticket-mode-{t.key}"
								value="price"
								bind:group={t.mode}
							/>
							<span>Precio fijo</span>
						</label>
						<label class="pill">
							<input
								type="radio"
								name="{idPrefix}-ticket-mode-{t.key}"
								value="gorra"
								bind:group={t.mode}
							/>
							<span>A la gorra</span>
						</label>
					</div>
					{#if t.mode === 'gorra'}
						<div class="grid">
							<label class="field">
								<span>Mínimo ($)</span>
								<input
									id="{idPrefix}-ticket-min-{i}"
									bind:value={t.min}
									inputmode="numeric"
									placeholder="0"
								/>
								<small>0 = quien no puede pagar, no paga.</small>
							</label>
							<label class="field">
								<span>Sugerido ($) <span class="req">*</span></span>
								<input
									id="{idPrefix}-ticket-suggested-{i}"
									bind:value={t.suggested}
									inputmode="numeric"
									placeholder="5000"
								/>
								{#if parseAmount(t.suggested) !== null}
									<small
										>Botones: {gorraQuickAmounts(
											parseAmount(t.min || '0') ?? 0,
											parseAmount(t.suggested) ?? 0
										)
											.map((n) => (n === 0 ? 'Sin cargo' : formatARS(n)))
											.join(' · ')}</small
									>
								{/if}
							</label>
						</div>
					{:else}
						<label class="field price">
							<span>Precio ($) <span class="req">*</span></span>
							<input
								id="{idPrefix}-ticket-price-{i}"
								bind:value={t.price}
								inputmode="numeric"
								placeholder="10000"
							/>
							<small
								>{money(t.price) ? `${money(t.price)}.` : 'Pesos, sin centavos.'}{#if fondo}{' '}Es
									el precio completo: el descuento del Fondo se calcula solo.{/if}</small
							>
						</label>
					{/if}
					<label class="field when">
						<span>Cierre propio (opcional)</span>
						<input type="datetime-local" id="{idPrefix}-ticket-close-{i}" bind:value={t.close} />
						<small
							>{#if validLocal(t.close)}Este tipo se vende hasta el {describe(t.close)}.{:else}Vacío
								= cierra con la venta del evento (por ejemplo, para que la anticipada cierre antes).{/if}</small
						>
					</label>
				</li>
			{/each}
		</ol>
		<button type="button" class="button secondary add" id="{idPrefix}-ticket-add" on:click={addType}
			>+ Agregar tipo de entrada</button
		>

		<fieldset class="group">
			<legend>Medios de pago <span class="req">*</span></legend>
			{#each METHODS as m}
				<label class="check">
					<input type="checkbox" id="{idPrefix}-pay-{m}" bind:checked={state.methods[m]} />
					{PAYMENT_METHOD_LABELS[m]}
				</label>
			{/each}
			{#if state.methods.transferencia}
				<small
					>Los datos para transferir se cargan en Ajustes de venta (no van en el archivo).</small
				>
			{/if}
		</fieldset>

		<fieldset class="group">
			<legend>Horario de la venta <small>(hora de Argentina)</small></legend>
			<label class="check">
				<input type="checkbox" id="{idPrefix}-open-custom" bind:checked={state.customOpen} />
				Abrir la venta en un momento determinado
			</label>
			{#if state.customOpen}
				<label class="field when">
					<span>Abre</span>
					<input type="datetime-local" id="{idPrefix}-open-at" bind:value={state.openAt} />
					{#if validLocal(state.openAt)}<small>Abre el {describe(state.openAt)}.</small>{/if}
				</label>
			{:else}
				<small>Se puede comprar desde que se publica (con el estado «Abierto»).</small>
			{/if}
			<label class="check">
				<input type="checkbox" id="{idPrefix}-close-custom" bind:checked={state.customClose} />
				Cerrar la venta antes de que empiece el evento
			</label>
			{#if state.customClose}
				<label class="field when">
					<span>Cierra</span>
					<input type="datetime-local" id="{idPrefix}-close-at" bind:value={state.closeAt} />
					{#if validLocal(state.closeAt)}<small>La venta cierra el {describe(state.closeAt)}.</small
						>{/if}
				</label>
			{:else}
				<small>La venta cierra cuando empieza el evento.</small>
			{/if}
			<small
				>Las compras que ya estaban en curso al cerrar (pagos o transferencias pendientes) se
				completan igual.</small
			>
		</fieldset>

		<label class="field">
			<span>Modalidad</span>
			<select id="{idPrefix}-modalidad" bind:value={state.modalidad}>
				<option value="">Automática: {autoOnline ? 'online' : 'presencial'}</option>
				<option value="presencial">Presencial: QR y control de ingreso</option>
				<option value="online">Online: el link de la transmisión en lugar de QR</option>
			</select>
			<small
				>Automática = online si tiene la etiqueta Online y no tiene dirección. El link de la
				transmisión se carga en el admin de entradas (nunca en el archivo).</small
			>
		</label>

		<label class="check">
			<input type="checkbox" id="{idPrefix}-reminders" bind:checked={state.reminders} />
			Mandar recordatorios por mail antes del evento
		</label>

		<details class="advanced" open={Boolean(state.mpFee)}>
			<summary>Avanzado</summary>
			<label class="field">
				<span>Comisión de Mercado Pago para este evento (%)</span>
				<input
					id="{idPrefix}-mp-fee"
					bind:value={state.mpFee}
					inputmode="decimal"
					placeholder="la de Ajustes de venta"
				/>
				<small
					>Vacío = la de Ajustes de venta. Se suma como recargo a quien paga con Mercado Pago.</small
				>
			</label>
		</details>

		{#each warnings as w}<p class="warning">⚠️ {w}</p>{/each}
		{#if errors.length}
			<ul class="errors" id="{idPrefix}-tickets-errors">
				{#each errors as e}<li class="error">{e}</li>{/each}
			</ul>
		{/if}
	{/if}
</fieldset>

<style lang="scss">
	.types {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7em;
	}
	.type {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		background: #faf6fc;
		border-radius: 1em;
		padding: 0.6em 0.8em 0.8em;
		min-width: 0;
	}
	.type-head {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4em 0.6em;
		.id {
			overflow-wrap: anywhere;
		}
	}
	.type-actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.4em;
	}
	button.icon {
		font: inherit;
		width: 2.2em;
		height: 2.2em;
		border-radius: 50%;
		border: 0;
		background: white;
		outline: 1px solid var(--1-light);
		color: var(--1-dark);
		cursor: pointer;
		&:disabled {
			opacity: 0.35;
			cursor: default;
		}
	}
	button.remove:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.sold {
		margin: 0;
		font-size: var(--step--1);
	}
	.price {
		max-width: 20em;
	}
	.add {
		align-self: flex-start;
	}
	.group {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35em;
		> legend {
			float: none;
			padding: 0;
			margin-bottom: 0.3em;
			color: var(--1-dark);
		}
	}
	.when {
		max-width: 20em;
	}
	.advanced summary {
		cursor: pointer;
		color: var(--2-dark);
		font-size: var(--step--1);
		margin-bottom: 0.4em;
	}
	.errors {
		margin: 0;
		padding-left: 1.2em;
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em;
	}
	.pill {
		position: relative;
		display: inline-flex;
		cursor: pointer;
		input {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
			margin: 0;
		}
		span {
			display: inline-block;
			padding: 0.35em 0.85em;
			border-radius: 2em;
			background: white;
			color: var(--1-dark);
			outline: 1px solid var(--1-light);
			outline-offset: -1px;
			font-size: var(--step--1);
			user-select: none;
		}
		input:checked + span {
			background: var(--1);
			color: white;
			outline-color: var(--1);
			font-weight: bold;
		}
		input:focus-visible + span {
			outline: 3px solid var(--2-dark, #333);
			outline-offset: 1px;
		}
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 0.7em;
		cursor: pointer;
		position: relative;
		input {
			position: absolute;
			opacity: 0;
			width: 1px;
			height: 1px;
			margin: 0;
		}
		.track {
			flex: none;
			width: 2.6em;
			height: 1.5em;
			border-radius: 1em;
			background: #ccc;
			position: relative;
			transition: background 150ms;
			&::after {
				content: '';
				position: absolute;
				top: 0.2em;
				left: 0.2em;
				width: 1.1em;
				height: 1.1em;
				border-radius: 50%;
				background: white;
				transition: transform 150ms;
			}
		}
		input:checked + .track {
			background: var(--1);
			&::after {
				transform: translateX(1.1em);
			}
		}
		input:focus-visible + .track {
			outline: 3px solid var(--2-dark, #333);
			outline-offset: 2px;
		}
		> span:last-child {
			display: flex;
			flex-direction: column;
		}
	}
</style>
