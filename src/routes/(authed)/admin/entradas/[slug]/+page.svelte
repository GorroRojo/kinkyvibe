<script>
	import { enhance } from '$app/forms';
	import { formatARS } from '$lib/utils/money.js';
	import { fondoOptionLabel } from '$lib/utils/tickets.js';

	let { data, form } = $props();

	let filter = $state('approved');
	let visible = $derived(
		filter === 'all'
			? data.orders
			: filter === 'pending'
				? data.orders.filter((o) => o.status === 'pending' || o.status === 'awaiting_transfer')
				: data.orders.filter((o) => o.status === filter)
	);

	const statusText = {
		pending: 'Pendiente',
		awaiting_transfer: 'Esperando transferencia',
		approved: 'Aprobada',
		rejected: 'Rechazada',
		cancelled: 'Cancelada',
		refunded: 'Reembolsada',
		expired: 'Vencida'
	};
	const methodText = {
		mercadopago: 'Mercado Pago',
		transferencia: 'Transferencia',
		gratis: 'Sin cargo'
	};

	/** @param {number} ms */
	function time(ms) {
		return new Date(ms).toLocaleString('es-AR', {
			dateStyle: 'short',
			timeStyle: 'short',
			hourCycle: 'h23',
			timeZone: 'America/Argentina/Buenos_Aires'
		});
	}

	/** @param {string} dni */
	function formatDni(dni) {
		return dni ? Number(dni).toLocaleString('es-AR') : '—';
	}
</script>

<svelte:head>
	<title>Entradas · {data.title} - KV Admin</title>
</svelte:head>

