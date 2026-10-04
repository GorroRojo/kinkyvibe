<!--
	Tramos de preventa de un tipo de entrada (editor de eventos, sección Entradas): nombre, precio,
	cantidad y fecha límite de cada tramo, en orden. La lógica (ids, validación, cómo se guarda)
	está en $lib/utils/ticketsEditor.js; acá solo se edita la lista.

	Uso: <TicketTiersEditor bind:tiers={t.tiers} taken={ventas por tramo} idPrefix="ev-0" />
-->
<script>
	import { MAX_TIERS, emptyTier, tierPreview } from '$lib/utils/ticketsEditor.js';

	/** @type {import('$lib/utils/ticketsEditor.js').TierForm[]} */
	export let tiers = [];
	/** Vendidas + reservadas por id de tramo (al editar un evento que ya vendió). */
	/** @type {Record<string, number>} */
	export let taken = {};
	/** Prefijo de los ids de los campos (único por tipo de entrada). */
	export let idPrefix = 'tier';

	/** @param {string | null} id */
	const takenOf = (id) => (id ? (taken[id] ?? 0) : 0);

	function add() {
		tiers = [...tiers, emptyTier(tiers.length)];
	}
	/** @param {number} j */
	function remove(j) {
		tiers = tiers.filter((_, k) => k !== j);
	}
</script>

<ol class="tiers">
	{#each tiers as tr, j (tr.key)}
		{@const sold = takenOf(tr.origId)}
		<li class="tier">
			<span class="tier-n" aria-hidden="true">{j + 1}</span>
			<label class="field t-name">
				<span>Nombre del tramo</span>
				<input
					id="{idPrefix}-name-{j}"
					bind:value={tr.name}
					maxlength="60"
					placeholder="Ej.: Preventa {j + 1}"
				/>
			</label>
			<label class="field t-price">
				<span>Precio ($)</span>
				<input
					id="{idPrefix}-price-{j}"
					bind:value={tr.price}
					inputmode="numeric"
					placeholder="Ej.: 8000"
				/>
			</label>
			<label class="field t-qty">
				<span>Cantidad</span>
				<input
					id="{idPrefix}-qty-{j}"
					bind:value={tr.quantity}
					inputmode="numeric"
					placeholder={j === tiers.length - 1 ? 'El resto' : 'Sin límite'}
				/>
			</label>
			<label class="field t-until">
				<span>Hasta <small>(opcional)</small></span>
				<input type="datetime-local" id="{idPrefix}-until-{j}" bind:value={tr.until} />
			</label>
			<button
				type="button"
				class="icon t-remove"
				on:click={() => remove(j)}
				disabled={sold > 0 || tiers.length === 1}
				title={sold > 0 ? 'Ya tiene entradas vendidas o reservadas' : undefined}
				aria-label="Quitar el tramo «{tr.name || j + 1}»">×</button
			>
			{#if sold}<small class="t-sold">Vendidas o reservadas: {sold}</small>{/if}
		</li>
	{/each}
</ol>
{#if tiers.length < MAX_TIERS}
	<button type="button" class="link add-tier" id="{idPrefix}-add" on:click={add}
		>+ Agregar tramo</button
	>
{/if}
<small class="tier-preview" aria-live="polite">{tierPreview(tiers)}</small>

<style>
	.tiers {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		container-type: inline-size;
	}
	/* Celu: número a la izquierda; nombre arriba; precio y cantidad; fecha. */
	.tier {
		display: grid;
		grid-template-columns: 1.8em minmax(0, 1fr) minmax(0, 1fr) 2.2em;
		grid-template-areas:
			'n name name x'
			'n price qty .'
			'n until until .'
			'n sold sold .';
		gap: 0.4em 0.6em;
		align-items: end;
		padding: 0.5em 0.6em;
		border-radius: var(--radius-m);
		background: var(--surface, white);
		outline: 1px solid var(--1-light);
	}
	.tier-n {
		grid-area: n;
		align-self: center;
		display: grid;
		place-items: center;
		width: 1.7em;
		height: 1.7em;
		border-radius: 50%;
		background: var(--1);
		color: white;
		font-weight: bold;
		font-size: var(--step--1);
	}
	.t-name {
		grid-area: name;
	}
	.t-price {
		grid-area: price;
	}
	.t-qty {
		grid-area: qty;
	}
	.t-until {
		grid-area: until;
	}
	.t-remove {
		grid-area: x;
		align-self: start;
	}
	.t-sold {
		grid-area: sold;
	}
	/* Compu (o un editor ancho): todo el tramo en una fila. */
	@container (min-width: 40em) {
		.tier {
			grid-template-columns: 1.8em minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(
					0,
					1.6fr
				) 2.2em;
			grid-template-areas:
				'n name price qty until x'
				'. sold sold sold sold .';
		}
		.t-remove {
			align-self: end;
		}
	}
	.field {
		min-width: 0;
	}
	button.icon {
		font: inherit;
		width: 2.2em;
		height: 2.2em;
		border-radius: 50%;
		border: 0;
		background: var(--surface-2, #faf6fc);
		outline: 1px solid var(--1-light);
		color: var(--1-dark);
		cursor: pointer;
	}
	button.icon:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.add-tier {
		align-self: flex-start;
		margin-top: 0.3em;
	}
	.tier-preview {
		display: block;
		margin-top: 0.3em;
		color: var(--2-dark);
	}
</style>
