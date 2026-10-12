<script>
	/**
	 * Pestañas como links (cada una es una URL), con el estilo del menú del sitio: rosas en negrita
	 * y la actual en una tarjeta blanca con texto violeta (decisión de gorrite, 4/10; el menú
	 * lateral sigue con violeta sobre lila). En el celu se deslizan de costado.
	 * Props: `tabs`: { href, label, count?, soon?, icon? }[] (`icon`: componente de Lucide,
	 * opcional); `current` (opcional): el href activo. Si no se pasa, se usa la URL actual.
	 * `label` (opcional): nombre de la barra para los lectores de pantalla.
	 * Íconos (`aria-hidden`, de 16 px; el nombre sigue siendo el de la pestaña): si todas tienen y
	 * en una pantalla angosta (< 600 px) no entran con sus nombres, quedan solo los íconos y el
	 * nombre de la actual. Las otras muestran su nombre como `title` y lo llevan en `aria-label`.
	 * `menu` (opcional): en el celu (< 600 px), en vez de la tira que se desliza, un botón con el
	 * nombre de la pestaña actual y ▾ que abre la lista entera (ícono y nombre, ninguna escondida).
	 * Escape o elegir una la cierran y el foco vuelve al botón; las flechas recorren la lista. En la
	 * compu, la tira de siempre (ficha del evento, gorrite 11/10). Desde la parte 2 de la opción C
	 * lo usan todas las barras de pestañas del panel. El botón es la navegación principal de la
	 * página en el celu (gorrite, 11/10): ancho entero, con borde y fondo, y una línea chica que
	 * dice qué es (`menuCaption`, «Sección» por defecto). Su contador suma el de todas las
	 * pestañas (lo que hay para revisar en cualquiera de ellas).
	 * Los links precargan la página al pasar el mouse o con el foco (`data-sveltekit-preload-data`).
	 */
	import { onMount, tick } from 'svelte';
	import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	/** @type {{ href: string, label: string, count?: number, soon?: boolean, icon?: any }[]} */
	export let tabs = [];
	/** @type {string | undefined} */
	export let current = undefined;
	export let label = 'Pestañas';
	/**
	 * `menu` es lo de siempre (gorrite, 12/10): en el celu TODAS las barras de pestañas pasan a la
	 * lista ▾. `menu={false}` deja la tira que se desliza (con solo íconos si no entran), para un
	 * caso que de verdad la necesite.
	 */
	export let menu = true;
	/** Qué es la lista, en el botón del celu («Sección: Órdenes»). */
	export let menuCaption = 'Sección';
	/**
	 * El contador del botón del celu: la suma de todas las pestañas (contadores «a revisar») o, con
	 * `false`, el de la actual (filtros como Próximos/Pasados, donde el número es un total).
	 */
	export let sumCounts = true;
	$: active = current ?? $page.url.pathname.replace(/\/+$/, '');

	// Señal de que hay más pestañas de costado (fundido y flecha) cuando no entran todas.
	/** @type {HTMLElement | undefined} */
	let bar;
	let moreLeft = false;
	let moreRight = false;
	// Solo íconos: cuando todas tienen ícono y en una pantalla angosta no entran con sus nombres.
	// `fullWidth` es lo que ocupan con los nombres (se mide mientras se ven, así no oscila).
	$: allIcons = tabs.length > 0 && tabs.every((t) => t.icon);
	let iconOnly = false;
	let fullWidth = 0;
	const narrow = () =>
		typeof matchMedia === 'function' && matchMedia('(max-width: 599.98px)').matches;
	function measure() {
		if (!bar) return;
		if (!iconOnly) fullWidth = bar.scrollWidth;
		const next = allIcons && narrow() && fullWidth > bar.clientWidth + 4;
		if (next !== iconOnly) {
			iconOnly = next;
			tick().then(measure);
			return;
		}
		moreLeft = bar.scrollLeft > 4;
		moreRight = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4;
	}
	/** @param {number} dir */
	function slide(dir) {
		bar?.scrollBy({ left: dir * bar.clientWidth * 0.7, behavior: 'smooth' });
	}
	onMount(() => {
		// La pestaña actual a la vista (si quedó al final, en el celu no se veía).
		bar
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
		measure();
		if (typeof ResizeObserver === 'undefined' || !bar) return;
		const ro = new ResizeObserver(measure);
		ro.observe(bar);
		return () => ro.disconnect();
	});
	// Pestañas nuevas: se vuelven a medir con sus nombres.
	$: if (bar && tabs) {
		iconOnly = false;
		tick().then(measure);
	}
	/** @param {{ label: string, count?: number }} tab */
	const nameOf = (tab) => (tab.count ? `${tab.label} (${tab.count})` : tab.label);

	// Lista del celu (`menu`).
	const listId = `tabs-menu-${Math.random().toString(36).slice(2, 8)}`;
	let open = false;
	/** @type {HTMLButtonElement | undefined} */
	let toggle;
	/** @type {HTMLElement | undefined} */
	let list;
	$: currentTab = tabs.find((t) => t.href === active);
	$: menuCount = sumCounts
		? tabs.reduce((n, t) => n + (t.soon ? 0 : Number(t.count ?? 0) || 0), 0)
		: Number(currentTab?.count ?? 0) || 0;
	/** @param {boolean} [focusToggle] */
	function close(focusToggle = false) {
		open = false;
		if (focusToggle) toggle?.focus();
	}
	async function openList() {
		open = true;
		await tick();
		const links = /** @type {HTMLElement[]} */ ([...(list?.querySelectorAll('a') ?? [])]);
		(links.find((a) => a.getAttribute('aria-current') === 'page') ?? links[0])?.focus();
	}
	afterNavigate(() => {
		open = false;
	});
	/** @param {KeyboardEvent} ev */
	function onListKey(ev) {
		if (ev.key === 'Escape') {
			ev.preventDefault();
			close(true);
			return;
		}
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) return;
		ev.preventDefault();
		const links = /** @type {HTMLElement[]} */ ([...(list?.querySelectorAll('a') ?? [])]);
		const i = links.indexOf(/** @type {HTMLElement} */ (document.activeElement));
		const next =
			ev.key === 'Home'
				? 0
				: ev.key === 'End'
					? links.length - 1
					: (i + (ev.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
		links[next]?.focus();
	}
	/** @param {FocusEvent} ev */
	function onFocusOut(ev) {
		// El foco se fue a otra parte de la página (con Tab o tocando afuera): se cierra.
		const to = /** @type {Node | null} */ (ev.relatedTarget);
		if (open && to && !(/** @type {HTMLElement} */ (ev.currentTarget).contains(to))) open = false;
	}
	/** @param {MouseEvent} ev */
	function onWindowClick(ev) {
		if (open && !toggle?.parentElement?.contains(/** @type {Node} */ (ev.target))) open = false;
	}
</script>

<svelte:window on:click={onWindowClick} />

<div class="kv-tabs">
	{#if menu}
		<nav
			class="tabs-menu"
			aria-label={label}
			on:focusout={onFocusOut}
			data-sveltekit-preload-data="hover"
		>
			<button
				type="button"
				class="tabs-toggle"
				bind:this={toggle}
				aria-expanded={open}
				aria-controls={listId}
				on:click={() => (open ? close() : openList())}
				on:keydown={(ev) => {
					if (ev.key === 'ArrowDown' && !open) {
						ev.preventDefault();
						openList();
					} else if (ev.key === 'Escape' && open) {
						ev.preventDefault();
						close(true);
					}
				}}
			>
				{#if currentTab?.icon}<svelte:component
						this={currentTab.icon}
						size={16}
						aria-hidden="true"
					/>{/if}
				<span class="toggle-name"
					><span class="toggle-cap">{menuCaption}:</span>
					{currentTab ? currentTab.label : label}</span
				>
				{#if menuCount}<span
						class="count"
						title={sumCounts ? 'Para revisar en estas pestañas' : undefined}>{menuCount}</span
					>{/if}
				<span class="sr-only">(elegí otra pestaña)</span>
				<ChevronDown size={18} aria-hidden="true" class="chev" />
			</button>
			<!-- svelte-ignore a11y-no-noninteractive-element-interactions (las flechas y Escape) -->
			<ul class="tabs-list" id={listId} hidden={!open} bind:this={list} on:keydown={onListKey}>
				{#each tabs as tab (tab.href)}
					{@const on = active === tab.href}
					<li>
						{#if tab.soon}
							<span class="item off" aria-disabled="true"
								>{#if tab.icon}<svelte:component
										this={tab.icon}
										size={18}
										aria-hidden="true"
									/>{/if}<span>{tab.label} <small>(próximamente)</small></span></span
							>
						{:else}
							<a
								class="item"
								class:on
								href={tab.href}
								aria-current={on ? 'page' : undefined}
								on:click={() => close(true)}
								>{#if tab.icon}<svelte:component
										this={tab.icon}
										size={18}
										aria-hidden="true"
									/>{/if}<span>{tab.label}</span>{#if tab.count}<span class="count"
										>{tab.count}</span
									>{/if}</a
							>
						{/if}
					</li>
				{/each}
			</ul>
		</nav>
	{/if}

	<div
		class="tabs-wrap"
		class:has-menu={menu}
		class:more-left={moreLeft}
		class:more-right={moreRight}
	>
		{#if moreLeft}
			<button
				type="button"
				class="more prev"
				tabindex="-1"
				aria-hidden="true"
				on:click={() => slide(-1)}><ChevronLeft size={18} /></button
			>
		{/if}
		<nav
			class="tabs"
			class:icon-only={iconOnly}
			aria-label={label}
			bind:this={bar}
			on:scroll={measure}
			data-sveltekit-preload-data="hover"
		>
			{#each tabs as tab (tab.href)}
				{@const on = active === tab.href}
				{@const short = iconOnly && !on}
				{#if tab.soon}
					<span
						class="tab off"
						aria-disabled="true"
						title={short ? `${tab.label} (próximamente)` : 'Próximamente'}
						aria-label={short ? tab.label : undefined}
						>{#if tab.icon}<svelte:component
								this={tab.icon}
								size={16}
								aria-hidden="true"
							/>{/if}<span class="name" class:short>{tab.label}</span></span
					>
				{:else}
					<a
						class="tab"
						class:on
						href={tab.href}
						aria-current={on ? 'page' : undefined}
						title={short ? nameOf(tab) : undefined}
						aria-label={short ? nameOf(tab) : undefined}
						>{#if tab.icon}<svelte:component
								this={tab.icon}
								size={16}
								aria-hidden="true"
							/>{/if}<span class="name" class:short>{tab.label}</span>{#if tab.count}<span
								class="count">{tab.count}</span
							>{/if}</a
					>
				{/if}
			{/each}
		</nav>
		{#if moreRight}
			<button
				type="button"
				class="more next"
				tabindex="-1"
				aria-hidden="true"
				on:click={() => slide(1)}><ChevronRight size={18} /></button
			>
		{/if}
	</div>
</div>

<style>
	/* El espacio hasta lo que sigue lo pone la barra solo si algo la sigue: sin un hueco vacío
	   abajo cuando es lo último de su caja (gorrite, 12/10). */
	.kv-tabs:not(:last-child) {
		margin-bottom: var(--space-xs);
	}
	.tabs-wrap {
		position: relative;
	}
	/* Fundido en el borde que tiene más pestañas (sirve sobre cualquier fondo). */
	.more-right .tabs {
		mask-image: linear-gradient(to right, #000 calc(100% - 4rem), transparent);
	}
	.more-left .tabs {
		mask-image: linear-gradient(to left, #000 calc(100% - 4rem), transparent);
	}
	.more-left.more-right .tabs {
		mask-image: linear-gradient(
			to right,
			transparent,
			#000 4rem,
			#000 calc(100% - 4rem),
			transparent
		);
	}
	.more {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		z-index: 1;
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius-pill);
		background: var(--surface);
		color: var(--accent);
		box-shadow: var(--shadow-1);
		cursor: pointer;
	}
	.more.prev {
		left: 0;
	}
	.more.next {
		right: 0;
	}
	.tabs {
		display: flex;
		gap: 0.2rem;
		overflow-x: auto;
		scrollbar-width: thin;
		padding: var(--space-3xs) 0.1rem;
	}
	/* Compactas (gorrite, 11/10): menos alto en la compu; en el celu, al menos 44 px de toque. */
	.tab {
		padding: var(--space-3xs) var(--space-xs);
		min-height: 2.25rem;
		position: relative;
		border-radius: var(--radius-m);
		font-weight: 700;
		/* el rosa legible como texto: 5.4:1 sobre el gris del fondo (el rosa de la marca daba
		   2.9:1; gorrite, 12/10) */
		color: var(--accent-text);
		white-space: nowrap;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		flex: none;
	}
	.tab :global(svg) {
		flex: none;
	}
	/* Solo íconos: el nombre queda para los lectores de pantalla (y en el `title`). */
	.name.short {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.icon-only .tab:not(.on) {
		padding-inline: var(--space-2xs);
		justify-content: center;
		min-width: var(--tap);
	}
	@media (max-width: 599.98px) {
		.tab {
			min-height: var(--tap);
		}
	}
	a.tab:hover {
		color: var(--accent-text);
		background: color-mix(in srgb, var(--surface) 55%, transparent);
	}
	/* «Estás acá» en las pestañas: tarjeta blanca sobre el fondo gris, texto violeta. */
	.tab.on {
		color: var(--link);
		background: var(--surface);
		box-shadow: var(--shadow-1);
	}
	.tab.off {
		color: var(--muted);
		font-weight: 400;
	}
	/* Lista del celu (`menu`): en la compu no se ve; en el celu reemplaza a la tira. */
	.tabs-menu {
		display: none;
		position: relative;
	}
	@media (max-width: 599.98px) {
		.tabs-menu {
			display: block;
		}
		.tabs-wrap.has-menu {
			display: none;
		}
	}
	.tabs-toggle {
		display: flex;
		align-items: center;
		gap: 0.45em;
		width: 100%;
		/* La navegación principal de la página en el celu: más alta, con borde violeta y fondo lila
		   (no se confunde con los botones de acción del encabezado). */
		min-height: calc(var(--tap) + 0.25rem);
		padding: var(--space-3xs) var(--space-xs);
		border: 2px solid var(--link);
		border-radius: var(--round);
		background: var(--link-bg);
		box-shadow: var(--shadow-1);
		color: var(--link);
		font: inherit;
		font-size: var(--text-lg, 1.1rem);
		font-weight: 700;
		text-align: left;
		cursor: pointer;
	}
	.tabs-toggle :global(svg) {
		flex: none;
	}
	.toggle-cap {
		font-size: var(--text-sm);
		font-weight: 400;
		color: var(--text);
	}
	.toggle-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tabs-toggle :global(.chev) {
		color: var(--accent);
		transition: transform 150ms;
	}
	.tabs-toggle[aria-expanded='true'] :global(.chev) {
		transform: rotate(180deg);
	}
	.tabs-list {
		position: absolute;
		z-index: 20;
		top: calc(100% + 0.25rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: var(--space-3xs);
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-2);
	}
	.tabs-list[hidden] {
		display: none;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 0.6em;
		min-height: var(--tap);
		padding: 0 var(--space-xs);
		border-radius: var(--radius-s);
		color: var(--accent-text);
		font-weight: 700;
		text-decoration: none;
	}
	.item :global(svg) {
		flex: none;
	}
	a.item:hover,
	a.item:focus-visible {
		background: var(--surface-2);
	}
	.item.on {
		color: var(--link);
		background: var(--link-bg);
	}
	.item.off {
		color: var(--muted);
		font-weight: 400;
	}
	.item .count {
		margin-left: auto;
	}
	.item.on .count,
	.tabs-toggle .count {
		background: var(--surface);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* El contador, en el violeta de la barra (no un amarillo más; gorrite, 12/10). */
	.count {
		background: var(--info-bg);
		color: var(--info);
		font-size: var(--text-xs);
		border-radius: var(--radius-m);
		padding: 0 0.5em;
	}
</style>
