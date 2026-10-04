<script>
	/**
	 * Contenido del panel "Más" del celu: la lista de áreas de `$lib/admin/nav.js` (con cuántas
	 * secciones tiene cada una y sus contadores) y, al tocar una, sus secciones.
	 * Props: `active` (NavItem actual), `counts` (`data.panelCounts`), `flags` (`data.navFlags`),
	 * `hideSoon` ("Ocultar lo que viene").
	 */
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import NavIcon from './NavIcon.svelte';
	import NavEntry from './NavEntry.svelte';
	import {
		NAV_AREAS,
		areaCount,
		navArea,
		navAreaItems,
		navAreaSections,
		navState
	} from '$lib/admin/nav.js';

	/** @type {import('$lib/admin/nav.js').NavItem | undefined} */
	export let active;
	/** @type {Record<string, number>} */
	export let counts = {};
	/** @type {Record<string, boolean>} */
	export let flags = {};
	export let hideSoon = false;

	/** Área abierta en la hoja (`null`: la lista de áreas). */
	/** @type {string | null} */
	let open = null;

	/** @param {import('$lib/admin/nav.js').NavItem} item */
	const countOf = (item) => (item.counter ? Number(counts[item.counter] ?? 0) : 0);

	$: opts = { flags, hideSoon };
	$: areas = NAV_AREAS.map((a) => {
		const items = navAreaItems(a.id, opts);
		const soon = items.filter((i) => i.soon).length;
		return { area: a, ready: items.length - soon, soon, total: areaCount(a.id, counts, opts) };
	}).filter((x) => x.ready + x.soon > 0);
	$: current = open ? navArea(open) : undefined;

	/**
	 * "4 secciones · 2 próximamente".
	 * @param {number} ready
	 * @param {number} soon
	 */
	const summary = (ready, soon) =>
		[ready === 1 ? '1 sección' : `${ready} secciones`, soon ? `${soon} próximamente` : '']
			.filter(Boolean)
			.join(' · ');
</script>

{#if current}
	<button type="button" class="back" on:click={() => (open = null)}
		><ChevronLeft size={18} aria-hidden="true" />Áreas</button
	>
	<div class="gl"><NavIcon item={current} size={18} />{current.label}</div>
	{#each navAreaSections(current.id, opts) as section (section.id)}
		{#if section.label}<div class="sub">{section.label}</div>{/if}
		<div class="cards">
			{#each section.items as item (item.id)}
				<NavEntry
					{item}
					variant="tile"
					state={navState(item, flags)}
					active={active?.id === item.id}
					count={countOf(item)}
				/>
			{/each}
		</div>
	{/each}
{:else}
	<div class="rows">
		{#each areas as x (x.area.id)}
			<button
				type="button"
				class="arow"
				class:here={active?.area === x.area.id}
				on:click={() => (open = x.area.id)}
				><NavIcon item={x.area} size={22} /><span class="txt"
					><b>{x.area.label}</b><small>{summary(x.ready, x.soon)}</small></span
				>{#if x.total}<span class="count">{x.total}</span>{/if}<span class="chev"
					><ChevronRight size={18} aria-hidden="true" /></span
				></button
			>
		{/each}
	</div>
{/if}

<style lang="scss">
	.rows,
	.cards {
		display: grid;
		gap: var(--space-2xs);
	}
	.rows {
		margin-top: 0.6rem;
	}
	.arow {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		background: var(--surface);
		color: var(--accent);
		border: 0;
		border-radius: var(--round);
		box-shadow: var(--shadow);
		padding: var(--space-2xs) var(--space-xs);
		text-align: left;
		width: 100%;
		font: inherit;
		cursor: pointer;
		&.here {
			box-shadow: inset 0 0 0 2px var(--link);
		}
		.txt {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		b {
			color: var(--text);
		}
		small {
			color: var(--muted);
			font-size: var(--text-xs);
		}
		.chev {
			margin-left: auto;
			display: grid;
			color: var(--muted);
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
		+ .chev {
			margin-left: 0.3rem;
		}
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		border: 0;
		background: none;
		color: var(--accent);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		padding: var(--space-3xs) 0;
	}
	.gl {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 700;
		color: var(--text);
		padding: 0.4rem 0.2rem var(--space-2xs);
	}
	.sub {
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		padding: var(--space-2xs) 0.2rem var(--space-3xs);
	}
</style>
