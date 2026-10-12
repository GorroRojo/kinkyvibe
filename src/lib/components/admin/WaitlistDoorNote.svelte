<!--
	Nota de la lista de espera en «Vender en puerta» (modo puerta) y en «Cargar entradas a mano»
	(docs/tickets.md, «Lista de espera»). No frena nada: la puerta y la carga a mano venden igual
	(decisión de gorrite), solo avisan que esa venta puede dejar sin lugar a alguien de la fila.

	Props: `summary` (`waitlistSummary` del servidor: `{ waiting, offered, nextHoldUntil }`, o
	`null` = no se muestra nada), `action` ('vender' | 'cargar': el verbo del aviso).
-->
<script>
	import { ListOrdered } from '@lucide/svelte';
	import { argTime } from '$lib/utils/dates.js';

	/** @type {{ waiting: number, offered: number, nextHoldUntil: number | null } | null} */
	export let summary = null;
	/** @type {'vender' | 'cargar'} */
	export let action = 'vender';

	$: total = summary ? summary.waiting + summary.offered : 0;
	$: held = summary?.offered
		? ` (${summary.offered === 1 ? '1 con lugar guardado' : `${summary.offered} con lugar guardado`}${
				summary.nextHoldUntil ? ` hasta las ${argTime(summary.nextHoldUntil)}` : ''
			})`
		: '';
	$: verb = action === 'cargar' ? 'cargar' : 'vender';
	$: past = action === 'cargar' ? 'cargás' : 'vendés';
</script>

{#if summary && total > 0}
	<p class="waitlist-note" role="note">
		<ListOrdered size={18} aria-hidden="true" />
		<span
			>Hay {total === 1 ? '1 persona' : `${total} personas`} en la lista de espera{held}. Podés {verb}
			igual; si {past} ese lugar, esa persona puede quedarse sin entrada.</span
		>
	</p>
{/if}

<style>
	.waitlist-note {
		display: flex;
		gap: var(--space-2xs);
		align-items: flex-start;
		margin: 0;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: color-mix(in srgb, var(--warn) 18%, var(--surface));
		color: var(--text);
	}
	.waitlist-note :global(svg) {
		flex: none;
		margin-top: 0.1em;
	}
</style>
