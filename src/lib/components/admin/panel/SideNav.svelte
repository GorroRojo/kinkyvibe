<script>
	/**
	 * Menú de la barra lateral del panel (≥ 900 px), opción C (decisión 0038): las 8 secciones con
	 * ícono y nombre (Inicio, Puerta, Eventos, Ventas, Comunidad, Contenido, Estadísticas y Ajustes
	 * al pie), sin sub-ítems. Cada sección lleva a la primera página de su grupo (`sideSections` de
	 * `$lib/admin/nav.js`); las demás páginas del grupo son las pestañas de arriba de la página
	 * (`sectionTabs`, en el layout). La Puerta va resaltada (se usa con gente esperando). Cada
	 * sección muestra la suma de sus contadores y su pista «g x» (`NavShortcut`, solo en una compu
	 * con mouse).
	 *
	 * Debajo de las secciones, «Recientes»: las últimas páginas que abriste (`recentPlaces.js`, en
	 * este navegador), las que entran en el alto de la pantalla, hasta 7. Las que no entran no se
	 * muestran (ni se leen ni se enfocan); si no entra ninguna, no aparece el título.
	 *
	 * Props: `active` (NavItem actual), `counts` (`data.panelCounts`), `flags` (`data.navFlags`),
	 * `recent` (las páginas recientes que se muestran, ya sin la actual).
	 * Con el panel lateral en «Solo íconos» (`data-lateral="iconos"` en <html>, `sidebarMode.js`)
	 * los nombres quedan solo para los lectores de pantalla, el layout muestra cada uno como
	 * cartelito (`data-tip`) al pasar el mouse o con el foco, y Recientes no se muestra.
	 */
	import { onMount, tick } from 'svelte';
	import { History } from '@lucide/svelte';
	import NavIcon from './NavIcon.svelte';
	import NavShortcut from './NavShortcut.svelte';
	import { activeSection, sideSections } from '$lib/admin/nav.js';

	/** @type {import('$lib/admin/nav.js').NavItem | undefined} */
	export let active;
	/** @type {Record<string, number>} */
	export let counts = {};
	/** @type {Record<string, boolean>} */
	export let flags = {};
	/** @type {import('$lib/admin/recentPlaces.js').RecentPlace[]} */
	export let recent = [];

	$: sections = sideSections({ flags, counts });
	$: main = sections.filter((s) => !s.foot);
	$: foot = sections.filter((s) => s.foot);
	$: here = activeSection(active);

	/** @type {HTMLUListElement | undefined} */
	let recentList;
	/** Cuántas recientes entran (las demás quedan `visibility: hidden`). */
	let fit = 0;

	/** Cuenta las filas que entran enteras en el alto que le queda a la lista. */
	function measure() {
		if (!recentList) return;
		const max = recentList.clientHeight;
		const top = recentList.getBoundingClientRect().top;
		let n = 0;
		for (const row of recentList.children) {
			const r = row.getBoundingClientRect();
			if (r.bottom - top > max + 0.5) break;
			n++;
		}
		fit = n;
	}

	onMount(() => {
		measure();
		if (typeof ResizeObserver !== 'function' || !recentList) return;
		const ro = new ResizeObserver(() => measure());
		ro.observe(recentList);
		return () => ro.disconnect();
	});
	// Cuando cambia la lista (al navegar), se vuelve a medir.
	$: if (recent) tick().then(measure);
</script>

