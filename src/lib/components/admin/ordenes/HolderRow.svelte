<script>
	/**
	 * Una entrada de una compra (Ventas › Órdenes, vista Compras): a nombre de quién, pronombres,
	 * si ya entró (✓), «primera vez» y sus respuestas a las preguntas de una vez por entrada.
	 *
	 * Props: `holder` ({ name, pronouns, checkedIn, firstTime, firstFrom }), `index` (desde 0),
	 * `answers` (las de esa entrada) y `onFilter` (ver AnswerList).
	 */
	import { CircleCheck } from '@lucide/svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import AnswerList from './AnswerList.svelte';

	/** @type {import('$lib/admin/ordersView.js').ViewHolder} */
	export let holder;
	/** @type {number} */
	export let index;
	/** @type {import('$lib/admin/ordersView.js').ShownAnswer[]} */
	export let answers = [];
	/** @type {(answer: import('$lib/admin/ordersView.js').ShownAnswer) => void} */
	export let onFilter = () => {};
</script>

<li class="holder" class:inside={holder.checkedIn}>
	<div class="who">
		<span class="n" aria-hidden="true">{index + 1}</span>
		<span
			><strong>{holder.name}</strong>{#if holder.pronouns}{' '}<span class="muted"
					>({holder.pronouns})</span
				>{/if}</span
		>
		{#if holder.checkedIn}<span class="in"
				><CircleCheck size={15} aria-hidden="true" /> ingresó</span
			>{/if}
		{#if holder.firstTime}<span
				title={holder.firstFrom === 'form'
					? 'Lo dijo en el formulario de compra'
					: 'No tiene entradas en ediciones anteriores'}
				><Badge tone="info">primera vez</Badge></span
			>{/if}
	</div>
	<AnswerList {answers} {onFilter} showTicket={false} />
</li>

<style>
	.holder {
		display: grid;
		grid-template-columns: minmax(10rem, 15rem) minmax(0, 1fr);
		gap: var(--space-3xs) var(--space-s);
		align-items: baseline;
		padding: var(--space-3xs) var(--space-2xs);
		border-radius: var(--radius-m);
		background: var(--surface-2, #f4eff7);
	}
	.inside {
		background: var(--ok-bg);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.1rem 0.4rem;
		font-size: var(--text-sm);
		overflow-wrap: anywhere;
	}
	.n {
		color: var(--muted);
		font-size: var(--text-xs);
		min-width: 1em;
	}
	.muted {
		color: var(--muted);
	}
	.in {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
		color: var(--ok);
		font-size: var(--text-xs);
		font-weight: 700;
	}
	@media (max-width: 40rem) {
		.holder {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
