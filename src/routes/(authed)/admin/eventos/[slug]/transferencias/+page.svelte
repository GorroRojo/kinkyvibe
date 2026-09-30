<script>
	import { enhance } from '$app/forms';
	import { CircleCheck } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import { ORDER_STATUS, formatDni, shortTime } from '$lib/admin/orderFormat.js';
	import { formatARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;
</script>

<svelte:head><title>Transferencias · {e.title} · Panel</title></svelte:head>

<section class="transfers" aria-labelledby="transferencias">
	<Card>
		<h2 id="transferencias">Transferencias pendientes</h2>
		{#if form?.transfer}
			<p class="flash" class:error={!form.transfer.ok} role="status">{form.transfer.message}</p>
		{/if}
		{#if data.transfers.length === 0}
			<EmptyState icon={CircleCheck} title="No hay transferencias esperando confirmación." />
		{:else}
			<p class="muted small">
				Buscá la referencia en el concepto de la transferencia y el comprobante que mandó la
				persona. Confirmá solo cuando la plata esté en la cuenta.
			</p>
			<ul class="orders">
				{#each data.transfers as o (o.id)}
					<li class="order status-{o.status}">
						<div class="who">
							<strong class="ref">{o.reference}</strong>
							<strong>{o.name}</strong>
							<span class="dni">DNI {formatDni(o.dni)}</span>
							<a href="mailto:{o.email}">{o.email}</a>
						</div>
						<div class="what">
							{o.quantity} × {o.type} · <strong>{formatARS(o.total)}</strong>
							{#if o.discountCode}· código {o.discountCode}{/if}
						</div>
						<div class="meta">
							Pedida {shortTime(o.createdAt)} ·
							{#if o.status === 'expired'}
								<span class="late">reserva vencida el {shortTime(o.expiresAt)}</span> (se confirma solo
								si hay cupo)
							{:else}
								reservada hasta {shortTime(o.expiresAt)}
							{/if}
						</div>
						<div class="buttons">
							<form method="POST" action="?/confirm" use:enhance>
								<input type="hidden" name="order" value={o.id} />
								<button type="submit" class="kv-btn confirm">Confirmar pago</button>
							</form>
							<form
								method="POST"
								action="?/cancel"
								use:enhance={({ cancel }) => {
									if (!confirm(`¿Cancelar ${o.reference}? Se libera el cupo.`)) cancel();
								}}
							>
								<input type="hidden" name="order" value={o.id} />
								<button type="submit" class="kv-btn ghost cancel">Cancelar</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card>
</section>

{#if data.resolved.length}
	<Card title="Resueltas hace poco">
		<ul class="resolved">
			{#each data.resolved as o (o.id)}
				<li>
					<span class="ref">{o.reference}</span>
					{o.name} · {formatARS(o.total)}
					<Badge tone={o.status === 'approved' ? 'ok' : 'neutral'}>{ORDER_STATUS[o.status]}</Badge>
					<span class="muted">por {o.confirmedBy}</span>
				</li>
			{/each}
		</ul>
	</Card>
{/if}

<style>
	.transfers {
		margin-bottom: 1rem;
	}
	h2 {
		font-size: 1.1rem;
		margin: 0;
	}
	.small {
		font-size: 0.85rem;
		margin: 0;
	}
	.flash {
		background: var(--ok-bg);
		padding: 0.6rem 0.9rem;
		border-radius: 0.8rem;
		margin: 0;
	}
	.flash.error {
		background: var(--bad-bg);
	}
	.orders,
	.resolved {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.order {
		border: 1px solid var(--line);
		border-left: 4px solid var(--4);
		border-radius: var(--card-round);
		padding: 0.7rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.status-expired {
		border-left-color: var(--bad);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.8rem;
		overflow-wrap: anywhere;
	}
	.ref,
	.dni {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	.what,
	.meta {
		font-size: 0.88rem;
	}
	.meta {
		color: var(--muted);
	}
	.late {
		color: var(--bad);
		font-weight: 700;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.3rem;
	}
	.buttons .kv-btn {
		min-height: 2.75rem;
	}
	.cancel {
		color: var(--bad);
	}
	.resolved li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.6rem;
		align-items: center;
		font-size: 0.9rem;
	}
</style>
