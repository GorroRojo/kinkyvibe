<script>
	/**
	 * Menú de la barra lateral del panel (≥ 900 px), opción C (decisión 0038): las secciones con
	 * ícono y nombre (Inicio, Eventos, Ventas, Comunidad, Contenido, Estadísticas y Ajustes al pie),
	 * sin sub-ítems. La Puerta no va acá (parte 2, gorrite 11/10: está en la barra de abajo del celu,
	 * en «Ir a…» y en cada evento). Cada sección lleva a la primera página de su grupo
	 * (`sideSections` de `$lib/admin/nav.js`); las demás páginas del grupo son las pestañas de arriba
	 * de la página (`sectionTabs`, en el layout). Cada sección muestra la suma de sus contadores y su
	 * pista «g x» (`NavShortcut`, solo en una compu con mouse).
	 *
	 * Debajo de las secciones:
	 * - «Fijados» (`pinnedPlaces.js`): las páginas que fijaste con 📌, hasta 7, en tu orden. Se
	 *   reordenan arrastrando o con «Subir»/«Bajar» (con el teclado: Tab hasta la fila y los botones
	 *   aparecen); «Soltar» las saca.
	 * - «Recientes» (`recentPlaces.js`): las últimas páginas que abriste, sin las fijadas, las que
	 *   entran en el alto de la pantalla, hasta 7. Las que no entran no se muestran (ni se leen ni se
	 *   enfocan); si no entra ninguna, no aparece el título. Cada una tiene 📌 para fijarla.
	 * Cada fila: ícono, nombre y una línea chica de contexto (`PlaceLink`).
	 *
	 * Props: `active` (NavItem actual), `counts` (`data.panelCounts`), `flags` (`data.navFlags`),
	 * `recent` (las recientes que se muestran, ya sin la actual ni las fijadas), `pinned` (las
	 * fijadas). Eventos: `pin` (detail: el lugar), `unpin` (detail: href), `move` (detail:
	 * `{ from, to }`); los maneja el layout, que guarda.
	 * Con el panel lateral en «Solo íconos» (`data-lateral="iconos"` en <html>, `sidebarMode.js`)
	 * los nombres quedan solo para los lectores de pantalla, el layout muestra cada uno como
	 * cartelito (`data-tip`) al pasar el mouse o con el foco, y Fijados y Recientes no se muestran.
	 */
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { ChevronDown, ChevronUp, History, Pin, PinOff } from '@lucide/svelte';
	import NavIcon from './NavIcon.svelte';
	import NavShortcut from './NavShortcut.svelte';
	import PlaceLink from './PlaceLink.svelte';
	import { activeSection, sideSections } from '$lib/admin/nav.js';
	import { PIN_MAX } from '$lib/admin/pinnedPlaces.js';

	/** @type {import('$lib/admin/nav.js').NavItem | undefined} */
	export let active;
	/** @type {Record<string, number>} */
	export let counts = {};
	/** @type {Record<string, boolean>} */
	export let flags = {};
	/** @type {import('$lib/admin/recentPlaces.js').RecentPlace[]} */
	export let recent = [];
	/** @type {import('$lib/admin/recentPlaces.js').RecentPlace[]} */
	export let pinned = [];

	/** @type {import('svelte').EventDispatcher<{ pin: import('$lib/admin/recentPlaces.js').RecentPlace, unpin: string, move: { from: number, to: number } }>} */
	const dispatch = createEventDispatcher();

	$: sections = sideSections({ flags, counts });
	$: main = sections.filter((s) => !s.foot);
	$: foot = sections.filter((s) => s.foot);
	$: here = activeSection(active);
	$: full = pinned.length >= PIN_MAX;

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
	// Cuando cambian las listas (al navegar o al fijar), se vuelve a medir.
	$: if (recent || pinned) tick().then(measure);

	/*
	 * Arrastrar para reordenar los fijados. `dragFrom`: la fila que se arrastra; `dragOver`: dónde
	 * caería (se marca con una raya).
	 */
	/** @type {number | null} */
	let dragFrom = null;
	/** @type {number | null} */
	let dragOver = null;
	/** @param {DragEvent} e @param {number} i */
	function dragStart(e, i) {
		dragFrom = i;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', pinned[i]?.href ?? '');
		}
	}
	/** @param {DragEvent} e @param {number} i */
	function dragEnter(e, i) {
		if (dragFrom === null) return;
		e.preventDefault();
		dragOver = i;
	}
	/** @param {DragEvent} e @param {number} i */
	function drop(e, i) {
		if (dragFrom === null) return;
		e.preventDefault();
		if (dragFrom !== i) dispatch('move', { from: dragFrom, to: i });
		dragFrom = dragOver = null;
	}
	function dragEnd() {
		dragFrom = dragOver = null;
	}

	/**
	 * «Subir»/«Bajar»: mueve y deja el foco en el mismo botón de la fila movida (así se puede
	 * apretar varias veces seguidas).
	 * @param {number} i @param {-1 | 1} dir @param {MouseEvent} e
	 */
	async function move(i, dir, e) {
		const which = /** @type {HTMLElement} */ (e.currentTarget).dataset.dir;
		dispatch('move', { from: i, to: i + dir });
		await tick();
		const row = pinnedList?.children[i + dir];
		/** @type {HTMLButtonElement | null | undefined} */ (
			row?.querySelector(`button[data-dir="${which}"]:not(:disabled)`) ?? row?.querySelector('a')
		)?.focus();
	}
	/** @type {HTMLUListElement | undefined} */
	let pinnedList;
