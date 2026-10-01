<script>
	/**
	 * Bandeja de transferencias de todos los eventos: confirmar o cancelar, filtrar por evento, y
	 * deshacer el rechazo de una cancelada en los últimos 7 días.
	 */
	import '$lib/admin/panel-forms.scss';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Check, CheckCheck, Clock, X } from '@lucide/svelte';
	import { eventPanelLink } from '$lib/admin/nav.js';
	import { fmtDateTime, fmtRelative } from '$lib/admin/format.js';
	import { csvFilename } from '$lib/admin/csv.js';
	import { formatARS } from '$lib/utils/money.js';
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import Card from '$lib/components/admin/panel/Card.svelte';
	import Badge from '$lib/components/admin/panel/Badge.svelte';
	import CsvButton from '$lib/components/admin/panel/CsvButton.svelte';
	import EmptyState from '$lib/components/admin/panel/EmptyState.svelte';
	import OverrideDialog from '$lib/components/admin/panel/OverrideDialog.svelte';
	import ReopenTransferButton from '$lib/components/admin/panel/ReopenTransferButton.svelte';

	export let data;
	export let form;

	/** @type {string | null} */
	let busy = null;
	/** @type {OverrideDialog} */
	let overrideDialog;

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
				if (needs) {
					busy = null;
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
					return;
				}
				await update();
				busy = null;
			};
		};

	/** @type {import('$lib/admin/csv.js').CsvColumn<any>[]} */
	const columns = [
		{ label: 'referencia', key: 'reference' },
		{ label: 'evento', key: 'event' },
		{ label: 'tipo', key: 'type' },
		{ label: 'cantidad', key: 'quantity' },
		{ label: 'total', key: 'total' },
		{ label: 'nombre', key: 'name' },
		{ label: 'pronombres', key: 'pronouns' },
		{ label: 'email', key: 'email' },
		{ label: 'codigo', value: (r) => r.discountCode ?? '' },
		{ label: 'pedida', value: (r) => new Date(r.createdAt).toISOString() },
		{ label: 'vence', value: (r) => new Date(r.expiresAt).toISOString() },
		{
			label: 'estado',
			value: (r) =>
				r.rejectedBy !== '' ? 'rechazada' : r.expiresAt > data.now ? 'pendiente' : 'vencida'
		}
	];

	/** @param {Event} e */
	function filter(e) {
		const v = /** @type {HTMLSelectElement} */ (e.currentTarget).value;
		goto(v ? `?evento=${encodeURIComponent(v)}` : '?', { keepFocus: true, noScroll: true });
	}

	/** @param {number} ms */
	const soon = (ms) => ms - data.now < 6 * 3_600_000;
</script>

<PageHeader
	title="Transferencias"
	subtitle="Compras por transferencia de todos los eventos que esperan el comprobante."
	back={{ href: '/admin/ventas', label: 'Ventas' }}
>
	<svelte:fragment slot="actions">
		<CsvButton
			rows={[...data.pending, ...data.expired, ...data.rejected]}
			{columns}
			filename={csvFilename('transferencias', data.eventSlug || 'todas')}
		/>
	</svelte:fragment>
</PageHeader>

