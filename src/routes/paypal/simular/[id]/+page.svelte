<script>
	/** DEV ONLY: la pantalla de aprobación de PayPal simulada (ver +page.server.js). */
	/** @type {{ id: string, status: string, value: string, description: string }} */
	export let data;
</script>

<svelte:head>
	<title>PayPal simulado · Kinky Vibe</title>
</svelte:head>

<section class="mock">
	<p class="badge">🧪 PayPal simulado (solo desarrollo)</p>
	<h1>Pagar US$ {data.value}</h1>
	<p>{data.description}<br /><small>Orden de PayPal {data.id} · {data.status}</small></p>
	<form method="POST">
		<button name="outcome" value="approve" class="approve">Aprobar pago</button>
		<button name="outcome" value="cancel" class="cancel">Cancelar y volver</button>
	</form>
	<p class="note">
		Aprobar vuelve al sitio como PayPal (con <code>?token=</code>) y la vuelta cobra la orden
		(comisión simulada: 5,4 % + US$ 0,30).
	</p>
</section>

<style>
	.mock {
		background: #f5f7fb;
		border-radius: var(--radius-m);
		padding: 1.2em;
		outline: 3px solid #003087;
		max-width: 40rem;
		margin: 1.5em auto;
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
		border-radius: var(--radius-s);
		color: white;
		cursor: pointer;
	}
	.approve {
		background: #0070ba;
	}
	.cancel {
		background: #777;
	}
	.note {
		font-size: var(--step--1);
		color: #555;
	}
</style>
