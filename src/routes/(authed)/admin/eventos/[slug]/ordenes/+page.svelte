<script>
	import { enhance } from '$app/forms';
	import { CircleCheck, ReceiptText, Search, TicketPlus, TriangleAlert } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import OrderAnswers from '$lib/components/admin/OrderAnswers.svelte';
	import { eventHref } from '$lib/admin/nav.js';
	import { foldSearch } from '$lib/admin/eventFormat.js';
	import {
		ORDER_STATUS,
		ORDER_STATUS_TONE,
		PAYMENT_METHOD,
		formatDni,
		shortTime
	} from '$lib/admin/orderFormat.js';
	import { formatARS } from '$lib/utils/money.js';
	import { fondoOptionLabel } from '$lib/utils/tickets.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;
	let filter = 'approved';
	let query = '';
	$: words = foldSearch(query).split(/\s+/).filter(Boolean);
	$: byStatus =
		filter === 'all'
			? data.orders
			: filter === 'pending'
				? data.orders.filter((o) => o.status === 'pending' || o.status === 'awaiting_transfer')
				: data.orders.filter((o) => o.status === filter);
	$: visible = words.length
		? byStatus.filter((o) => {
				const hay = foldSearch(
					`${o.reference} ${o.name} ${o.email} ${o.dni} ${o.holders.map((h) => h.name).join(' ')}`
				);
				return words.every((w) => hay.includes(w));
			})
		: byStatus;
	$: counts = {
		approved: data.orders.filter((o) => o.status === 'approved').length,
		pending: data.orders.filter((o) => o.status === 'pending' || o.status === 'awaiting_transfer')
			.length,
		refunded: data.orders.filter((o) => o.status === 'refunded').length,
		all: data.orders.length
	};
</script>

<svelte:head><title>Órdenes · {e.title} · Panel</title></svelte:head>

