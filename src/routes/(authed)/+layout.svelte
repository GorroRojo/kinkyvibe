<script>
	import UserMenu from '$lib/components/UserMenu.svelte';
	import { filteredTags } from '$lib/utils/stores';
	import { page } from '$app/stores';
	export let data;
	filteredTags.set([]);
	// El panel (/admin/**) tiene su propio marco: ver admin/+layout.svelte.
	$: inPanel = /^\/admin(\/|$)/.test($page.url.pathname);
</script>

<svelte:head>
	{#if !inPanel}<title>KV Admin</title>{/if}
</svelte:head>
{#if !inPanel}
	<header>
		<a href="/">⬅️ Inicio</a>
		<a href="/admin">Panel de admin</a>
		{#if data.user}<UserMenu user={data.user} />{/if}
	</header>
{/if}

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
	header > a:nth-child(2) {
		text-align: center;
	}
</style>
