<script>
	/**
	 * Lo que ven los links «Confirmar mi reserva» de los mails viejos (decisión 0031): hasta cuándo
	 * está guardada la reserva, o que ya venció. No hay nada para confirmar.
	 */
	import ExpiryTime from '$lib/components/ExpiryTime.svelte';

	/** @type {import('./$types').PageData} */
	export let data;
	/** @type {import('./$types').ActionData} */
	export let form;

	$: order = form?.order ?? data.order;
</script>

<svelte:head>
	<title>Tu reserva · Kinky Vibe</title>
</svelte:head>

<!-- No es un <main>: el layout de /entradas ya pone uno. -->
<div class="confirm">
	{#if order.state === 'held'}
		<h1>Tu reserva ya está guardada 💜</h1>
		<p>
			Tu reserva ya está guardada <strong><ExpiryTime at={order.expiresAt} until /></strong>. No
			tenés que confirmar nada más: transferí y mandanos el comprobante antes de esa hora; si no
			llega, la reserva se libera.
		</p>
	{:else if order.state === 'paid'}
		<h1>Ya confirmamos tu pago 🎉</h1>
		<p>Te mandamos las entradas por mail. Si no las ves, revisá spam o promociones.</p>
	{:else}
		<h1>Tu reserva ya venció</h1>
		<p>Si ya transferiste, respondé el mail con el comprobante y lo revisamos.</p>
	{/if}
	<p><a href="/entradas/{order.id}/estado">Ver el estado de tu compra</a></p>
</div>

<style>
	.confirm {
		max-width: 36rem;
		margin: 2em auto;
		padding: 0 var(--space-xs);
	}
</style>