{#if form?.review}
	<p class="flash" class:error={!form.review.ok} role="status">{form.review.message}</p>
{/if}
{#if data.review.length}
	<section class="review" aria-labelledby="revisar" id="revisar-ordenes">
		<h2 id="revisar"><TriangleAlert size={18} aria-hidden="true" /> Para revisar</h2>
		<ul>
			{#each data.review as o (o.id)}
				<li>
					<strong>{o.reference}</strong> · {o.name} · {o.type} × {o.quantity} ·
					{#if o.needsReview === 'late_payment'}
						Pago aprobado con la reserva ya vencida y sin cupo libre: puede haber más entradas
						vendidas que el cupo. Decidí si se acepta o se reembolsa.
					{:else if o.needsReview === 'duplicate_payment'}
						Llegó otro pago aprobado (Mercado Pago n.° {o.reviewDetail}) para esta orden, que ya
						estaba pagada: posible cobro doble. Revisalo en Mercado Pago y reembolsá el que sobre.
					{/if}
					<form method="POST" action="?/reviewed" use:enhance>
						<input type="hidden" name="order" value={o.id} />
						<button type="submit" class="kv-btn ghost small">Marcar como revisada</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>
{/if}

{#if form?.resend}
	<p class="flash" class:error={!form.resend.ok} role="status">{form.resend.message}</p>
{/if}
{#if form?.refund}
	<p class="flash" class:error={!form.refund.ok} role="status">{form.refund.message}</p>
{/if}

<Card title="Órdenes">
	<svelte:fragment slot="actions">
		<!-- Invitaciones, cortesías o pagos por otro lado (la página es del modo puerta, #103). -->
		<a class="kv-btn small" href="{eventHref(e.slug)}/ordenes/cargar"
			><TicketPlus size={16} aria-hidden="true" /> Cargar entradas a mano</a
		>
		<CsvButton href="{eventHref(e.slug)}/ordenes.csv" label="CSV (una fila por entrada)" />
	</svelte:fragment>
	<div class="tools">
		<label class="filter">
			<span>Mostrar</span>
			<select bind:value={filter}>
				<option value="approved">Aprobadas ({counts.approved})</option>
				<option value="pending">Pendientes ({counts.pending})</option>
				<option value="refunded">Reembolsadas ({counts.refunded})</option>
				<option value="all">Todas ({counts.all})</option>
			</select>
		</label>
		<label class="search">
			<Search size={16} aria-hidden="true" />
			<span class="sr-only">Buscar una orden</span>
			<input
				type="search"
				bind:value={query}
				placeholder="Nombre, email, DNI o KV-…"
				autocomplete="off"
			/>
		</label>
	</div>

	{#if visible.length === 0}
		<EmptyState icon={ReceiptText} title="No hay órdenes para mostrar" />
	{/if}
	<ul class="orders">
		{#each visible as o (o.id)}
			<li class="order status-{o.status}" id="orden-{o.id}">
				<div class="who">
					<strong>{o.name}</strong>{#if o.pronouns}<span class="muted">({o.pronouns})</span>{/if}
					<span class="dni">DNI {formatDni(o.dni)}</span>
					<a href="mailto:{o.email}">{o.email}</a>
					<Badge tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}
						><span class="status">{ORDER_STATUS[o.status]}</span></Badge
					>
				</div>
				<div class="what">
					{o.quantity} × {o.type} · <strong>{formatARS(o.total)}</strong>
					{#if o.gorra !== null}<small>(a la gorra, {formatARS(o.gorra)} c/u)</small>{/if}
					{#if o.fondo}<small>(fondo −{formatARS(o.fondo)})</small>{/if}
					{#if o.contribution}<small
							>({fondoOptionLabel(o.fondoOption)}: aporte al fondo +{formatARS(
								o.contribution
							)})</small
						>{/if}
					{#if o.discountAmount}<small
							>(código {o.discountCode}, −{formatARS(o.discountAmount)})</small
						>{/if}
					{#if o.surcharge}<small>(recargo MP +{formatARS(o.surcharge)})</small>{/if}
					· {PAYMENT_METHOD[o.method]}
					{#if o.status === 'approved'}
						· ingresaron {o.checkedIn}/{o.quantity}
					{/if}
				</div>
				{#if o.holders.length}
					<div class="kv-table-wrap">
						<table class="kv-table holders">
							<thead>
								<tr><th>#</th><th>Entrada a nombre de</th><th>Pronombres</th></tr>
							</thead>
							<tbody>
								{#each o.holders as h, i (i)}
									<tr class:inside={h.checkedIn}>
										<td>{i + 1}</td>
										<td
											>{h.name}{#if h.checkedIn}&nbsp;<CircleCheck
													size={15}
													class="in"
													aria-label="ingresó"
												/>{/if}</td
										>
										<td>{h.pronouns || '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
				<OrderAnswers answers={o.answers} />
				<div class="meta">
					<span class="ref">{o.reference}</span> · {shortTime(o.createdAt)}{#if o.paymentId}
						· pago MP {o.paymentId}{/if}{#if o.confirmedBy}
						· {o.status === 'cancelled' ? 'canceló' : 'confirmó'} {o.confirmedBy}{/if}
					{#if o.status === 'approved'}
						· {o.emailSent ? 'mail enviado' : 'mail NO enviado'}
						<form method="POST" action="?/resend" use:enhance>
							<input type="hidden" name="order" value={o.id} />
							<button type="submit" class="kv-btn ghost small">Reenviar mail</button>
						</form>
					{/if}
					{#if o.status === 'refunded'}
						· reembolsada {o.refundedAt ? shortTime(o.refundedAt) : ''}{o.refundedBy
							? ` por ${o.refundedBy}`
							: ' (desde Mercado Pago)'}
					{/if}
				</div>
				{#if o.status === 'approved'}
					<!-- Paso de confirmación: se abre, se revisa y recién ahí se reembolsa. -->
					<details class="refund">
						<summary>Reembolsar…</summary>
						<div class="refund-panel">
							<p>
								<strong>{formatARS(o.total)}</strong> a <strong>{o.name}</strong> ({o.email}) ·
								{o.quantity}
								{o.quantity === 1 ? 'entrada' : 'entradas'}{#if o.holders.length}:
									{o.holders.map((h) => h.name).join(', ')}{/if}.
							</p>
							<p class="note">
								{#if o.method === 'mercadopago'}
									Se pide a Mercado Pago el reembolso TOTAL del pago {o.paymentId} (tiene que haber saldo
									en la cuenta; hasta 180 días desde el pago).
								{:else if o.method === 'transferencia'}
									No hay devolución automática: primero devolvé la transferencia a mano, después
									marcala acá.
								{:else}
									Compra sin cargo: solo se anulan las entradas.
								{/if}
								Las entradas quedan anuladas (el control de ingreso las rechaza), se libera el cupo y
								el uso del código, sale de los totales y le avisamos por mail.
							</p>
							<form method="POST" action="?/refund" use:enhance>
								<input type="hidden" name="order" value={o.id} />
								<button type="submit" class="refund-confirm">
									{o.method === 'mercadopago'
										? `Confirmar reembolso de ${formatARS(o.total)}`
										: o.method === 'transferencia'
											? 'Marcar como reembolsada (transferencia devuelta a mano)'
											: 'Anular las entradas'}
								</button>
							</form>
						</div>
					</details>
				{/if}
			</li>
		{/each}
	</ul>
</Card>

<style>
	.flash {
		background: var(--ok-bg);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		margin: 0 0 1rem;
	}
	.flash.error {
		background: var(--bad-bg);
	}
	.review {
		background: var(--warn-bg);
		border-radius: var(--radius-m);
		padding: var(--space-2xs) var(--space-s);
		margin: 0 0 1rem;
	}
	.review h2 {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: var(--text-sm);
		margin: 0.3rem 0;
	}
	.review ul {
		padding-left: 1.2em;
	}
	.review li {
		margin-bottom: 0.6em;
	}
	.review form {
		display: inline;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		align-items: center;
	}
	.filter {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.filter select {
		padding: 0.45rem var(--space-2xs);
		min-height: 2.5rem;
		border-radius: 3em;
		border: 1px solid var(--field);
		background: var(--surface);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid var(--field);
		border-radius: 3em;
		padding: 0 var(--space-xs);
		flex: 1 1 14rem;
		max-width: 22rem;
		color: var(--muted);
		background: var(--surface);
	}
	.search input {
		border: 0;
		background: transparent;
		min-height: 2.5rem;
		width: 100%;
		min-width: 0;
		color: var(--text);
	}
	.search input:focus {
		outline: none;
	}
	.search:focus-within {
		outline: 2px solid var(--link);
		outline-offset: 2px;
	}
	.order {
		scroll-margin-top: 5rem;
	}
	.order:target {
		box-shadow: 0 0 0 3px var(--link);
	}
	.orders {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.order {
		border: 1px solid var(--line);
		border-left: 4px solid var(--line);
		border-radius: var(--card-round);
		padding: var(--space-2xs) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.status-approved {
		border-left-color: var(--3);
	}
	.status-pending,
	.status-awaiting_transfer {
		border-left-color: var(--4);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem var(--space-xs);
		align-items: center;
		overflow-wrap: anywhere;
	}
	.dni,
	.ref {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.what,
	.meta {
		font-size: var(--text-sm);
	}
	.meta {
		color: var(--muted);
	}
	.meta form {
		display: inline;
	}
	.small {
		padding: var(--space-3xs) var(--space-2xs);
		font-size: var(--text-xs);
	}
	.holders {
		font-size: var(--text-xs);
	}
	.holders :global(.in) {
		color: var(--ok);
		vertical-align: -0.15em;
	}
	.holders .inside {
		background: var(--ok-bg);
	}
	.refund {
		font-size: var(--text-sm);
	}
	.refund summary {
		cursor: pointer;
		color: var(--bad);
		font-weight: 700;
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
	.note {
		color: var(--muted);
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
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