<nav class="sn" aria-label="Secciones del panel">
	<ul class="secs" role="list">
		{#each main as s (s.id)}
			<li>
				<a
					class="sec"
					class:on={here === s.id}
					class:hl={s.highlight}
					href={s.href}
					aria-current={here === s.id ? 'page' : undefined}
					data-tip={s.label}
					><NavIcon item={s} size={18} /><span class="label">{s.label}</span>{#if s.count}<span
							class="count"
							title="Pendientes">{s.count}</span
						>{/if}<NavShortcut id={s.root} /></a
				>
			</li>
		{/each}
	</ul>

	<div class="recent" class:empty={!recent.length || fit === 0}>
		{#if recent.length}
			<p class="rlabel" id="kv-recent-label">
				<History size={14} aria-hidden="true" />Recientes
			</p>
		{/if}
		<ul
			bind:this={recentList}
			role="list"
			aria-labelledby={recent.length ? 'kv-recent-label' : undefined}
		>
			{#each recent as r, i (r.href)}
				<li class:cut={i >= fit}>
					<a href={r.href} title={r.label}>{r.label}</a>
				</li>
			{/each}
		</ul>
	</div>

	<ul class="secs foot" role="list">
		{#each foot as s (s.id)}
			<li>
				<a
					class="sec"
					class:on={here === s.id}
					href={s.href}
					aria-current={here === s.id ? 'page' : undefined}
					data-tip={s.label}
					><NavIcon item={s} size={18} /><span class="label">{s.label}</span>{#if s.count}<span
							class="count"
							title="Pendientes">{s.count}</span
						>{/if}<NavShortcut id={s.root} /></a
				>
			</li>
		{/each}
	</ul>
</nav>

<style lang="scss">
	/* Compacta (gorrite, 11/10): poco aire entre renglones y todos los íconos de 18 px. */
	.sn {
		display: flex;
		flex-direction: column;
		flex: 1;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.secs {
		margin-top: var(--space-3xs);
		&.foot {
			padding-top: var(--space-2xs);
			border-top: 1px solid var(--line);
		}
	}
	.sec {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-3xs) var(--space-xs);
		border-radius: var(--round);
		position: relative;
		text-decoration: none;
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
		/* La Puerta: rosa lleno, como su botón de la barra de abajo del celu. */
		&.hl:not(.on) {
			background: var(--accent);
			color: var(--accent-ink);
			:global(.kv-nav-sc) {
				color: var(--accent);
				background: var(--accent-ink);
				border-color: transparent;
			}
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
	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Recientes: ocupa el alto que sobra entre las secciones y Ajustes; muestra las filas que
	   entran enteras (`measure`) y esconde las demás. */
	.recent {
		flex: 1 1 0;
		min-height: 0;
		/* Su contenido no cuenta para el alto mínimo de la barra: solo toma lo que sobra. */
		contain: size;
		display: flex;
		flex-direction: column;
		margin-block: var(--space-s) var(--space-2xs);
		overflow: hidden;
		&.empty .rlabel {
			visibility: hidden;
		}
		ul {
			flex: 1 1 0;
			min-height: 0;
			overflow: hidden;
		}
	}
	.rlabel {
		display: flex;
		align-items: center;
		gap: var(--space-3xs);
		margin: 0 0 var(--space-3xs);
		padding: 0 var(--space-xs);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.recent a {
		display: block;
		padding: 0.2rem var(--space-xs);
		border-radius: var(--round);
		font-size: var(--text-xs);
		color: var(--text);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		&:hover {
			background: var(--surface-2);
			color: var(--link);
		}
	}
	/* No entra: no se ve, no se lee y no se enfoca. */
	.cut {
		visibility: hidden;
	}

	/* «Solo íconos» (en la compu): una franja angosta. Los nombres quedan para los lectores de
	   pantalla; el cartelito lo pone el layout (`data-tip`). Los contadores, como un puntito. */
	@media (min-width: 900px) {
		:global(html[data-lateral='iconos']) {
			.recent {
				visibility: hidden;
			}
			.sn :global(.kv-nav-sc) {
				display: none;
			}
			.label {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip: rect(0 0 0 0);
			}
			.sec {
				justify-content: center;
				padding-inline: 0;
			}
			.count {
				position: absolute;
				top: 0;
				right: 0;
				margin: 0;
				padding: 0 0.35em;
				line-height: 1.3;
			}
		}
	}
</style>
