<script>
	/**
	 * Evento cancelado (decisión 0051), arriba de Ventas › Órdenes: «Reembolsar todas» con la
	 * cantidad y el total exactos de las órdenes de Mercado Pago o PayPal (se escribe la palabra y
	 * recién ahí se manda, de a tandas) y la lista de las que se devuelven a mano.
	 *
	 * Props: `ra` (`data.refundAll` de la página), `form` (el de la página) y `onReveal(id)` (ir a
	 * una orden de la lista).
	 */
	import { enhance } from '$app/forms';
	import { announce, announceResult } from '$lib/admin/announce.js';
	import { PAYMENT_METHOD } from '$lib/admin/orderFormat.js';
	import { formatARS } from '$lib/utils/money.js';

	/** @type {any} */
	export let ra;
	/** @type {any} */
	export let form = null;
	/** @type {(orderId: string) => void} */
	export let onReveal = () => {};

	let confirmingAll = false;
	let typedAll = '';
	let sendingAll = false;
	// Las respuestas con error de `?/refundAll` no traen `results`: se lee sin el tipo de la unión.
	/** @type {any} */
	$: rr = form?.refundAll;
	$: rrDone = rr?.results ? rr.results.filter((/** @type {any} */ r) => r.ok) : [];
	$: rrFailed = rr?.results ? rr.results.filter((/** @type {any} */ r) => !r.ok) : [];
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submitAll = () => {
		sendingAll = true;
		return async ({ result, update }) => {
			await update();
			announceResult(result, 'refundAll');
			// La tanda que salió bien no trae mensaje: se lee el resumen.
			const done = /** @type {any} */ (result).data?.refundAll?.results;
			if (result.type === 'success' && Array.isArray(done)) {
				const failed = done.filter((/** @type {any} */ r) => !r.ok).length;
				announce(
					`Reembolsadas: ${done.length - failed}${failed ? `. Sin reembolsar: ${failed}` : ''}.`,
					{ force: true }
				);
			}
			sendingAll = false;
			confirmingAll = false;
			typedAll = '';
		};
	};
</script>

