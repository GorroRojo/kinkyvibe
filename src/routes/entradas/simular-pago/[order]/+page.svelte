<script>
	import MockCheckout from '$lib/components/MockCheckout.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Pago simulado · Kinky Vibe</title>
</svelte:head>

<MockCheckout
	total={data.order.total}
	detail={data.detail}
	reference="Orden {data.order.id} · {data.order.email}"
/>
