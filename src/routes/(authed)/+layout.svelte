<script>
	import UserMenu from '$lib/components/UserMenu.svelte';
	import { filteredTags } from '$lib/utils/stores';
	export let data;
	filteredTags.set([]);
</script>

<svelte:head>
	<title>KV Admin</title>
</svelte:head>
<header>
	<a href="/">⬅️ Inicio</a>
	<span>Panel de administradore</span>
	{#if data.user}
		<UserMenu user={data.user} />
	{/if}
</header>

<slot />

<style lang="scss">
	header {
		display: grid;
		grid-template-columns: 4em 1fr 5em;
		max-width: 50rem;
		margin-inline: auto;
		height: 3em;
		align-items: center;
		font-size: var(--step-0);
		justify-content: space-between;
		align-content: center;
	}
	span {
		text-align: center;
	}
</style>
