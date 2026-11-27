<script>
	/**
	 * Una compra en Ventas › Órdenes (vista Compras), con todo a la vista (gorrite, 22/11): quien
	 * compró (nombre, pronombres, mail, DNI con «Mostrar»), el estado, la plata con su desglose,
	 * reembolsos parciales, precio cambiado en la puerta, la nota, cada entrada con sus respuestas
	 * y los datos del pago.
	 *
	 * Abajo, siempre la misma fila de botones, en el mismo lugar, con solo los que corresponden al
	 * estado: «Llegó la transferencia ✓» (la que toca ahora, resaltada) y «Cancelar» en una
	 * transferencia por confirmar; «Reenviar mail» en una aprobada; «Deshacer rechazo» en una
	 * transferencia cancelada por une admin; la casilla «Facturada» si la compra se factura; y en
	 * «Más» lo raro: corregir el mail y reembolsar (con su paso de confirmación). En todas,
	 * «Editar» (OrderEditor: quien compró, cada entrada y las respuestas) y, si se editó, «Editado
	 * por X el dd/mm» con el historial y «Deshacer» (OrderHistory).
	 *
	 * Props: `o` (la orden), `fields` (las preguntas, para las respuestas), `form` (el de la página),
	 * `result` (lo que pasó al confirmar o cancelar, se muestra en la tarjeta), `busy`, `linked`
	 * (la del link `#orden-<id>`), `overrideDialog`, `confirmSubmit` y `cancelSubmit` (los
	 * `use:enhance` de la página), `onFilter` (filtrar por una respuesta) y, para la barra de
	 * varias compras, `selected` y `onSelect` (la casilla al lado del nombre).
	 */
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import DniReveal from '$lib/components/admin/DniReveal.svelte';
	import InvoicedCheck from '$lib/components/admin/InvoicedCheck.svelte';
	import ReopenTransferButton from '$lib/components/admin/panel/ReopenTransferButton.svelte';
	import HolderRow from './HolderRow.svelte';
	import AnswerList from './AnswerList.svelte';
	import OrderEditor from './OrderEditor.svelte';
	import OrderHistory from './OrderHistory.svelte';
	import { announceResult } from '$lib/admin/announce.js';
	import {
		EMAIL_PROBLEM,
		ORDER_STATUS,
		ORDER_STATUS_TONE,
		PAYMENT_METHOD,
		orderMoneyLines,
		shortTime
	} from '$lib/admin/orderFormat.js';
	import { orderAnswerGroups } from '$lib/admin/ordersView.js';
	import { formatARS } from '$lib/utils/money.js';
	import { formatUSD } from '$lib/utils/paypal.js';

	/** @type {any} */
	export let o;
	/** @type {import('$lib/admin/ordersView.js').ViewField[]} */
	export let fields = [];
	/** @type {any} */
	export let form = null;
	/** @type {{ ok: boolean, message: string } | null} */
	export let result = null;
	export let busy = false;
	export let linked = false;
	/** @type {import('$lib/components/admin/panel/OverrideDialog.svelte').default | undefined} */
	export let overrideDialog = undefined;
	/** @type {import('@sveltejs/kit').SubmitFunction | undefined} */
	export let confirmSubmit = undefined;
	/** @type {import('@sveltejs/kit').SubmitFunction | undefined} */
	export let cancelSubmit = undefined;
	/** @type {(answer: import('$lib/admin/ordersView.js').ShownAnswer) => void} */
	export let onFilter = () => {};
	export let selected = false;
	/** @type {((checked: boolean) => void) | null} sin esto, no hay casilla */
	export let onSelect = null;

	$: money = orderMoneyLines(o);
	$: groups = orderAnswerGroups(o, fields);
	$: left = Math.max(0, o.total - o.refundedAmount);
	// «Deshacer rechazo»: una transferencia cancelada a mano (por une admin, no vencida sola).
	$: canReopen = o.method === 'transferencia' && o.status === 'cancelled' && Boolean(o.confirmedBy);
	$: confirming = o.transferPending && !result?.ok;
	// Sin JavaScript, «Corregir el mail» con error vuelve abierto.
	$: emailFixFailed = form?.emailFix?.order === o.id && !form.emailFix.ok;
	// «Editar»: lo que pasó al guardar o deshacer en esta orden; con error, el editor queda abierto.
	$: edited = form?.orderEdit?.order === o.id ? form.orderEdit : null;
	let editing = false;
	$: if (edited && !edited.ok && edited.errors && Object.keys(edited.errors).length) editing = true;

	/**
	 * `use:enhance` que, al volver, lee en voz alta el mensaje de la acción (`form[key].message`).
	 * @param {string} key
	 * @returns {import('@sveltejs/kit').SubmitFunction}
	 */
	const announced =
		(key) =>
		() =>
		async ({ result, update }) => {
			await update();
			announceResult(result, key);
		};
	// «Reembolsar…»: mientras se pide, el botón queda apagado y dice «Reembolsando…».
	let refunding = false;
	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submitRefund = () => {
		refunding = true;
		return async ({ result, update }) => {
			await update();
			announceResult(result, 'refund');
			refunding = false;
		};
	};
