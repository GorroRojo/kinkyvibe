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
	 * barra lateral es `SideNav.svelte` (opción C, decisión 0038: las 8 secciones, sin sub-ítems,
	 * y «Recientes», con scroll propio); las páginas de cada sección son las pestañas de arriba
	 * (`sectionTabs`), y el panel "Más" del celu es `MoreAreas.svelte`. Cada página que se abre se
	 * suma a Recientes (`$lib/admin/recentPlaces.js`, en este navegador). Arriba (y en el header
	 * del celu) está el botón global "Para revisar".
	 *
	 * Parte 2 de la opción C (gorrite, 11/10): la Puerta ya no está en la barra lateral (sí en la
	 * barra de abajo del celu); «Fijados» arriba de Recientes (`$lib/admin/pinnedPlaces.js`, se fijan
	 * desde Recientes o desde «Ir a…»); «+ Crear ▾» en vez de «+ Cargar evento» (`CreateMenu`);
	 * las pestañas de sección con contadores y, en el celu, como lista ▾ (`Tabs` con `menu`).
	 * Más ágil: una barrita arriba de todo mientras carga la página siguiente (`$navigating`), el
	 * link o botón que se tocó queda «cargando» (`data-pending`) hasta que llega, y los menús
	 * precargan la página al pasar el mouse (`data-sveltekit-preload-data="hover"`; los `load` del
	 * panel solo leen, no cambian nada).
	 *
	 * Atajos de teclado (solo en la compu): «Atajos de teclado» al pie de la barra lateral y el
	 * botón `?` de la barra de arriba abren la hoja de atajos del buscador (`openHelp`), y
	 * `ShortcutTip` los cuenta una vez. Ver `$lib/admin/shortcutHints.js`.
	 *
	 * Panel lateral (solo en la compu): cada admin elige en el menú de su cuenta si está «Siempre
	 * abierto», en «Solo íconos» (los nombres salen como cartelito, `data-tip`) o si «Se oculta»
	 * (un botón de la barra de arriba lo abre encima del contenido). Ver `$lib/admin/sidebarMode.js`.
	 */
	import '$lib/admin/panel.scss';
	import { onMount, tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/stores';
	import {
		ClipboardCheck,
		ExternalLink,
		Eye,
		EyeOff,
		Keyboard,
		LogOut,
		Menu,
		Moon,
		History,
		Pin,
		Sun,
		SunMoon,
		X
	} from '@lucide/svelte';
	import logo from '../../logo.png';
	import { logoutHref as logoutLink } from '$lib/utils/authLinks.js';
	import SearchBox from '$lib/components/admin/panel/SearchBox.svelte';
	import ShortcutTip from '$lib/components/admin/panel/ShortcutTip.svelte';
	import ConfirmDialog from '$lib/components/admin/panel/ConfirmDialog.svelte';
	import NavIcon from '$lib/components/admin/panel/NavIcon.svelte';
	import SideNav from '$lib/components/admin/panel/SideNav.svelte';
	import CreateMenu from '$lib/components/admin/panel/CreateMenu.svelte';
	import PlaceLink from '$lib/components/admin/panel/PlaceLink.svelte';
	import MoreAreas from '$lib/components/admin/panel/MoreAreas.svelte';
	import Tabs from '$lib/components/admin/panel/Tabs.svelte';
	import {
		MOBILE_TABS,
		REVIEW_LINK,
		activeNavItem,
		navItem,
		reviewCountOf,
		sectionTabs
	} from '$lib/admin/nav.js';
	import { readHideSoon, saveHideSoon } from '$lib/admin/navPrefs.js';
	import {
		addRecent,
		readRecent,
		recentParts,
		saveRecent,
		shouldRemember,
		visibleRecent
	} from '$lib/admin/recentPlaces.js';
	import {
		PIN_MAX,
		addPin,
		movePin,
		readPinned,
		removePin,
		savePinned
	} from '$lib/admin/pinnedPlaces.js';
	import {
		DEFAULT_THEME,
		THEME_HEAD_SCRIPT,
		THEME_LABELS,
		nextTheme,
		readTheme,
		saveTheme
	} from '$lib/admin/theme.js';
	import { SHEET_TAP_SLOP, sheetDragOffset, shouldCloseSheet } from '$lib/admin/sheetDrag.js';
	import {
		DEFAULT_SIDEBAR_MODE,
		SIDEBAR_MODES,
		SIDEBAR_MODE_LABELS,
		readSidebarMode,
		saveSidebarMode,
		sidebarHeadScript
	} from '$lib/admin/sidebarMode.js';

	export let data;

	const THEME_ICONS = { auto: SunMoon, light: Sun, dark: Moon };

	/** @type {import('$lib/admin/theme.js').Theme} */
	let theme = DEFAULT_THEME;
	let sheetOpen = false;
	/** "Ocultar lo que viene" (menú de usuario): cada persona, en localStorage. */
	let hideSoon = false;
	/** @type {HTMLDetailsElement | undefined} */
	let userMenu;
	/** El buscador de la barra de arriba (el que escucha el teclado y tiene la hoja de atajos). */
	/** @type {SearchBox | undefined} */
	let searchBox;
	const openShortcuts = () => searchBox?.openHelp();

	/** Panel lateral de cada admin (`sidebarMode.js`). */
	/** @type {import('$lib/admin/sidebarMode.js').SidebarMode} */
	let sidebarMode = DEFAULT_SIDEBAR_MODE;
	/** Recientes de la barra lateral (`recentPlaces.js`): todo lo guardado, sin filtrar. */
	/** @type {import('$lib/admin/recentPlaces.js').RecentPlace[]} */
	let recentAll = [];
	let recentLoaded = false;
	/** Fijados (`pinnedPlaces.js`). */
	/** @type {import('$lib/admin/pinnedPlaces.js').PinnedPlace[]} */
	let pinned = [];
	$: pinnedHrefs = pinned.map((p) => p.href);
	$: recent = visibleRecent(recentAll, $page.url.pathname, { flags, pinned: pinnedHrefs });

	/** @param {import('$lib/admin/recentPlaces.js').RecentPlace} place */
	function pin(place) {
		pinned = addPin(pinned, place, { flags });
		savePinned(user?.login, pinned);
	}
	/** @param {string} href */
	function unpin(href) {
		pinned = removePin(pinned, href);
		savePinned(user?.login, pinned);
	}
	/** @param {{ from: number, to: number }} m */
	function movePinned({ from, to }) {
		pinned = movePin(pinned, from, to);
		savePinned(user?.login, pinned);
	}

	/*
	 * «Cargando»: el link o botón que se tocó queda marcado (`data-pending`, estilo en panel.scss)
	 * mientras SvelteKit trae la página siguiente; se desmarca al llegar (o si falla). Solo se marca
	 * si de verdad empezó una navegación (un `#ancla` o un botón que no navega no quedan marcados).
	 */
	/** @type {HTMLElement | null} */
	let pressed = null;
	/** @type {HTMLElement | null} */
	let pending = null;
	/** @param {MouseEvent} e */
	function notePress(e) {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		const el = e.target instanceof Element ? e.target.closest('a[href], button') : null;
		pressed = el instanceof HTMLElement ? el : null;
	}
	function clearPending() {
		pending?.removeAttribute('data-pending');
		pending?.removeAttribute('aria-busy');
		pending = null;
	}
	$: if ($navigating && $navigating.type !== 'popstate' && pressed && !pending) {
		pending = pressed;
		pending.setAttribute('data-pending', '');
		pending.setAttribute('aria-busy', 'true');
	}
	$: if (!$navigating) {
		clearPending();
		pressed = null;
	}

	/** Suma la página que se acaba de abrir a Recientes (con el título que ya se dibujó). */
	async function rememberPage() {
		const { pathname } = $page.url;
		if (!recentLoaded) {
			recentAll = readRecent(user?.login);
			pinned = readPinned(user?.login);
			recentLoaded = true;
		}
		if (!shouldRemember(pathname, { flags, status: $page.status })) return;
		await tick();
		const heading = document.querySelector('main h1')?.textContent;
		const path = pathname.replace(/\/+$/, '') || '/';
		const parts = recentParts({ pathname: path, heading });
		recentAll = addRecent(recentAll, {
			href: path,
			label: parts.label,
			...(parts.context ? { context: parts.context } : {})
		});
		saveRecent(user?.login, recentAll);
	}

	/** «Se oculta»: si está abierto encima del contenido. */
	let drawerOpen = false;
	/** @type {HTMLButtonElement | undefined} */
	let drawerButton;
	/** @type {HTMLButtonElement | undefined} */
	let drawerClose;

	/** @param {import('$lib/admin/sidebarMode.js').SidebarMode} mode */
	function chooseSidebarMode(mode) {
		sidebarMode = mode;
		drawerOpen = false;
		saveSidebarMode(user?.login, mode);
	}

	/** @param {boolean} open */
	async function setDrawer(open) {
		if (drawerOpen === open) return;
		drawerOpen = open;
		await tick();
		(open ? drawerClose : drawerButton)?.focus();
	}

	/*
	 * Cartelito con el nombre de cada link en «Solo íconos» (al pasar el mouse o con el foco). Va
	 * con `position: fixed` porque la barra tiene scroll propio y cortaría uno absoluto. Es solo
	 * visual (`aria-hidden`): el nombre ya está en el link, oculto a la vista.
	 */
	/** @type {{ text: string, x: number, y: number } | null} */
	let tip = null;
	/** @param {Event} e */
	function showTip(e) {
		const el = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
		const rail = document.documentElement.getAttribute('data-lateral') === 'iconos';
		if (!rail || !(el instanceof HTMLElement) || !el.dataset.tip) {
			tip = null;
			return;
		}
		const r = el.getBoundingClientRect();
		tip = { text: el.dataset.tip, x: r.right + 8, y: r.top + r.height / 2 };
	}
	const hideTip = () => (tip = null);

	$: bare = $page.data?.bare === true;
	/** Una página con `wide: true` en su load (la agenda) usa todo el ancho, sin el máximo de siempre. */
	$: wide = $page.data?.wide === true;
	$: active = activeNavItem($page.url.pathname);
	// Pestañas de sección arriba de cada sección de un grupo del menú (Ajustes no: tiene portada).
	$: tabsHere = sectionTabs($page.url.pathname, { flags, counts, hideSoon });
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
		sidebarMode = readSidebarMode(user?.login);
		saveSidebarMode(user?.login, sidebarMode);
		return () => {
			document.documentElement.removeAttribute('data-theme');
			document.documentElement.removeAttribute('data-lateral');
		};
	});
	afterNavigate(() => {
		sheetOpen = false;
		drawerOpen = false;
		tip = null;
		if (userMenu) userMenu.open = false;
		rememberPage();
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
			if (drawerOpen) setDrawer(false);
			if (userMenu) userMenu.open = false;
		}
	}

	/**
	 * Barra de abajo del celu: `null` es el botón "Más". "Ventas" muestra el contador de
	 * transferencias pendientes y, cuando hay, lleva a Transferencias (lo que el número promete).
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
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- solo la clave del login, ver sidebarMode.js -->
	{@html sidebarHeadScript(data.user?.login)}
	<title>Panel · Kinky Vibe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window on:keydown={onKey} />

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions (solo anota qué se tocó) -->
<div class="kv-panel" on:click|capture={notePress}>
	{#if $navigating && !bare}
		<div class="loadbar" role="progressbar" aria-label="Cargando la página"></div>
	{/if}
	<ConfirmDialog />
	{#if bare}
		<slot />
	{:else}
		<div class="app">
			<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
			<aside
				class="side"
				class:open={drawerOpen}
				id="kv-side"
				aria-label="Secciones del panel"
				on:pointerover={showTip}
				on:focusin={showTip}
				on:pointerleave={hideTip}
				on:focusout={hideTip}
				on:scroll={hideTip}
			>
				<button
					type="button"
					class="drawer-x"
					aria-label="Cerrar el panel lateral"
					bind:this={drawerClose}
					on:click={() => setDrawer(false)}><X size={20} aria-hidden="true" /></button
				>
				<a class="brand" href="/admin" data-tip="Inicio del panel">
					<img src={logo} alt="Kinky Vibe" width="64" height="64" />
					<span class="pill">Panel de admin</span>
				</a>
				<SideNav
					{active}
					{counts}
					{flags}
					{recent}
					{pinned}
					on:pin={(e) => pin(e.detail)}
					on:unpin={(e) => unpin(e.detail)}
					on:move={(e) => movePinned(e.detail)}
				/>
				<div class="foot">
					<button
						type="button"
						class="nav"
						on:click={toggleTheme}
						data-tip={THEME_LABELS[theme].label}
						><svelte:component this={THEME_ICONS[theme]} size={18} aria-hidden="true" /><span
							class="lbl">{THEME_LABELS[theme].label}</span
						></button
					>
					<a class="nav" href="/" target="_blank" rel="noopener" data-tip="Ver el sitio"
						><ExternalLink size={18} aria-hidden="true" /><span class="lbl">Ver el sitio</span></a
					>
					<button
						type="button"
						class="nav keys"
						on:click={openShortcuts}
						data-tip="Atajos de teclado (?)"
						><Keyboard size={18} aria-hidden="true" /><span class="lbl">Atajos de teclado</span><kbd
							aria-hidden="true">?</kbd
						></button
					>
				</div>
			</aside>

			<div class="main">
				<header class="top">
					<button
						type="button"
						class="drawerbtn"
						aria-label="Abrir el panel lateral"
						title="Secciones del panel"
						aria-expanded={drawerOpen}
						aria-controls="kv-side"
						bind:this={drawerButton}
						on:click={() => setDrawer(!drawerOpen)}><Menu size={20} aria-hidden="true" /></button
					>
					<SearchBox
						bind:this={searchBox}
						{hideSoon}
						pinned={pinnedHrefs}
						pinFull={pinned.length >= PIN_MAX}
						pinnedPlaces={pinned}
						recentPlaces={recent}
						on:theme={toggleTheme}
						on:hidesoon={toggleHideSoon}
						on:pin={(e) => pin(e.detail)}
						on:unpin={(e) => unpin(e.detail)}
					/>
					<a
						class="review"
						href={REVIEW_LINK.href}
						title={reviewCount ? `${REVIEW_LINK.label}: ${reviewCount}` : REVIEW_LINK.label}
						><ClipboardCheck size={18} aria-hidden="true" />{REVIEW_LINK.label}
						{#if reviewCount}<span class="count">{reviewCount}</span>{/if}</a
					>
					<CreateMenu {flags} {hideSoon} />
					<button
						type="button"
						class="keysbtn"
						title="Atajos de teclado (?)"
						aria-label="Atajos de teclado"
						on:click={openShortcuts}
						><Keyboard size={18} aria-hidden="true" /><kbd aria-hidden="true">?</kbd></button
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
							<fieldset class="lateral">
								<legend>Panel lateral</legend>
								{#each SIDEBAR_MODES as mode (mode)}
									<label
										><input
											type="radio"
											name="kv-lateral"
											value={mode}
											checked={sidebarMode === mode}
											on:change={() => chooseSidebarMode(mode)}
										/>{SIDEBAR_MODE_LABELS[mode]}</label
									>
								{/each}
							</fieldset>
							<a href="/" target="_blank" rel="noopener"
								><ExternalLink size={18} aria-hidden="true" />Ver el sitio</a
							>
							<a href={logoutHref} data-sveltekit-reload
								><LogOut size={18} aria-hidden="true" />Salir</a
							>
						</div>
					</details>
				</header>

				<header class="mtop">
					<a href="/admin" class="mlogo" aria-label="Inicio del panel"
						><img src={logo} alt="Kinky Vibe" width="44" height="44" /></a
					>
					<SearchBox
						compact
						hotkeys={false}
						{hideSoon}
						pinned={pinnedHrefs}
						pinFull={pinned.length >= PIN_MAX}
						pinnedPlaces={pinned}
						recentPlaces={recent}
						on:theme={toggleTheme}
						on:hidesoon={toggleHideSoon}
						on:pin={(e) => pin(e.detail)}
						on:unpin={(e) => unpin(e.detail)}
					/>
					<a class="site" href="/" target="_blank" rel="noopener" title="Ver el sitio"
						>Sitio<ExternalLink size={14} aria-hidden="true" /></a
					>
					<CreateMenu compact {flags} {hideSoon} />
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
					{#if tabsHere}<Tabs label={tabsHere.label} tabs={tabsHere.tabs} menu />{/if}
					<slot />
				</main>
			</div>
		</div>

		<ShortcutTip onShowShortcuts={openShortcuts} />

		{#if drawerOpen}
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
			<div class="drawer-scrim" on:click={() => setDrawer(false)}></div>
		{/if}
		{#if tip}
			<div class="side-tip" aria-hidden="true" style:left="{tip.x}px" style:top="{tip.y}px">
				{tip.text}
			</div>
		{/if}

		<nav class="tabbar" aria-label="Secciones principales" data-sveltekit-preload-data="hover">
			{#each mobileTabs as tab, i (i)}
				{#if tab}
					<a
						href={countOf(tab.counterItem) ? tab.counterItem.href : tab.item.href}
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
					{#if pinned.length || recent.length}
						<div class="places" data-sveltekit-preload-data="hover">
							{#if pinned.length}
								<p class="plabel"><Pin size={14} aria-hidden="true" />Fijados</p>
								<ul role="list">
									{#each pinned as p (p.href)}<li><PlaceLink place={p} /></li>{/each}
								</ul>
							{/if}
							{#if recent.length}
								<p class="plabel"><History size={14} aria-hidden="true" />Recientes</p>
								<ul role="list">
									{#each recent.slice(0, 5) as r (r.href)}<li><PlaceLink place={r} /></li>{/each}
								</ul>
							{/if}
						</div>
					{/if}
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
							><LogOut size={16} aria-hidden="true" />Salir</a
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
	/* Con las pistas de atajos «g x» (NavShortcut, misma consulta que HINTS_MEDIA) la barra es más
	   ancha, así «Ventas en el tiempo» o «Árbol de etiquetas» entran en un renglón. */
	@media (hover: hover) and (pointer: fine) and (min-width: 1100px) {
		.app {
			grid-template-columns: 18rem minmax(0, 1fr);
		}
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
		/* Scroll propio: si el menú es más alto que la pantalla, la barra scrollea sola y no se
		   mueve con la página (SideNav lleva a la vista el link actual al cargar). */
		position: sticky;
		top: 0;
		height: 100vh;
		height: 100dvh;
		max-height: 100vh;
		max-height: 100dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* Compacta (gorrite, 11/10): logo más chico y menos aire entre renglones. */
	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3xs);
		padding: 0 0 var(--space-2xs);
		text-decoration: none;
		img {
			width: 3rem;
			height: 3rem;
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
		padding: var(--space-3xs) var(--space-xs);
		position: relative;
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
		margin-top: var(--space-3xs);
		border-top: 1px solid var(--line);
		padding-top: var(--space-2xs);
		.nav {
			font-weight: 400;
			color: var(--text);
		}
	}

	/* Atajos de teclado: solo en una compu con mouse (la consulta de HINTS_MEDIA, sin el ancho). */
	.keys,
	.keysbtn {
		display: none;
	}
	.foot .keys kbd,
	.keysbtn kbd {
		font: inherit;
		font-size: var(--text-xs);
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 0.4em;
		padding: 0 0.4em;
		color: var(--muted);
	}
	.foot .keys kbd {
		margin-left: auto;
	}
	.keysbtn {
		align-items: center;
		gap: 0.3rem;
		flex: none;
		margin-left: auto;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--muted);
		border-radius: 3em;
		padding: 0.35em 0.6em;
		cursor: pointer;
		&:hover {
			color: var(--text);
			background: var(--surface-2);
		}
	}
	@media (hover: hover) and (pointer: fine) {
		.keys,
		.keysbtn {
			display: flex;
		}
		.keysbtn + .usermenu {
			margin-left: 0;
		}
	}

	.main {
		min-width: 0;
	}

	/* Panel lateral de cada admin (`data-lateral` en <html>, sidebarMode.js). Sin atributo:
	   «Siempre abierto». El botón de abrir y la X de cerrar solo existen con «Se oculta». */
	.drawerbtn,
	.drawer-x {
		display: none;
	}
	@media (min-width: 900px) {
		/* «Solo íconos»: una franja angosta; los nombres, para lectores de pantalla y en el
		   cartelito (.side-tip). */
		:global(html[data-lateral='iconos']) {
			.app {
				grid-template-columns: 3.75rem minmax(0, 1fr);
			}
			.side {
				padding-inline: var(--space-3xs);
				scrollbar-width: none;
			}
			.brand img {
				width: 2.5rem;
				height: 2.5rem;
			}
			.pill,
			.foot kbd {
				display: none;
			}
			.lbl {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip: rect(0 0 0 0);
			}
			.nav {
				justify-content: center;
				padding-inline: 0;
			}
		}
		/* «Se oculta»: no ocupa lugar; el botón de arriba lo abre encima del contenido. */
		:global(html[data-lateral='oculto']) {
			.app {
				display: block;
			}
			.side {
				position: fixed;
				left: 0;
				top: 0;
				z-index: 30;
				width: min(18rem, 85vw);
				transform: translateX(-105%);
				visibility: hidden;
				transition:
					transform 180ms ease-out,
					visibility 0s 180ms;
				&.open {
					transform: none;
					visibility: visible;
					transition: transform 180ms ease-out;
					box-shadow: var(--shadow-2);
				}
			}
			.drawerbtn {
				display: grid;
			}
			.drawer-x {
				display: grid;
				align-self: flex-end;
			}
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.side {
			transition: none !important;
		}
	}
	.drawerbtn,
	.drawer-x {
		flex: none;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 0;
		border-radius: 50%;
		background: var(--surface);
		color: var(--accent);
		cursor: pointer;
		&:hover {
			background: var(--surface-2);
		}
	}
	.drawer-x {
		background: none;
		width: 2.3rem;
		height: 2.3rem;
	}
	.drawer-scrim {
		position: fixed;
		inset: 0;
		background: var(--scrim);
		z-index: 29;
	}
	.side-tip {
		position: fixed;
		z-index: 40;
		transform: translateY(-50%);
		pointer-events: none;
		background: var(--text);
		color: var(--surface);
		font-size: var(--text-xs);
		font-weight: 700;
		white-space: nowrap;
		border-radius: var(--radius-s);
		padding: var(--space-3xs) var(--space-2xs);
		box-shadow: var(--shadow-1);
	}
	@media (max-width: 899.98px) {
		.side-tip,
		.drawer-scrim {
			display: none;
		}
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
			.lateral {
				border: 0;
				border-top: 1px solid var(--line);
				border-bottom: 1px solid var(--line);
				margin: var(--space-3xs) 0;
				padding: var(--space-3xs) 0;
				display: flex;
				flex-direction: column;
				legend {
					float: left;
					width: 100%;
					padding: var(--space-3xs) var(--space-2xs) 0;
					font-size: var(--text-xs);
					color: var(--muted);
				}
				label {
					display: flex;
					align-items: center;
					gap: 0.6em;
					padding: var(--space-3xs) var(--space-2xs);
					border-radius: var(--radius-s);
					cursor: pointer;
					&:hover {
						background: var(--surface-2);
					}
				}
				input {
					accent-color: var(--link);
					margin: 0;
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
	/* Barrita de carga arriba de todo (mientras llega la página siguiente). Aparece después de un
	   instante, así una navegación rápida no parpadea. */
	.loadbar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 60;
		pointer-events: none;
		overflow: hidden;
		opacity: 0;
		animation: loadbar-in 0s 120ms forwards;
		&::before {
			content: '';
			position: absolute;
			inset: 0;
			background: var(--link);
			transform-origin: left;
			animation: loadbar-grow 8s cubic-bezier(0.1, 0.7, 0.3, 1) forwards;
		}
	}
	@keyframes loadbar-in {
		to {
			opacity: 1;
		}
	}
	@keyframes loadbar-grow {
		from {
			transform: scaleX(0.05);
		}
		to {
			transform: scaleX(0.92);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		/* Sin animaciones (panel.scss las apaga todas): una barra quieta, a medio tono. */
		.loadbar {
			opacity: 1;
		}
		.loadbar::before {
			animation: none;
			transform: scaleX(1);
			opacity: 0.6;
		}
	}
	/* Fijados y Recientes en el panel «Más» del celu. */
	.places {
		margin-top: var(--space-s);
		ul {
			list-style: none;
			margin: 0 0 var(--space-2xs);
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		li {
			display: flex;
		}
		:global(.place) {
			min-height: var(--tap);
		}
	}
	.plabel {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: var(--space-2xs) 0 var(--space-3xs);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.sheet-foot {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2xs);
		margin-top: 1rem;
	}
</style>
