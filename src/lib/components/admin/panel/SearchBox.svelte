<script>
	/**
	 * «Ir a… o buscar» (opción C, decisión 0038): el buscador global del panel, una paleta de
	 * comandos que busca registros (eventos, órdenes `KV-…`, entradas por código, códigos de
	 * descuento, personas, perfiles y etiquetas, sin mayúsculas ni tildes; ver /admin/buscar) y
	 * acciones (cada sección del menú, «Nuevo código de descuento», «Abrir la puerta de hoy»,
	 * «Para revisar», crear e importar, el tema...; ver paletteActions.js). Las acciones van
	 * arriba, salvo cuando lo buscado es claramente un registro (`recordsFirst`). Del primer
	 * evento encontrado salen atajos a sus pestañas.
	 * Entiende operadores (`#etiqueta`, `@persona`, `e:evento`, `tipo:`, `lugar:`, `hoy`/`finde`,
	 * `"frase"`, `-palabra`, `>` solo acciones; ver $lib/utils/searchQuery.js): con la lista vacía
	 * hay una línea con ejemplos, y «Cómo buscar» (al pie, en la hoja de atajos y como acción)
	 * explica todos, con ejemplos que se pueden tocar.
	 *
	 * Interfaz (la usa el layout del panel):
	 * - prop `compact`: texto corto, para el header del celu;
	 * - prop `hotkeys`: si esta instancia escucha el teclado (`/` y Ctrl/⌘+K abren la paleta,
	 *   `g` + letra navega, `?` muestra los atajos). Solo una instancia la tiene en `true`;
	 * - prop `hideSoon`: si ahora está «Ocultar lo que viene» (para el nombre de la acción);
	 * - eventos `theme` y `hidesoon`: la persona eligió «Cambiar tema» u «Ocultar/Mostrar lo que
	 *   viene» (las preferencias las cambia el layout);
	 * - `open(q?)` y `openHelp()` exportadas, para abrir la paleta (con algo ya escrito o no) o la
	 *   hoja de atajos desde afuera (bind:this; «Atajos de teclado» del menú lateral y el botón `?`
	 *   de la barra de arriba);
	 * - prop `pinned` (las URLs fijadas en la barra lateral) y `pinFull` (ya hay 7) y eventos `pin`
	 *   (detail: `{ href, label, context }`) y `unpin` (detail: href): 📌 en cada resultado que lleva
	 *   a una página del panel que se puede fijar (`canPin`: no las «Próximamente»), al pasar el
	 *   mouse o en el elegido; con el teclado, Alt+F fija o suelta el elegido;
	 * - props `pinnedPlaces` y `recentPlaces` (los Fijados y Recientes de la barra lateral): sin
	 *   nada escrito, la paleta los lista (`placeSections`, gorrite 12/10), con el teclado como
	 *   cualquier resultado; al escribir, busca como siempre;
	 * - mientras `g` espera su segunda tecla, `goPending` (`$lib/admin/shortcutHints.js`) está en
	 *   `true` y las pistas «g x» del menú se encienden.
	 *
	 * Teclado adentro: ↑/↓ para moverse, Enter para abrir, Esc para cerrar. En el celu la paleta
	 * ocupa toda la pantalla.
	 */
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowLeftRight,
		ArrowRight,
		BookOpen,
		Calendar,
		CalendarPlus,
		ClipboardCheck,
		MapPin,
		ChartLine,
		ExternalLink,
		Eye,
		EyeOff,
		Heart,
		History,
		House,
		IdCard,
		Key,
		Keyboard,
		LoaderCircle,
		LogOut,
		Mail,
		Pin,
		PinOff,
		Receipt,
		ScanLine,
		Search,
		Settings,
		Sheet,
		SunMoon,
		Tag,
		Ticket,
		User,
		Users,
		Wallet,
		X
	} from '@lucide/svelte';
	import NavIcon from './NavIcon.svelte';
	import { navItem } from '$lib/admin/nav.js';
	import {
		OTHER_SHORTCUTS,
		goShortcutHref,
		goShortcutRows,
		matchCommands
	} from '$lib/admin/commands.js';
	import {
		SEARCH_TIPS,
		paletteCommands,
		placeSections,
		recordsFirst
	} from '$lib/admin/paletteActions.js';
	import { allowsKind, hasRecordCriteria, parseSearchQuery } from '$lib/utils/searchQuery.js';
	import { goPending, isMac } from '$lib/admin/shortcutHints.js';
	import { canPin } from '$lib/admin/pinnedPlaces.js';
	import { placeIcon } from '$lib/admin/recentPlaces.js';

	/** Texto corto para el header del celu. */
	export let compact = false;
	/** Si esta instancia escucha el teclado. */
	export let hotkeys = true;
	/** Si ahora están ocultas las secciones «Próximamente» (el nombre de la acción cambia). */
	export let hideSoon = false;
	/** Las URLs fijadas en la barra lateral. @type {string[]} */
	export let pinned = [];
	/** Si ya hay el máximo de fijados. */
	export let pinFull = false;
	/** Los Fijados de la barra lateral. @type {import('$lib/admin/recentPlaces.js').RecentPlace[]} */
	export let pinnedPlaces = [];
	/** Los Recientes que muestra la barra lateral. @type {import('$lib/admin/recentPlaces.js').RecentPlace[]} */
	export let recentPlaces = [];

	/** @type {import('svelte').EventDispatcher<{ theme: null, hidesoon: null, pin: { href: string, label: string, context?: string }, unpin: string }>} */
	const dispatch = createEventDispatcher();

	const ICONS = /** @type {Record<string, any>} */ ({
		home: House,
		calendar: Calendar,
		'calendar-plus': CalendarPlus,
		'map-pin': MapPin,
		sheet: Sheet,
		scan: ScanLine,
		wallet: Wallet,
		transfer: ArrowLeftRight,
		tag: Tag,
		users: Users,
		chart: ChartLine,
		book: BookOpen,
		heart: Heart,
		eye: Eye,
		'eye-off': EyeOff,
		settings: Settings,
		mail: Mail,
		key: Key,
		history: History,
		external: ExternalLink,
		keyboard: Keyboard,
		logout: LogOut,
		arrow: ArrowRight,
		event: Calendar,
		order: Receipt,
		ticket: Ticket,
		person: User,
		code: Tag,
		profile: IdCard,
		check: ClipboardCheck,
		theme: SunMoon,
		search: Search
	});

	const uid = Math.random().toString(36).slice(2, 8);

	let isOpen = false;
	let helpOpen = false;
	/** @type {HTMLDialogElement | undefined} */
	let dialog;
	/** @type {HTMLDialogElement | undefined} */
	let helpDialog;
	/** @type {HTMLInputElement | undefined} */
	let input;
	/** @type {HTMLElement | undefined} */
	let listEl;
	/** @type {HTMLElement | undefined} */
	let searchHelpEl;

	let q = '';
	let active = 0;
	let loading = false;
	let errorText = '';
	/** @type {{ slug: string, title: string, href: string }[]} */
	let today = [];
	/** @type {{ id: string, label: string, items: { id: string, icon: string, title: string, sub: string, href: string, exact?: boolean }[] }[]} */
	let groups = [];
	/** @type {AbortController | null} */
	let inflight = null;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	let lastQuery = '\u0000';

	/**
	 * @typedef {{ key: string, icon: string, title: string, sub: string, href?: string,
	 *   external?: boolean, run?: 'help' | 'search-help' | 'theme' | 'hide-soon', shortcut?: string,
	 *   navId?: string, place?: boolean }} Row
	 */

	$: commands = paletteCommands({ today, hideSoon });
	// Lo escrito, con sus operadores (#etiqueta, @persona, hoy…).
	$: pq = parseSearchQuery(q);
	$: onlyActions = Boolean(pq.kinds?.length) && pq.kinds?.every((k) => k === 'actions');
	$: actionRows = /** @type {Row[]} */ (
		(allowsKind(pq, 'actions')
			? matchCommands(commands, pq.actionText, onlyActions ? 12 : q.trim() ? 6 : 8)
			: []
		).map((c) => ({
			key: c.id,
			icon: c.icon,
			title: c.label,
			sub: c.hint,
			href: c.href,
			external: c.external,
			run: c.run,
			shortcut: c.shortcut,
			navId: c.navId
		}))
	);
	$: actionSection = actionRows.length
		? [{ id: 'actions', label: 'Acciones', rows: actionRows }]
		: [];
	$: recordSections = groups.map((g) => ({
		id: g.id,
		label: g.label,
		rows: /** @type {Row[]} */ (g.items.map((i) => ({ ...i, key: i.id })))
	}));
	// Las acciones van arriba, salvo que lo buscado sea claramente un registro (ver recordsFirst).
	$: searchSections = recordsFirst(
		pq.actionText || q,
		actionRows.map((r) => r.title),
		groups
	)
		? [...recordSections, ...actionSection]
		: [...actionSection, ...recordSections];
	// Sin nada escrito: Fijados y Recientes, como en la barra lateral.
	$: blank = !q.trim();
	$: sections = blank
		? /** @type {{ id: string, label: string, rows: Row[] }[]} */ (
				placeSections(pinnedPlaces, recentPlaces)
			)
		: searchSections;
	$: flat = sections.flatMap((s) => s.rows);
	// Al cambiar lo escrito (también al borrarlo todo), el elegido vuelve a ser el primero.
	$: resetActive(q);
	/** @param {string} _q */
	function resetActive(_q) {
		active = 0;
	}
	$: if (active >= flat.length) active = Math.max(0, flat.length - 1);
	$: search(q);

	/** @param {string} [initial] lo que ya aparece escrito */
	export async function open(initial = '') {
		if (isOpen) return;
		isOpen = true;
		q = initial;
		active = 0;
		groups = [];
		errorText = '';
		dialog?.showModal?.();
		await tick();
		input?.focus();
		fetchResults('');
		// Por si ya estaba escrito lo mismo (entonces `$: search(q)` no corre).
		if (initial) search(initial);
	}
	function close() {
		isOpen = false;
		if (dialog?.open) dialog.close();
	}
	/** @param {{ searchTips?: boolean }} [opts] `searchTips`: ir directo a «Cómo buscar» */
	export async function openHelp({ searchTips = false } = {}) {
		close();
		helpOpen = true;
		helpDialog?.showModal?.();
		if (searchTips) {
			await tick();
			searchHelpEl?.scrollIntoView({ block: 'start' });
			searchHelpEl?.focus({ preventScroll: true });
		}
	}
	/** Un ejemplo de «Cómo buscar»: cierra la ayuda y lo busca. @param {string} example */
	async function tryExample(example) {
		closeHelp();
		await tick();
		open(example);
	}
	function closeHelp() {
		helpOpen = false;
		if (helpDialog?.open) helpDialog.close();
	}

	/** @param {string} query */
	function search(query) {
		if (!isOpen) return;
		clearTimeout(timer);
		const trimmed = query.trim();
		if (!hasRecordCriteria(parseSearchQuery(trimmed))) {
			groups = [];
			loading = false;
			errorText = '';
			return;
		}
		timer = setTimeout(() => fetchResults(trimmed), 150);
	}

	/** @param {string} query */
	async function fetchResults(query) {
		if (query === lastQuery && query) return;
		lastQuery = query;
		inflight?.abort();
		const ctrl = new AbortController();
		inflight = ctrl;
		loading = Boolean(query);
		try {
			const res = await fetch(`/admin/buscar?q=${encodeURIComponent(query)}`, {
				signal: ctrl.signal,
				headers: { accept: 'application/json' }
			});
			const body = await res.json().catch(() => ({}));
			if (ctrl.signal.aborted) return;
			if (!res.ok) {
				errorText = body?.error || 'No se pudo buscar. Probá de nuevo.';
				groups = [];
			} else {
				errorText = '';
				today = Array.isArray(body.today) ? body.today : [];
				if (query) groups = Array.isArray(body.groups) ? body.groups : [];
			}
		} catch (e) {
			if (/** @type {Error} */ (e).name !== 'AbortError') {
				errorText = 'No se pudo buscar (¿sin conexión?).';
				groups = [];
			}
		} finally {
			if (inflight === ctrl) {
				loading = false;
				inflight = null;
			}
		}
	}

	/** @param {Row | undefined} row */
	async function choose(row) {
		if (!row) return;
		if (row.run === 'help') return openHelp();
		if (row.run === 'search-help') return openHelp({ searchTips: true });
		if (row.run === 'theme' || row.run === 'hide-soon') {
			close();
			dispatch(row.run === 'theme' ? 'theme' : 'hidesoon');
			return;
		}
		if (!row.href) return;
		close();
		lastQuery = '\u0000';
		if (row.external) {
			window.open(row.href, '_blank', 'noopener');
		} else if (row.href.startsWith('/logout')) {
			window.location.href = row.href;
		} else {
			await goto(row.href);
		}
	}

	/** Lo que se acaba de fijar o soltar, para los lectores de pantalla. */
	let pinNote = '';
	/** @param {Row} row */
	const pinnable = (row) => Boolean(row.href && !row.external && !row.run && canPin(row.href));
	/** @param {Row | undefined} row */
	function togglePin(row) {
		if (!row || !pinnable(row) || !row.href) return;
		if (pinned.includes(row.href)) {
			dispatch('unpin', row.href);
			pinNote = `Soltaste «${row.title}».`;
		} else if (pinFull) {
			pinNote = 'Ya tenés 7 fijados: soltá uno en la barra lateral para fijar otro.';
		} else {
			dispatch('pin', { href: row.href, label: row.title, context: row.sub || undefined });
			pinNote = `Fijaste «${row.title}» en la barra lateral.`;
		}
	}

	/** @param {number} i */
	async function setActive(i) {
		if (!flat.length) return;
		active = (i + flat.length) % flat.length;
		await tick();
		listEl?.querySelector(`#kv-opt-${uid}-${active}`)?.scrollIntoView({ block: 'nearest' });
	}

	/** @param {KeyboardEvent} e */
	function onInputKey(e) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setActive(active + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setActive(active - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			choose(flat[active]);
		} else if (e.key === 'Home' && e.ctrlKey) {
			setActive(0);
		} else if (e.altKey && e.code === 'KeyF') {
			e.preventDefault();
			togglePin(flat[active]);
		}
	}

	/** Índice de cada fila en la lista plana (para ids y `active`). */
	/** @param {number} si @param {number} ri */
	function indexOf(si, ri) {
		let n = 0;
		for (let s = 0; s < si; s++) n += sections[s].rows.length;
		return n + ri;
	}

	/** «Ctrl K» o «⌘ K», al lado del `/` (el CSS lo muestra solo en una compu con mouse). */
	let ctrlK = '';

	onMount(() => {
		if (!hotkeys) return;
		ctrlK = isMac() ? '⌘ K' : 'Ctrl K';
		let pendingG = false;
		/** @type {ReturnType<typeof setTimeout> | undefined} */
		let gTimer;
		/** @param {boolean} on */
		const setPending = (on) => {
			pendingG = on;
			goPending.set(on);
			clearTimeout(gTimer);
			if (on) gTimer = setTimeout(() => setPending(false), 1200);
		};
		/** @param {KeyboardEvent} e */
		const onKey = (e) => {
			const el = /** @type {HTMLElement | null} */ (document.activeElement);
			const typing = !!el && (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable);
			if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !e.altKey) {
				e.preventDefault();
				if (isOpen) close();
				else open();
				return;
			}
			if (typing || e.ctrlKey || e.metaKey || e.altKey || isOpen || helpOpen) {
				if (pendingG) setPending(false);
				return;
			}
			if (document.querySelector('dialog[open]')) return;
			// Dejar `g` apretada repite la tecla: no es `g g`.
			if (e.repeat) return;
			if (pendingG) {
				if (e.key === 'Shift') return;
				setPending(false);
				const href = goShortcutHref(e.key);
				if (href) {
					e.preventDefault();
					goto(href);
				}
				return;
			}
			if (e.key === '/') {
				e.preventDefault();
				open();
			} else if (e.key === '?') {
				e.preventDefault();
				openHelp();
			} else if (e.key === 'g') {
				setPending(true);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			setPending(false);
		};
	});
