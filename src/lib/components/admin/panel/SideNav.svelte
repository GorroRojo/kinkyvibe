<script>
	/**
	 * Menú de la barra lateral del panel (≥ 900 px): Inicio, las áreas de `$lib/admin/nav.js` y
	 * Ajustes al pie. Las áreas se abren de a una: la de la página actual abierta, y si la persona
	 * abre otra se recuerda (`navPrefs.js`, localStorage con try/catch; sin storage anda igual).
	 * Un área cerrada muestra la suma de sus contadores.
	 * Props: `active` (NavItem actual), `counts` (`data.panelCounts`), `flags` (`data.navFlags`),
	 * `hideSoon` ("Ocultar lo que viene").
	 */
	import { onMount } from 'svelte';
	import { ChevronDown } from '@lucide/svelte';
	import NavIcon from './NavIcon.svelte';
	import NavEntry from './NavEntry.svelte';
	import { NAV_AREAS, areaCount, navAreaItems, navAreaSections, navState } from '$lib/admin/nav.js';
	import { pickOpenArea, readOpenArea, saveOpenArea } from '$lib/admin/navPrefs.js';

	/** @type {import('$lib/admin/nav.js').NavItem | undefined} */
	export let active;
	/** @type {Record<string, number>} */
	export let counts = {};
	/** @type {Record<string, boolean>} */
	export let flags = {};
	export let hideSoon = false;

	/** @type {string | null} */
	let open = pickOpenArea(active?.area, null);
	let mounted = false;
	onMount(() => {
		open = pickOpenArea(active?.area, readOpenArea());
		mounted = true;
	});
	// Al navegar a otra área, se abre esa.
	$: activeArea = active?.area ?? null;
	$: if (mounted && activeArea) open = activeArea;

	/** @param {string} id */
	function toggle(id) {
		open = open === id ? null : id;
		saveOpenArea(open);
	}

	/** @param {import('$lib/admin/nav.js').NavItem} item */
	const countOf = (item) => (item.counter ? Number(counts[item.counter] ?? 0) : 0);

	$: opts = { flags, hideSoon };
	$: main = NAV_AREAS.filter((a) => !a.foot && navAreaItems(a.id, opts).length);
	$: foot = NAV_AREAS.filter((a) => a.foot && navAreaItems(a.id, opts).length);
</script>

<nav class="sn" aria-label="Secciones del panel">
	{#each navAreaItems(null, opts) as item (item.id)}
		<a
			class="top"
			class:on={active?.id === item.id}
			href={item.href}
			aria-current={active?.id === item.id ? 'page' : undefined}><NavIcon {item} />{item.label}</a
		>
	{/each}
	{#each [main, foot] as list, i (i)}
		<div class="areas" class:foot={i === 1}>
			{#each list as area (area.id)}
				{@const isOpen = open === area.id}
				{@const total = areaCount(area.id, counts, opts)}
				<button
					type="button"
					class="area"
					class:here={activeArea === area.id}
					aria-expanded={isOpen}
					aria-controls="kv-area-{area.id}"
					on:click={() => toggle(area.id)}
					><NavIcon item={area} />{area.label}
					{#if total && !isOpen}<span class="count" title="Pendientes">{total}</span>{/if}
					<span class="chev" aria-hidden="true"><ChevronDown size={16} /></span></button
				>
				<div class="items" id="kv-area-{area.id}" hidden={!isOpen}>
					{#each navAreaSections(area.id, opts) as section (section.id)}
						{#if section.label}<div class="sub">{section.label}</div>{/if}
						{#each section.items as item (item.id)}
							<NavEntry
								{item}
								state={navState(item, flags)}
								active={active?.id === item.id}
								count={countOf(item)}
							/>
						{/each}
					{/each}
				</div>
			{/each}
		</div>
	{/each}
</nav>

<style lang="scss">
	.sn {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1;
	}
	.areas {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin-top: 0.5rem;
		&.foot {
			margin-top: auto;
			padding-top: 0.5rem;
			border-top: 1px solid var(--line);
		}
	}
	.top,
	.area {
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
		font: inherit;
		font-weight: 700;
		transition: background 100ms;
		&:hover {
			background: var(--surface-2);
		}
	}
	.top {
		color: var(--accent);
		&.on {
			background: var(--link-bg);
			color: var(--link);
		}
	}
	.area {
		color: var(--text);
		&[aria-expanded='true'],
		&.here {
			color: var(--link);
		}
		.chev {
			margin-left: auto;
			display: grid;
			color: var(--muted);
			transition: rotate 150ms;
		}
		&[aria-expanded='true'] .chev {
			rotate: 180deg;
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
		+ .chev {
			margin-left: 0.3rem;
		}
	}
	.items {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding-bottom: 0.3rem;
		&[hidden] {
			display: none;
		}
	}
	.sub {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		padding: 0.45rem 0.8rem 0.1rem 2.3rem;
	}
	@media (prefers-reduced-motion: reduce) {
		.area .chev {
			transition: none;
		}
	}
</style>
