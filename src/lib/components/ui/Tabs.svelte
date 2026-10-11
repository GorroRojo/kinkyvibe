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
	 */
	import { onMount, tick } from 'svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { page } from '$app/stores';
	/** @type {{ href: string, label: string, count?: number, soon?: boolean, icon?: any }[]} */
	export let tabs = [];
	/** @type {string | undefined} */
	export let current = undefined;
	export let label = 'Pestañas';
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
</script>

<div class="tabs-wrap" class:more-left={moreLeft} class:more-right={moreRight}>
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
					>{#if tab.icon}<svelte:component this={tab.icon} size={16} aria-hidden="true" />{/if}<span
						class="name"
						class:short>{tab.label}</span
					></span
				>
			{:else}
				<a
					class="tab"
					class:on
					href={tab.href}
					aria-current={on ? 'page' : undefined}
					title={short ? nameOf(tab) : undefined}
					aria-label={short ? nameOf(tab) : undefined}
					>{#if tab.icon}<svelte:component this={tab.icon} size={16} aria-hidden="true" />{/if}<span
						class="name"
						class:short>{tab.label}</span
					>{#if tab.count}<span class="count">{tab.count}</span>{/if}</a
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

<style>
	.tabs-wrap {
		position: relative;
		margin-bottom: 1rem;
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
		border-radius: var(--round);
		font-weight: 700;
		color: var(--accent);
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
		color: var(--accent);
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
	.count {
		background: var(--counter);
		color: var(--counter-ink);
		font-size: var(--text-xs);
		border-radius: var(--radius-m);
		padding: 0 0.5em;
	}
</style>
