<script>
	import { enhance } from '$app/forms';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: order = form?.order ?? data.order;
	/** @param {number} ms */
	const deadline = (ms) =>
		new Intl.DateTimeFormat('es-AR', {
			timeZone: 'America/Argentina/Buenos_Aires',
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			hour: '2-digit',
			minute: '2-digit',
			// sin esto, es-AR sale en 12 h y con el «hs» de abajo quedaba «03:00 p. m. hs»
			hourCycle: 'h23'
		}).format(new Date(ms));
</script>

<svelte:head>
	<title>Confirmar reserva · KinkyVibe</title>
</svelte:head>

<main class="confirm">
	{#if order.confirmed && !order.expired}
		<h1>¡Reserva confirmada! 💜</h1>
		<p>
			Te guardamos el lugar hasta el <strong>{deadline(order.expiresAt)} hs</strong>. Transferí y
			mandanos el comprobante respondiendo el mail.
		</p>
	{:else if order.expired}
		<h1>La reserva ya no está vigente</h1>
		<p>Si ya transferiste, respondé el mail con el comprobante y lo revisamos.</p>
	{:else}
		<h1>Confirmá tu reserva</h1>
		<p>
			Así te guardamos el lugar {order.fullHours} horas mientras hacés la transferencia (ahora vence el
			<strong>{deadline(order.expiresAt)} hs</strong>).
		</p>
		<form method="POST" use:enhance>
			<input type="hidden" name="k" value={data.k} />
			<button type="submit" class="button" id="confirm-hold">Confirmar mi reserva</button>
		</form>
	{/if}
	{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
	<p><a href="/entradas/{order.id}/estado">Ver el estado de tu compra</a></p>
</main>

<style>
	.confirm {
		max-width: 36rem;
		margin: 2em auto;
		padding: 0 16px;
	}
	.button {
		font: inherit;
		background: var(--1);
		color: white;
		border: 0;
		border-radius: var(--round-pill);
		font-weight: bold;
		min-height: var(--tap);
		padding: 0.7em 1.2em;
		cursor: pointer;
	}
	.error {
		color: #b00020;
	}
</style>
