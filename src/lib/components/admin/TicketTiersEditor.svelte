<!--
	Tramos de preventa de un tipo de entrada (editor de eventos, sección Entradas): nombre, precio,
	cantidad y fecha límite de cada tramo, en orden. La lógica (ids, validación, cómo se guarda)
	está en $lib/utils/ticketsEditor.js; acá solo se edita la lista.

	Con el porcentaje del Fondo (`fondoPercent`, solo eventos KinkyVibe), cada precio muestra cuánto
	sale con el Fondo, y el resumen también. «Copiar precios» copia una línea por tramo (y la de la
	puerta) para la agenda y los flyers (ver $lib/utils/fondoPrices.js).

	Uso: <TicketTiersEditor bind:tiers={t.tiers} taken={ventas por tramo} doorPrice={t.doorPrice}
	  fondoPercent={20} idPrefix="ev-0" />
-->
<script>
	import { tick } from 'svelte';
	import { Check, Copy, Plus } from '@lucide/svelte';
	import { MAX_TIERS, emptyTier, tierPreview } from '$lib/utils/ticketsEditor.js';
	import {
		fondoPriceLine,
		fondoPriceSpoken,
		fondoTodayLine,
		pricesCopyText
	} from '$lib/utils/fondoPrices.js';

	/** @type {import('$lib/utils/ticketsEditor.js').TierForm[]} */
	export let tiers = [];
	/** Vendidas + reservadas por id de tramo (al editar un evento que ya vendió). */
	/** @type {Record<string, number>} */
	export let taken = {};
	/** Prefijo de los ids de los campos (único por tipo de entrada). */
	export let idPrefix = 'tier';
	/** «Precio en puerta» del tipo ('' = el del último tramo), para «Copiar precios». */
	export let doorPrice = '';
	/**
	 * Porcentaje del Fondo para mostrar los precios con el Fondo; `null` o 0: no se muestran (evento
	 * sin Fondo o porcentaje desconocido).
	 * @type {number | null}
	 */
	export let fondoPercent = null;

	$: copyText = pricesCopyText(
		{ mode: 'tiers', name: '', price: '', tiers, doorPrice },
		fondoPercent
	);
	let copied = false;
	/** No se pudo usar el portapapeles: el texto queda a la vista, seleccionado, para copiarlo. */
	let copyFailed = false;
	/** @type {HTMLTextAreaElement | undefined} */
	let copyBox;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let copiedTimer;

	async function copyPrices() {
		const text = copyText;
		try {
			await navigator.clipboard.writeText(text);
			copyFailed = false;
			copied = true;
			clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copied = false), 2500);
		} catch {
			copied = false;
			copyFailed = true;
			await tick();
			copyBox?.focus();
			copyBox?.select();
		}
	}

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
		<li class="tier" class:with-fondo={fondoPriceLine(tr.price, fondoPercent)}>
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
			{#if fondoPriceLine(tr.price, fondoPercent)}
				<small class="t-fondo" id="{idPrefix}-price-fondo-{j}"
					><span aria-hidden="true">{fondoPriceLine(tr.price, fondoPercent)}</span><span
						class="visually-hidden">{fondoPriceSpoken(tr.price, fondoPercent)}</span
					></small
				>
			{/if}
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
				aria-label="Sacar el tramo «{tr.name || j + 1}»">×</button
			>
			{#if sold}<small class="t-sold">Vendidas o reservadas: {sold}</small>{/if}
		</li>
	{/each}
</ol>
{#if tiers.length < MAX_TIERS}
	<button type="button" class="kv-link add-tier" id="{idPrefix}-add" on:click={add}
		><Plus size={16} aria-hidden="true" /> Agregar tramo</button
	>
{/if}
<div class="tier-summary">
	<small class="tier-preview" id="{idPrefix}-preview" aria-live="polite"
		><span aria-hidden="true">{tierPreview(tiers, fondoPercent)}</span><span class="visually-hidden"
			>{tierPreview(tiers, fondoPercent, { spoken: true })}</span
		>{#if fondoTodayLine(fondoPercent)}{' '}<strong>{fondoTodayLine(fondoPercent)}</strong
			>{/if}</small
	>
	<button
		type="button"
		class="kv-link copy-prices"
		id="{idPrefix}-copy"
		on:click={copyPrices}
		aria-describedby="{idPrefix}-preview"
		>{#if copied}<Check size={16} aria-hidden="true" /> Copiado{:else}<Copy
				size={16}
				aria-hidden="true"
			/> Copiar precios{/if}</button
	>
</div>
<p class="visually-hidden" role="status">{copied ? 'Precios copiados' : ''}</p>
{#if copyFailed}
	<label class="field copy-box">
		<span>No se pudo copiar: seleccioná el texto y copialo.</span>
		<textarea
			bind:this={copyBox}
			id="{idPrefix}-copy-text"
			readonly
			rows={copyText.split('\n').length}
			value={copyText}
			on:focus={(e) => e.currentTarget.select()}></textarea>
	</label>
{/if}

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
	/* Con el precio con el Fondo debajo del precio. */
	.tier.with-fondo {
		grid-template-areas:
			'n name name x'
			'n price qty .'
			'n fondo fondo .'
			'n until until .'
			'n sold sold .';
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
	.t-fondo {
		grid-area: fondo;
		margin-top: -0.2em;
		color: var(--2-dark);
	}
	/* Compu (o un editor ancho): todo el tramo en una fila. */
	@container (min-width: 40em) {
		.tier {
			grid-template-columns:
				1.8em minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.6fr)
				2.2em;
			grid-template-areas:
				'n name price qty until x'
				'. sold sold sold sold .';
		}
		.tier.with-fondo {
			grid-template-areas:
				'n name price qty until x'
				'. . fondo fondo fondo .'
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
	.tier-summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2em 0.8em;
		margin-top: 0.3em;
	}
	.tier-preview {
		flex: 1 1 18em;
		min-width: 0;
		color: var(--2-dark);
	}
	.copy-prices {
		flex: none;
		min-height: 44px;
	}
	.copy-box {
		margin-top: 0.3em;
	}
	.copy-box textarea {
		font-size: var(--step--1);
		resize: vertical;
	}
</style>
