<script>
	import { formatARS } from '$lib/utils/money.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>Pago simulado - KinkyVibe.ar</title>
</svelte:head>

<section class="mock">
	<p class="badge">🧪 Mercado Pago simulado (solo desarrollo)</p>
	<h1>Pagar {formatARS(data.order.total)}</h1>
	<p>
		{data.item.quantity} × {data.item.title}<br />
		<small>Orden {data.order.id} · {data.order.email}</small>
	</p>
	<form method="POST">
		<button name="outcome" value="approved" class="approve">Aprobar pago</button>
		<button name="outcome" value="rejected" class="reject">Rechazar pago</button>
		<button name="outcome" value="pending" class="pending">Dejar pendiente</button>
		<button name="outcome" value="late" class="late">Aprobar sin webhook (llega tarde)</button>
	</form>
	<p class="note">
		Cada botón crea un pago simulado, manda la notificación firmada al webhook (salvo el último) y
		vuelve a la página de estado con los mismos parámetros que agrega Mercado Pago.
	</p>
</section>

<style>
	.mock {
		background: #f5f7fb;
		border-radius: 1em;
		padding: 1.2em;
		outline: 3px solid #009ee3;
	}
	.badge {
		display: inline-block;
		background: var(--4-light);
		padding: 0.2em 0.6em;
		border-radius: 0.4em;
		font-size: var(--step--1);
	}
	h1 {
		font-size: var(--step-3);
		margin: 0.3em 0;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.6em;
	}
	button {
		font: inherit;
		font-weight: bold;
		min-height: 3.2em;
		border: 0;
		border-radius: 0.6em;
		color: white;
		cursor: pointer;
	}
	.approve {
		background: #009ee3;
	}
	.reject {
		background: hsl(0, 70%, 45%);
	}
	.pending {
		background: #777;
	}
	.late {
		background: #2d3277;
	}
	.note {
		font-size: var(--step--1);
		color: #555;
	}
</style>
