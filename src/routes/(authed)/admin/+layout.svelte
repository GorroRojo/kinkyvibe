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
	 * Las secciones y sus íconos salen de `$lib/admin/nav.js` (no agregar links a mano acá): la
	 * barra lateral es `SideNav.svelte` (áreas que se abren de a una) y el panel "Más" del celu,
	 * `MoreAreas.svelte`. Arriba (y en el header del celu) está el botón global "Para revisar".
	 */
	import '$lib/admin/panel.scss';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		ClipboardCheck,
		ExternalLink,
		Eye,
		EyeOff,
		LogOut,
		Menu,
		Moon,
		Plus,
		Sun,
		SunMoon,
		X
	} from '@lucide/svelte';
	import logo from '../../logo.png';
	import { logoutHref as logoutLink } from '$lib/utils/authLinks.js';
	import SearchBox from '$lib/components/admin/panel/SearchBox.svelte';
	import ConfirmDialog from '$lib/components/admin/panel/ConfirmDialog.svelte';
	import NavIcon from '$lib/components/admin/panel/NavIcon.svelte';
	import SideNav from '$lib/components/admin/panel/SideNav.svelte';
	import MoreAreas from '$lib/components/admin/panel/MoreAreas.svelte';
	import {
		MOBILE_TABS,
		REVIEW_LINK,
		activeNavItem,
		navItem,
		reviewCountOf
	} from '$lib/admin/nav.js';
	import { readHideSoon, saveHideSoon } from '$lib/admin/navPrefs.js';
	import {
		DEFAULT_THEME,
		THEME_HEAD_SCRIPT,
		THEME_LABELS,
		nextTheme,
		readTheme,
		saveTheme
	} from '$lib/admin/theme.js';
	import { SHEET_TAP_SLOP, sheetDragOffset, shouldCloseSheet } from '$lib/admin/sheetDrag.js';

	export let data;

	const THEME_ICONS = { auto: SunMoon, light: Sun, dark: Moon };

	/** @type {import('$lib/admin/theme.js').Theme} */
	let theme = DEFAULT_THEME;
	let sheetOpen = false;
	/** "Ocultar lo que viene" (menú de usuario): cada persona, en localStorage. */
	let hideSoon = false;
	/** @type {HTMLDetailsElement | undefined} */
	let userMenu;

	$: bare = $page.data?.bare === true;
	/** Una página con `wide: true` en su load (la agenda) usa todo el ancho, sin el máximo de siempre. */
	$: wide = $page.data?.wide === true;
	$: active = activeNavItem($page.url.pathname);
	/** @type {Record<string, number>} */
	$: counts = data.panelCounts ?? {};
	/** @type {Record<string, boolean>} */
	$: flags = data.navFlags ?? {};
	$: reviewCount = reviewCountOf(counts);
	$: user = data.user;
	let avatarFailed = false;
	$: avatar = avatarFailed
		? ''
		: user?.avatar_url ||
			(user?.login ? `https://github.com/${encodeURIComponent(user.login)}.png` : '');
	$: initial = (user?.name || user?.login || '?').slice(0, 1).toUpperCase();
	// Al salir del panel se vuelve al inicio del sitio (el panel pide sesión).
	const logoutHref = logoutLink({ pathname: '/', search: '' });

	/** @param {import('$lib/admin/nav.js').NavItem | undefined} item */
	const countOf = (item) => (item?.counter ? (counts[item.counter] ?? 0) : 0);

	/** @type {HTMLImageElement | undefined} */
	let avatarImg;
	onMount(() => {
		// La imagen puede haber fallado antes de que Svelte escuchara `error` (render del servidor).
		if (avatarImg?.complete && avatarImg.naturalWidth === 0) avatarFailed = true;
		theme = readTheme();
		saveTheme(theme);
		hideSoon = readHideSoon();
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

	function toggleHideSoon() {
		hideSoon = !hideSoon;
		saveHideSoon(hideSoon);
	}

	/*
	 * Deslizar para cerrar el panel "Más": se arrastra desde la manija o el encabezado de la hoja
	 * (el resto de la hoja scrollea normal). Si se suelta lejos o con un tirón rápido se cierra;
	 * si no, vuelve a su lugar. Con movimiento reducido no hay animaciones.
	 */
	/** @type {HTMLDivElement | undefined} */
	let sheetEl;
	let dragY = 0;
	let dragging = false;
	let closing = false;
	/** @type {{ id: number, startY: number, lastY: number, lastT: number, velocity: number } | null} */
	let drag = null;

	$: if (!sheetOpen) {
		dragY = 0;
		dragging = false;
		closing = false;
		drag = null;
	}

	const reducedMotion = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	/** @param {PointerEvent} e */
	function dragStart(e) {
		if (closing || (e.pointerType === 'mouse' && e.button !== 0)) return;
		// Los botones del encabezado (cerrar) siguen siendo botones.
		if (e.target instanceof Element && e.target.closest('button, a')) return;
		drag = {
			id: e.pointerId,
			startY: e.clientY,
			lastY: e.clientY,
			lastT: e.timeStamp,
			velocity: 0
		};
	}

	/** @param {PointerEvent} e */
	function dragMove(e) {
		if (!drag || e.pointerId !== drag.id) return;
		const offset = sheetDragOffset(drag.startY, e.clientY);
		if (!dragging) {
			if (offset < SHEET_TAP_SLOP) return;
			dragging = true;
			/** @type {Element} */ (e.currentTarget).setPointerCapture?.(e.pointerId);
		}
		const dt = e.timeStamp - drag.lastT;
		if (dt > 0) drag.velocity = (e.clientY - drag.lastY) / dt;
		drag.lastY = e.clientY;
		drag.lastT = e.timeStamp;
		dragY = offset;
	}

	/** @param {PointerEvent} e */
	function dragEnd(e) {
		if (!drag || e.pointerId !== drag.id) return;
		const { velocity } = drag;
		drag = null;
		if (!dragging) return;
		dragging = false;
		const height = sheetEl?.offsetHeight ?? 0;
		if (e.type !== 'pointercancel' && shouldCloseSheet({ offset: dragY, velocity, height })) {
			if (reducedMotion()) {
				sheetOpen = false;
				return;
			}
			// Termina de bajar y recién ahí se cierra (ver on:transitionend).
			closing = true;
			dragY = height + 16;
			setTimeout(() => {
				if (closing) sheetOpen = false;
			}, 400);
		} else {
			dragY = 0;
		}
	}

	/** @param {TransitionEvent} e */
	function sheetTransitionEnd(e) {
		if (closing && e.target === sheetEl && e.propertyName === 'transform') sheetOpen = false;
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'Escape') {
			sheetOpen = false;
			if (userMenu) userMenu.open = false;
		}
	}

	/**
	 * Barra de abajo del celu: `null` es el botón "Más". "Ventas" muestra el contador de
	 * transferencias pendientes.
	 * @type {({ item: import('$lib/admin/nav.js').NavItem, label: string, counterItem: import('$lib/admin/nav.js').NavItem } | null)[]}
	 */
	const mobileTabs = MOBILE_TABS.map((id) => {
		const item = navItem(id);
		if (!item) return null;
		if (id === 'entradas') {
			const transfers = navItem('entradas-transferencias') ?? item;
			return { item, label: 'Ventas', counterItem: transfers };
		}
		return { item, label: item.label, counterItem: item };
	});
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- string fijo, ver theme.js -->
	{@html THEME_HEAD_SCRIPT}
	<title>Panel · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window on:keydown={onKey} />

<div class="kv-panel">
	<ConfirmDialog />
	{#if bare}
		<slot />
	{:else}
		<div class="app">
			<aside class="side" aria-label="Secciones del panel">
				<a class="brand" href="/admin">
					<img src={logo} alt="Kinky Vibe" width="64" height="64" />
					<span class="pill">Panel de admin</span>
				</a>
				<SideNav {active} {counts} {flags} {hideSoon} />
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
					<a
						class="review"
						href={REVIEW_LINK.href}
						title={reviewCount ? `${REVIEW_LINK.label}: ${reviewCount}` : REVIEW_LINK.label}
						><ClipboardCheck size={18} aria-hidden="true" />{REVIEW_LINK.label}
						{#if reviewCount}<span class="count">{reviewCount}</span>{/if}</a
					>
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
							<button type="button" aria-pressed={hideSoon} on:click={toggleHideSoon}
								><svelte:component
									this={hideSoon ? Eye : EyeOff}
									size={18}
									aria-hidden="true"
								/>{hideSoon ? 'Mostrar lo que viene' : 'Ocultar lo que viene'}</button
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
						><img src={logo} alt="Kinky Vibe" width="44" height="44" /></a
					>
					<SearchBox compact hotkeys={false} />
					<a class="site" href="/" target="_blank" rel="noopener" title="Ver el sitio"
						>Sitio<ExternalLink size={14} aria-hidden="true" /></a
					>
					<a
						class="mreview"
						href={REVIEW_LINK.href}
						aria-label={reviewCount ? `${REVIEW_LINK.label}: ${reviewCount}` : REVIEW_LINK.label}
						><ClipboardCheck size={20} aria-hidden="true" />{#if reviewCount}<span class="count"
								>{reviewCount}</span
							>{/if}</a
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

				<main class="page" class:wide>
					<slot />
				</main>
			</div>
		</div>

		<nav class="tabbar" aria-label="Secciones principales">
			{#each mobileTabs as tab, i (i)}
				{#if tab}
					<a
						href={tab.item.href}
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
				<div
					class="sheet"
					class:dragging
					id="kv-more"
					role="dialog"
					aria-label="Todas las secciones"
					bind:this={sheetEl}
					style:transform={dragY ? `translateY(${dragY}px)` : undefined}
					on:transitionend={sheetTransitionEnd}
				>
					<div
						class="drag"
						title="Deslizá hacia abajo para cerrar"
						on:pointerdown={dragStart}
						on:pointermove={dragMove}
						on:pointerup={dragEnd}
						on:pointercancel={dragEnd}
					>
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
							<button
								type="button"
								class="x"
								aria-label="Cerrar"
								on:click={() => (sheetOpen = false)}><X size={20} aria-hidden="true" /></button
							>
						</div>
					</div>
					<MoreAreas {active} {counts} {flags} {hideSoon} />
					<div class="sheet-foot">
						<button
							type="button"
							class="kv-btn ghost small"
							aria-pressed={hideSoon}
							on:click={toggleHideSoon}
							><svelte:component
								this={hideSoon ? Eye : EyeOff}
								size={16}
								aria-hidden="true"
							/>{hideSoon ? 'Mostrar lo que viene' : 'Ocultar lo que viene'}</button
						>
						<button type="button" class="kv-btn ghost small" on:click={toggleTheme}
							><svelte:component
								this={THEME_ICONS[theme]}
								size={16}
								aria-hidden="true"
							/>{THEME_LABELS[theme].label}</button
						>
						<a class="kv-btn small" href="/" target="_blank" rel="noopener"
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
		padding: var(--space-xs) var(--space-xs);
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow: auto;
	}
	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0 var(--space-xs);
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
		font-size: var(--text-xs);
	}
	.nav {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: 0.45rem var(--space-xs);
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
	}
	.count {
		margin-left: auto;
		background: var(--counter);
		color: var(--counter-ink);
		font-size: var(--text-xs);
		font-weight: 700;
		border-radius: var(--radius-m);
		padding: 0 0.55em;
		font-variant-numeric: tabular-nums;
	}
	/* Botón global "Para revisar": amarillo como los contadores. */
	.review {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		white-space: nowrap;
		text-decoration: none;
		font-weight: 700;
		color: var(--text);
		border: 2px solid var(--counter);
		background: color-mix(in srgb, var(--counter) 18%, var(--surface));
		border-radius: 3em;
		padding: 0.3em 0.9em;
		.count {
			margin-left: 0.1rem;
		}
		&:hover {
			color: var(--text);
			background: color-mix(in srgb, var(--counter) 35%, var(--surface));
		}
	}
	.foot {
		margin-top: 0.5rem;
		border-top: 1px solid var(--line);
		padding-top: var(--space-2xs);
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
		gap: var(--space-xs);
		align-items: center;
		padding: var(--space-xs) var(--space-m);
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
			box-shadow: var(--shadow-2);
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
				padding: var(--space-2xs) var(--space-2xs);
				border-radius: var(--radius-s);
				text-decoration: none;
				cursor: pointer;
				&:hover {
					background: var(--surface-2);
				}
			}
			.who {
				padding: 0.4rem var(--space-2xs) var(--space-2xs);
				border-bottom: 1px solid var(--line);
				margin-bottom: 0.3rem;
				display: flex;
				flex-direction: column;
			}
		}
	}
	.page {
		padding: var(--space-3xs) var(--space-m) var(--space-3xl);
		max-width: 80rem;
	}
	.page.wide {
		max-width: none;
	}
	@media (min-width: 900px) {
		.page.wide {
			padding-inline: var(--space-s);
		}
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
			gap: var(--space-2xs);
			align-items: center;
			padding: var(--space-2xs) var(--space-xs);
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
				font-size: var(--text-xs);
				white-space: nowrap;
				text-decoration: none;
				color: white;
				background: var(--2);
				border-radius: 3em;
				padding: 0.15em 0.6em;
			}
			.mreview {
				position: relative;
				flex: none;
				width: 2.2rem;
				height: 2.2rem;
				border-radius: 50%;
				display: grid;
				place-items: center;
				background: var(--surface);
				color: var(--text);
				.count {
					position: absolute;
					top: -0.25rem;
					right: -0.35rem;
					margin: 0;
				}
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
				font-size: var(--text-xs);
				font-weight: 700;
				color: var(--accent);
				padding: var(--space-3xs) 0;
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
				box-shadow: var(--shadow-2);
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
		transition: transform 200ms ease-out;
		animation: sheet-in 200ms ease-out;
		&.dragging {
			transition: none;
		}
		.drag {
			// El gesto lo maneja el JS: el navegador no scrollea ni hace zoom desde acá.
			touch-action: none;
			cursor: grab;
			user-select: none;
			margin: -0.5rem -16px 0;
			padding: var(--space-2xs) var(--space-xs) 0.2rem;
		}
		&.dragging .drag {
			cursor: grabbing;
		}
		.grab {
			width: 3rem;
			height: 0.3rem;
			border-radius: var(--radius-m);
			background: var(--line);
			margin: 0 auto 0.6rem;
		}
	}
	@keyframes sheet-in {
		from {
			transform: translateY(100%);
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
		gap: var(--space-2xs);
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
	.sheet-foot {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		margin-top: 1rem;
	}
</style>
