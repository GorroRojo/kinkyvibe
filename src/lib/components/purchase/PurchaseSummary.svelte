<script>
	/**
	 * Resumen de lo que se está comprando, siempre a la vista: en pantallas anchas es una columna
	 * al costado (fija al bajar); en el celu, una barra arriba del formulario con el total, que se
	 * despliega para ver el detalle. Un solo bloque para los dos casos (cambia con CSS).
	 *
	 * En el celu la barra es una sola línea («1 entrada · $ 15.300 ▾», toda tocable) para no tapar
	 * el formulario; abajo, siempre a la vista, el recargo de Mercado Pago si lo hay (el total ya
	 * lo incluye y no tiene que ser una sorpresa).
	 *
	 * `summary` sale de `purchaseSummary` ($lib/utils/purchaseSteps.js); acá no se hacen cuentas.
	 */
	import { ChevronDown } from '@lucide/svelte';

	/** @type {import('$lib/utils/purchaseSteps.js').PurchaseSummary} */
	export let summary;
	/** Texto del cierre de la venta ("La venta cierra el …."), o vacío. */
	export let closesText = '';

	/** Cuando cambia (el paso), el detalle desplegado se vuelve a cerrar para no tapar el paso. */
	export let collapseKey = 0;

	let expanded = false;
	$: collapse(collapseKey);
	/** @param {unknown} _key */
	function collapse(_key) {
		expanded = false;
	}
	$: fee = summary.lines.find((l) => l.id === 'recargo') ?? null;
</script>

