<script>
	/**
	 * Compras para facturar: las compras con plata de todos los eventos que falta facturar, de la
	 * más vieja a la más nueva, por mes de compra, con la casilla «Facturada». Cada mes puede mostrar
	 * también sus facturadas (`?mes=AAAA-MM`).
	 */
	import '$lib/admin/panel-forms.scss';
	import { CheckCheck } from '@lucide/svelte';
	import { Card, EmptyState, PageHeader } from '$lib/components/ui';
	import InvoicedCheck from '$lib/components/admin/InvoicedCheck.svelte';
	import { eventHref } from '$lib/admin/nav.js';
	import { fmtDate, fmtDateTime } from '$lib/admin/format.js';
	import { PAYMENT_METHOD, orderHref } from '$lib/admin/orderFormat.js';
	import { SALE_CHANNEL_SINGULAR } from '$lib/utils/saleChannel.js';
	import { formatARS } from '$lib/utils/money.js';

	export let data;

	// Lo que falta del mes: al marcar, la fila queda (con su casilla) y el número baja. Si la lista
	// vino recortada, el del servidor.
	/** @param {(typeof data.groups)[number]} g */
	const pendingOf = (g) =>
		data.truncated ? g.pending : g.orders.filter((o) => !o.invoicedAt).length;
</script>

<PageHeader
	title="Compras para facturar"
	subtitle="Las compras pagas de todos los eventos, de la más vieja a la más nueva."
	back={{ href: '/admin/ventas', label: 'Ventas' }}
/>

<div class="kv-stack">
	{#if data.truncated}
		<p class="kv-note">Se muestran las {data.limit} más viejas de {data.total}.</p>
	{/if}

	{#if data.groups.length === 0}
		<Card>
			<EmptyState
				icon={CheckCheck}
				title="Todo facturado"
				text="No falta facturar ninguna compra."
			/>
		</Card>
	{/if}

	{#each data.groups as g (g.month)}
		<Card title="{g.label} · {pendingOf(g)} sin facturar">
			<svelte:fragment slot="actions">
				{#if g.open}
					<a class="kv-btn ghost small" href="?" data-sveltekit-noscroll>Ocultar las facturadas</a>
				{:else if g.invoiced}
					<a class="kv-btn ghost small" href="?mes={g.month}" data-sveltekit-noscroll
						>Ver también las facturadas ({g.invoiced})</a
					>
				{/if}
			</svelte:fragment>
			{#if g.orders.length === 0}
				<p class="kv-note">Este mes no tiene compras facturadas.</p>
			{/if}
			<ul class="list">
				{#each g.orders as o (o.id)}
					<li>
						<div class="main">
							<div class="kv-row">
								<a class="ref num" href={orderHref(eventHref(o.slug, 'ordenes'), o.id)}
									>{o.reference}</a
								>
								<b class="num">{formatARS(o.total)}</b>
								<b>{o.name}</b>
							</div>
							<div class="muted small">
								<a href={eventHref(o.slug, 'ordenes')}>{o.event}</a>{#if o.eventStart}
									({fmtDate(o.eventStart)}){/if}
								· comprada {fmtDateTime(o.createdAt)} · {PAYMENT_METHOD[o.method] ?? o.method} · {SALE_CHANNEL_SINGULAR[
									o.channel
								]}
							</div>
						</div>
						<InvoicedCheck
							orderId={o.id}
							bind:invoicedAt={o.invoicedAt}
							bind:invoicedBy={o.invoicedBy}
						/>
					</li>
				{/each}
			</ul>
		</Card>
	{/each}

	{#if data.done.length}
		<Card title="Meses al día">
			<ul class="done">
				{#each data.done as m (m.month)}
					<li>
						<a href="?mes={m.month}" data-sveltekit-noscroll>{m.label}</a>
						<span class="muted">({m.invoiced} facturadas)</span>
					</li>
				{/each}
			</ul>
		</Card>
	{/if}
</div>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2xs) 0;
		border-top: 1px solid var(--line);
	}
	.list li:first-child {
		border-top: 0;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		min-width: 0;
		flex: 1 1 18rem;
		overflow-wrap: anywhere;
	}
	.ref {
		font-size: var(--text-sm);
		letter-spacing: 0.03em;
	}
	.small {
		font-size: var(--text-xs);
	}
	.done {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-s);
		list-style: none;
		margin: 0;
		padding: 0;
	}
</style>
