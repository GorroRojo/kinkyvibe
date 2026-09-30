<script>
	/**
	 * Buscador global del panel: una paleta de comandos que busca registros (eventos, órdenes
	 * `KV-…`, entradas por código, códigos de descuento y personas; ver /admin/buscar) y acciones
	 * (cada sección del menú, "Nuevo código", "Abrir check-in de hoy"...).
	 *
	 * Interfaz (la usa el layout del panel):
	 * - prop `compact`: texto corto, para el header del celu;
	 * - prop `hotkeys`: si esta instancia escucha el teclado (`/` y Ctrl/⌘+K abren la paleta,
	 *   `g` + letra navega, `?` muestra los atajos). Solo una instancia la tiene en `true`;
	 * - `open()` exportada, para abrirla desde afuera (bind:this).
	 *
	 * Teclado adentro: ↑/↓ para moverse, Enter para abrir, Esc para cerrar. En el celu la paleta
	 * ocupa toda la pantalla.
	 */
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowLeftRight,
		ArrowRight,
		BookOpen,
		Calendar,
		CalendarPlus,
		ChartLine,
		ExternalLink,
		EyeOff,
		Heart,
		History,
		House,
		Key,
		Keyboard,
		LoaderCircle,
		LogOut,
		Mail,
		Receipt,
		ScanLine,
		Search,
		Settings,
		Sheet,
		Tag,
		Ticket,
		User,
		Users,
		Wallet,
		X
	} from '@lucide/svelte';
	import {
		OTHER_SHORTCUTS,
		buildCommands,
		goShortcutHref,
		goShortcutRows,
		matchCommands
	} from '$lib/admin/commands.js';

	/** Texto corto para el header del celu. */
	export let compact = false;
	/** Si esta instancia escucha el teclado. */
	export let hotkeys = true;

	const ICONS = /** @type {Record<string, any>} */ ({
		home: House,
		calendar: Calendar,
		'calendar-plus': CalendarPlus,
		sheet: Sheet,
		scan: ScanLine,
		wallet: Wallet,
		transfer: ArrowLeftRight,
		tag: Tag,
		users: Users,
		chart: ChartLine,
		book: BookOpen,
		heart: Heart,
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
		code: Tag
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

	let q = '';
	let active = 0;
	let loading = false;
	let errorText = '';
	/** @type {{ slug: string, title: string, href: string }[]} */
	let today = [];
	/** @type {{ id: string, label: string, items: { id: string, icon: string, title: string, sub: string, href: string }[] }[]} */
	let groups = [];
	/** @type {AbortController | null} */
	let inflight = null;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	let lastQuery = '\u0000';

	/**
	 * @typedef {{ key: string, icon: string, title: string, sub: string, href?: string,
	 *   external?: boolean, run?: 'help', shortcut?: string }} Row
	 */

	$: commands = buildCommands({ today });
	$: actionRows = /** @type {Row[]} */ (
		matchCommands(commands, q, q.trim() ? 6 : 8).map((c) => ({
			key: c.id,
			icon: c.icon,
			title: c.label,
			sub: c.hint,
			href: c.href,
			external: c.external,
			run: c.run,
			shortcut: c.shortcut
		}))
	);
	$: sections = [
		...(actionRows.length ? [{ id: 'actions', label: 'Acciones', rows: actionRows }] : []),
		...groups.map((g) => ({
			id: g.id,
			label: g.label,
			rows: /** @type {Row[]} */ (g.items.map((i) => ({ ...i, key: i.id })))
		}))
	];
	$: flat = sections.flatMap((s) => s.rows);
	$: if (active >= flat.length) active = Math.max(0, flat.length - 1);
	$: search(q);

	export async function open() {
		if (isOpen) return;
		isOpen = true;
		q = '';
		active = 0;
		groups = [];
		errorText = '';
		dialog?.showModal?.();
		await tick();
		input?.focus();
		fetchResults('');
	}
	function close() {
		isOpen = false;
		if (dialog?.open) dialog.close();
	}
	function openHelp() {
		close();
		helpOpen = true;
		helpDialog?.showModal?.();
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
		if (trimmed.length < 2) {
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
		}
	}

	/** Índice de cada fila en la lista plana (para ids y `active`). */
	/** @param {number} si @param {number} ri */
	function indexOf(si, ri) {
		let n = 0;
		for (let s = 0; s < si; s++) n += sections[s].rows.length;
		return n + ri;
	}

	onMount(() => {
		if (!hotkeys) return;
		let pendingG = false;
		/** @type {ReturnType<typeof setTimeout> | undefined} */
		let gTimer;
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
			if (typing || e.ctrlKey || e.metaKey || e.altKey || isOpen || helpOpen) return;
			if (document.querySelector('dialog[open]')) return;
			if (pendingG) {
				pendingG = false;
				clearTimeout(gTimer);
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
				pendingG = true;
				gTimer = setTimeout(() => (pendingG = false), 1200);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
			clearTimeout(gTimer);
		};
	});
</script>

<button type="button" class="search" class:compact on:click={open} aria-haspopup="dialog">
	<Search size={18} aria-hidden="true" />
	<span class="label">{compact ? 'Buscar o hacer…' : 'Buscar personas, eventos o acciones…'}</span>
	{#if !compact}<kbd>/</kbd>{/if}
</button>

<dialog
	bind:this={dialog}
	class="palette"
	on:close={() => (isOpen = false)}
	on:click|self={close}
	aria-label="Buscar en el panel"
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
					placeholder="Buscá eventos, KV-…, personas, códigos o una acción"
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
								><svelte:component this={ICONS[row.icon] ?? ArrowRight} size={18} /></span
							>
							<span class="ot">
								<b>{row.title}</b>
								{#if row.sub}<small>{row.sub}</small>{/if}
							</span>
							{#if row.shortcut}<kbd class="sc">{row.shortcut}</kbd>{/if}
						</div>
					{/each}
				{/each}
				{#if errorText}
					<p class="note bad" role="alert">{errorText}</p>
				{:else if q.trim().length >= 2 && !loading && !groups.length}
					<p class="note">No encontramos registros con "{q.trim()}".</p>
				{:else if q.trim().length === 1}
					<p class="note">Escribí una letra más para buscar registros.</p>
				{/if}
			</div>

			<footer class="foot">
				<span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
				<span><kbd>Enter</kbd> abrir</span>
				<span><kbd>Esc</kbd> cerrar</span>
				<button type="button" class="linkish" on:click={openHelp}><kbd>?</kbd> atajos</button>
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
		gap: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--field, var(--1-light));
		border-radius: 3em;
		padding: 0.5rem 1rem;
		color: color-mix(in srgb, var(--1-dark) 55%, var(--surface));
		text-align: left;
		cursor: text;
		&.compact {
			padding: 0.5rem 0.8rem;
		}
		:global(svg) {
			flex: none;
			color: var(--accent);
		}
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	kbd {
		font: inherit;
		font-size: 0.72rem;
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 0.4em;
		padding: 0.05em 0.45em;
		color: var(--muted);
	}
	.search kbd {
		margin-left: auto;
	}
	dialog {
		border: 0;
		padding: 0;
		border-radius: var(--card-round, 1.25rem);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.25);
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
		gap: 0.6rem;
		padding: 0.7rem 0.9rem;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
		input {
			flex: 1;
			min-width: 0;
			border: 0;
			background: none;
			font-size: 1.05rem;
			padding: 0.3rem 0;
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
		padding: 0.3rem 0.4rem 0.5rem;
		flex: 1;
	}
	.gl {
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted);
		font-weight: 700;
		padding: 0.7rem 0.6rem 0.25rem;
	}
	.opt {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.5rem 0.6rem;
		border-radius: 0.7em;
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
		border-radius: 0.6em;
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
		gap: 0.3rem 1rem;
		padding: 0.55rem 0.9rem;
		border-top: 1px solid var(--line);
		font-size: 0.8rem;
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
		margin-left: auto;
		font-size: inherit;
	}
	.help {
		width: min(40rem, calc(100% - 32px));
	}
	.helpbox {
		padding: 1rem 1.2rem 1.2rem;
		header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
		}
		h2 {
			margin: 0;
			font-size: 1.15rem;
			display: flex;
			align-items: center;
			gap: 0.5rem;
		}
		h3 {
			font-size: 0.72rem;
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
			gap: 0.35rem;
		}
		li {
			display: flex;
			gap: 0.7rem;
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
		gap: 0 1.5rem;
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
	}
	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}
</style>