<div class="admin-event">
	<p><a href="/admin/entradas">← Todos los eventos</a></p>
	<h1>{data.title}</h1>

	<div class="actions">
		<a class="big" href="/admin/entradas/{data.slug}/ingreso">📷 Control de ingreso</a>
		<a class="big secondary" href="/admin/entradas/{data.slug}/ordenes.csv" download>
			⬇️ Exportar CSV
		</a>
	</div>

	<div class="table-scroll">
		<table class="summary">
			<thead>
				<tr>
					<th>Tipo</th><th>Vendidas</th><th>Reservadas</th><th>Recaudado</th><th>Fondo usado</th><th
						>Aportes al fondo</th
					>
				</tr>
			</thead>
			<tbody>
				{#each data.types as t (t.id)}
					<tr class:over={t.sold > t.capacity}>
						<td>{t.name}</td>
						<td>{t.sold}/{t.capacity}</td>
						<td>{t.held}</td>
						<td>{formatARS(t.revenue)}</td>
						<td>{formatARS(t.fondoUsed)}</td>
						<td>{formatARS(t.contribution)}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td colspan="3">Total</td>
					<td>{formatARS(data.types.reduce((s, t) => s + t.revenue, 0))}</td>
					<td>{formatARS(data.types.reduce((s, t) => s + t.fondoUsed, 0))}</td>
					<td>{formatARS(data.types.reduce((s, t) => s + t.contribution, 0))}</td>
				</tr>
			</tfoot>
		</table>
	</div>
	<p class="note">
		"Reservadas" incluye pagos en curso y transferencias pendientes. "Recaudado" es lo cobrado (con
		descuentos y aportes), antes de comisiones. "Fondo usado" es lo que cubrió el Fondo KinkyVibe
		(entradas "con el descuento del fondo"); "Aportes al fondo", lo que se pagó de más para el fondo
		(entradas solidaria, muy solidaria y Sugar). Solo cuentan las compras aprobadas.
	</p>

	{#if form?.resend}
		<p class="flash" class:error={!form.resend.ok} role="status">{form.resend.message}</p>
	{/if}

	<section class="transfers" aria-labelledby="transferencias">
		<h2 id="transferencias">Transferencias pendientes</h2>
		{#if form?.transfer}
			<p class="flash" class:error={!form.transfer.ok} role="status">{form.transfer.message}</p>
		{/if}
		{#if data.transfers.length === 0}
			<p>No hay transferencias esperando confirmación.</p>
		{:else}
			<p class="note">
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
							Pedida {time(o.createdAt)} ·
							{#if o.status === 'expired'}
								<span class="late">reserva vencida el {time(o.expiresAt)}</span> (se confirma solo si
								hay cupo)
							{:else}
								reservada hasta {time(o.expiresAt)}
							{/if}
						</div>
						<div class="buttons">
							<form method="POST" action="?/confirm" use:enhance>
								<input type="hidden" name="order" value={o.id} />
								<button type="submit" class="confirm">Confirmar pago</button>
							</form>
							<form
								method="POST"
								action="?/cancel"
								use:enhance={({ cancel }) => {
									if (!confirm(`¿Cancelar ${o.reference}? Se libera el cupo.`)) cancel();
								}}
							>
								<input type="hidden" name="order" value={o.id} />
								<button type="submit" class="cancel">Cancelar</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<h2>Órdenes</h2>
	<label class="filter">
		Mostrar
		<select bind:value={filter}>
			<option value="approved">Aprobadas</option>
			<option value="pending">Pendientes</option>
			<option value="all">Todas</option>
		</select>
	</label>

	{#if visible.length === 0}
		<p>No hay órdenes para mostrar.</p>
	{/if}
	<ul class="orders">
		{#each visible as o (o.id)}
			<li class="order status-{o.status}">
				<div class="who">
					<strong>{o.name}</strong>
					<span class="dni">DNI {formatDni(o.dni)}</span>
					<a href="mailto:{o.email}">{o.email}</a>
				</div>
				<div class="what">
					{o.quantity} × {o.type} · {formatARS(o.total)}
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
					· {methodText[o.method]} ·
					<span class="status">{statusText[o.status]}</span>
					{#if o.status === 'approved'}
						· ingresaron {o.checkedIn}/{o.quantity}
					{/if}
				</div>
				{#if o.holders.length}
					<table class="holders">
						<thead>
							<tr><th>#</th><th>Entrada a nombre de</th><th>Pronombres</th></tr>
						</thead>
						<tbody>
							{#each o.holders as h, i (i)}
								<tr class:inside={h.checkedIn}>
									<td>{i + 1}</td>
									<td
										>{h.name}{#if h.checkedIn}&nbsp;✅{/if}</td
									>
									<td>{h.pronouns || '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
				<div class="meta">
					{o.reference} · {time(o.createdAt)}{#if o.paymentId}
						· pago MP {o.paymentId}{/if}{#if o.confirmedBy}
						· {o.status === 'cancelled' ? 'canceló' : 'confirmó'} {o.confirmedBy}{/if}
					{#if o.status === 'approved'}
						· {o.emailSent ? 'mail enviado' : 'mail NO enviado'}
						<form method="POST" action="?/resend" use:enhance>
							<input type="hidden" name="order" value={o.id} />
							<button type="submit">Reenviar mail</button>
						</form>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</div>

<style>
	.admin-event {
		max-width: 50rem;
		margin: 0 auto;
		padding: 0 16px 2em;
	}
	h1 {
		font-size: var(--step-2);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6em;
	}
	.big {
		flex: 1 1 12em;
		text-align: center;
		padding: 1em;
		border-radius: 0.7em;
		background: var(--3-dark);
		color: white;
		font-weight: bold;
		text-decoration: none;
		font-size: var(--step-1);
	}
	.big.secondary {
		background: var(--2);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin: 1em 0;
	}
	th,
	td {
		padding: 0.3em;
		border-bottom: 1px solid #eee;
		text-align: left;
	}
	td:not(:first-child),
	th:not(:first-child) {
		text-align: right;
	}
	.over {
		background: hsl(0, 90%, 92%);
	}
	.table-scroll {
		overflow-x: auto;
	}
	.summary {
		font-size: var(--step--1);
	}
	.summary tfoot td {
		font-weight: bold;
	}
	.flash {
		background: var(--3-light);
		padding: 0.5em;
		border-radius: 0.5em;
	}
	.flash.error {
		background: hsl(0, 90%, 90%);
	}
	.filter select {
		font: inherit;
		padding: 0.3em;
	}
	.orders {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6em;
	}
	.order {
		background: white;
		border-radius: 0.7em;
		padding: 0.7em 0.9em;
		outline: 2px solid #ddd;
	}
	.status-approved {
		outline-color: var(--3);
	}
	.status-pending,
	.status-awaiting_transfer {
		outline-color: var(--4);
	}
	.note {
		font-size: var(--step--1);
		color: #555;
	}
	.transfers {
		margin: 1.5em 0;
		padding: 0.8em 1em 1em;
		border-radius: 0.8em;
		background: color-mix(in srgb, var(--4) 12%, white);
	}
	.transfers h2 {
		margin-top: 0;
	}
	.ref {
		font-family: ui-monospace, monospace;
	}
	.late {
		color: hsl(0, 70%, 40%);
		font-weight: bold;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		margin-top: 0.5em;
	}
	.buttons button {
		font: inherit;
		font-weight: bold;
		border: 0;
		border-radius: 0.5em;
		padding: 0.6em 1em;
		min-height: 2.8em;
		cursor: pointer;
	}
	.buttons .confirm {
		background: var(--3-dark);
		color: white;
	}
	.buttons .cancel {
		background: white;
		outline: 2px solid hsl(0, 70%, 45%);
		color: hsl(0, 70%, 35%);
	}
	table.holders {
		margin: 0.4em 0;
		font-size: var(--step--1);
	}
	table.holders td,
	table.holders th {
		text-align: left;
	}
	.dni {
		font-family: ui-monospace, monospace;
		white-space: nowrap;
	}
	table.holders .inside {
		background: color-mix(in srgb, var(--3) 12%, white);
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.8em;
		overflow-wrap: anywhere;
	}
	.what,
	.meta {
		font-size: var(--step--1);
	}
	.meta {
		color: #555;
	}
	.meta form {
		display: inline;
	}
	.meta button {
		font: inherit;
		cursor: pointer;
	}
</style>
