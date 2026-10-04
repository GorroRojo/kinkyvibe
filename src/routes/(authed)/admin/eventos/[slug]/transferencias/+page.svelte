<script>
	import { askConfirm } from '$lib/admin/confirm.js';
	import { enhance } from '$app/forms';
	import { CircleCheck } from '@lucide/svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import OverrideDialog from '$lib/components/admin/panel/OverrideDialog.svelte';
	import ReopenTransferButton from '$lib/components/admin/panel/ReopenTransferButton.svelte';
	import { ORDER_STATUS, formatDni, shortTime } from '$lib/admin/orderFormat.js';
	import { formatARS } from '$lib/utils/money.js';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: e = data.event;

	/** @type {OverrideDialog} */
	let overrideDialog;
	/** @type {string | null} */
	let busy = null;

	/**
	 * "Confirmar pago": si confirmar pasa el cupo (llegó tarde y los lugares ya se ocuparon), el
	 * servidor contesta `needsConfirmation`; se pregunta en la página y, si le admin confirma, se
	 * reenvía con la clave en `override`.
	 * @param {string} id
	 * @returns {import('@sveltejs/kit').SubmitFunction}
	 */
	const confirmPayment =
		(id) =>
		({ formElement }) => {
			busy = id;
			return async ({ result, update }) => {
				// La clave vale para un solo envío.
				formElement.querySelector('input[name=override]')?.remove();
				const needs =
					result.type === 'failure'
						? /** @type {any} */ (result.data)?.transfer?.needsConfirmation
						: null;
				busy = null;
				if (!needs) return update();
				const key = await overrideDialog.ask(needs, {
					title: 'Confirmar esta transferencia pasa el cupo'
				});
				if (!key) return;
				const input = document.createElement('input');
				input.type = 'hidden';
				input.name = 'override';
				input.value = key;
				formElement.append(input);
				formElement.requestSubmit();
			};
		};
</script>

<svelte:head><title>Transferencias · {e.title} · Panel</title></svelte:head>

<section class="transfers" aria-labelledby="transferencias">
	<Card>
		<h2 id="transferencias">Transferencias pendientes</h2>
		{#if form?.transfer}
			<p class="flash" class:error={!form.transfer.ok} role="status">{form.transfer.message}</p>
			{#if 'needsConfirmation' in form.transfer && form.transfer.needsConfirmation}
				<!-- Sin JavaScript: la confirmación en la página. -->
				<form
					class="flash error"
					method="POST"
					action={'action' in form.transfer && form.transfer.action === 'reopen'
						? '?/reopen'
						: '?/confirm'}
				>
					{#each form.transfer.needsConfirmation.limits as l}<p>{l.message}</p>{/each}
					<input type="hidden" name="order" value={form.transfer.order} />
					<button
						class="kv-btn small"
						type="submit"
						name="override"
						value={form.transfer.needsConfirmation.key}>Sí, confirmar igual</button
					>
				</form>
			{/if}
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
								<span class="late">reserva vencida el {shortTime(o.expiresAt)}</span> (si ya no hay cupo,
								te avisamos y podés confirmarla igual)
							{:else}
								reservada hasta {shortTime(o.expiresAt)}
							{/if}
						</div>
						<div class="buttons">
							<form method="POST" action="?/confirm" use:enhance={confirmPayment(o.id)}>
								<input type="hidden" name="order" value={o.id} />
								<button type="submit" class="kv-btn confirm" disabled={busy === o.id}
									>Confirmar pago</button
								>
							</form>
							<form
								method="POST"
								action="?/cancel"
								use:enhance={async ({ cancel }) => {
									const ok = await askConfirm({
										title: `¿Cancelar ${o.reference}?`,
										text: 'Se libera el cupo.',
										confirmLabel: 'Cancelar la orden',
										cancelLabel: 'Volver',
										tone: 'danger'
									});
									if (!ok) cancel();
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
					{#if o.status === 'cancelled'}
						<ReopenTransferButton id={o.id} reference={o.reference} dialog={overrideDialog} />
					{/if}
				</li>
			{/each}
		</ul>
	</Card>
{/if}

<OverrideDialog bind:this={overrideDialog} confirmLabel="Sí, confirmar igual" />

<style>
	.transfers {
		margin-bottom: 1rem;
	}
	h2 {
		font-size: var(--text-base);
		margin: 0;
	}
	.small {
		font-size: var(--text-xs);
		margin: 0;
	}
	.flash {
		background: var(--ok-bg);
		padding: var(--space-2xs) var(--space-xs);
		border-radius: var(--radius-m);
		margin: 0;
	}
	.flash.error {
		background: var(--error-bg);
		color: var(--error);
	}
	.orders,
	.resolved {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.order {
		border: 1px solid var(--line);
		border-left: 4px solid var(--4);
		border-radius: var(--card-round);
		padding: var(--space-2xs) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
	}
	.status-expired {
		border-left-color: var(--bad);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem var(--space-xs);
		overflow-wrap: anywhere;
	}
	.ref,
	.dni {
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
	.late {
		color: var(--bad);
		font-weight: 700;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
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
		gap: var(--space-3xs) var(--space-2xs);
		align-items: center;
		font-size: var(--text-sm);
	}
</style>
