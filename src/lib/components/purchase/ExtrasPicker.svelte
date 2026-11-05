<script>
	/**
	 * Extras de la compra (decisión 0056; interruptor `extras`): cada extra del evento con su precio,
	 * su descripción y un stepper − n + (0 por defecto). Va en el paso «Entradas», después de las
	 * entradas. El Fondo y los códigos son solo de las entradas: los extras van a precio de lista.
	 * Cada cantidad viaja como `extra_<id>` (también sin JavaScript); el servidor vuelve a validar
	 * todo (máximo por compra y tope).
	 */
	import { formatARS } from '$lib/utils/money.js';

	/** @type {NonNullable<import('$lib/server/tickets/checkout.js').TicketsView['extras']>} */
	export let extras = [];
	/** Cantidad elegida de cada extra (id → cantidad). @type {Record<string, number>} */
	export let choice = {};
	/** @type {Record<string, string>} */
	export let errors = {};

	/** @param {string} id @param {number} n @param {number} max */
	function set(id, n, max) {
		choice = { ...choice, [id]: Math.max(0, Math.min(max, Math.trunc(n) || 0)) };
	}
</script>

<fieldset class="extras">
	<legend>Extras <small>(opcional)</small></legend>
	<p class="hint">
		Se pagan junto con las entradas. El Fondo y los códigos no aplican a los extras.
	</p>
	<ul>
		{#each extras as e (e.id)}
			{@const n = choice[e.id] ?? 0}
			{@const err = errors[`extra_${e.id}`]}
			<li class="extra" class:soldout={e.available === 0}>
				<div class="text">
					<span class="name" id="extra-{e.id}-nombre">{e.name}</span>
					<span class="price">{formatARS(e.price)}</span>
					{#if e.description}<span class="desc">{e.description}</span>{/if}
					{#if e.available === 0}<span class="desc">Agotado</span>{/if}
				</div>
				<div class="stepper">
					<button
						type="button"
						class="step"
						aria-label="Un {e.name} menos"
						aria-controls="extra-{e.id}"
						disabled={n <= 0}
						on:click={() => set(e.id, n - 1, e.available)}>−</button
					>
					<input
						id="extra-{e.id}"
						type="number"
						name="extra_{e.id}"
						inputmode="numeric"
						min="0"
						max={e.available}
						step="1"
						value={n}
						disabled={e.available === 0}
						aria-labelledby="extra-{e.id}-nombre"
						aria-invalid={err ? 'true' : undefined}
						aria-describedby={err ? `extra-${e.id}-error` : undefined}
						on:change={(ev) => set(e.id, Number(ev.currentTarget.value), e.available)}
					/>
					<button
						type="button"
						class="step"
						aria-label="Un {e.name} más"
						aria-controls="extra-{e.id}"
						disabled={n >= e.available}
						on:click={() => set(e.id, n + 1, e.available)}>+</button
					>
				</div>
				{#if err}<span class="field-error" id="extra-{e.id}-error">{err}</span>{/if}
			</li>
		{/each}
	</ul>
</fieldset>

<style>
	fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4em;
		min-width: 0;
	}
	legend {
		font-weight: bold;
		padding: 0;
		margin-bottom: 0.2em;
	}
	legend small {
		font-weight: normal;
		color: var(--text-muted, inherit);
	}
	.hint {
		margin: 0;
		font-size: var(--step--1);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	.extra {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.4em 0.8em;
		padding: 0.6em 0.8em;
		border: 1px solid color-mix(in srgb, var(--2) 30%, transparent);
		border-radius: var(--radius-m, 12px);
		background: var(--surface, white);
	}
	.extra.soldout {
		opacity: 0.6;
	}
	.text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.1em 0.6em;
		min-width: 0;
		flex: 1 1 12em;
	}
	.name {
		font-weight: bold;
	}
	.price {
		font-variant-numeric: tabular-nums;
	}
	.desc {
		flex-basis: 100%;
		font-size: var(--step--1);
	}
	.field-error {
		flex-basis: 100%;
	}
	/* El mismo stepper que «Cantidad» (TicketsStep): botones de 44 × 44. */
	.stepper {
		display: inline-flex;
		align-items: stretch;
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
		font: inherit;
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
</style>