{#if ra && (ra.mp.count || ra.manual.length || ra.free || rr)}
	<section class="refund-all" aria-labelledby="reembolsar-todas">
		<h2 id="reembolsar-todas">El evento está cancelado: devolver lo vendido</h2>
		{#if rr?.message}
			<p class="flash" class:error={!rr.ok} role="status">{rr.message}</p>
		{/if}
		{#if rr?.results}
			<div class="refund-summary" role="status">
				<p>
					<strong>Reembolsadas: {rrDone.length}</strong>{#if rrFailed.length}
						· <strong class="bad">Sin reembolsar: {rrFailed.length}</strong> (quedaron como estaban; antes
						de devolverlas a mano, revisá cada pago en Mercado Pago: si figura reembolsado, no lo devuelvas
						de nuevo){/if}{#if rr.remaining}
						· faltan {rr.remaining}{/if}.
				</p>
				{#if rr.results.length}
					<ul>
						{#each rr.results as r (r.id)}
							<li class:bad={!r.ok}>
								<span class="ref">{r.reference}</span> · {r.name} · {formatARS(r.total)} · {r.reason}
							</li>
						{/each}
					</ul>
				{/if}
				{#if rr.remaining !== 0 && rr.after}
					<form method="POST" action="?/refundAll" use:enhance={submitAll}>
						<input type="hidden" name="after" value={rr.after} />
						<input type="hidden" name="confirm" value={ra.word} />
						<button type="submit" class="refund-confirm" disabled={sendingAll}>
							{sendingAll
								? 'Reembolsando…'
								: rr.remaining
									? `Seguir con las ${rr.remaining} que faltan`
									: 'Seguir con las que falten'}
						</button>
					</form>
				{/if}
			</div>
		{/if}
		{#if ra.mp.count}
			<p>
				<strong
					>{ra.mp.count} {ra.mp.count === 1 ? 'orden' : 'órdenes'} de Mercado Pago o PayPal</strong
				>
				sin reembolsar, por <strong>{formatARS(ra.mp.total)}</strong> en total.
			</p>
			{#if !confirmingAll}
				<button type="button" class="kv-btn small" on:click={() => (confirmingAll = true)}
					>Reembolsar todas…</button
				>
			{:else}
				<form method="POST" action="?/refundAll" class="refund-panel" use:enhance={submitAll}>
					<input type="hidden" name="count" value={ra.mp.count} />
					<input type="hidden" name="total" value={ra.mp.total} />
					<p>
						Se le pide a Mercado Pago el reembolso TOTAL de cada una, de a {ra.batch} por vez (si son
						más, después aparece «Seguir»). Cada orden reembolsada queda anulada, sale de los totales
						y le avisamos a quien compró por mail, como con «Reembolsar…». Las que Mercado Pago no acepte
						quedan como están, para hacerlas a mano. Lo ya reembolsado no se vuelve a pedir.
					</p>
					<label class="confirm-word">
						<span>Para confirmar, escribí <strong>{ra.word}</strong></span>
						<input
							class="kv-input"
							name="confirm"
							bind:value={typedAll}
							autocomplete="off"
							spellcheck="false"
						/>
					</label>
					<div class="refund-actions">
						<button
							type="submit"
							class="refund-confirm"
							disabled={sendingAll || typedAll.trim().toUpperCase() !== ra.word}
						>
							{sendingAll
								? 'Reembolsando…'
								: `Reembolsar ${ra.mp.count} ${ra.mp.count === 1 ? 'orden' : 'órdenes'} por ${formatARS(ra.mp.total)}`}
						</button>
						<button
							type="button"
							class="kv-btn ghost small"
							on:click={() => ((confirmingAll = false), (typedAll = ''))}>Cancelar</button
						>
					</div>
				</form>
			{/if}
		{:else}
			<p>No queda ninguna orden de Mercado Pago o PayPal para reembolsar.</p>
		{/if}
		{#if ra.manual.length}
			<h3>Para devolver a mano</h3>
			<p class="note">
				No pasan por Mercado Pago (puerta, carga a mano o transferencia): devolvé la plata por fuera
				y después marcá cada una con «Reembolsar…» en su orden.
			</p>
			<ul>
				{#each ra.manual as o (o.id)}
					<li>
						<a href="#orden-{o.id}" class="ref" on:click|preventDefault={() => onReveal(o.id)}
							>{o.reference}</a
						>
						· {o.name} · {PAYMENT_METHOD[o.method] ?? o.method}{o.channel === 'puerta'
							? ' (puerta)'
							: o.channel === 'manual'
								? ' (carga a mano)'
								: ''} · {formatARS(o.total)}
					</li>
				{/each}
			</ul>
		{/if}
		{#if ra.free}
			<p class="note">
				{ra.free === 1 ? '1 orden sin cargo' : `${ra.free} órdenes sin cargo`}: no hay plata que
				devolver; si hace falta, anulalas desde su orden.
			</p>
		{/if}
	</section>
{/if}

<style>
	.refund-all {
		border: 2px solid var(--bad);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-s);
		margin: 0 0 1rem;
		font-size: var(--text-sm);
	}
	.refund-all h2 {
		font-size: var(--text-sm);
		margin: 0.3rem 0;
	}
	.refund-all h3 {
		font-size: var(--text-sm);
		margin: 0.8rem 0 0.2rem;
	}
	.refund-all ul {
		padding-left: 1.2em;
		overflow-wrap: anywhere;
	}
	.refund-all .bad {
		color: var(--bad);
	}
	.refund-summary {
		background: var(--surface);
		border-radius: var(--radius-m);
		padding: var(--space-3xs) var(--space-xs);
		margin-bottom: 0.6rem;
	}
	.confirm-word {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		max-width: 20rem;
		margin-bottom: 0.6rem;
	}
	.refund-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
	}
	.refund-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.flash {
		background: var(--ok-bg);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		margin: 0 0 1rem;
	}
	.flash.error {
		background: var(--error-bg);
		color: var(--error);
	}
	.ref {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.note {
		color: var(--muted);
	}
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
	}
	.refund-panel {
		margin-top: 0.4rem;
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		background: var(--bad-bg);
	}
	.refund-panel p {
		margin: 0.2em 0 0.5em;
	}
	.refund-confirm {
		font-weight: 700;
		border: 0;
		border-radius: 2em;
		padding: var(--space-2xs) var(--space-s);
		min-height: 2.75rem;
		cursor: pointer;
		background: var(--bad);
		color: var(--surface);
	}
</style>
