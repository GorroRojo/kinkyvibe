<!--
	«Meta de venta»: ninguna, plata (pesos netos), entradas o ganancia, y el número
	($lib/utils/salesGoal.js). La usa el editor de eventos, dentro de «Entradas» (TicketsEditor:
	`bind:kind` y `bind:value`).

	Props: `kind` ('' | 'plata' | 'entradas' | 'ganancia'), `value`, `idPrefix`, `legend`, `help`
	(texto debajo), `error`, `profitGoal` (ofrece «Ganancia»: con el interruptor `gastos_reparto`;
	una meta de ganancia ya guardada se sigue viendo).
-->
<script>
	import { formatARS } from '$lib/utils/money.js';
	import { goalFromForm } from '$lib/utils/salesGoal.js';

	/** @type {'' | 'plata' | 'entradas' | 'ganancia'} */
	export let kind = '';
	export let value = '';
	export let idPrefix = 'ev';
	export let legend = 'Meta de venta';
	export let help =
		'El panel muestra el avance contra la meta. Sin meta, contra el cupo (vender todas las entradas).';
	export let error = '';
	export let profitGoal = false;

	$: parsed = goalFromForm(kind, value);
	$: preview =
		parsed.goal?.kind === 'plata'
			? formatARS(parsed.goal.value)
			: parsed.goal?.kind === 'ganancia'
				? `${formatARS(parsed.goal.value)} de ganancia`
				: parsed.goal
					? `${parsed.goal.value} ${parsed.goal.value === 1 ? 'entrada' : 'entradas'}`
					: '';
</script>

<fieldset class="goal" id="{idPrefix}-goal">
	<legend>{legend}</legend>
	<div class="row">
		<label class="part">
			<span>Medida</span>
			<select id="{idPrefix}-goal-kind" bind:value={kind} aria-describedby="{idPrefix}-goal-help">
				<option value="">Sin meta</option>
				<option value="plata">Plata (pesos)</option>
				<option value="entradas">Entradas</option>
				{#if profitGoal || kind === 'ganancia'}
					<option value="ganancia">Ganancia (pesos)</option>
				{/if}
			</select>
		</label>
		{#if kind}
			<label class="part amount">
				<span
					>{kind === 'plata'
						? '¿Cuánta plata?'
						: kind === 'ganancia'
							? '¿Cuánta ganancia?'
							: '¿Cuántas entradas?'}</span
				>
				<input
					id="{idPrefix}-goal-value"
					bind:value
					inputmode="numeric"
					placeholder={kind === 'plata' ? '250.000' : kind === 'ganancia' ? '150.000' : '30'}
					aria-invalid={error ? 'true' : undefined}
				/>
			</label>
		{/if}
	</div>
	{#if preview}<small class="preview">Meta: {preview}</small>{/if}
	<small id="{idPrefix}-goal-help"
		>{help}{#if kind === 'plata'}{' '}Cuenta lo neto: lo cobrado menos la comisión de Mercado Pago
			(las compras con transferencia, en la puerta o cargadas a mano no tienen comisión).{:else if kind === 'ganancia'}{' '}Cuenta
			la ganancia de Gastos y reparto: estimada (lo que entró menos los gastos cargados hasta ahora)
			mientras la cuenta está abierta, y la del cierre cuando la cerrás.{/if}</small
	>
	{#if error}<small class="error" role="alert">{error}</small>{/if}
</fieldset>

<style>
	.goal {
		border: 0;
		padding: 0;
		margin: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35em;
	}
	legend {
		float: none;
		padding: 0;
		margin-bottom: 0.3em;
		color: var(--1-dark);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em 0.8em;
	}
	.part {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		min-width: 0;
		flex: 1 1 10em;
		max-width: 16em;
	}
	.part > span {
		color: var(--1-dark);
	}
	.preview {
		font-weight: 700;
	}
	.error {
		color: var(--bad, #b00020);
	}
</style>
