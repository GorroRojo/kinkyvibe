<script>
	import TelegramCard from '$lib/components/sigo/TelegramCard.svelte';

	export let data;
	export let form;
</script>

<svelte:head>
	<title>Telegram - KinkyVibe.ar</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="rincon">
	<p><a href="/mi-rincon/sigo">← Lo que sigo</a></p>
	{#if data.telegram}
		<TelegramCard telegram={data.telegram} result={form} />
	{/if}
</div>

<style>
	.rincon {
		display: grid;
		gap: 1em;
		width: min(40rem, 100%);
		margin: 1.5em auto;
		padding-inline: 16px;
		box-sizing: border-box;
	}
	p {
		margin: 0;
	}
</style>