<div class="kv-stack">
	<Card>
		<form class="kv-row filters" method="GET">
			<label class="kv-field grow">
				<span>Evento</span>
				<select name="evento" value={data.eventSlug} on:change={filter}>
					<option value="">Todos los eventos</option>
					{#each data.events as e (e.slug)}
						<option value={e.slug}>{e.title}{e.pending ? ` (${e.pending})` : ''}</option>
					{/each}
				</select>
			</label>
			<noscript><button class="kv-btn ghost" type="submit">Filtrar</button></noscript>
		</form>
		<p class="kv-note">
			Buscá la referencia (KV-…) en el concepto de la transferencia y el comprobante que mandó la
			persona. Confirmá solo cuando la plata esté en la cuenta: se emiten las entradas y le llegan
			por mail.
		</p>
	</Card>

	{#if form?.transfer}
		<p class="kv-flash" class:bad={!form.transfer.ok} role="status">{form.transfer.message}</p>
		{#if 'needsConfirmation' in form.transfer && form.transfer.needsConfirmation}
			<!-- Sin JavaScript: la confirmación en la página. -->
			<form
				class="kv-flash bad"
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

	<Card title="Esperan comprobante ({data.pending.length})">
		{#if data.pending.length === 0}
			<EmptyState
				icon={CheckCheck}
				title="Nada pendiente"
				text="No hay transferencias esperando."
			/>
		{/if}
		<ul class="list">
			{#each data.pending as o (o.id)}
				<li>
					<div class="main">
						<div class="kv-row">
							<b class="ref num">{o.reference}</b>
							<b class="num">{formatARS(o.total)}</b>
							<Badge tone={soon(o.expiresAt) ? 'warn' : 'neutral'}>
								<Clock size={12} aria-hidden="true" /> vence {fmtRelative(o.expiresAt, data.now)}
							</Badge>
						</div>
						<div>
							<b>{o.name}</b>
							{#if o.pronouns}<span class="muted">({o.pronouns})</span>{/if}
							· <a href="mailto:{o.email}">{o.email}</a>
						</div>
						<div class="muted small">
							<a href={eventPanelLink(o.slug, { tickets: true })}>{o.event}</a>
							· {o.quantity} × {o.type}
							{#if o.discountCode}· código {o.discountCode}{/if}
							· pedida {fmtDateTime(o.createdAt)} · reservada hasta {fmtDateTime(o.expiresAt)}
						</div>
					</div>
					<div class="buttons">
						<form method="POST" action="?/confirm" use:enhance={confirmPayment(o.id)}>
							<input type="hidden" name="order" value={o.id} />
							<button class="kv-btn" type="submit" disabled={busy === o.id}>
								<Check size={16} aria-hidden="true" /> Confirmar pago
							</button>
						</form>
						<form
							method="POST"
							action="?/cancel"
							use:enhance={({ cancel }) => {
								if (!confirm(`¿Cancelar ${o.reference}? Se libera el cupo.`)) return cancel();
								busy = o.id;
								return async ({ update }) => {
									await update();
									busy = null;
								};
							}}
						>
							<input type="hidden" name="order" value={o.id} />
							<button class="kv-btn ghost" type="submit" disabled={busy === o.id}>
								<X size={16} aria-hidden="true" /> Cancelar
							</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	</Card>

	{#if data.expired.length}
		<Card title="Vencidas en los últimos 7 días ({data.expired.length})">
			<p class="kv-note">
				Si el pago llegó tarde, se puede confirmar igual. Si los lugares ya se ocuparon, te avisamos
				cuánto se pasa del cupo y podés confirmarla igual (queda en el registro). Si no va a llegar,
				cancelala para que no quede dando vueltas.
			</p>
			<ul class="list">
				{#each data.expired as o (o.id)}
					<li>
						<div class="main">
							<div class="kv-row">
								<b class="ref num">{o.reference}</b>
								<b class="num">{formatARS(o.total)}</b>
								<Badge tone="bad">venció {fmtRelative(o.expiresAt, data.now)}</Badge>
							</div>
							<div>
								<b>{o.name}</b> · <a href="mailto:{o.email}">{o.email}</a>
							</div>
							<div class="muted small">
								<a href={eventPanelLink(o.slug, { tickets: true })}>{o.event}</a>
								· {o.quantity} × {o.type} · pedida {fmtDateTime(o.createdAt)}
							</div>
						</div>
						<div class="buttons">
							<form method="POST" action="?/confirm" use:enhance={confirmPayment(o.id)}>
								<input type="hidden" name="order" value={o.id} />
								<button class="kv-btn ghost" type="submit" disabled={busy === o.id}
									>Confirmar pago</button
								>
							</form>
							<form
								method="POST"
								action="?/cancel"
								use:enhance={({ cancel }) => {
									if (!confirm(`¿Cancelar ${o.reference}?`)) cancel();
								}}
							>
								<input type="hidden" name="order" value={o.id} />
								<button class="kv-btn ghost" type="submit">Cancelar</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		</Card>
	{/if}

	{#if data.rejected.length}
		<Card title="Rechazadas en los últimos 7 días ({data.rejected.length})">
			<p class="kv-note">
				Si una se canceló por error (o el pago llegó después), deshacé el rechazo: vuelve a esperar
				el comprobante con la reserva renovada. Solo si todavía hay lugar en su tipo de entrada; si
				no, te avisamos cuánto se pasa y podés confirmarlo igual (queda en el registro).
			</p>
			<ul class="list">
				{#each data.rejected as o (o.id)}
					<li>
						<div class="main">
							<div class="kv-row">
								<b class="ref num">{o.reference}</b>
								<b class="num">{formatARS(o.total)}</b>
								<Badge tone="neutral">rechazada {fmtRelative(o.updatedAt, data.now)}</Badge>
							</div>
							<div>
								<b>{o.name}</b> · <a href="mailto:{o.email}">{o.email}</a>
							</div>
							<div class="muted small">
								<a href={eventPanelLink(o.slug, { tickets: true })}>{o.event}</a>
								· {o.quantity} × {o.type} · pedida {fmtDateTime(o.createdAt)}
								{#if o.rejectedBy}· la rechazó {o.rejectedBy}{/if}
							</div>
						</div>
						<div class="buttons">
							<ReopenTransferButton id={o.id} reference={o.reference} dialog={overrideDialog} />
						</div>
					</li>
				{/each}
			</ul>
		</Card>
	{/if}
</div>

<OverrideDialog bind:this={overrideDialog} confirmLabel="Sí, confirmar igual" />

<style>
	.filters {
		align-items: flex-end;
	}
	.grow {
		flex: 1;
		max-width: 28rem;
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.list li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.8rem 0;
		border-top: 1px solid var(--line);
	}
	.list li:first-child {
		border-top: 0;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1 1 18rem;
		overflow-wrap: anywhere;
	}
	.ref {
		font-size: 1.05rem;
		letter-spacing: 0.03em;
	}
	.small {
		font-size: 0.85rem;
	}
	.buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
