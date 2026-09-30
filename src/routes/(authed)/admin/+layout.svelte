<script>
	/**
	 * Marco del panel de admin, con el estilo del sitio público: barra lateral (≥ 900 px) con el
	 * logo, barra de arriba con el buscador, y en el celu un header chico + barra de abajo como la
	 * del sitio (íconos de Lucide) con 5 lugares y el panel "Más".
	 *
	 * Pantalla completa sin marco (modo puerta): la página devuelve `bare: true` en su `load`
	 * (+page.js o +page.server.js), por ejemplo `return { bare: true, ... }`. Entonces este layout
	 * solo pone los tokens del panel (`.kv-panel`, con modo oscuro) y la página, sin menús.
	 *
	 * Las secciones y sus íconos salen de `$lib/admin/nav.js` (no agregar links a mano acá).
	 */
	import '$lib/admin/panel.scss';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { ExternalLink, LogOut, Menu, Moon, Plus, Sun, SunMoon, X } from '@lucide/svelte';
	import logo from '../../logo.png';
	import SearchBox from '$lib/components/admin/panel/SearchBox.svelte';
	import NavIcon from '$lib/components/admin/panel/NavIcon.svelte';
	import {
		NAV_GROUPS,
		MOBILE_TABS,
		activeNavItem,
		navGroupItems,
		navItem,
		navLink
	} from '$lib/admin/nav.js';
	import {
		THEME_HEAD_SCRIPT,
		THEME_LABELS,
		nextTheme,
		readTheme,
		saveTheme
	} from '$lib/admin/theme.js';

	export let data;

	const THEME_ICONS = { auto: SunMoon, light: Sun, dark: Moon };

	/** @type {import('$lib/admin/theme.js').Theme} */
	let theme = 'auto';
	let sheetOpen = false;
	/** @type {HTMLDetailsElement | undefined} */
	let userMenu;

	$: bare = $page.data?.bare === true;
	$: active = activeNavItem($page.url.pathname);
	/** @type {Record<string, number>} */
	$: counts = data.panelCounts ?? {};
	$: user = data.user;
	let avatarFailed = false;
	$: avatar = avatarFailed
		? ''
		: user?.avatar_url ||
			(user?.login ? `https://github.com/${encodeURIComponent(user.login)}.png` : '');
	$: initial = (user?.name || user?.login || '?').slice(0, 1).toUpperCase();
	const logoutHref = '/logout?redirectTo=/';

	/** @param {import('$lib/admin/nav.js').NavItem | undefined} item */
	const countOf = (item) => (item?.counter ? (counts[item.counter] ?? 0) : 0);

	/** @type {HTMLImageElement | undefined} */
	let avatarImg;
	onMount(() => {
		// La imagen puede haber fallado antes de que Svelte escuchara `error` (render del servidor).
		if (avatarImg?.complete && avatarImg.naturalWidth === 0) avatarFailed = true;
		theme = readTheme();
		saveTheme(theme);
		return () => document.documentElement.removeAttribute('data-theme');
	});
	afterNavigate(() => {
		sheetOpen = false;
		if (userMenu) userMenu.open = false;
	});

	function toggleTheme() {
		theme = nextTheme(theme);
		saveTheme(theme);
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Escape') {
			sheetOpen = false;
			if (userMenu) userMenu.open = false;
		}
	}

	/**
	 * Barra de abajo del celu: `null` es el botón "Más". "Entradas" muestra el contador de
	 * transferencias pendientes.
	 * @type {({ item: import('$lib/admin/nav.js').NavItem, label: string, counterItem: import('$lib/admin/nav.js').NavItem } | null)[]}
	 */
	const mobileTabs = MOBILE_TABS.map((id) => {
		const item = navItem(id);
		if (!item) return null;
		if (id === 'entradas') {
			const transfers = navItem('entradas-transferencias') ?? item;
			return { item, label: 'Entradas', counterItem: transfers };
		}
		return { item, label: item.label, counterItem: item };
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- string fijo, ver theme.js -->
	{@html THEME_HEAD_SCRIPT}
	<title>Panel · KinkyVibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window on:keydown={onKey} />

<div class="kv-panel">
	{#if bare}
		<slot />
	{:else}
		<div class="app">
			<aside class="side" aria-label="Secciones del panel">
				<a class="brand" href="/admin">
					<img src={logo} alt="KinkyVibe" width="64" height="64" />
					<span class="pill">Panel de admin</span>
				</a>
				<nav>
					{#each navGroupItems(null) as item (item.id)}
						<a
							class="nav"
							class:on={active?.id === item.id}
							href={navLink(item)}
							aria-current={active?.id === item.id ? 'page' : undefined}
							><NavIcon {item} />{item.label}</a
						>
					{/each}
					{#each NAV_GROUPS as group (group.id)}
						<div class="gl">{group.label}</div>
						{#each navGroupItems(group.id) as item (item.id)}
							{@const href = navLink(item)}
							{#if href}
								<a
									class="nav"
									class:on={active?.id === item.id}
									{href}
									aria-current={active?.id === item.id ? 'page' : undefined}
									><NavIcon {item} />{item.label}
									{#if countOf(item)}<span class="count" title="Pendientes">{countOf(item)}</span
										>{/if}</a
								>
							{:else}
								<span class="nav off" aria-disabled="true"
									><NavIcon {item} />{item.label}<span class="soon">pronto</span></span
								>
							{/if}
						{/each}
					{/each}
				</nav>
				<div class="foot">
					<button type="button" class="nav" on:click={toggleTheme}
						><svelte:component
							this={THEME_ICONS[theme]}
							size={20}
							aria-hidden="true"
						/>{THEME_LABELS[theme].label}</button
					>
					<a class="nav" href="/" target="_blank" rel="noopener"
						><ExternalLink size={20} aria-hidden="true" />Ver el sitio</a
					>
				</div>
			</aside>

			<div class="main">
				<header class="top">
					<SearchBox />
					<a class="kv-btn" href="/admin/eventos/nuevo"
						><Plus size={18} strokeWidth={2.5} aria-hidden="true" />Cargar evento</a
					>
					<details class="usermenu" bind:this={userMenu}>
						<summary aria-label="Tu cuenta">
							{#if avatar}<img
									src={avatar}
									alt=""
									width="36"
									height="36"
									bind:this={avatarImg}
									on:error={() => (avatarFailed = true)}
								/>{:else}<span class="initial">{initial}</span>{/if}
						</summary>
						<div class="pop">
							<div class="who">
								<b>{user?.name || user?.login || ''}</b>
								{#if user?.name && user?.login}<small class="muted">@{user.login}</small>{/if}
							</div>
							<button type="button" on:click={toggleTheme}
								><svelte:component
									this={THEME_ICONS[theme]}
									size={18}
									aria-hidden="true"
								/>{THEME_LABELS[theme].label}</button
							>
							<a href="/" target="_blank" rel="noopener"
								><ExternalLink size={18} aria-hidden="true" />Ver el sitio</a
							>
							<a href={logoutHref} data-sveltekit-reload
								><LogOut size={18} aria-hidden="true" />Cerrar sesión</a
							>
						</div>
					</details>
				</header>

				<header class="mtop">
					<a href="/admin" class="mlogo" aria-label="Inicio del panel"
						><img src={logo} alt="KinkyVibe" width="44" height="44" /></a
					>
					<SearchBox compact hotkeys={false} />
					<a class="site" href="/" target="_blank" rel="noopener" title="Ver el sitio"
						>Sitio<ExternalLink size={14} aria-hidden="true" /></a
					>
					<button
						type="button"
						class="mavatar"
						aria-label="Tu cuenta y todas las secciones"
						on:click={() => (sheetOpen = true)}
						>{#if avatar}<img
								src={avatar}
								alt=""
								width="32"
								height="32"
							/>{:else}{initial}{/if}</button
					>
				</header>

				<main class="page">
					<slot />
				</main>
			</div>
		</div>

		<nav class="tabbar" aria-label="Secciones principales">
			{#each mobileTabs as tab, i (i)}
				{#if tab}
					{@const href = navLink(tab.item)}
					<a
						href={href ?? '/admin'}
						class:on={active?.id === tab.item.id}
						class:door={tab.item.id === 'checkin'}
						aria-current={active?.id === tab.item.id ? 'page' : undefined}
					>
						<span class="ti"
							><NavIcon item={tab.item} size={tab.item.id === 'checkin' ? 26 : 24} /></span
						>{tab.label}
						{#if countOf(tab.counterItem)}<span class="count">{countOf(tab.counterItem)}</span>{/if}
					</a>
				{:else}
					<button
						type="button"
						class:on={sheetOpen}
						aria-expanded={sheetOpen}
						aria-controls="kv-more"
						on:click={() => (sheetOpen = !sheetOpen)}
						><span class="ti"><Menu size={24} aria-hidden="true" /></span>Más</button
					>
				{/if}
			{/each}
		</nav>

		{#if sheetOpen}
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="scrim" on:click|self={() => (sheetOpen = false)}>
				<div class="sheet" id="kv-more" role="dialog" aria-label="Todas las secciones">
					<div class="grab" aria-hidden="true"></div>
					<div class="sheet-head">
						<span class="mavatar"
							>{#if avatar}<img
									src={avatar}
									alt=""
									width="32"
									height="32"
								/>{:else}{initial}{/if}</span
						>
						<div>
							<b>{user?.name || user?.login || ''}</b><br /><small class="muted"
								>Panel de admin</small
							>
						</div>
						<button type="button" class="x" aria-label="Cerrar" on:click={() => (sheetOpen = false)}
							><X size={20} aria-hidden="true" /></button
						>
					</div>
					{#each NAV_GROUPS as group (group.id)}
						<div class="gl">{group.label}</div>
						<div class="cards">
							{#each navGroupItems(group.id) as item (item.id)}
								{@const href = navLink(item)}
								{#if href}
									<a {href} class="tile" class:hl={item.highlight} class:on={active?.id === item.id}
										><NavIcon {item} />{item.label}
										{#if countOf(item)}<span class="count">{countOf(item)}</span>{/if}</a
									>
								{:else}
									<span class="tile off" aria-disabled="true"
										><NavIcon {item} />{item.label}<small>pronto</small></span
									>
								{/if}
							{/each}
						</div>
					{/each}
					<div class="sheet-foot">
						<button type="button" class="kv-btn ghost small" on:click={toggleTheme}
							><svelte:component
								this={THEME_ICONS[theme]}
								size={16}
								aria-hidden="true"
							/>{THEME_LABELS[theme].label}</button
						>
						<a class="kv-btn violet small" href="/" target="_blank" rel="noopener"
							>Ver el sitio<ExternalLink size={16} aria-hidden="true" /></a
						>
						<a class="kv-btn ghost small" href={logoutHref} data-sveltekit-reload
							><LogOut size={16} aria-hidden="true" />Cerrar sesión</a
						>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style lang="scss">
	.app {
		display: grid;
		grid-template-columns: 15.5rem minmax(0, 1fr);
		min-height: 100vh;
	}

	/* Barra lateral: blanca, como las tarjetas del sitio; los links como el menú del sitio
	   (rosas en negrita, el actual en violeta). */
	.side {
		background: var(--surface);
		box-shadow: var(--shadow);
		padding: 1rem 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow: auto;
		nav {
			display: flex;
			flex-direction: column;
			gap: 0.1rem;
		}
	}
	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0 0.8rem;
		text-decoration: none;
		img {
			width: 4rem;
			height: 4rem;
			object-fit: contain;
		}
	}
	.pill {
		background: var(--2);
		color: white;
		border-radius: 3em;
		padding: 0.1em 0.8em;
		font-size: 0.85rem;
	}
	.gl {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--muted);
		padding: 0.9rem 0.8rem 0.2rem;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.8rem;
		border-radius: var(--round);
		border: 0;
		background: none;
		text-align: left;
		width: 100%;
		text-decoration: none;
		cursor: pointer;
		color: var(--accent);
		font-weight: 700;
		transition: background 100ms;
		&:hover {
			background: var(--surface-2);
			color: var(--accent);
		}
		&.on {
			background: var(--link-bg);
			color: var(--link);
		}
		&.off {
			color: var(--muted);
			font-weight: 400;
			cursor: default;
			&:hover {
				background: none;
			}
		}
	}
	.count {
		margin-left: auto;
		background: var(--counter);
		color: var(--counter-ink);
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: 1em;
		padding: 0 0.55em;
		font-variant-numeric: tabular-nums;
	}
	.soon {
		margin-left: auto;
		font-size: 0.7rem;
		border: 1px solid var(--line);
		color: var(--muted);
		border-radius: 2em;
		padding: 0 0.5em;
		white-space: nowrap;
	}
	.foot {
		margin-top: auto;
		border-top: 1px solid var(--line);
		padding-top: 0.5rem;
		.nav {
			font-weight: 400;
			color: var(--text);
		}
	}

	.main {
		min-width: 0;
	}
	.top {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		padding: 0.9rem 2rem;
		position: sticky;
		top: 0;
		background: var(--bg);
		z-index: 4;
	}
	.usermenu {
		position: relative;
		margin-left: auto;
		summary {
			list-style: none;
			cursor: pointer;
			&::-webkit-details-marker {
				display: none;
			}
		}
		img,
		.initial {
			width: 2.3rem;
			height: 2.3rem;
			border-radius: 50%;
			display: grid;
			place-items: center;
			object-fit: cover;
			background: var(--2);
			color: white;
			font-weight: 700;
		}
		.pop {
			position: absolute;
			right: 0;
			top: calc(100% + 0.4rem);
			background: var(--surface);
			border-radius: var(--round);
			box-shadow: 0 0.2em 1em rgba(1, 1, 1, 0.15);
			min-width: 14rem;
			padding: 0.4rem;
			display: flex;
			flex-direction: column;
			z-index: 10;
			> a,
			> button {
				display: flex;
				align-items: center;
				gap: 0.6em;
				text-align: left;
				background: none;
				border: 0;
				padding: 0.5rem 0.6rem;
				border-radius: 0.7em;
				text-decoration: none;
				cursor: pointer;
				&:hover {
					background: var(--surface-2);
				}
			}
			.who {
				padding: 0.4rem 0.6rem 0.5rem;
				border-bottom: 1px solid var(--line);
				margin-bottom: 0.3rem;
				display: flex;
				flex-direction: column;
			}
		}
	}
	.page {
		padding: 0.3rem 2rem 6rem;
		max-width: 80rem;
	}

	.mtop,
	.tabbar {
		display: none;
	}

	@media (max-width: 899.98px) {
		.app {
			display: block;
		}
		.side,
		.top {
			display: none;
		}
		.mtop {
			display: flex;
			gap: 0.6rem;
			align-items: center;
			padding: 0.5rem 16px;
			position: sticky;
			top: 0;
			background: var(--bg);
			z-index: 4;
			.mlogo img {
				display: block;
				width: 2.75rem;
				height: 2.75rem;
				object-fit: contain;
			}
			.site {
				display: inline-flex;
				align-items: center;
				gap: 0.2em;
				font-size: 0.85rem;
				white-space: nowrap;
				text-decoration: none;
				color: white;
				background: var(--2);
				border-radius: 3em;
				padding: 0.15em 0.6em;
			}
		}
		.page {
			padding: 0.2rem 16px calc(6.5rem + env(safe-area-inset-bottom, 0px));
		}

		/* Barra de abajo: la del sitio (blanca, íconos de Lucide y etiquetas rosas; la actual en
		   violeta con el ícono más grande). Check-in va en el medio, como el botón flotante rosa. */
		.tabbar {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			background: var(--surface);
			padding: 0.3rem 0.3rem calc(env(safe-area-inset-bottom, 0px) + 0.3rem);
			z-index: 10;
			a,
			button {
				position: relative;
				border: 0;
				background: none;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: flex-end;
				gap: 0.15rem;
				font-size: 0.75rem;
				font-weight: 700;
				color: var(--accent);
				padding: 0.25rem 0;
				min-height: 3.6rem;
				text-decoration: none;
				cursor: pointer;
				&.on {
					color: var(--link);
					.ti {
						scale: 1.2;
						translate: 0 -0.1rem;
					}
				}
			}
			.ti {
				display: grid;
				place-items: center;
				transition: scale 100ms;
			}
			.door .ti {
				background: var(--accent);
				color: white;
				width: 3.3rem;
				height: 3.3rem;
				border-radius: 50%;
				margin-top: -1.5rem;
				box-shadow: 0 0.2em 0.6em rgba(1, 1, 1, 0.25);
			}
			.door.on .ti {
				scale: 1;
				background: var(--2);
			}
			.count {
				position: absolute;
				top: 0.1rem;
				left: calc(50% + 0.4rem);
				margin: 0;
			}
		}
	}

	.scrim {
		position: fixed;
		inset: 0;
		background: var(--scrim);
		backdrop-filter: blur(3px);
		z-index: 20;
		display: flex;
		align-items: flex-end;
	}
	.sheet {
		background: var(--bg);
		width: 100%;
		max-height: 88vh;
		overflow: auto;
		border-radius: var(--card-round) var(--card-round) 0 0;
		padding: 0.5rem 16px calc(1rem + env(safe-area-inset-bottom, 0px));
		box-shadow: 0 -0.5rem 2rem rgba(0, 0, 0, 0.2);
		.grab {
			width: 3rem;
			height: 0.3rem;
			border-radius: 1em;
			background: var(--line);
			margin: 0 auto 0.6rem;
		}
		.gl {
			padding-inline: 0.2rem;
		}
	}
	.mavatar {
		flex: none;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 50%;
		border: 0;
		padding: 0;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: var(--2);
		color: white;
		font-weight: 700;
		cursor: pointer;
		img {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
	}
	.sheet-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		.x {
			margin-left: auto;
			border: 0;
			background: var(--surface);
			color: var(--accent);
			border-radius: 50%;
			width: 2.3rem;
			height: 2.3rem;
			display: grid;
			place-items: center;
			cursor: pointer;
		}
	}
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.tile {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--surface);
		color: var(--accent);
		border-radius: var(--round);
		box-shadow: var(--shadow);
		padding: 0.75rem 0.8rem;
		text-decoration: none;
		font-weight: 700;
		min-width: 0;
		&.hl {
			background: var(--accent);
			color: var(--accent-ink);
		}
		&.on {
			color: var(--link);
			box-shadow: inset 0 0 0 2px var(--link);
		}
		&.off {
			font-weight: 400;
			color: var(--muted);
			background: transparent;
			box-shadow: inset 0 0 0 1px var(--line);
			flex-wrap: wrap;
			small {
				margin-left: auto;
				font-size: 0.7rem;
			}
		}
	}
	.sheet-foot {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
