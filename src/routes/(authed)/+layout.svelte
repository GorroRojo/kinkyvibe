<script>
	import { filteredTags, tagsConfig, alias } from '$lib/utils/stores';
	import { aliaserFactory } from '$lib/utils/index.js';
	export let data;
	// onMount(() => {
	tagsConfig.set(data.tagsConfig);
	filteredTags.set([]);
	// });
	alias.update(() => aliaserFactory($tagsConfig));
</script>

<svelte:head>
	<title>KV Admin</title>
</svelte:head>
<header>
	<span>Panel de administradore</span>
    <a href="/">⬅️ volver a la página</a>
	<div class="profile-header">
		<img src={data.user.avatar_url} class="profile-pic" alt="" />
		<span id="title" class="profile-name">
			{data.user.name ?? data.user.login}
		</span>
	</div>
    <form method="POST" action="/logout">
        <input type="submit" value="Cerrar sesión" />
    </form>
</header>

<slot />

<style lang="scss">
	header {
		display: grid;
        grid-template-columns: 12em 1fr 10em 5em;
		max-width: 50rem;
		margin-inline: auto;
		height: 3em;
		align-items: center;
        justify-content: space-between;
        align-content: center;
	}
	.profile-header {
		display: flex;
		gap: 0.4em;
		align-items: center;
		font-size: var(--step-0);
		justify-content: start;
		justify-items: start;
		width: max-content;
		max-width: 100%;
	}
	.profile-pic {
		display: block;
		border-radius: 9999em;
		object-fit: cover;
		max-height: 1.5em;
		width: auto;
		justify-self: right;
		aspect-ratio: 1;
		translate: 0 -0em;
	}
	.profile-name {
		margin-right: 1em;
	}
</style>
