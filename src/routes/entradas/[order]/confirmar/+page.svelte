<script>
	import { enhance } from '$app/forms';
	import ExpiryTime from '$lib/components/ExpiryTime.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: order = form?.order ?? data.order;
</script>

<svelte:head>
	<title>Confirmar reserva · KinkyVibe</title>
</svelte:head>

<main class="confirm">
	{#if order.confirmed && !order.expired}
		<h1>¡Reserva confirmada! 💜</h1>
		<p>
			Te guardamos el lugar <strong><ExpiryTime at={order.expiresAt} until /></strong>. Transferí y
			mandanos el comprobante respondiendo el mail.
		</p>
	{:else if order.expired}
		<h1>La reserva ya no está vigente</h1>
		<p>Si ya transferiste, respondé el mail con el comprobante y lo revisamos.</p>
	{:else}
		<h1>Confirmá tu reserva</h1>
		<p>
			Así te guardamos el lugar {order.fullHours} horas mientras hacés la transferencia (ahora vence
			<strong><ExpiryTime at={order.expiresAt} /></strong>).
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