</script>

<li
	class="order status-{o.status}"
	class:waiting={o.transferPending}
	class:selected
	class:linked
	id="orden-{o.id}"
>
	<div class="head">
		{#if onSelect}
			<input
				class="pick"
				type="checkbox"
				checked={selected}
				aria-label="Elegir {o.reference}"
				on:change={(ev) => onSelect?.(ev.currentTarget.checked)}
			/>
		{/if}
		<strong class="name">{o.name}</strong>{#if o.pronouns}<span class="muted">({o.pronouns})</span
			>{/if}
		<a href="mailto:{o.email}">{o.email}</a>
		<DniReveal orderId={o.id} tail={o.dniTail} {form} />
		<span class="status"
			><Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}>{ORDER_STATUS[o.status]}</Badge></span
		>
	</div>
	<!-- Lo pagado y lo que queda arriba; el desglose (Fondo, recargo, comisión, extras) abajo,
	     chico (opción A de gorrite). -->
	<div class="what">
		<strong>{money.main}</strong>
		· {PAYMENT_METHOD[o.method] ?? o.method}
		{#if o.status === 'approved'}
			· ingresaron {o.checkedIn}/{o.quantity}
		{/if}
	</div>
	{#if money.detail}<p class="what-detail">{money.detail}</p>{/if}
	{#if o.transferPending}
		<p class="deadline">
			Pedida {shortTime(o.createdAt)} ·
			{#if o.status === 'expired'}
				<span class="late">reserva vencida el {shortTime(o.expiresAt)}</span> (si ya no hay cupo, te avisamos
				y podés confirmarla igual)
			{:else}
				reservada hasta {shortTime(o.expiresAt)}
			{/if}
		</p>
	{/if}
	{#if o.refundedAmount}<p class="admin-note">
			Reembolso parcial en Mercado Pago: {formatARS(o.refundedAmount)} (quedan {formatARS(left)})
		</p>{/if}
	{#if o.priceChange}<p class="admin-note">{o.priceChange}</p>{/if}
	{#if o.note}
		<!-- Nota de la carga a mano o de la venta en la puerta (solo en el panel). -->
		<p class="admin-note note-box"><strong>Nota:</strong> <span class="pre">{o.note}</span></p>
	{/if}
	{#if groups.order.length}
		<div class="order-answers"><AnswerList answers={groups.order} {onFilter} /></div>
	{/if}
	{#if o.holders.length}
		<ul class="holders" aria-label="Entradas">
			{#each o.holders as h, i (i)}
				<HolderRow holder={h} index={i} answers={groups.holders[i]} {onFilter} />
			{/each}
		</ul>
	{/if}
	<div class="meta">
		<span class="ref">{o.reference}</span> · {shortTime(o.createdAt)}{#if o.paymentId}{' '}
			· {o.method === 'paypal' ? 'cobro PayPal' : 'pago MP'}
			{o.paymentId}{/if}{#if o.usdCents}{' '}· {formatUSD(
				o.usdCents
			)}{#if o.usdFeeCents}{' '}(comisión
				{formatUSD(o.usdFeeCents)}){/if}{/if}{#if o.confirmedBy}
			· {o.status === 'cancelled' ? 'canceló' : 'confirmó'} {o.confirmedBy}{/if}
		{#if o.status === 'approved'}
			· {#if o.emailProblem}<strong class="mail-problem"
					>{EMAIL_PROBLEM[o.emailProblem] ?? 'mail enviado'}</strong
				>{:else}{o.emailSent ? 'mail enviado' : 'mail NO enviado'}{/if}
		{/if}
		{#if o.status === 'refunded'}
			· reembolsada {o.refundedAt ? shortTime(o.refundedAt) : ''}{o.refundedBy
				? ` por ${o.refundedBy}`
				: ' (desde Mercado Pago)'}
		{/if}
	</div>
	<OrderHistory orderId={o.id} edits={o.edits ?? []} />
	{#if result}
		<p class="kv-flash row-flash" class:bad={!result.ok} role="status">{result.message}</p>
	{/if}
	{#if edited}
		<p class="kv-flash row-flash" class:bad={!edited.ok} role="status">{edited.message}</p>
	{/if}
	<div class="actions">
		{#if confirming}
			<form method="POST" action="?/confirm" use:enhance={confirmSubmit}>
				<input type="hidden" name="order" value={o.id} />
				<button type="submit" class="kv-btn small next" disabled={busy}
					>Llegó la transferencia ✓</button
				>
			</form>
			<form method="POST" action="?/cancel" use:enhance={cancelSubmit}>
				<input type="hidden" name="order" value={o.id} />
				<button type="submit" class="kv-btn ghost small danger" disabled={busy}>Cancelar</button>
			</form>
		{/if}
		{#if o.status === 'approved'}
			<form method="POST" action="?/resend" use:enhance={announced('resend')}>
				<input type="hidden" name="order" value={o.id} />
				<button type="submit" class="kv-btn ghost small">Reenviar mail</button>
			</form>
		{/if}
		{#if canReopen}
			<ReopenTransferButton id={o.id} reference={o.reference} dialog={overrideDialog} />
		{/if}
		{#if o.toInvoice || o.invoicedAt}
			<!-- Ya se facturó esta compra (solo admins). -->
			<InvoicedCheck orderId={o.id} bind:invoicedAt={o.invoicedAt} bind:invoicedBy={o.invoicedBy} />
		{/if}
		<details class="more edit" bind:open={editing}>
			<summary class="kv-btn ghost small">Editar</summary>
			{#if editing}
				<OrderEditor {o} {fields} {form} onDone={() => (editing = false)} />
			{/if}
		</details>
		{#if o.status === 'approved'}
			<details class="more" open={emailFixFailed}>
				<summary class="kv-btn ghost small">Más</summary>
				<div class="more-panel">
					<!-- Quien compró escribió mal su mail: se corrige y las entradas salen a la nueva. -->
					<details class="email-fix" open={emailFixFailed}>
						<summary>Corregir el mail…</summary>
						<form
							method="POST"
							action="?/email"
							use:enhance={announced('emailFix')}
							class="email-fix-form"
						>
							<input type="hidden" name="order" value={o.id} />
							<label>
								<span>Mail nuevo</span>
								<input
									class="kv-input"
									type="email"
									name="email"
									required
									maxlength="254"
									autocomplete="off"
									spellcheck="false"
								/>
							</label>
							<button type="submit" class="kv-btn small">Corregir el mail y reenviar</button>
						</form>
						<p class="note">
							Las entradas salen a la dirección nueva; a la anterior no le mandamos nada más.
						</p>
					</details>
					<!-- Paso de confirmación: se abre, se revisa y recién ahí se reembolsa. -->
					<details class="refund">
						<summary>Reembolsar…</summary>
						<div class="refund-panel">
							<p>
								<strong>{formatARS(left)}</strong> a
								<strong>{o.name}</strong> ({o.email}) ·
								{o.quantity}
								{o.quantity === 1 ? 'entrada' : 'entradas'}{#if o.holders.length}:
									{o.holders.map((/** @type {any} */ h) => h.name).join(', ')}{/if}.
							</p>
							<p class="note">
								{#if o.method === 'mercadopago'}
									Se pide a Mercado Pago el reembolso TOTAL del pago {o.paymentId} (tiene que haber saldo
									en la cuenta; hasta 180 días desde el pago).
								{:else if o.method === 'paypal'}
									Se pide a PayPal el reembolso TOTAL del cobro {o.paymentId}{#if o.usdCents}{' '}({formatUSD(
											o.usdCents
										)}){/if} (tiene que haber saldo en la cuenta de PayPal; hasta 180 días desde el pago).
								{:else if o.method === 'transferencia'}
									No hay devolución automática: primero devolvé la transferencia a mano, después
									marcala acá.
								{:else}
									Compra sin cargo: solo se anulan las entradas.
								{/if}
								Las entradas quedan anuladas (el control de ingreso las rechaza), se libera el cupo y
								el uso del código, sale de los totales y le avisamos por mail.
							</p>
							<form method="POST" action="?/refund" use:enhance={submitRefund}>
								<input type="hidden" name="order" value={o.id} />
								<button
									type="submit"
									class="refund-confirm"
									disabled={refunding}
									aria-busy={refunding}
								>
									{refunding
										? 'Reembolsando…'
										: o.method === 'mercadopago' || o.method === 'paypal'
											? `Confirmar reembolso de ${formatARS(left)}`
											: o.method === 'transferencia'
												? 'Marcar como reembolsada (transferencia devuelta a mano)'
												: 'Anular las entradas'}
								</button>
							</form>
						</div>
					</details>
				</div>
			</details>
		{/if}
	</div>
</li>

<style>
	.order {
		/* 5rem en total: en el celu, parte la pone el scroll-padding del panel. */
		scroll-margin-top: calc(5rem - var(--panel-scroll-top, 0px));
		border: 1px solid var(--line);
		border-left: 4px solid var(--line);
		border-radius: var(--card-round);
		padding: var(--space-2xs) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		min-width: 0;
	}
	.order.selected {
		background: color-mix(in srgb, var(--link) 7%, transparent);
	}
	.order:target,
	.order.linked {
		box-shadow: 0 0 0 3px var(--link);
	}
	.status-approved {
		border-left-color: var(--3);
	}
	.status-pending,
	.status-awaiting_transfer,
	.waiting {
		border-left-color: var(--4);
	}
	.waiting.status-expired {
		border-left-color: var(--bad);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem var(--space-xs);
		align-items: center;
		overflow-wrap: anywhere;
	}
	.name {
		font-size: var(--text-base);
	}
	.pick {
		width: 1.15rem;
		height: 1.15rem;
		margin: 0;
		accent-color: var(--link);
		cursor: pointer;
	}
	.status {
		margin-left: auto;
	}
	.muted {
		color: var(--muted);
	}
	.what,
	.meta,
	.deadline {
		font-size: var(--text-sm);
	}
	.what-detail {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.deadline {
		margin: 0;
	}
	.late {
		color: var(--bad);
		font-weight: 700;
	}
	.meta {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.ref {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.mail-problem {
		color: var(--bad);
	}
	.admin-note {
		margin: 0;
		font-size: var(--text-sm);
	}
	.note-box {
		padding: var(--space-3xs) var(--space-2xs);
		border-radius: var(--radius-m);
		background: var(--warn-bg);
	}
	.admin-note .pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.holders {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.row-flash {
		margin: 0;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3xs) var(--space-2xs);
		margin-top: 0.2rem;
	}
	.actions form {
		display: inline-flex;
	}
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
		min-height: 2.25rem;
	}
	.next {
		background: var(--ok);
		border-color: var(--ok);
		color: var(--surface);
		font-weight: 700;
	}
	.danger {
		color: var(--bad);
	}
	.more > summary {
		list-style: none;
		cursor: pointer;
	}
	.more > summary::-webkit-details-marker {
		display: none;
	}
	.more > summary::after {
		content: ' ▾';
	}
	.more[open] {
		flex-basis: 100%;
	}
	.more[open] > summary::after {
		content: ' ▴';
	}
	.more-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
		margin-top: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		font-size: var(--text-sm);
	}
	.email-fix summary,
	.refund summary {
		cursor: pointer;
		font-weight: 700;
	}
	.refund summary {
		color: var(--bad);
	}
	.email-fix-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: end;
		margin-top: 0.4rem;
	}
	.email-fix-form label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1 1 14rem;
		max-width: 22rem;
	}
	.email-fix .note {
		margin: 0.3em 0 0;
	}
	.note {
		color: var(--muted);
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
	.refund-confirm:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