</script>

<nav class="sn" aria-label="Secciones del panel" data-sveltekit-preload-data="hover">
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

	{#if pinned.length}
		<div class="pinned">
			<p class="rlabel" id="kv-pinned-label"><Pin size={14} aria-hidden="true" />Fijados</p>
			<ul
				role="list"
				aria-labelledby="kv-pinned-label"
				bind:this={pinnedList}
				data-sveltekit-preload-data="hover"
			>
				{#each pinned as p, i (p.href)}
					<li
						class="row"
						class:dragging={dragFrom === i}
						class:over={dragOver === i && dragFrom !== null && dragFrom !== i}
						class:below={dragFrom !== null && dragFrom < i}
						draggable="true"
						on:dragstart={(e) => dragStart(e, i)}
						on:dragenter={(e) => dragEnter(e, i)}
						on:dragover={(e) => dragEnter(e, i)}
						on:drop={(e) => drop(e, i)}
						on:dragend={dragEnd}
					>
						<PlaceLink place={p} />
						<span class="tools">
							<button
								type="button"
								data-dir="up"
								disabled={i === 0}
								aria-label="Subir «{p.label}»"
								title="Subir"
								on:click={(e) => move(i, -1, e)}><ChevronUp size={14} aria-hidden="true" /></button
							>
							<button
								type="button"
								data-dir="down"
								disabled={i === pinned.length - 1}
								aria-label="Bajar «{p.label}»"
								title="Bajar"
								on:click={(e) => move(i, 1, e)}><ChevronDown size={14} aria-hidden="true" /></button
							>
							<button
								type="button"
								aria-label="Soltar «{p.label}» (sacarla de Fijados)"
								title="Soltar"
								on:click={() => dispatch('unpin', p.href)}
								><PinOff size={14} aria-hidden="true" /></button
							>
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

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
			data-sveltekit-preload-data="hover"
		>
			{#each recent as r, i (r.href)}
				<li class="row" class:cut={i >= fit}>
					<PlaceLink place={r} />
					<span class="tools">
						<button
							type="button"
							disabled={full}
							aria-label="Fijar «{r.label}»"
							title={full ? `Ya tenés ${PIN_MAX} fijados: soltá uno para fijar otro` : 'Fijar'}
							on:click={() => dispatch('pin', r)}><Pin size={14} aria-hidden="true" /></button
						>
					</span>
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
	/* Fijados: arriba de Recientes, con su alto (hasta 7). */
	.pinned {
		flex: none;
		margin-top: var(--space-s);
	}
	/* Una fila de Fijados o Recientes: el link (PlaceLink) y sus botones, que aparecen al pasar el
	   mouse o con el foco dentro de la fila. */
	.row {
		position: relative;
		display: flex;
		align-items: center;
		border-radius: var(--round);
	}
	.tools {
		position: absolute;
		right: var(--space-3xs);
		top: 50%;
		transform: translateY(-50%);
		display: none;
		gap: 1px;
		background: var(--surface);
		border-radius: var(--radius-s);
		box-shadow: var(--shadow-1);
	}
	.row:hover .tools,
	.row:focus-within .tools {
		display: flex;
	}
	.tools button {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		background: none;
		color: var(--accent);
		cursor: pointer;
		&:hover:not(:disabled),
		&:focus-visible {
			background: var(--surface-2);
			color: var(--link);
		}
		&:disabled {
			color: var(--muted);
			opacity: 0.5;
			cursor: default;
		}
	}
	.pinned .row {
		cursor: grab;
		&.dragging {
			opacity: 0.45;
		}
		/* Dónde cae: una raya violeta arriba (o abajo, si se arrastra hacia abajo). */
		&.over {
			box-shadow: inset 0 2px 0 var(--link);
			&.below {
				box-shadow: inset 0 -2px 0 var(--link);
			}
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
			.pinned {
				display: none;
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
