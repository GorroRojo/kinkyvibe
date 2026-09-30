<script>
	/**
	 * Marco del panel de admin: barra lateral (≥ 900 px), barra de arriba con el buscador, y en el
	 * celu un header chico + barra de abajo con 5 lugares y el panel "Más".
	 *
	 * Pantalla completa sin marco (modo puerta): la página devuelve `bare: true` en su `load`
	 * (+page.js o +page.server.js), por ejemplo `return { bare: true, ... }`. Entonces este layout
	 * solo pone los tokens del panel (`.kv-panel`, con modo oscuro) y la página, sin menús.
	 *
	 * Las secciones salen de `$lib/admin/nav.js` (no agregar links a mano acá).
	 */
	import '$lib/admin/panel.scss';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import logo from '../../logo.png';
	import SearchBox from '$lib/components/admin/panel/SearchBox.svelte';
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
	$: logoutHref = '/logout?redirectTo=/';

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
					<img src={logo} alt="" width="40" height="40" />
					<span><b>Panel</b><small>de admin</small></span>
				</a>
				<nav>
					{#each navGroupItems(null) as item (item.id)}
						<a
							class="nav"
							class:on={active?.id === item.id}
							href={navLink(item)}
							aria-current={active?.id === item.id ? 'page' : undefined}
							><span class="ico" aria-hidden="true">{item.emoji}</span>{item.label}</a
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
									><span class="ico" aria-hidden="true">{item.emoji}</span>{item.label}
									{#if countOf(item)}<span class="count" title="Pendientes">{countOf(item)}</span
										>{/if}</a
								>
							{:else}
								<span class="nav off" aria-disabled="true"
									><span class="ico" aria-hidden="true">{item.emoji}</span>{item.label}<span
										class="soon">próximamente</span
									></span
								>
							{/if}
						{/each}
					{/each}
				</nav>
				<div class="foot">
					<button type="button" class="nav" on:click={toggleTheme}
						><span class="ico" aria-hidden="true">{THEME_LABELS[theme].icon}</span>{THEME_LABELS[
							theme
						].label}</button
					>
					<a class="nav" href="/" target="_blank" rel="noopener"
						><span class="ico" aria-hidden="true">↗</span>Ver el sitio</a
					>
				</div>
			</aside>

			<div class="main">
				<header class="top">
					<SearchBox />
					<a class="kv-btn" href="/admin/eventos/nuevo">＋ Cargar evento</a>
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
								>{THEME_LABELS[theme].icon} {THEME_LABELS[theme].label}</button
							>
							<a href="/" target="_blank" rel="noopener">↗ Ver el sitio</a>
							<a href={logoutHref} data-sveltekit-reload>🚪 Cerrar sesión</a>
						</div>
					</details>
				</header>

				<header class="mtop">
					<a href="/admin" class="mlogo" aria-label="Inicio del panel"
						><img src={logo} alt="" width="34" height="34" /></a
					>
					<SearchBox compact hotkeys={false} />
					<a class="site" href="/" target="_blank" rel="noopener" title="Ver el sitio">Sitio ↗</a>
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
						<span class="ti" aria-hidden="true">{tab.item.emoji}</span>{tab.label}
						{#if countOf(tab.counterItem)}<span class="count">{countOf(tab.counterItem)}</span>{/if}
					</a>
				{:else}
					<button
						type="button"
						class:on={sheetOpen}
						aria-expanded={sheetOpen}
						aria-controls="kv-more"
						on:click={() => (sheetOpen = !sheetOpen)}
						><span class="ti" aria-hidden="true">☰</span>Más</button
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
							>×</button
						>
					</div>
					{#each NAV_GROUPS as group (group.id)}
						<div class="gl">{group.label}</div>
						<div class="cards">
							{#each navGroupItems(group.id) as item (item.id)}
								{@const href = navLink(item)}
								{#if href}
									<a {href} class="tile" class:hl={item.highlight} class:on={active?.id === item.id}
										><span aria-hidden="true">{item.emoji}</span>{item.label}
										{#if countOf(item)}<span class="count">{countOf(item)}</span>{/if}</a
									>
								{:else}
									<span class="tile off" aria-disabled="true"
										><span aria-hidden="true">{item.emoji}</span>{item.label}<small
											>próximamente</small
										></span
									>
								{/if}
							{/each}
						</div>
					{/each}
					<div class="sheet-foot">
						<button type="button" class="kv-btn ghost" on:click={toggleTheme}
							>{THEME_LABELS[theme].icon} {THEME_LABELS[theme].label}</button
						>
						<a class="kv-btn ghost" href="/" target="_blank" rel="noopener">↗ Ver el sitio</a>
						<a class="kv-btn ghost" href={logoutHref} data-sveltekit-reload>🚪 Cerrar sesión</a>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style lang="scss">
	.app {
		display: grid;
		grid-template-columns: 15rem minmax(0, 1fr);
		min-height: 100vh;
	}
	.side {
		background: var(--surface);
		box-shadow: var(--shadow);
		padding: 1rem 0.7rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow: auto;
		nav {
			display: flex;
			flex-direction: column;
			gap: 0.15rem;
		}
	}
	.brand {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding: 0.2rem 0.6rem 1rem;
		text-decoration: none;
		img {
			width: 2.5rem;
			height: 2.5rem;
			object-fit: contain;
		}
		b {
			display: block;
			font-size: 1.05rem;
		}
		small {
			color: var(--link);
			font-size: 0.78rem;
		}
	}
	.gl {
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted);
		padding: 0.8rem 0.7rem 0.25rem;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.7rem;
		border-radius: 0.8em;
		border: 0;
		background: none;
		text-align: left;
		width: 100%;
		text-decoration: none;
		cursor: pointer;
		color: var(--text);
		&:hover {
			background: var(--surface-2);
			color: var(--text);
		}
		&.on {
			background: var(--link-bg);
			color: var(--link);
			font-weight: 700;
		}
		&.off {
			color: var(--muted);
			cursor: default;
			&:hover {
				background: none;
			}
		}
		.ico {
			width: 1.3rem;
			text-align: center;
			flex: none;
		}
	}
	.count {
		margin-left: auto;
		background: var(--counter);
		color: var(--counter-ink);
		font-size: 0.72rem;
		font-weight: 700;
		border-radius: 1em;
		padding: 0 0.5em;
		font-variant-numeric: tabular-nums;
	}
	.soon {
		margin-left: auto;
		font-size: 0.65rem;
		background: var(--warn-bg);
		color: var(--warn);
		border-radius: 1em;
		padding: 0.1em 0.5em;
		white-space: nowrap;
	}
	.foot {
		margin-top: auto;
		border-top: 1px solid var(--line);
		padding-top: 0.5rem;
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
			width: 2.2rem;
			height: 2.2rem;
			border-radius: 50%;
			display: grid;
			place-items: center;
			object-fit: cover;
			background: linear-gradient(135deg, var(--2), var(--1));
			color: #fff;
			font-weight: 700;
		}
		.pop {
			position: absolute;
			right: 0;
			top: calc(100% + 0.4rem);
			background: var(--surface);
			border: 1px solid var(--line);
			border-radius: 0.8rem;
			box-shadow: var(--shadow);
			min-width: 14rem;
			padding: 0.4rem;
			display: flex;
			flex-direction: column;
			z-index: 10;
			> a,
			> button {
				text-align: left;
				background: none;
				border: 0;
				padding: 0.5rem 0.6rem;
				border-radius: 0.6em;
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
			padding: 0.6rem 16px;
			position: sticky;
			top: 0;
			background: var(--bg);
			z-index: 4;
			.mlogo img {
				display: block;
				width: 2.1rem;
				height: 2.1rem;
				object-fit: contain;
			}
			.site {
				font-size: 0.8rem;
				font-weight: 700;
				white-space: nowrap;
				text-decoration: none;
				color: var(--link);
			}
		}
		.page {
			padding: 0.2rem 16px calc(6.5rem + env(safe-area-inset-bottom, 0px));
		}
		.tabbar {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			background: var(--surface);
			box-shadow: 0 -0.1rem 0.6rem rgba(0, 0, 0, 0.08);
			padding: 0.35rem 0.3rem calc(env(safe-area-inset-bottom, 0px) + 0.35rem);
			z-index: 10;
			a,
			button {
				position: relative;
				border: 0;
				background: none;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.1rem;
				font-size: 0.68rem;
				color: var(--muted);
				padding: 0.2rem 0;
				text-decoration: none;
				cursor: pointer;
				&.on {
					color: var(--link);
					font-weight: 700;
				}
			}
			.ti {
				font-size: 1.25rem;
				line-height: 1.3;
			}
			.door .ti {
				background: var(--accent);
				color: #fff;
				width: 3.2rem;
				height: 3.2rem;
				border-radius: 50%;
				display: grid;
				place-items: center;
				margin-top: -1.4rem;
				box-shadow: 0 0.2rem 0.6rem rgba(200, 30, 140, 0.4);
			}
			.count {
				position: absolute;
				top: 0;
				left: calc(50% + 0.5rem);
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
		border-radius: 1.2rem 1.2rem 0 0;
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
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 50%;
		border: 0;
		padding: 0;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, var(--2), var(--1));
		color: #fff;
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
			background: var(--surface-2);
			border-radius: 50%;
			width: 2.2rem;
			height: 2.2rem;
			font-size: 1.2rem;
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
		border-radius: 0.9rem;
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
			outline: 2px solid var(--link);
		}
		&.off {
			font-weight: 400;
			color: var(--muted);
			background: repeating-linear-gradient(
				135deg,
				var(--surface),
				var(--surface) 8px,
				var(--surface-2) 8px,
				var(--surface-2) 16px
			);
			flex-wrap: wrap;
			small {
				width: 100%;
				font-size: 0.68rem;
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
