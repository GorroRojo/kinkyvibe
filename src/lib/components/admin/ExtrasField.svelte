<!--
	«Extras» del editor de eventos, dentro de «Entradas» (TicketsEditor; decisión 0056; solo con el
	interruptor `extras`): cosas que se suman a la compra (tragos, una remera…). Cada una con nombre,
	precio, descripción corta y, si querés, un tope total y un máximo por compra. Escribe la clave
	`extras` ($lib/utils/extrasEditor.js). El Fondo y los códigos son solo de las entradas.

	Props (con bind): `extras`. Además `idPrefix`.
-->
<script>
	import { X } from '@lucide/svelte';
	import { EXTRAS_MAX, EXTRA_DESCRIPTION_MAX, EXTRA_NAME_MAX } from '$lib/utils/extras.js';
	import { emptyExtra } from '$lib/utils/extrasEditor.js';

	/** @type {import('$lib/utils/extrasEditor.js').ExtraForm[]} */
	export let extras = [];
	export let idPrefix = 'ev';

	function add() {
		extras = [...extras, emptyExtra()];
	}
	/** @param {number} i */
	function remove(i) {
		extras = extras.filter((_, j) => j !== i);
	}
</script>

<fieldset class="extras" id="{idPrefix}-extras">
	<legend>Extras</legend>
	<small
		>Se suman a la compra después de las entradas (tragos, una remera…). Se pagan juntos; el Fondo y
		los códigos de descuento son solo para las entradas. Se entregan en la puerta o con un link de
		barra.</small
	>
	{#if extras.length}
		<ol class="list">
			{#each extras as x, i (x.key)}
				<li class="extra">
					<div class="head">
						<strong>Extra {i + 1}</strong>
						<button
							type="button"
							class="remove"
							aria-label="Sacar el extra {i + 1}"
							on:click={() => remove(i)}><X size={18} /> Sacar</button
						>
					</div>
					<div class="fields">
						<label class="field name">
							<span>Nombre <span class="req">*</span></span>
							<input
								id="{idPrefix}-extra-{i}-name"
								bind:value={x.name}
								maxlength={EXTRA_NAME_MAX}
								placeholder="Ej.: Trago"
							/>
						</label>
						<label class="field price">
							<span>Precio <span class="req">*</span></span>
							<input
								id="{idPrefix}-extra-{i}-price"
								bind:value={x.price}
								inputmode="numeric"
								placeholder="$"
							/>
						</label>
						<label class="field desc">
							<span>Descripción corta <small>(opcional)</small></span>
							<input
								id="{idPrefix}-extra-{i}-description"
								bind:value={x.description}
								maxlength={EXTRA_DESCRIPTION_MAX}
								placeholder="Ej.: con o sin alcohol, en la barra"
							/>
						</label>
						<label class="field num">
							<span>Tope <small>(opcional)</small></span>
							<input
								id="{idPrefix}-extra-{i}-capacity"
								bind:value={x.capacity}
								inputmode="numeric"
								placeholder="sin tope"
							/>
						</label>
						<label class="field num">
							<span>Máximo por compra <small>(opcional)</small></span>
							<input
								id="{idPrefix}-extra-{i}-per-order"
								bind:value={x.perOrder}
								inputmode="numeric"
								placeholder="sin máximo"
							/>
						</label>
					</div>
					{#if x.origId}<small class="muted"
							>Id «{x.origId}» (no cambia aunque cambies el nombre).</small
						>{/if}
				</li>
			{/each}
		</ol>
	{/if}
	{#if extras.length < EXTRAS_MAX}
		<button type="button" class="button secondary add" id="{idPrefix}-extra-add" on:click={add}
			>+ Agregar extra</button
		>
	{/if}
</fieldset>

<style>
	.extras {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.45em;
		container-type: inline-size;
	}
	legend {
		float: none;
		padding: 0;
		margin-bottom: 0.3em;
		color: var(--1-dark);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6em;
	}
	.extra {
		border: 1px solid color-mix(in srgb, var(--2) 30%, transparent);
		border-radius: var(--radius-m, 12px);
		padding: 0.6em 0.8em;
		display: flex;
		flex-direction: column;
		gap: 0.45em;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5em;
	}
	.remove {
		display: inline-flex;
		align-items: center;
		gap: 0.2em;
	}
	.fields {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.45em;
	}
	@container (min-width: 34em) {
		.fields {
			grid-template-columns: 2fr 1fr 1fr 1fr;
		}
		.desc {
			grid-column: 1 / -1;
		}
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
	}
	.field > span {
		color: var(--1-dark);
	}
	.field input {
		max-width: 100%;
	}
	.req {
		color: var(--1);
	}
	.add {
		align-self: flex-start;
	}
</style>
