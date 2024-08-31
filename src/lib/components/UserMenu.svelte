<script>
	import { createDropdownMenu, melt } from '@melt-ui/svelte';
	import { fly } from 'svelte/transition';
	import { page } from '$app/stores';
	/** @type {GHUser} */
	export let user;
	const {
		elements: { trigger, menu, item },
		states: { open }
	} = createDropdownMenu({
		preventScroll:false
	});
	$: isPageEditable = /\/?(amigues|calendario|material)\/.*/.test($page.url.pathname);
	/**
	 *
	 * @param {string} token
	 * @param {string} username
	 * @returns {boolean}
	 */
	function isAdmin(token, username) {
		return ['GorroRojo', 'Tallarines333', 'VelvetVoid'].includes(username);
		// TODO make it read it from github
		// try {
		// 	await ghGet(`repos/GorroRojo/kinkyvibe/collaborators/${username}}`, token)
		// } catch (e) {
		// 	console.log(e)
		// 	return false
		// }
		// return true
	}
	let admin = isAdmin('', user.login);
</script>

<div class="profile-header" use:melt={$trigger}>
	<img src={user.avatar_url} class="profile-pic" alt="" />
	<span id="title" class="profile-name">
		{user.name ?? user.login}
	</span>
	{#if $open}
	<div class="menu" use:melt={$menu} transition:fly|global={{ duration: 150, y: -10 }}>
		{#if admin}
		<a href="/admin" class="menuitem" use:melt={$item}>Panel de admin</a>
		{#if isPageEditable}
			<!-- TODO handle wikiless wiki links -->
			<a href="/edit{$page.url.pathname}" class="menuitem" use:melt={$item}>Editar contenido</a>
		{:else}
			<span class="menuitem disabled" use:melt={$item}>Editar contenido</span>
		{/if}
		{/if}
		<a href="/logout?redirectTo={$page.url}" class="menuitem" use:melt={$item}>Cerrar sesión</a>
	</div>
	{/if}
</div>

<style lang="scss">
	a {
		text-decoration: none;
	}
	.menu {
		display: flex;
		flex-direction: column;
		background: #fff;
		.menuitem {
			padding: 0.5em 1em;
			width: 100%;
		}
		.disabled {
			opacity: 0.5;
		}
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
		color: #222;
	}
</style>
