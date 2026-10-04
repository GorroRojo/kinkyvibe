<script>
	import MockCheckout from '$lib/components/MockCheckout.svelte';

	export let data;
</script>

<svelte:head>
	<title>Pago simulado · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<MockCheckout
		total={data.tip.amount}
		detail={data.item.title}
		reference="Propina {data.tip.id}"
	/>
</div>

<style>
	.wrap {
		max-width: 36rem;
		margin: 1em auto;
		padding: 0 var(--space-xs);
	}
</style>
