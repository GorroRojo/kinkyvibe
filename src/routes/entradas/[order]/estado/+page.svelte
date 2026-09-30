<script>
	import { invalidateAll } from '$app/navigation';
	import { formatARS } from '$lib/utils/money.js';
	import { fondoOptionLabel } from '$lib/utils/tickets.js';

	let { data } = $props();

	let order = $derived(data.order);
	let waiting = $derived(order.status === 'pending');

	/** @param {number} ms */
	function deadline(ms) {
		return new Date(ms).toLocaleString('es-AR', {
			dateStyle: 'full',
			timeStyle: 'short',
			hourCycle: 'h23',
			timeZone: 'America/Argentina/Buenos_Aires'
		});
	}

	// Mientras esperamos la confirmación, volvemos a consultar cada 5 segundos (hasta 2 minutos).
	$effect(() => {
		if (!waiting) return;
		let tries = 0;
		const id = setInterval(() => {
			tries++;
			if (tries > 24) clearInterval(id);
			else invalidateAll();
		}, 5000);
		return () => clearInterval(id);
	});
</script>

<svelte:head>
	<title>Tu compra - KinkyVibe.ar</title>
</svelte:head>

<section class="estado estado-{order.status}" aria-live="polite">
	{#if order.status === 'approved'}
		<h1>¡Listo, ya tenés tus entradas! 🎉</h1>
		<p>
			Te mandamos {order.quantity === 1 ? 'la entrada' : `las ${order.quantity} entradas`} a
			<strong>{order.email}</strong>. Si no lo ves, revisá spam o promociones.
		</p>
		{#if data.tickets.length}
			<ul class="ticket-links">
				{#each data.tickets as t, i (t.token)}
					<li>
						<a href="/entradas/t/{t.token}"
							>Ver entrada {i + 1}{data.event.online ? '' : ' con su QR'}</a
						>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if order.status === 'awaiting_transfer'}
		<h1>Reservamos tus entradas: falta la transferencia</h1>
		<p>
			Transferí <strong class="amount">{formatARS(order.total)}</strong>: te reservamos el lugar
			{order.holdHours} horas (hasta el <strong>{deadline(order.expiresAt)} hs</strong>) mientras
			mandás el comprobante por mail. Si no llega a tiempo, la reserva se libera.
		</p>
		{#if order.confirmPending}
			<p class="confirm-note">
				<strong>Confirmá tu reserva</strong> con el link del mail que te mandamos a
				<strong>{order.email}</strong> para que te guardemos el lugar {order.fullHoldHours} horas.
			</p>
		{/if}
		{#if data.transfer?.info}
			<div class="transfer-info" aria-label="Datos para transferir">{data.transfer.info}</div>
		{:else}
			<p>Los datos para transferir te llegaron por email.</p>
		{/if}
		<p>
			En el concepto o la descripción de la transferencia poné:
			<strong class="reference">{order.reference}</strong>
		</p>
		<ol class="steps">
			<li>Hacé la transferencia desde tu banco o billetera.</li>
			<li>
				Mandanos el comprobante respondiendo el email que te mandamos a
				<strong>{order.email}</strong>{#if data.transfer?.replyTo}{' '}o escribiendo a
					<a href="mailto:{data.transfer.replyTo}">{data.transfer.replyTo}</a>{/if}, con la
				referencia {order.reference}.
			</li>
			<li>
				Cuando lo confirmemos, te llegan las entradas{data.event.online ? '' : ' con su QR'} por email.
			</li>
		</ol>
	{:else if order.status === 'pending'}
		<h1>Estamos esperando la confirmación del pago…</h1>
		<p>
			Apenas Mercado Pago nos confirme, te mandamos las entradas a <strong>{order.email}</strong>.
			Esta página se actualiza sola.
		</p>
	{:else if order.status === 'rejected'}
		<h1>El pago fue rechazado</h1>
		<p>No se cobró nada. Podés volver al evento e intentar de nuevo con otro medio de pago.</p>
	{:else if order.status === 'cancelled'}
		<h1>Esta compra se canceló</h1>
		<p>
			No se emitieron entradas. Si pagaste igual, respondé el email o escribinos con el número de
			orden.
		</p>
	{:else if order.status === 'refunded'}
		<h1>Esta compra fue reembolsada</h1>
		<p>Las entradas de esta compra ya no son válidas.</p>
	{:else}
		<h1>Esta reserva venció</h1>
		<p>
			No recibimos el pago a tiempo y el lugar se liberó. Si te cobraron igual, respondé el email o
			escribinos con el número de orden.
		</p>
	{/if}

	<dl>
		<dt>Evento</dt>
		<dd><a href="/calendario/{data.event.slug}">{data.event.title}</a></dd>
		<dt>Entradas</dt>
		<dd>{order.quantity} × {order.typeName}</dd>
		{#if order.fondoOption === 'gorra'}
			<dt>A la gorra</dt>
			<dd>{formatARS(order.unitPrice)} por entrada</dd>
		{/if}
		{#if order.fondo || order.contribution || order.discountAmount || order.surcharge}
			<dt>Precio</dt>
			<dd>{formatARS(order.list)}</dd>
		{/if}
		{#if order.fondo}
			<dt>Fondo KinkyVibe</dt>
			<dd>−{formatARS(order.fondo)} 💜</dd>
		{/if}
		{#if order.contribution}
			<dt>Aporte al fondo</dt>
			<dd>+{formatARS(order.contribution)} 💜 · {fondoOptionLabel(order.fondoOption)}</dd>
		{/if}
		{#if order.discountAmount}
			<dt>Descuento</dt>
			<dd>−{formatARS(order.discountAmount)} (código {order.discountCode})</dd>
		{/if}
		{#if order.surcharge}
			<dt>Recargo MP</dt>
			<dd>+{formatARS(order.surcharge)}</dd>
		{/if}
		<dt>Total</dt>
		<dd>{formatARS(order.total)}</dd>
		<dt>Pago</dt>
		<dd>
			{order.method === 'transferencia'
				? 'Transferencia'
				: order.method === 'gratis'
					? 'Sin cargo'
					: 'Mercado Pago'}
		</dd>
		<dt>Orden</dt>
		<dd><code>{order.id}</code></dd>
	</dl>

	{#if order.status !== 'approved' && order.status !== 'pending' && order.status !== 'awaiting_transfer'}
		<a class="button" href="/calendario/{data.event.slug}/entradas">Volver a comprar</a>
	{/if}
</section>

<style>
	.estado {
		border-radius: 1em;
		padding: 1.2em;
		background: white;
		outline: 3px solid var(--2);
	}
	.estado-approved {
		outline-color: var(--3-dark);
	}
	.estado-rejected,
	.estado-expired,
	.estado-cancelled,
	.estado-refunded {
		outline-color: var(--1-dark);
	}
	h1 {
		font-size: var(--step-2);
		margin-top: 0;
	}
	.ticket-links {
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.5em;
	}
	.ticket-links a,
	.button {
		display: block;
		text-align: center;
		padding: 0.8em 1em;
		border-radius: 0.6em;
		background: var(--2);
		color: white;
		font-weight: bold;
		text-decoration: none;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3em 1em;
		font-size: var(--step--1);
	}
	dt {
		font-weight: bold;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.estado-awaiting_transfer {
		outline-color: var(--4-dark, var(--2));
	}
	.confirm-note {
		background: #fff3c4;
		border-radius: 0.8em;
		padding: 0.6em 1em;
	}
	.transfer-info {
		white-space: pre-line;
		background: color-mix(in srgb, var(--2) 8%, white);
		border-radius: 0.6em;
		padding: 0.8em 1em;
		font-family: ui-monospace, monospace;
		font-size: var(--step--1);
		overflow-wrap: anywhere;
	}
	.reference {
		white-space: nowrap;
		font-size: var(--step-1);
		letter-spacing: 0.05em;
		user-select: all;
	}
	.amount {
		font-size: var(--step-1);
	}
	.steps {
		padding-left: 1.3em;
	}
	.steps li {
		margin-bottom: 0.4em;
	}
</style>
