<script>
	import { invalidate } from '$app/navigation';
	import { formatARS } from '$lib/utils/money.js';
	import { fondoOptionLabel } from '$lib/utils/tickets.js';
	import ExpiryTime from '$lib/components/ExpiryTime.svelte';
	import { TRANSFER_HOLD_AFTER } from '$lib/utils/transferDeadline.js';
	import { nextOrderPollDelay } from '$lib/utils/orderPolling.js';

	let { data } = $props();

	let order = $derived(data.order);
	let waiting = $derived(order.status === 'pending');

	// Cuando la orden cambia de estado mientras se mira (pendiente → aprobada), se lee el título
	// nuevo en una región viva aparte: si toda la tarjeta fuera la región, el lector recibiría la
	// tarjeta entera.
	/** @type {HTMLElement | undefined} */
	let card = $state();
	let liveText = $state('');
	let lastStatus = data.order.status;
	$effect(() => {
		const status = order.status;
		if (status === lastStatus) return;
		lastStatus = status;
		liveText = card?.querySelector('h1')?.textContent?.trim() ?? '';
	});

	// Compra aprobada: se borra el borrador del formulario de compra (TicketPurchase, en
	// sessionStorage de esta pestaña). Con Mercado Pago queda hasta acá para que un pago rechazado
	// vuelva al formulario con los datos cargados.
	$effect(() => {
		if (order.status !== 'approved') return;
		try {
			for (const key of Object.keys(sessionStorage)) {
				if (key.startsWith('kv-entradas:')) sessionStorage.removeItem(key);
			}
		} catch {
			// sin sessionStorage: no hay nada que borrar
		}
	});

	// Mientras esperamos la confirmación, volvemos a consultar cada vez más espaciado (5, 10, 20 y
	// después 30 segundos; 8 veces, unos 3 minutos: `nextOrderPollDelay`). Solo se recarga la orden
	// (`kv:orden`), no el layout del sitio.
	$effect(() => {
		if (!waiting) return;
		let done = 0;
		let stopped = false;
		/** @type {ReturnType<typeof setTimeout> | undefined} */
		let id;
		const schedule = () => {
			const delay = nextOrderPollDelay(done);
			if (stopped || delay === null) return;
			id = setTimeout(async () => {
				done++;
				// Si una consulta falla (sin conexión), sigue con la próxima.
				await invalidate('kv:orden').catch(() => {});
				schedule();
			}, delay);
		};
		schedule();
		return () => {
			stopped = true;
			clearTimeout(id);
		};
	});
</script>

<svelte:head>
	<title>Tu compra · Kinky Vibe</title>
</svelte:head>

<section class="estado estado-{order.status}" bind:this={card}>
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
		{:else}
			<!-- Las entradas se muestran solo con la cookie de la compra (otro navegador o vencida: no). -->
			<p>
				Acá las entradas se ven solo en el navegador donde hiciste la compra. Desde otro, abrilas
				con {order.quantity === 1
					? 'el link de la entrada que te mandamos por mail'
					: 'los links del mail: cada entrada tiene el suyo'}.
			</p>
		{/if}
	{:else if order.status === 'awaiting_transfer'}
		<h1>Reservamos tus entradas: falta la transferencia</h1>
		<p>
			Para confirmar tus entradas, transferí <strong class="amount">{formatARS(order.total)}</strong
			>.
		</p>
		{#if order.holdExpired}
			<p class="hold-note">
				La reserva venció <strong><ExpiryTime at={order.expiresAt} /></strong>. Si ya transferiste,
				mandanos el comprobante igual y lo revisamos.
			</p>
		{:else}
			<p class="hold-note">
				Te guardamos el lugar <strong><ExpiryTime at={order.expiresAt} until /></strong>.
				{TRANSFER_HOLD_AFTER}
			</p>
		{/if}
		{#if data.transfer?.info}
			<div class="transfer-info" role="group" aria-label="Datos para transferir">
				{data.transfer.info}
			</div>
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
			compra, {order.reference}.
		</p>
	{:else if order.status === 'refunded'}
		<h1>Esta compra fue reembolsada</h1>
		<p>Las entradas de esta compra ya no son válidas.</p>
	{:else}
		<h1>Esta reserva venció</h1>
		<p>
			No recibimos el pago a tiempo y el lugar se liberó. Si te cobraron igual, respondé el email o
			escribinos con el número de compra, {order.reference}.
		</p>
	{/if}

	<dl>
		<dt>Evento</dt>
		<dd><a href="/calendario/{data.event.slug}">{data.event.title}</a></dd>
		{#if data.event.parts?.lines.length}
			<dt>Partes</dt>
			<dd>
				<ul class="parts">
					{#each data.event.parts.lines as line, i (i)}
						<li>{line}</li>
					{/each}
				</ul>
			</dd>
		{/if}
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
			<dt>Fondo Kinky Vibe</dt>
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
			<dt>Recargo Mercado Pago</dt>
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
		<dt>Número de compra</dt>
		<dd><code>{order.reference}</code></dd>
	</dl>

	{#if order.status !== 'approved' && order.status !== 'pending' && order.status !== 'awaiting_transfer'}
		<a class="button" href="/calendario/{data.event.slug}/entradas">Volver a comprar</a>
	{/if}
	<div class="visually-hidden" role="status">{liveText}</div>
</section>

<style>
	.estado {
		border-radius: var(--round);
		padding: 1.2em;
		background: var(--surface);
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
		border-radius: var(--round-pill);
		background: var(--2);
		color: white;
		font-weight: bold;
		text-decoration: none;
	}
	.ticket-links a:hover,
	.button:hover {
		background: var(--2-dark);
		color: white;
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
	.parts {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.parts li {
		margin-bottom: 0.15em;
	}
	.estado-awaiting_transfer {
		outline-color: var(--4-dark, var(--2));
	}
	.hold-note {
		background: var(--4-tint);
		border-radius: var(--round-sm);
		padding: 0.6em 1em;
	}
	.transfer-info {
		white-space: pre-line;
		background: var(--2-tint);
		border-radius: var(--round-sm);
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
