<script>
	import { onMount, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { Search, X, LoaderCircle } from '@lucide/svelte';
	import { searchOpen } from '$lib/utils/stores';
	import { TIMEZONE } from '$lib/utils/dates.js';

	/** Resultados que se muestran por grupo antes de "Ver más". */
	const PER_GROUP = 5;
	/** Tope por grupo al expandirlo. */
	const MAX_GROUP = 50;

	/** @type {typeof import('$lib/utils/search') | undefined} */
	let engine;
	/** @type {import('$lib/utils/search').PreparedIndex | undefined} */
	let index;
	/** @type {Promise<void> | undefined} */
	let loadingIndex;
	let error = '';
	let query = '';
	let active = 0;
	/** @type {Record<string, boolean>} */
	let expanded = {};
	let lastMs = 0;
	/** @type {HTMLInputElement} */
	let input;
	/** @type {HTMLElement} */
	let dialog;
	/** @type {Element | null} */
	let previouslyFocused = null;
	let shortcut = 'Ctrl K';

	/**
	 * @typedef {{kind: 'hit', id: string, href: string, hit: import('$lib/utils/search').SearchHit}
	 *   | {kind: 'more', id: string, key: string, count: number}} Item
	 */

	/**
	 * Descarga el índice y el motor recién la primera vez que se abre el buscador.
	 */
	function ensureIndex() {
		if (loadingIndex) return loadingIndex;
		loadingIndex = (async () => {
			try {
				const [mod, res] = await Promise.all([
					import('$lib/utils/search'),
					fetch('/api/search-index.json')
				]);
				if (!res.ok) throw new Error(res.statusText);
				const raw = await res.json();
				engine = mod;
				index = mod.prepareIndex(raw);
			} catch (e) {
				console.error(e);
				error = 'No pudimos cargar el buscador. Probá de nuevo en un rato.';
				loadingIndex = undefined;
			}
		})();
		return loadingIndex;
	}

	/**
	 * @param {string} q
	 * @param {typeof index} idx
	 * @param {Record<string, boolean>} exp
	 */
	function compute(q, idx, exp) {
		if (!engine || !idx || q.trim().length < 2) return [];
		const t0 = performance.now();
		const grouped = engine.groupHits(engine.search(idx, q));
		lastMs = performance.now() - t0;
		const limit = grouped.length === 1 ? PER_GROUP * 2 : PER_GROUP;
		return grouped.map((g) => {
			const shown = g.hits.slice(0, exp[g.key] ? MAX_GROUP : limit);
			/** @type {Item[]} */
			const items = shown.map((hit) => ({
				kind: 'hit',
				id: `search-opt-${hit.i}`,
				href: hit.doc.h,
				hit
			}));
			const rest = Math.min(g.hits.length, MAX_GROUP) - shown.length;
			if (rest > 0)
				items.push({ kind: 'more', id: `search-more-${g.key}`, key: g.key, count: rest });
			return { ...g, items, total: g.hits.length };
		});
	}

	$: groups = compute(query, index, expanded);
	$: flat = groups.flatMap((g) => g.items);
	$: total = groups.reduce((n, g) => n + g.total, 0);
	$: if (active >= flat.length) active = Math.max(0, flat.length - 1);
	$: activeId = flat[active]?.id;

	/** @param {string} _q */
	function resetSelection(_q) {
		active = 0;
		expanded = {};
	}
	$: resetSelection(query);

	async function open() {
		previouslyFocused = document.activeElement;
		document.body.style.overflow = 'hidden';
		ensureIndex();
		await tick();
		input?.focus();
		input?.select();
	}

	function close() {
		document.body.style.overflow = '';
		if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
		previouslyFocused = null;
	}

	onMount(() => {
		if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = '⌘ K';
		let wasOpen = false;
		const unsubscribe = searchOpen.subscribe((isOpen) => {
			if (isOpen && !wasOpen) open();
			if (!isOpen && wasOpen) close();
			wasOpen = isOpen;
		});
		return () => {
			unsubscribe();
			document.body.style.overflow = '';
		};
	});

	/** @param {Item | undefined} item */
	function activate(item) {
		if (!item) return;
		if (item.kind === 'more') {
			expanded = { ...expanded, [item.key]: true };
			return;
		}
		searchOpen.set(false);
		goto(item.href);
	}

	/** @param {number} i */
	async function move(i) {
		if (flat.length === 0) return;
		active = (i + flat.length) % flat.length;
		await tick();
		document.getElementById(flat[active].id)?.scrollIntoView({ block: 'nearest' });
	}

	/** @param {KeyboardEvent} e */
	function onInputKeydown(e) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(active + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(active - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			activate(flat[active]);
		}
	}

	/** @param {KeyboardEvent} e */
	function onDialogKeydown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			searchOpen.set(false);
		} else if (e.key === 'Tab') {
			// trampa de foco: Tab sólo recorre el diálogo
			const focusables = /** @type {HTMLElement[]} */ ([
				...dialog.querySelectorAll('input, button, [href]')
			]).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0);
			if (focusables.length === 0) return;
			if (!dialog.contains(document.activeElement)) {
				e.preventDefault();
				focusables[0].focus();
				return;
			}
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	/** @param {KeyboardEvent} e */
	function onWindowKeydown(e) {
		if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchOpen.update((v) => !v);
		} else if ($searchOpen && dialog && !dialog.contains(/** @type {Node} */ (e.target))) {
			// por si el foco quedó afuera (p. ej. un clic en el fondo): Esc y Tab igual funcionan
			onDialogKeydown(e);
		}
	}

	const dateFormat = new Intl.DateTimeFormat('es-AR', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: TIMEZONE
	});
	/** @param {string} d */
	const formatDate = (d) => dateFormat.format(new Date(d));
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if $searchOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="backdrop"
		transition:fade={{ duration: 100 }}
		on:click|self={() => searchOpen.set(false)}
	>
		<div
			class="palette"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-labelledby="search-title"
			data-ready={index ? '' : undefined}
			bind:this={dialog}
			on:keydown={onDialogKeydown}
		>
			<h2 id="search-title" class="visually-hidden">Buscar en KinkyVibe</h2>
			<div class="bar">
				<span class="icon" aria-hidden="true">
					{#if loadingIndex && !index && !error}
						<span class="spin"><LoaderCircle size="1.2em" /></span>
					{:else}
						<Search size="1.2em" />
					{/if}
				</span>
				<input
					bind:this={input}
					bind:value={query}
					on:keydown={onInputKeydown}
					type="search"
					placeholder="Buscar eventos, series, material, amigues, Kinkipedia…"
					autocomplete="off"
					spellcheck="false"
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={flat.length > 0}
					aria-controls="search-results"
					aria-activedescendant={flat.length > 0 ? activeId : undefined}
					aria-label="Buscar"
				/>
				<button class="close" on:click={() => searchOpen.set(false)} aria-label="Cerrar buscador">
					<span class="esc" aria-hidden="true">Esc</span>
					<span class="x" aria-hidden="true"><X size="1.3em" /></span>
				</button>
			</div>

			<div
				class="results"
				id="search-results"
				role="listbox"
				aria-label="Resultados"
				data-ms={lastMs.toFixed(1)}
			>
				{#if error}
					<p class="status">{error}</p>
				{:else if query.trim().length < 2}
					<p class="status">
						Buscá en todo el sitio: eventos, series, textos, amigues y la Kinkipedia.<br />
						<small>Probá con «shibari», «consentimiento» o el nombre de une autore.</small>
					</p>
				{:else if !index}
					<p class="status">Cargando el índice…</p>
				{:else if flat.length === 0}
					<p class="status">No encontramos nada para «{query.trim()}».</p>
				{:else}
					{#each groups as group (group.key)}
						<div class="group" role="group" aria-labelledby="search-group-{group.key}">
							<div class="grouplabel" id="search-group-{group.key}" role="presentation">
								{group.label} <small>{group.total}</small>
							</div>
							{#each group.items as item (item.id)}
								{@const i = flat.indexOf(item)}
								{@const doc = item.kind === 'hit' ? item.hit.doc : undefined}
								{@const names =
									item.kind === 'hit' && engine && index
										? engine.matchedNames(index, item.hit.doc, item.hit.words)
										: []}
								{#if item.kind === 'hit' && doc && engine}
									<a
										id={item.id}
										href={item.href}
										class="option"
										class:active={i === active}
										role="option"
										aria-selected={i === active}
										tabindex="-1"
										on:mousemove={() => (active = i)}
										on:click={() => searchOpen.set(false)}
									>
										<span class="title">
											{#if doc.i}<span aria-hidden="true">{doc.i}&nbsp;</span>{/if}
											{#each engine.highlight(doc.t, item.hit.words) as part}
												{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}
											{/each}
										</span>
										{#if doc.c === 'calendario' && doc.d}
											<time class="date" datetime={doc.d}>{formatDate(doc.d)}</time>
										{/if}
										{#if names.length > 0}
											<span class="names">
												{#each names as name}<span class="name">{name}</span>{/each}
											</span>
										{/if}
										<span class="snippet">
											{#each engine.snippet(doc, item.hit.words, 140) as part}
												{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}
											{/each}
										</span>
									</a>
								{:else if item.kind === 'more'}
									<button
										id={item.id}
										class="option more"
										class:active={i === active}
										role="option"
										aria-selected={i === active}
										tabindex="-1"
										on:mousemove={() => (active = i)}
										on:click={() => activate(item)}
									>
										Ver {item.count} más en {group.label}
									</button>
								{/if}
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<div class="footer" aria-hidden="true">
				<span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
				<span><kbd>Enter</kbd> abrir</span>
				<span><kbd>Esc</kbd> cerrar</span>
				<span class="count">
					{#if total > 0}{total} resultado{total === 1 ? '' : 's'}{/if}
					<kbd>{shortcut}</kbd>
				</span>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
		background: color-mix(in srgb, black 55%, transparent);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding: 8vh 1em 1em;
	}
	.palette {
		width: 100%;
		max-width: 680px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		background: white;
		border-radius: var(--round, 1rem);
		box-shadow: 0 1em 3em rgba(0, 0, 0, 0.35);
		overflow: hidden;
		color: #222;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.6em 0.8em;
		border-bottom: 2px solid var(--1);
		.icon {
			color: var(--1);
			display: flex;
		}
		input {
			flex: 1;
			min-width: 0;
			border: 0;
			outline: 0;
			font: inherit;
			font-size: var(--step-0, 1.1rem);
			padding: 0.4em 0.2em;
			background: transparent;
			color: inherit;
		}
		input::-webkit-search-cancel-button {
			display: none;
		}
	}
	.spin {
		display: flex;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			rotate: 360deg;
		}
	}
	.close {
		border: 0;
		background: none;
		cursor: pointer;
		color: gray;
		display: flex;
		align-items: center;
		padding: 0.3em;
		border-radius: 0.4em;
		font: inherit;
		&:focus-visible {
			outline: 2px solid var(--2);
		}
		.x {
			display: none;
		}
	}
	.esc,
	kbd {
		font-family: inherit;
		font-size: 0.75em;
		border: 1px solid #ccc;
		border-bottom-width: 2px;
		border-radius: 0.3em;
		padding: 0.05em 0.4em;
		color: #555;
		background: #fafafa;
	}
	.results {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.3em 0.5em 0.6em;
		flex: 1;
	}
	.status {
		color: #555;
		padding: 1em 0.5em;
		margin: 0;
		small {
			color: gray;
		}
	}
	.grouplabel {
		position: sticky;
		top: -0.3em;
		background: white;
		font-weight: bold;
		font-size: 0.8em;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--2);
		padding: 0.8em 0.5em 0.3em;
		z-index: 1;
		small {
			color: gray;
			font-weight: normal;
		}
	}
	.option {
		display: flex;
		flex-direction: column;
		gap: 0.15em;
		padding: 0.5em 0.6em;
		border-radius: 0.6em;
		text-decoration: none;
		color: inherit;
		border-left: 3px solid transparent;
		&.active {
			background: color-mix(in srgb, var(--1) 10%, white);
			border-left-color: var(--1);
		}
	}
	.title {
		font-weight: bold;
		color: var(--1-dark);
	}
	.date {
		font-size: 0.8em;
		color: var(--2-dark);
		font-weight: bold;
	}
	.names {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3em;
		font-size: 0.75em;
		.name {
			border: 1px solid var(--1-light);
			color: var(--1-dark);
			border-radius: 1em;
			padding: 0 0.5em;
		}
	}
	.snippet {
		font-size: 0.85em;
		color: #444;
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	mark {
		background: color-mix(in srgb, var(--4) 70%, white);
		color: inherit;
		border-radius: 0.15em;
		padding: 0 0.05em;
	}
	.more {
		width: 100%;
		border: 0;
		background: none;
		font: inherit;
		font-size: 0.85em;
		color: var(--2);
		text-align: left;
		cursor: pointer;
	}
	.footer {
		display: flex;
		gap: 1em;
		padding: 0.5em 1em;
		border-top: 1px solid #eee;
		font-size: 0.8em;
		color: gray;
		.count {
			margin-left: auto;
		}
	}
	@media screen and (max-width: 680px) {
		.backdrop {
			padding: 0;
		}
		.palette {
			max-width: none;
			max-height: none;
			height: 100%;
			height: 100dvh;
			border-radius: 0;
		}
		.close {
			.esc {
				display: none;
			}
			.x {
				display: flex;
			}
		}
		.footer {
			display: none;
		}
	}
</style>