<aside class="summary" class:expanded aria-labelledby="resumen-titulo">
	<h3 id="resumen-titulo">Tu compra</h3>
	<!-- Celu: la barra de una línea, que despliega el detalle. -->
	<button
		type="button"
		class="bar"
		aria-expanded={expanded}
		aria-controls="resumen-detalle"
		on:click={() => (expanded = !expanded)}
	>
		<span class="bar-text"
			>{summary.item ? summary.countText : 'Elegí tu entrada'} ·
			<strong>{summary.total}</strong></span
		>
		<span class="visually-hidden">{expanded ? 'Ocultar detalle' : 'Ver detalle'}</span>
		<ChevronDown size="1.1em" aria-hidden="true" />
	</button>
	{#if fee}
		<p class="fee">Incluye el recargo de Mercado Pago <span class="amount">{fee.amount}</span></p>
	{:else if summary.surchargePlaceholder}
		<!-- Mismo lugar que la línea del recargo, para que el formulario no salte al cambiar el medio
		     de pago (el texto va en ::before, fuera del DOM). -->
		<p class="fee placeholder" aria-hidden="true">
			<span data-text="Incluye el recargo de Mercado Pago"></span>
			<span data-text={summary.surchargePlaceholder}></span>
		</p>
	{/if}
	<div class="detail" id="resumen-detalle">
		{#if summary.item}
			<p class="item">
				<strong>{summary.item.name}</strong>{#if summary.item.tier}<span class="tier"
						>{summary.item.tier}</span
					>{/if}
			</p>
			{#if summary.option}<p class="option">{summary.option}</p>{/if}
			<div class="breakdown" aria-live="polite">
				{#each summary.lines as l (l.id)}
					<p class="line" class:note={l.note}>
						<span>{l.label}</span>{#if l.amount}<span class="amount">{l.amount}</span>{/if}
					</p>
				{/each}
				{#if summary.surchargePlaceholder}
					<!-- Reserva el lugar de la línea del recargo para que nada salte al cambiar el medio de
					     pago. Lleva el mismo texto (invisible y fuera del DOM, en ::before) para que se corte
					     en las mismas líneas que la real cuando la columna es angosta. -->
					<p class="line placeholder" aria-hidden="true">
						<span data-text="Recargo Mercado Pago"></span>
						<span data-text={summary.surchargePlaceholder}></span>
					</p>
				{/if}
			</div>
		{:else}
			<p class="empty">Elegí un tipo de entrada.</p>
		{/if}
		{#if closesText}<small class="closes">{closesText}</small>{/if}
	</div>
	{#if summary.item}<span class="count">{summary.countText}</span>{/if}
	<p class="total" aria-live="polite">Total: <strong>{summary.total}</strong></p>
</aside>

<style>
	.summary {
		grid-area: summary;
		align-self: start;
		/* En el celu: barra fija arriba mientras se baja por el formulario. */
		position: sticky;
		top: 0;
		z-index: 1;
		padding: var(--space-3xs) var(--space-2xs);
		border-radius: var(--radius-m);
		background: white;
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--2) 35%, transparent),
			0 4px 10px rgba(0, 0, 0, 0.08);
		font-size: var(--step--1);
	}
	h3 {
		margin: 0;
		font-size: var(--step-0);
		color: var(--1-ink);
	}
	/* Celu: «Tu compra» queda para los lectores de pantalla; se ve la barra. */
	h3,
	.count,
	.total {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2xs);
		width: 100%;
		min-height: var(--tap);
		margin: 0;
		padding: 0 var(--space-3xs);
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: var(--step-0);
		text-align: start;
		cursor: pointer;
	}
	.bar :global(svg) {
		flex: none;
		color: var(--2-dark);
		transition: rotate 150ms;
	}
	.expanded .bar :global(svg) {
		rotate: 180deg;
	}
	.bar:focus-visible {
		outline: 3px solid var(--2-light);
		border-radius: var(--radius-s);
	}
	.fee {
		display: flex;
		justify-content: space-between;
		gap: 1em;
		margin: 0;
		padding: 0 var(--space-3xs) var(--space-3xs);
		color: var(--muted);
	}
	.detail {
		display: none;
		margin-top: 0.4em;
		padding: 0.4em var(--space-3xs) var(--space-3xs);
		border-top: 1px solid color-mix(in srgb, var(--2) 25%, transparent);
	}
	.expanded .detail {
		display: block;
	}
	/* Desplegado, el recargo ya está en el detalle. */
	.expanded .fee {
		display: none;
	}
	.item,
	.option {
		margin: 0 0 0.2em;
	}
	.option {
		color: var(--2-dark);
	}
	.tier {
		display: inline-block;
		margin-left: 0.5em;
		padding: 0.05em 0.6em;
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--2) 15%, white);
		color: var(--2-dark);
		white-space: nowrap;
	}
	.line {
		display: flex;
		justify-content: space-between;
		gap: 1em;
		margin: 0.1em 0;
	}
	.amount {
		white-space: nowrap;
	}
	.note {
		color: var(--2-dark);
	}
	.placeholder {
		visibility: hidden;
	}
	.placeholder span::before {
		content: attr(data-text);
	}
	.empty {
		margin: 0;
		color: var(--muted);
	}
	.closes {
		display: block;
		margin-top: 0.5em;
		color: var(--muted);
		font-size: var(--step--2);
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	/* Pantallas anchas (lo decide el contenedor de la compra): columna al costado, siempre con el
	   detalle, sin la barra para desplegar. */
	@container compra (min-width: 46rem) {
		.summary {
			top: 1em;
			display: flex;
			flex-direction: column;
			padding: 0.9em 1em;
		}
		h3,
		.count,
		.total {
			position: static;
			width: auto;
			height: auto;
			margin: 0;
			overflow: visible;
			clip: auto;
			white-space: normal;
		}
		.bar,
		.fee {
			display: none;
		}
		.count {
			color: var(--muted);
		}
		.detail {
			order: 2;
			display: block;
			padding-inline: 0;
		}
		.count {
			order: 1;
		}
		.total {
			order: 3;
			margin: 0.5em 0 0;
			padding-top: 0.4em;
			border-top: 1px solid color-mix(in srgb, var(--2) 25%, transparent);
			font-size: var(--step-1);
		}
	}
</style>
