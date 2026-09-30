<script>
	import { enhance } from '$app/forms';
	import { formatARS, formatSignedARS } from '$lib/utils/money.js';
	import { fondoOptionLabel } from '$lib/utils/tickets.js';
	import { eventHref } from '$lib/admin/nav.js';

	let { data, form } = $props();

	let fondoNet = $derived(data.types.reduce((s, t) => s + t.fondoNet, 0));
	let showFondo = $derived(
		data.fondoEnabled || data.types.some((t) => t.fondoUsed || t.contribution)
	);

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
		gratis: 'Sin cargo',
		efectivo: 'Efectivo (puerta)'
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
		{#if !data.online}
			<a class="big" href={eventHref(data.slug, 'ingreso')}>📷 Modo puerta (check-in)</a>
		{/if}
		<a class="big secondary" href="/admin/entradas/{data.slug}/ordenes.csv" download>
			⬇️ Exportar CSV
		</a>
	</div>

	<div class="table-scroll">
		<table class="summary">
			<thead>
				<tr>
					<th>Tipo</th><th>Vendidas</th><th>Reservadas</th><th>Recaudado</th>
					{#if showFondo}<th>Fondo usado</th><th>Aportes al fondo</th><th>Neto del fondo</th>{/if}
				</tr>
			</thead>
			<tbody>
				{#each data.types as t (t.id)}
					<tr class:over={t.sold > t.capacity}>
						<td>{t.name}</td>
						<td>{t.sold}/{t.capacity}</td>
						<td>{t.held}</td>
						<td>{formatARS(t.revenue)}</td>
						{#if showFondo}
							<td>{formatARS(t.fondoUsed)}</td>
							<td>{formatARS(t.contribution)}</td>
							<td class="net" class:pos={t.fondoNet > 0} class:neg={t.fondoNet < 0}
								>{formatSignedARS(t.fondoNet)}</td
							>
						{/if}
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td colspan="3">Total</td>
					<td>{formatARS(data.types.reduce((s, t) => s + t.revenue, 0))}</td>
					{#if showFondo}
						<td>{formatARS(data.types.reduce((s, t) => s + t.fondoUsed, 0))}</td>
						<td>{formatARS(data.types.reduce((s, t) => s + t.contribution, 0))}</td>
						<td class="net" class:pos={fondoNet > 0} class:neg={fondoNet < 0}
							>{formatSignedARS(fondoNet)}</td
						>
					{/if}
				</tr>
			</tfoot>
		</table>
	</div>
	<p class="note">
		"Reservadas" incluye pagos en curso y transferencias pendientes. "Recaudado" es lo cobrado (con
		descuentos y aportes), antes de comisiones.{#if !showFondo}
			Este evento no tiene la etiqueta KinkyVibe: no usa el Fondo KinkyVibe.{/if}
		{#if showFondo}"Fondo usado" es lo que cubrió el Fondo KinkyVibe (entradas "con el descuento del
			fondo"); "Aportes al fondo", lo que se pagó de más para el fondo (entradas solidaria, muy
			solidaria y Sugar). "Neto del fondo" es aportes − fondo usado: en verde (+) si entró más de lo
			que cubrió el fondo, en rojo (−) si el fondo puso más de lo que entró.{/if}
		Solo cuentan las compras aprobadas.
	</p>

	{#if data.stream}
		<section class="stream" aria-labelledby="transmision">
			<h2 id="transmision">Link de la transmisión</h2>
			<p class="note">
				Evento online: las entradas llevan este link en lugar de un QR (no hay control de ingreso).
				El link no está en el repo: se guarda solo acá. Si lo cargás antes de que alguien compre, le
				llega en el mail de las entradas.
			</p>
			{#if form?.stream}
				<p class="flash" class:error={!form.stream.ok} role="status">{form.stream.message}</p>
			{/if}
			<form method="POST" action="?/setLink" use:enhance class="stream-form">
				<label>
					<span>Link (https://…)</span>
					<input
						type="text"
						inputmode="url"
						name="link"
						value={form?.stream && 'value' in form.stream
							? form.stream.value
							: (data.stream.link ?? '')}
						placeholder="https://…"
						autocomplete="off"
						spellcheck="false"
					/>
				</label>
				<button type="submit">Guardar link</button>
			</form>
			{#if data.stream.link}
				<p class="note">
					Guardado {data.stream.updatedAt ? time(data.stream.updatedAt) : ''}{data.stream.updatedBy
						? ` por ${data.stream.updatedBy}`
						: ''}. Ya lo tienen {data.stream.approvedOrders - data.stream.pending} de {data.stream
						.approvedOrders}
					{data.stream.approvedOrders === 1 ? 'compra' : 'compras'}.
				</p>
				<form
					method="POST"
					action="?/sendLink"
					use:enhance={({ cancel }) => {
						if (
							data.stream?.pending &&
							!confirm(
								`¿Mandar el link por mail a ${data.stream.pending} ${data.stream.pending === 1 ? 'persona' : 'personas'}?`
							)
						)
							cancel();
					}}
				>
					<button type="submit" class="send-link" disabled={!data.stream.pending}>
						{data.stream.pending
							? `📨 Enviar el link a todes (${data.stream.pending} ${data.stream.pending === 1 ? 'persona' : 'personas'})`
							: '✓ Todes ya recibieron este link'}
					</button>
				</form>
				<p class="note">
					Solo le escribe a quien todavía no recibió este link (tocarlo dos veces no manda nada de
					nuevo). Si cambiás el link, se puede mandar el nuevo a todes.
				</p>
			{/if}
		</section>
	{/if}

	{#if form?.review}
		<p class="flash" class:error={!form.review.ok} role="status">{form.review.message}</p>
	{/if}
	{#if data.review.length}
		<section class="review" aria-labelledby="revisar" id="revisar-ordenes">
			<h2 id="revisar">⚠️ Para revisar</h2>
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
							<button type="submit" class="small">Marcar como revisada</button>
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
					<strong>{o.name}</strong>{#if o.pronouns}<span class="pronouns">({o.pronouns})</span>{/if}
					<span class="dni">DNI {formatDni(o.dni)}</span>
					<a href="mailto:{o.email}">{o.email}</a>
				</div>
				<div class="what">
					{o.quantity} × {o.type} · {formatARS(o.total)}
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
					{#if o.status === 'refunded'}
						· reembolsada {o.refundedAt ? time(o.refundedAt) : ''}{o.refundedBy
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
		border-bottom: 1px solid var(--line, #eee);
		text-align: left;
	}
	td:not(:first-child),
	th:not(:first-child) {
		text-align: right;
	}
	.over {
		background: var(--bad-bg, hsl(0, 90%, 92%));
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
		background: var(--bad-bg, hsl(0, 90%, 90%));
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
		background: var(--surface, white);
		border-radius: 0.7em;
		padding: 0.7em 0.9em;
		outline: 2px solid var(--line, #ddd);
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
		color: var(--muted, #555);
	}
	.review {
		background: var(--warn-bg, #fff3e0);
		border-radius: 1em;
		padding: 0.6em 1em;
		margin: 1em 0;
		ul {
			padding-left: 1.2em;
		}
		li {
			margin-bottom: 0.6em;
		}
		form {
			display: inline;
		}
	}
	.transfers {
		margin: 1.5em 0;
		padding: 0.8em 1em 1em;
		border-radius: 0.8em;
		background: color-mix(in srgb, var(--4) 12%, var(--surface, white));
	}
	.transfers h2 {
		margin-top: 0;
	}
	.ref {
		font-family: ui-monospace, monospace;
	}
	.late {
		color: var(--bad, hsl(0, 70%, 40%));
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
		background: var(--surface, white);
		outline: 2px solid hsl(0, 70%, 45%);
		color: var(--bad, hsl(0, 70%, 35%));
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
		background: color-mix(in srgb, var(--3) 12%, var(--surface, white));
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
		color: var(--muted, #555);
	}
	.meta form {
		display: inline;
	}
	.meta button {
		font: inherit;
		cursor: pointer;
	}
	.net {
		font-weight: bold;
	}
	.refund {
		margin-top: 0.4em;
		font-size: var(--step--1);
	}
	.refund summary {
		cursor: pointer;
		color: var(--bad, hsl(0, 70%, 35%));
	}
	.refund-panel {
		margin-top: 0.4em;
		padding: 0.6em 0.8em;
		border-radius: 0.6em;
		background: var(--bad-bg, hsl(0, 90%, 97%));
		outline: 2px solid hsl(0, 70%, 80%);
	}
	.refund-panel p {
		margin: 0.2em 0 0.5em;
	}
	.refund-confirm {
		font: inherit;
		font-weight: bold;
		border: 0;
		border-radius: 0.5em;
		padding: 0.6em 1em;
		min-height: 2.8em;
		cursor: pointer;
		background: hsl(0, 70%, 42%);
		color: white;
	}
	.pos {
		color: var(--ok, hsl(145, 70%, 26%));
	}
	.neg {
		color: var(--bad, hsl(0, 75%, 40%));
	}
	.pronouns {
		color: var(--muted, #555);
	}
	.stream {
		margin: 1.5em 0;
		padding: 0.8em 1em 1em;
		border-radius: 0.8em;
		background: color-mix(in srgb, var(--2) 10%, var(--surface, white));
	}
	.stream h2 {
		margin-top: 0;
	}
	.stream-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5em;
		align-items: flex-end;
	}
	.stream-form label {
		flex: 1 1 16em;
		display: flex;
		flex-direction: column;
		font-size: var(--step--1);
	}
	.stream input {
		font: inherit;
		padding: 0.5em;
		min-height: 2.8em;
		border-radius: 0.5em;
		border: 2px solid var(--line, #bbb);
		min-width: 0;
	}
	.stream button {
		font: inherit;
		font-weight: bold;
		border: 0;
		border-radius: 0.5em;
		padding: 0.6em 1em;
		min-height: 2.8em;
		cursor: pointer;
		background: var(--2);
		color: white;
	}
	.stream .send-link {
		background: var(--3-dark);
		width: 100%;
		margin-top: 0.3em;
	}
	.stream button:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