</script>

<button type="button" class="search" class:compact on:click={() => open()} aria-haspopup="dialog">
	<Search size={18} aria-hidden="true" />
	<span class="label"
		>{compact ? 'Ir a… o buscar' : 'Ir a… o buscar personas, eventos, etiquetas…'}</span
	>
	{#if !compact}<kbd>/</kbd>{#if ctrlK}<kbd class="ck">{ctrlK}</kbd>{/if}{/if}
</button>

<dialog
	bind:this={dialog}
	class="palette"
	on:close={() => (isOpen = false)}
	on:click|self={close}
	aria-label="Ir a… o buscar en el panel"
>
	{#if isOpen}
		<div class="pal">
			<div class="inrow">
				{#if loading}
					<span class="spin" aria-hidden="true"><LoaderCircle size={20} /></span>
				{:else}
					<Search size={20} aria-hidden="true" />
				{/if}
				<input
					bind:this={input}
					bind:value={q}
					on:keydown={onInputKey}
					type="search"
					placeholder="Ir a una página, o buscá personas, eventos, etiquetas, KV-…, códigos"
					autocomplete="off"
					spellcheck="false"
					role="combobox"
					aria-expanded="true"
					aria-controls="kv-pal-list-{uid}"
					aria-activedescendant={flat.length ? `kv-opt-${uid}-${active}` : undefined}
					aria-label="Buscar"
				/>
				<button type="button" class="x" on:click={close} aria-label="Cerrar"><X size={20} /></button
				>
			</div>

			{#if !q.trim()}
				<p class="tips">
					Probá <code>#etiqueta</code>, <code>@persona</code>, <code>hoy</code> o
					<code>"frase"</code>.
					<button
						type="button"
						class="linkish inline"
						on:click={() => openHelp({ searchTips: true })}>Cómo buscar</button
					>
				</p>
			{/if}
			<div
				class="list"
				id="kv-pal-list-{uid}"
				role="listbox"
				bind:this={listEl}
				aria-label="Resultados"
			>
				{#each sections as s, si (s.id)}
					<div class="gl" role="presentation">{s.label}</div>
					{#each s.rows as row, ri (row.key)}
						{@const i = indexOf(si, ri)}
						<!-- svelte-ignore a11y-click-events-have-key-events (el teclado va por el input) -->
						<div
							class="opt"
							class:on={i === active}
							id="kv-opt-{uid}-{i}"
							role="option"
							aria-selected={i === active}
							tabindex="-1"
							on:click={() => choose(row)}
							on:mousemove={() => (active = i)}
						>
							<span class="oi" aria-hidden="true"
								>{#if row.place && row.href}<NavIcon
										item={placeIcon(row.href)}
										size={18}
									/>{:else if row.navId && navItem(row.navId)}<NavIcon
										item={navItem(row.navId) ?? {}}
										size={18}
									/>{:else}<svelte:component
										this={ICONS[row.icon] ?? ArrowRight}
										size={18}
									/>{/if}</span
							>
							<span class="ot">
								<b>{row.title}</b>
								{#if row.sub}<small>{row.sub}</small>{/if}
							</span>
							{#if row.shortcut}<kbd class="sc">{row.shortcut}</kbd>{/if}
							{#if pinnable(row) && row.href}
								{@const isPinned = pinned.includes(row.href)}
								<button
									type="button"
									class="pin"
									class:pinned={isPinned}
									tabindex="-1"
									aria-label={isPinned ? `Soltar «${row.title}»` : `Fijar «${row.title}»`}
									title={isPinned
										? 'Soltar de la barra lateral (Alt F)'
										: pinFull
											? 'Ya tenés 7 fijados'
											: 'Fijar en la barra lateral (Alt F)'}
									on:click|stopPropagation={() => togglePin(row)}
									>{#if isPinned}<PinOff size={16} aria-hidden="true" />{:else}<Pin
											size={16}
											aria-hidden="true"
										/>{/if}</button
								>
							{/if}
						</div>
					{/each}
				{/each}
				{#if errorText}
					<p class="note bad" role="alert">{errorText}</p>
				{:else if pq.kinds && !pq.kinds.length}
					<p class="note">
						Esos filtros no van juntos (por ejemplo, una etiqueta y un estado de orden).
					</p>
				{:else if hasRecordCriteria(pq) && !loading && !groups.length}
					<p class="note">No encontramos registros con "{q.trim()}".</p>
				{:else if blank && !flat.length}
					<p class="note">
						Todavía no tenés páginas fijadas ni recientes. Escribí para ir a una página o buscar.
					</p>
				{:else if q.trim().length === 1}
					<p class="note">Escribí una letra más para buscar registros.</p>
				{/if}
			</div>

			<p class="sr-only" aria-live="polite">{pinNote}</p>
			<footer class="foot">
				<span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
				<span><kbd>Enter</kbd> abrir</span>
				<span><kbd>Alt</kbd><kbd>F</kbd> fijar</span>
				<span><kbd>Esc</kbd> cerrar</span>
				<button type="button" class="linkish push" on:click={() => openHelp({ searchTips: true })}
					>Cómo buscar</button
				>
				<button type="button" class="linkish" on:click={() => openHelp()}
					><kbd>?</kbd> atajos</button
				>
			</footer>
		</div>
	{/if}
</dialog>

<dialog
	bind:this={helpDialog}
	class="help"
	on:close={() => (helpOpen = false)}
	on:click|self={closeHelp}
	aria-labelledby="kv-help-title-{uid}"
>
	{#if helpOpen}
		<div class="helpbox">
			<header>
				<h2 id="kv-help-title-{uid}">
					<Keyboard size={20} aria-hidden="true" /> Atajos de teclado
				</h2>
				<button type="button" class="x" on:click={closeHelp} aria-label="Cerrar"
					><X size={20} /></button
				>
			</header>
			<div class="cols">
				<section>
					<h3>Ir a…</h3>
					<ul>
						{#each goShortcutRows() as r (r.keys.join())}
							<li class:off={!r.available}>
								<span class="keys"
									>{#each r.keys as k, ki (ki)}<kbd>{k}</kbd>{/each}</span
								>
								<span
									>{r.label}{#if !r.available}<small>{' · próximamente'}</small>{/if}</span
								>
							</li>
						{/each}
					</ul>
				</section>
				<section>
					<h3>Buscador</h3>
					<ul>
						{#each OTHER_SHORTCUTS as r (r.label)}
							<li>
								<span class="keys"
									>{#each r.keys as k, ki (ki)}<kbd>{k}</kbd>{/each}</span
								>
								<span>{r.label}</span>
							</li>
						{/each}
					</ul>
				</section>
			</div>
			<section
				class="tipsbox"
				bind:this={searchHelpEl}
				tabindex="-1"
				aria-labelledby="kv-search-help-{uid}"
			>
				<h3 id="kv-search-help-{uid}">Cómo buscar</h3>
				<p class="lead">
					Sin tildes ni mayúsculas, y las palabras en cualquier orden. Se pueden combinar: <button
						type="button"
						class="ex"
						on:click={() => tryExample('#shibari finde')}><code>#shibari finde</code></button
					>. Tocá un ejemplo para probarlo.
				</p>
				<ul>
					{#each SEARCH_TIPS as tip (tip.q)}
						<li>
							<span class="exs"
								><button type="button" class="ex" on:click={() => tryExample(tip.q)}
									><code>{tip.q}</code></button
								>{#each tip.also ?? [] as other (other)}<code class="also">{other}</code
									>{/each}</span
							>
							<span>{tip.text}</span>
						</li>
					{/each}
				</ul>
			</section>
		</div>
	{/if}
</dialog>

<style lang="scss">
	.search {
		flex: 1;
		min-width: 0;
		max-width: 34rem;
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		background: var(--surface);
		border: 1px solid var(--field, var(--1-light));
		border-radius: 3em;
		padding: var(--space-2xs) var(--space-xs);
		/* parece un input vacío: el texto va como placeholder (token de style.scss / panel.scss) */
		color: var(--placeholder);
		text-align: left;
		cursor: text;
		&.compact {
			padding: var(--space-2xs) var(--space-xs);
		}
		:global(svg) {
			flex: none;
			color: var(--accent);
		}
	}
	.label {
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	kbd {
		font: inherit;
		font-size: var(--text-xs);
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 0.4em;
		padding: 0.05em 0.45em;
		color: var(--muted);
	}
	.search kbd {
		margin-left: auto;
		flex: none;
		&.ck {
			display: none;
		}
	}
	/* La misma consulta que HINTS_MEDIA (shortcutHints.js). */
	@media (hover: hover) and (pointer: fine) and (min-width: 1100px) {
		.search kbd.ck {
			display: inline;
			margin-left: 0;
		}
	}
	dialog {
		border: 0;
		padding: 0;
		border-radius: var(--card-round, 1.25rem);
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-3);
		&::backdrop {
			background: var(--scrim, rgba(30, 15, 40, 0.35));
		}
	}
	.palette {
		width: min(40rem, calc(100% - 32px));
		margin-top: 10vh;
	}
	.pal {
		display: flex;
		flex-direction: column;
		max-height: min(34rem, 75vh);
	}
	.inrow {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		border-bottom: 1px solid var(--line);
		color: var(--muted);
		input {
			flex: 1;
			min-width: 0;
			border: 0;
			background: none;
			font-size: var(--text-field);
			padding: var(--space-3xs) 0;
			color: var(--text);
			outline: none;
			&::-webkit-search-cancel-button {
				display: none;
			}
		}
	}
	.x {
		border: 0;
		background: var(--surface-2);
		border-radius: 50%;
		width: 2.2rem;
		height: 2.2rem;
		display: grid;
		place-items: center;
		cursor: pointer;
		color: var(--text);
		flex: none;
	}
	.spin {
		display: grid;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.list {
		overflow-y: auto;
		padding: var(--space-3xs) 0.4rem var(--space-2xs);
		flex: 1;
	}
	.gl {
		font-size: var(--text-xs);
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 700;
		padding: var(--space-2xs) var(--space-2xs) var(--space-3xs);
	}
	.opt {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		padding: var(--space-2xs) var(--space-2xs);
		border-radius: var(--radius-s);
		cursor: pointer;
		min-height: 2.75rem;
		&.on {
			background: var(--link-bg);
			.oi {
				color: var(--link);
			}
		}
	}
	.oi {
		flex: none;
		width: 2rem;
		height: 2rem;
		display: grid;
		place-items: center;
		border-radius: var(--radius-s);
		background: var(--surface-2);
		color: var(--muted);
	}
	.ot {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		b {
			font-weight: 700;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		small {
			color: var(--muted);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
	.sc {
		flex: none;
	}
	/* 📌: aparece al pasar el mouse o en el elegido; si ya está fijado, siempre. */
	.pin {
		flex: none;
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-s);
		background: none;
		color: var(--accent);
		cursor: pointer;
		visibility: hidden;
		&:hover {
			background: var(--surface);
			color: var(--link);
		}
		&.pinned {
			visibility: visible;
			color: var(--link);
		}
	}
	.opt:hover .pin,
	.opt.on .pin {
		visibility: visible;
	}
	@media (hover: none) {
		.pin {
			visibility: visible;
		}
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.note {
		margin: 0.6rem;
		color: var(--muted);
		&.bad {
			color: var(--bad);
		}
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3xs) var(--space-xs);
		padding: var(--space-2xs) var(--space-xs);
		border-top: 1px solid var(--line);
		font-size: var(--text-xs);
		color: var(--muted);
		kbd {
			margin-right: 0.2rem;
		}
	}
	.linkish {
		border: 0;
		background: none;
		color: var(--muted);
		padding: 0;
		cursor: pointer;
		font-size: inherit;
		&.push {
			margin-left: auto;
		}
	}
	.tips {
		margin: 0;
		padding: var(--space-3xs) var(--space-xs);
		border-bottom: 1px solid var(--line);
		font-size: var(--text-xs);
		color: var(--muted);
		code {
			font-size: inherit;
		}
	}
	.linkish.inline {
		margin-left: 0.3rem;
		color: var(--link);
		text-decoration: underline;
	}
	.help {
		width: min(40rem, calc(100% - 32px));
		max-height: min(44rem, 90vh);
	}
	.helpbox .tipsbox {
		margin-top: var(--space-xs);
		border-top: 1px solid var(--line);
		outline: none;
		.lead {
			margin: 0 0 var(--space-2xs);
			color: var(--muted);
			font-size: var(--text-xs);
		}
		/* Una grilla para toda la lista: los ejemplos a la izquierda, alineados. */
		ul {
			display: grid;
			grid-template-columns: fit-content(17rem) minmax(0, 1fr);
			gap: var(--space-2xs) var(--space-xs);
			align-items: baseline;
		}
		li {
			display: contents;
		}
		code {
			white-space: nowrap;
		}
		.exs {
			display: inline-flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0.3rem;
		}
		.also {
			color: var(--muted);
			font-size: var(--text-xs);
		}
	}
	.ex {
		border: 0;
		background: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
		code {
			color: var(--link);
			background: var(--link-bg);
			border-radius: 0.35em;
			padding: 0.05em 0.35em;
		}
		&:hover code,
		&:focus-visible code {
			text-decoration: underline;
		}
	}
	.helpbox {
		padding: var(--space-xs) var(--space-s) var(--space-s);
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-xs);
		}
		h2 {
			margin: 0;
			font-size: var(--text-base);
			display: flex;
			align-items: center;
			gap: var(--space-2xs);
		}
		h3 {
			font-size: var(--text-xs);
			letter-spacing: 0.09em;
			text-transform: uppercase;
			color: var(--muted);
			margin: 1rem 0 0.4rem;
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 0;
			display: flex;
			flex-direction: column;
			gap: var(--space-3xs);
		}
		li {
			display: flex;
			gap: var(--space-2xs);
			align-items: baseline;
			&.off {
				color: var(--muted);
			}
		}
		.keys {
			min-width: 4.5rem;
			display: inline-flex;
			gap: 0.2rem;
		}
	}
	.cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 var(--space-m);
	}
	@media (max-width: 899.98px) {
		.palette,
		.help {
			width: 100%;
			max-width: 100%;
			height: 100%;
			max-height: 100%;
			margin: 0;
			border-radius: 0;
		}
		.pal {
			height: 100%;
			max-height: none;
		}
		.inrow {
			padding-top: calc(0.7rem + env(safe-area-inset-top, 0px));
		}
		.foot {
			display: none;
		}
		.cols {
			grid-template-columns: 1fr;
		}
		.helpbox .tipsbox ul {
			grid-template-columns: 1fr;
			gap: var(--space-3xs);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}
</style>
