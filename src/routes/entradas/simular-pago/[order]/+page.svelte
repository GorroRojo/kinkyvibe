<script>
	import MockCheckout from '$lib/components/MockCheckout.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Pago simulado - KinkyVibe.ar</title>
</svelte:head>

<MockCheckout
	total={data.order.total}
	detail="{data.item.quantity} × {data.item.title}"
	reference="Orden {data.order.id} · {data.order.email}"
/>
