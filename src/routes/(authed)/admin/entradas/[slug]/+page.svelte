<script>
	import { enhance } from '$app/forms';
	import { formatARS } from '$lib/utils/money.js';

	let { data, form } = $props();

	let filter = $state('approved');
	let visible = $derived(
		filter === 'all' ? data.orders : data.orders.filter((o) => o.status === filter)
	);

	const statusText = {
		pending: 'Pendiente',
		approved: 'Aprobada',
		rejected: 'Rechazada',
		cancelled: 'Cancelada',
		refunded: 'Reembolsada',
		expired: 'Vencida'
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

	<table class="summary">
		<thead>
			<tr><th>Tipo</th><th>Vendidas</th><th>Reservadas</th><th>Bruto</th></tr>
		</thead>
		<tbody>
			{#each data.types as t (t.id)}
				<tr class:over={t.sold > t.capacity}>
					<td>{t.name}</td>
					<td>{t.sold}/{t.capacity}</td>
					<td>{t.held}</td>
					<td>{formatARS(t.revenue)}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	{#if form?.resend}
		<p class="flash" class:error={!form.resend.ok} role="status">{form.resend.message}</p>
	{/if}

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
					<a href="mailto:{o.email}">{o.email}</a>
				</div>
				<div class="what">
					{o.quantity} × {o.type} · {formatARS(o.total)} ·
					<span class="status">{statusText[o.status]}</span>
					{#if o.status === 'approved'}
						· ingresaron {o.checkedIn}/{o.quantity}
					{/if}
				</div>
				<div class="meta">
					{time(o.createdAt)}{#if o.paymentId}
						· pago MP {o.paymentId}{/if}
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
	.status-pending {
		outline-color: var(--4);
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
