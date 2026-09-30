<script>
	import { createDropdownMenu, melt } from '@melt-ui/svelte';
	import { fly } from 'svelte/transition';
	import { page } from '$app/stores';
	import {
		CalendarPlus,
		Copy,
		FileSpreadsheet,
		LayoutDashboard,
		LogOut,
		SquarePen,
		Ticket
	} from '@lucide/svelte';
	/** @type {GHUser} */
	export let user;
	const {
		elements: { trigger, menu, item },
		states: { open }
	} = createDropdownMenu({
		preventScroll:false
	});
	$: isPageEditable = /\/?(amigues|calendario|material)\/.*/.test($page.url.pathname);
	$: eventSlug = $page.url.pathname.match(/^\/calendario\/([^/]+)\/?$/)?.[1];
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
	// GitHub serves every account's picture at github.com/<login>.png; used when the session has
	// no avatar_url (e.g. the fake admin of `npm run dev:admin`).
	$: avatar = user.avatar_url || `https://github.com/${encodeURIComponent(user.login)}.png`;
	/** Same size and stroke for every menu icon. */
	const icon = { size: 18, strokeWidth: 2, 'aria-hidden': true, class: 'icon' };
</script>

<div class="profile-header" use:melt={$trigger}>
	<img src={avatar} class="profile-pic" alt="" width="24" height="24" />
	<span id="title" class="profile-name">
		{user.name || user.login}
	</span>
	{#if $open}
	<div class="menu" use:melt={$menu} transition:fly={{ duration: 150, y: -10 }}>
		{#if admin}
		<a href="/admin" class="menuitem" use:melt={$item}
			><LayoutDashboard {...icon} /><span>Panel de admin</span></a
		>
		<a href="/admin/entradas" class="menuitem" use:melt={$item}
			><Ticket {...icon} /><span>Entradas</span></a
		>
		{#if $page.params.event && $page.data?.tickets}
			<a href="/admin/entradas/{$page.params.event}" class="menuitem" use:melt={$item}
				><Ticket {...icon} /><span>Entradas de este evento</span></a
			>
		{/if}
		<a href="/admin/eventos" class="menuitem" use:melt={$item}
			><CalendarPlus {...icon} /><span>Cargar evento</span></a
		>
		<a href="/admin/eventos/importar" class="menuitem" use:melt={$item}
			><FileSpreadsheet {...icon} /><span>Importar planilla</span></a
		>
		{#if eventSlug}
			<a href="/admin/eventos/nuevo?desde={eventSlug}" class="menuitem" use:melt={$item}
				><Copy {...icon} /><span>Duplicar este evento</span></a
			>
		{/if}
		{#if isPageEditable}
			<!-- TODO handle wikiless wiki links -->
			<a href="/edit{$page.url.pathname}" class="menuitem" use:melt={$item}
				><SquarePen {...icon} /><span>Editar contenido</span></a
			>
		{:else}
			<span class="menuitem disabled" use:melt={$item}
				><SquarePen {...icon} /><span>Editar contenido</span></span
			>
		{/if}
		{/if}
		<a href="/logout?redirectTo={$page.url}" class="menuitem" use:melt={$item}
			><LogOut {...icon} /><span>Cerrar sesión</span></a
		>
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
			display: flex;
			align-items: center;
			gap: 0.6em;
			padding: 0.5em 1em;
			width: 100%;
			line-height: 1.2;
			:global(.icon) {
				flex: none;
				opacity: 0.75;
			}
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
