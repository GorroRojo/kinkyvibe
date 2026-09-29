<script>
	import { invalidateAll } from '$app/navigation';
	import { formatARS } from '$lib/utils/money.js';

	let { data } = $props();

	let order = $derived(data.order);
	let waiting = $derived(order.status === 'pending');

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
					<li><a href="/entradas/t/{t.token}">Ver entrada {i + 1} con su QR</a></li>
				{/each}
			</ul>
		{/if}
	{:else if order.status === 'pending'}
		<h1>Estamos esperando la confirmación del pago…</h1>
		<p>
			Apenas Mercado Pago nos confirme, te mandamos las entradas a <strong>{order.email}</strong>.
			Esta página se actualiza sola.
		</p>
	{:else if order.status === 'rejected'}
		<h1>El pago fue rechazado</h1>
		<p>No se cobró nada. Podés volver al evento e intentar de nuevo con otro medio de pago.</p>
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
		<dt>Total</dt>
		<dd>{formatARS(order.total)}</dd>
		<dt>Orden</dt>
		<dd><code>{order.id}</code></dd>
	</dl>

	{#if order.status !== 'approved' && order.status !== 'pending'}
		<a class="button" href="/calendario/{data.event.slug}#entradas">Volver al evento</a>
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
</style>
