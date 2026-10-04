<!--
	"Entradas" del editor de eventos: prende/apaga la venta por el sitio y edita los tipos de
	entrada (precio fijo, preventas por tramos o a la gorra; cupo opcional; cierre propio; tipos
	encadenados), la meta de venta (SalesGoalField), medios de pago, cierre, modalidad, entradas en
	la puerta y recordatorios (ver
	$lib/utils/ticketsEditor.js, que lee y escribe el frontmatter). Los tramos se editan en
	TicketTiersEditor. Nada del Fondo: es automático, solo avisa si aplica.

	Diseño: primero el celu (una columna); en pantallas anchas los campos de cada tipo se acomodan
	en una grilla según el ancho del editor (container queries), no de la ventana.
-->
<script>
	import { formatARS } from '$lib/utils/money.js';
	import { LOW_STOCK, formatSaleTime, gorraQuickAmounts, parseAmount } from '$lib/utils/tickets.js';
	import {
		DOOR_PRICE_MAX,
		PAYMENT_METHOD_LABELS,
		doorPricePreview,
		emptyTicketType,
		isKinkyVibeEvent,
		isOnlineEvent,
		tiersForMode
	} from '$lib/utils/ticketsEditor.js';
	import TicketTiersEditor from './TicketTiersEditor.svelte';
	import SalesGoalField from './SalesGoalField.svelte';

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
	/** Dónde se cargan el alias y los datos para transferir. */
	export let settingsHref = '/admin/ajustes/cobros';

	/** @type {Array<'mercadopago' | 'transferencia'>} */
	const METHODS = ['mercadopago', 'transferencia'];
	/** Cómo se cobra un tipo. */
	const MODES = /** @type {const} */ ([
		{ id: 'price', label: 'Precio fijo' },
		{ id: 'tiers', label: 'Preventas' },
		{ id: 'gorra', label: 'A la gorra' }
	]);
	$: fondo = isKinkyVibeEvent({ tags });
	$: autoOnline = isOnlineEvent({ tags, location });
	$: online = state.modalidad === 'online' || (state.modalidad === '' && autoOnline);
	/** @param {string | null} id */
	const salesFor = (id) => (id && sales ? sales[id] : undefined);
	/** @param {string | null} id */
	const takenFor = (id) => {
		const s = salesFor(id);
		return s ? s.sold + s.held : 0;
	};

	function addType() {
		state.types = [...state.types, emptyTicketType({ first: !state.types.length })];
	}
	/** @param {number} i */
	function removeType(i) {
		const gone = state.types[i]?.key;
		// Los que se habilitaban después de este pasan a estar a la venta desde el principio.
		state.types = state.types
			.filter((_, j) => j !== i)
			.map((t) => (t.after === gone ? { ...t, after: '' } : t));
	}
	/** Al pasar a "Preventas", arranca con dos tramos (ver `tiersForMode`). @param {number} i */
	function modeChanged(i) {
		const t = state.types[i];
		if (t.mode === 'tiers') t.tiers = tiersForMode(t);
		state.types = state.types;
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
		if (on && !state.types.length) state.types = [emptyTicketType({ first: true })];
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
					<div class="type-fields mode-{t.mode}">
						<label class="field f-name">
							<span>Nombre <span class="req">*</span></span>
							<input
								id="{idPrefix}-ticket-name-{i}"
								bind:value={t.name}
								placeholder={i === 0 ? 'General' : 'Anticipada'}
								maxlength="60"
							/>
						</label>
						<div class="field f-mode">
							<span id="{idPrefix}-ticket-mode-label-{i}">Cómo se cobra</span>
							<div
								class="pills"
								role="radiogroup"
								aria-labelledby="{idPrefix}-ticket-mode-label-{i}"
							>
								{#each MODES as m}
									<label class="pill">
										<input
											type="radio"
											name="{idPrefix}-ticket-mode-{t.key}"
											value={m.id}
											bind:group={t.mode}
											on:change={() => modeChanged(i)}
										/>
										<span>{m.label}</span>
									</label>
								{/each}
							</div>
						</div>
						{#if t.mode === 'gorra'}
							<label class="field f-min">
								<span>Mínimo ($)</span>
								<input
									id="{idPrefix}-ticket-min-{i}"
									bind:value={t.min}
									inputmode="numeric"
									placeholder="0"
								/>
								<small>0 = quien no puede pagar, no paga.</small>
							</label>
							<label class="field f-sug">
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
						{:else if t.mode === 'tiers'}
							<div class="field f-tiers">
								<span
									>Tramos de preventa <small
										>(en orden: pasa al siguiente cuando se vende la cantidad o llega la fecha)</small
									></span
								>
								<TicketTiersEditor
									bind:tiers={t.tiers}
									taken={s?.tiers ?? {}}
									idPrefix="{idPrefix}-tier-{i}"
								/>
							</div>
						{:else}
							<label class="field f-price">
								<span>Precio ($) <span class="req">*</span></span>
								<input
									id="{idPrefix}-ticket-price-{i}"
									bind:value={t.price}
									inputmode="numeric"
									placeholder="10000"
								/>
								<small
									>{money(t.price)
										? `${money(t.price)}.`
										: 'Pesos, sin centavos.'}{#if fondo}{' '}Es el precio completo: el descuento del
										Fondo se calcula solo.{/if}</small
								>
							</label>
						{/if}
						{#if t.mode !== 'gorra'}
							<label class="field f-door">
								<span>Precio en puerta <small>(opcional)</small></span>
								<input
									id="{idPrefix}-ticket-door-price-{i}"
									bind:value={t.doorPrice}
									inputmode="numeric"
									placeholder={t.mode === 'tiers' ? 'El del último tramo' : 'El mismo'}
									aria-describedby="{idPrefix}-ticket-door-help-{i}"
								/>
								<small id="{idPrefix}-ticket-door-help-{i}"
									>{#if t.mode === 'tiers'}Si lo dejás vacío, se cobra el precio del último tramo.{:else}Si
										lo dejás vacío, se cobra el precio fijo.{/if} Vale para la venta en la puerta y la
									carga a mano. <span aria-live="polite">{doorPricePreview(t)}</span></small
								>
							</label>
						{/if}
						<label class="field f-cap">
							<span>Cupo <small>(opcional)</small></span>
							<input
								id="{idPrefix}-ticket-capacity-{i}"
								bind:value={t.capacity}
								inputmode="numeric"
								placeholder="Sin límite"
								aria-describedby="{idPrefix}-ticket-capacity-help-{i}"
							/>
							<small id="{idPrefix}-ticket-capacity-help-{i}"
								>{#if taken}Mínimo {taken} (lo ya vendido o reservado).{:else}Vacío = sin límite. En
									público solo se ve «quedan N» cuando quedan menos de {LOW_STOCK}.{/if}</small
							>
						</label>
						<label class="field f-close">
							<span>Cierre propio <small>(opcional)</small></span>
							<input type="datetime-local" id="{idPrefix}-ticket-close-{i}" bind:value={t.close} />
							<small
								>{#if validLocal(t.close)}Este tipo se vende hasta el {describe(
										t.close
									)}.{:else}Vacío = cierra con la venta del evento.{/if}</small
							>
						</label>
						{#if state.types.length > 1}
							<label class="field f-after">
								<span>Se habilita</span>
								<select id="{idPrefix}-ticket-after-{i}" bind:value={t.after}>
									<option value="">Desde que abre la venta</option>
									{#each state.types as o, k (o.key)}
										{#if o.key !== t.key}
											<option value={o.key}
												>Cuando se agote o cierre «{o.name.trim() || `Entrada ${k + 1}`}»</option
											>
										{/if}
									{/each}
									{#if t.after.startsWith('missing:')}
										<option value={t.after}>Cuando se agote «{t.after.slice(8)}» (no existe)</option
										>
									{/if}
								</select>
								<small
									>Por ejemplo, una «Última tanda» que sale a la venta cuando se agota la anterior.</small
								>
							</label>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
		<button type="button" class="button secondary add" id="{idPrefix}-ticket-add" on:click={addType}
			>+ Agregar tipo de entrada</button
		>

		<SalesGoalField bind:kind={state.goalKind} bind:value={state.goalValue} {idPrefix} />

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
					>El alias y los datos para transferir se configuran en <a
						href={settingsHref}
						target="_blank"
						rel="noopener">Ajustes de venta</a
					>.</small
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

		{#if !online}
			<fieldset class="group door">
				<legend>Entradas en la puerta</legend>
				<label class="check">
					<input type="checkbox" id="{idPrefix}-door" bind:checked={state.door} />
					Hay entradas en la puerta
				</label>
				{#if state.door}
					<label class="field door-price">
						<span>Nota sobre la puerta <small>(opcional)</small></span>
						<input
							id="{idPrefix}-door-price"
							bind:value={state.doorPrice}
							maxlength={DOOR_PRICE_MAX}
							placeholder="$ 12.000, solo efectivo"
							aria-describedby="{idPrefix}-door-price-hint"
						/>
						<small id="{idPrefix}-door-price-hint"
							>Solo se muestra en la página del evento («También hay entradas en la puerta: …»). Lo
							que se cobra es el «Precio en puerta» de cada tipo.</small
						>
					</label>
					<small
						>La página del evento avisa que también hay entradas en la puerta, y en el modo puerta
						se puede «Vender en puerta».{#if !state.doorSet && state.types.some((t) => t.origId)}{' '}(Este
							evento todavía no lo tenía elegido: al guardar queda prendido.){/if}</small
					>
				{:else}
					<small
						>La página del evento dice «Solo anticipadas» y el modo puerta no ofrece vender.</small
					>
				{/if}
			</fieldset>
		{/if}

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
		background: var(--surface-2, #faf6fc);
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
		background: var(--surface, white);
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
	/* Campos de un tipo. Celu: una columna (nombre, cómo se cobra, precio, cupo, cierre…). Se
	   acomoda por el ancho del editor (container query), así funciona igual en una columna angosta
	   de la compu. */
	.type {
		container-type: inline-size;
	}
	.type-fields {
		display: grid;
		gap: 0.7em 0.8em;
		grid-template-columns: minmax(0, 1fr);
		grid-template-areas: 'name' 'mode' 'price' 'door' 'cap' 'close' 'after';
		align-items: start;
		&.mode-gorra {
			grid-template-areas: 'name' 'mode' 'min' 'sug' 'cap' 'close' 'after';
		}
		&.mode-tiers {
			grid-template-areas: 'name' 'mode' 'tiers' 'door' 'cap' 'close' 'after';
		}
	}
	/* Mediano: de a dos (precio y precio en puerta juntos; cupo y cierre juntos). */
	@container (min-width: 30em) {
		.type-fields {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-areas: 'name name' 'mode mode' 'price door' 'cap close' 'after after';
			&.mode-gorra {
				grid-template-areas: 'name name' 'mode mode' 'min sug' 'cap close' 'after after';
			}
			&.mode-tiers {
				grid-template-areas: 'name name' 'mode mode' 'tiers tiers' 'door cap' 'close after';
			}
		}
	}
	/* Ancho (compu): nombre y cómo se cobra arriba; precio, precio en puerta, cupo y cierre en una
	   fila pareja. */
	@container (min-width: 48em) {
		.type-fields {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			grid-template-areas: 'name name mode mode' 'price door cap close' 'after after after after';
			&.mode-gorra {
				grid-template-areas:
					'name name mode mode' 'min sug cap close'
					'after after after after';
			}
			&.mode-tiers {
				grid-template-areas:
					'name name mode mode' 'tiers tiers tiers tiers' 'door cap close close'
					'after after after after';
			}
		}
	}
	.f-name {
		grid-area: name;
	}
	.f-cap {
		grid-area: cap;
	}
	.f-mode {
		grid-area: mode;
	}
	.f-price {
		grid-area: price;
	}
	.f-min {
		grid-area: min;
	}
	.f-sug {
		grid-area: sug;
	}
	.f-close {
		grid-area: close;
	}
	.f-door {
		grid-area: door;
	}
	.f-tiers {
		grid-area: tiers;
	}
	.f-after {
		grid-area: after;
		max-width: 34em;
	}
	.type-fields .field {
		min-width: 0;
	}
	.type-fields input,
	.type-fields select {
		max-width: 100%;
	}
	.door-price {
		max-width: 34em;
		input {
			max-width: 24em;
		}
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
			background: var(--surface, white);
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
				background: var(--surface, white);
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
