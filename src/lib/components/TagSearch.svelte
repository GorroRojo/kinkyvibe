<script context="module">
	/** Para que cada buscador tenga sus propios ids (label, campo, menú y sugerencias). */
	let instances = 0;
</script>

<script>
	/*
	 * El buscador de las listas: un combobox (ARIA 1.2) con sugerencias de etiquetas, propio. Antes
	 * era el de @melt-ui; este hace lo mismo con mucho menos JavaScript (el menú flotante y el
	 * «tocar afuera» viven en $lib/utils/popover.js):
	 * - un clic en el campo abre o cierra las sugerencias; cualquier tecla que escribe las abre
	 *   (no las flechas a los costados, Escape, Enter, Tab, las modificadoras ni las F; tampoco
	 *   Backspace con el campo vacío, que saca la última etiqueta elegida);
	 * - con las sugerencias abiertas: ↓/↑ recorren la lista (y dan la vuelta), Inicio/Fin van a la
	 *   primera y a la última, AvPág/RePág saltan de a 10; Enter suma la resaltada (y la lista
	 *   sigue abierta para sumar otra); Escape, Tab o Alt+↑ las cierran;
	 * - con texto escrito, la primera sugerencia queda resaltada (Enter la suma); sin texto, ninguna;
	 * - con el mouse: pasar por encima resalta, un clic suma; tocar fuera del menú lo cierra.
	 */
	import { onDestroy, tick } from 'svelte';
	import { writable } from 'svelte/store';
	import { Search, X } from '@lucide/svelte';
	import TagChip from './ui/TagChip.svelte';
	import { filteredTags, searchText, tagManager } from '$lib/utils/stores';
	import { filterPosts, suggestTags, aliasIndex, canonicalTag } from '$lib/utils/postSearch';
	import { floatingMenu, outsidePress } from '$lib/utils/popover.js';

	/** Posts the search runs over (before tag/text filtering).
	 * @type {Array<{meta: {tags?: string[]}}>} */
	export let posts = [];

	const uid = `tag-search-${++instances}`;
	const labelId = `${uid}-label`;
	const inputId = `${uid}-input`;
	const menuId = `${uid}-menu`;

	const open = writable(false);
	const inputValue = writable('');
	/** The highlighted suggestion (its tag id), or null.
	 * @type {import('svelte/store').Writable<string | null>} */
	const highlightedItem = writable(null);

	/** Un id estable por sugerencia (para `aria-activedescendant`).
	 * @type {Map<string, string>} */
	const optionIds = new Map();
	/** @param {string} value */
	function optionId(value) {
		let id = optionIds.get(value);
		if (!id) optionIds.set(value, (id = `${uid}-option-${optionIds.size}`));
		return id;
	}

	/** Suma (o, si ya estaba, saca) una etiqueta del filtro y borra el texto escrito.
	 * @param {string} value */
	function select(value) {
		const current = $filteredTags;
		const next = current.includes(value) ? current.filter((t) => t != value) : [...current, value];
		filteredTags.set([...new Set(next.map((t) => canonicalTag($tagManager, t)))]);
		inputValue.set('');
	}

	// The typed text doubles as the free-text search.
	$: searchText.set($inputValue);
	$: if ($searchText !== $inputValue) inputValue.set($searchText);

	$: aliases = aliasIndex($tagManager);
	$: suggestions = suggestTags(
		filterPosts(posts, { tags: $filteredTags }, $tagManager),
		{ selected: $filteredTags, text: $inputValue, aliases },
		$tagManager
	);
	$: values = suggestions.map((s) => s.id);
	// The list re-renders on every keystroke; never keep a highlight on a removed option.
	// Whenever the list changes or opens: with a query, highlight the top suggestion so
	// Enter picks it; with an empty query, highlight nothing so Enter adds no tag.
	// (Also avoids keeping a highlight on an option that was just removed.)
	$: (suggestions, $open, highlightFirst());

	/** @type {HTMLElement} */
	let menuEl;
	async function highlightFirst() {
		await tick();
		if ($open && $inputValue.trim() != '' && values.length > 0) {
			highlightedItem.set(values[0]);
			// the first option sits at the top of the menu: resetting the menu's own scroll is
			// enough, and unlike scrollIntoView() it can't scroll the page or force a layout
			// of the whole document on every keystroke
			if (menuEl.scrollTop != 0) menuEl.scrollTop = 0;
		} else highlightedItem.set(null);
	}

	/** @type {(() => void) | null} */
	let stopOutside = null;
	async function openMenu() {
		open.set(true);
		await tick();
		// La lista abre siempre desde arriba (melt-ui la sacaba de la página al cerrarse).
		if ($open && menuEl.scrollTop != 0) menuEl.scrollTop = 0;
		// Tocar fuera del menú (salvo el campo y su etiqueta) lo cierra.
		stopOutside?.();
		stopOutside = null;
		if (!$open) return;
		stopOutside = outsidePress(menuEl, {
			ignore: (t) => inputEl.contains(t) || !!t.closest(`label[for="${inputId}"]`),
			onOutside: closeMenu
		});
	}
	function closeMenu() {
		open.set(false);
		highlightedItem.set(null);
		stopOutside?.();
		stopOutside = null;
	}
	onDestroy(() => stopOutside?.());

	/** Escape, desde cualquier lado, mientras está abierto.
	 * @param {KeyboardEvent} e */
	function onDocumentKeydown(e) {
		if (!$open || e.key != 'Escape' || !(e.target instanceof HTMLElement)) return;
		e.preventDefault();
		closeMenu();
	}

	/** Resalta una sugerencia y la muestra en la lista.
	 * @param {string} value */
	function highlight(value) {
		highlightedItem.set(value);
		document.getElementById(optionId(value))?.scrollIntoView({ block: 'nearest' });
	}

	/** @param {string} id */
	function removeTag(id) {
		filteredTags.update((tags) => tags.filter((t) => t != id));
	}

	/** Keys that never open the suggestions. */
	const PASSIVE_KEYS = new Set([
		'ArrowLeft',
		'ArrowRight',
		'Escape',
		'Shift',
		'CapsLock',
		'Control',
		'Alt',
		'Meta',
		'Enter',
		'Tab',
		...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)
	]);

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		const el = /** @type {HTMLInputElement} */ (e.currentTarget);
		if (e.key == 'Backspace' && el.value == '' && $filteredTags.length > 0) {
			e.preventDefault();
			removeTag($filteredTags[$filteredTags.length - 1]);
		}
		const wasOpen = $open;
		if (!wasOpen) {
			if (PASSIVE_KEYS.has(e.key) || (e.key == 'Backspace' && el.value == '')) return;
			openMenu();
		}
		if (e.key == 'Tab') return closeMenu();
		if (e.key == 'Enter' && !e.isComposing) {
			e.preventDefault();
			if ($highlightedItem !== null) select($highlightedItem);
			return;
		}
		if (e.key == 'ArrowUp' && e.altKey) return closeMenu();
		const n = values.length;
		const i = $highlightedItem === null ? -1 : values.indexOf($highlightedItem);
		/** @type {Record<string, number>} El índice al que lleva cada tecla (y da la vuelta). */
		const moves = {
			ArrowDown: i == n - 1 ? 0 : i + 1,
			ArrowUp: i <= 0 ? n - 1 : i - 1,
			PageDown: i + 10 > n - 1 ? 0 : i + 10,
			PageUp: i - 10 <= 0 ? n - 1 : i - 10,
			Home: 0,
			End: n - 1
		};
		if (!(e.key in moves)) return;
		e.preventDefault();
		// Recién abierta: sin resaltar (con texto, highlightFirst resalta la primera).
		if (wasOpen && n > 0) highlight(values[moves[e.key]]);
	}

	/** @type {HTMLInputElement} */
	let inputEl;
	/** @type {HTMLElement | undefined} */
	let chipsEl;
	let chipsOverflow = false;
	// Las elegidas se deslizan de costado en su fila (ver el estilo): que se vea la última.
	async function showLastChip() {
		await tick();
		// una variable local: asignarle a `chipsEl.scrollLeft` invalidaría `chipsEl` (modo legacy)
		const el = chipsEl;
		if (!el) return;
		el.scrollLeft = el.scrollWidth;
		// el fundido de la izquierda, solo si hay más de las que entran
		chipsOverflow = el.scrollWidth > el.clientWidth + 1;
	}
	$: ($filteredTags.length, showLastChip());
</script>

<svelte:document on:keydown={onDocumentKeydown} />

<div class="tag-search">
	<label class="visually-hidden" id={labelId} for={inputId}>Buscar por etiquetas o texto</label>
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div class="field" on:click={() => inputEl?.focus()}>
		<Search size="1.1em" aria-hidden="true" class="search-icon" />
		{#if $filteredTags.length > 0}
			<ul
				class="chips"
				class:overflow={chipsOverflow}
				aria-label="Etiquetas seleccionadas"
				bind:this={chipsEl}
			>
				{#each $filteredTags as id (id)}
					{@const tag = $tagManager.get(id)}
					<!-- El chip compartido, elegido (TagChip `selected`), con su botón para sacarla. -->
					<li class="chip">
						<TagChip tag={id} selected
							><button
								type="button"
								aria-label="Sacar etiqueta {tag?.visible_name ?? id}"
								on:click|stopPropagation={() => {
									removeTag(id);
									inputEl?.focus();
								}}><X size="0.9em" aria-hidden="true" /></button
							></TagChip
						>
					</li>
				{/each}
			</ul>
		{/if}
		<input
			bind:this={inputEl}
			id={inputId}
			role="combobox"
			aria-autocomplete="list"
			aria-controls={menuId}
			aria-expanded={$open}
			aria-labelledby={labelId}
			aria-activedescendant={$highlightedItem === null ? undefined : optionId($highlightedItem)}
			data-state={$open ? 'open' : 'closed'}
			value={$inputValue}
			on:input={(e) => inputValue.set(e.currentTarget.value)}
			on:keydown={onKeydown}
			on:click={() => {
				inputEl.focus();
				if ($open) closeMenu();
				else openMenu();
			}}
			type="text"
			autocomplete="off"
			spellcheck="false"
			placeholder={$filteredTags.length > 0
				? 'Sumar otra etiqueta…'
				: 'Buscar por etiqueta o texto…'}
		/>
		{#if $filteredTags.length > 0 || $inputValue != ''}
			<button
				type="button"
				class="clear"
				aria-label="Despejar búsqueda"
				on:click|stopPropagation={() => {
					filteredTags.set([]);
					inputValue.set('');
					inputEl?.focus();
				}}><X size="1em" aria-hidden="true" /></button
			>
		{/if}
	</div>
	<!-- Picking a suggestion with the mouse used to move focus to <body>; keep it in the
	input so the next keystroke still searches. The menu floats at the end of <body>
	($lib/utils/popover.js), so no container clips it. -->
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<ul
		class="menu"
		id={menuId}
		role="listbox"
		hidden={!$open}
		style:display={$open ? null : 'none'}
		bind:this={menuEl}
		use:floatingMenu={{ anchor: () => inputEl, open: $open }}
		on:mousedown|preventDefault
	>
		{#each suggestions as s (s.id)}
			{@const tag = $tagManager.get(s.id)}
			<!-- The keyboard goes through the input (aria-activedescendant), as in any combobox. -->
			<!-- svelte-ignore a11y-click-events-have-key-events a11y-mouse-events-have-key-events a11y-interactive-supports-focus -->
			<li
				class="suggestion"
				id={optionId(s.id)}
				role="option"
				aria-selected="false"
				data-highlighted={$highlightedItem === s.id ? '' : undefined}
				style:--tag-color={tag?.getColor() ?? 'var(--1)'}
				on:click={() => select(s.id)}
				on:mouseover={() => highlightedItem.set(s.id)}
				on:mouseleave={() => highlightedItem.set(null)}
			>
				<span class="name">
					<span class="icon" aria-hidden="true">{tag?.icon ?? '#'}</span>
					{s.name}
					{#if s.alias}<small class="alias">({s.alias})</small>{/if}
				</span>
				<span class="count" aria-label="{s.count} {s.count == 1 ? 'resultado' : 'resultados'}"
					>{s.count}</span
				>
			</li>
		{:else}
			<li class="empty">
				{#if $inputValue.trim() != ''}
					Ninguna etiqueta coincide: buscamos «{$inputValue.trim()}» como texto.
				{:else}
					No hay más etiquetas para sumar.
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style lang="scss">
	.tag-search {
		max-width: 50rem;
		margin-inline: auto;
		width: 100%;
		box-sizing: border-box;
	}
	/* Una sola línea siempre, con su forma de píldora: con muchas etiquetas elegidas, las elegidas
	   se deslizan de costado en su propia fila (con un fundido a la izquierda y la última a la
	   vista) y el campo de texto nunca baja de 10.5em, así se lee «Sumar otra etiqueta…». Antes
	   crecía en varias líneas y la píldora se deformaba. */
	.field {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.3em;
		background: var(--surface);
		border-radius: var(--round-pill);
		outline: 1px solid var(--1-light);
		box-shadow: var(--shadow);
		min-height: var(--tap);
		padding: 0.3em 0.5em 0.3em 0.9em;
		font-size: var(--step--1);
		cursor: text;
		transition: 100ms;
		&:focus-within {
			outline-width: 3px;
		}
		:global(.search-icon) {
			color: var(--1);
			flex: none;
		}
	}
	/* input, chips and the clear button share one height, so the field doesn't grow
	   (and push the results down) when the first chip or the clear button appears */
	input,
	.chip,
	.clear {
		height: 2em;
	}
	input {
		flex: 1 0 10.5em;
		min-width: 10.5em;
		text-overflow: ellipsis;
		border: 0;
		outline: none;
		padding: 0.3em 0.2em;
		font: inherit;
		background: transparent;
	}
	.chips {
		display: flex;
		align-items: center;
		gap: 0.3em;
		flex: 0 1 auto;
		min-width: 0;
		margin: 0;
		padding: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.chips.overflow {
		mask-image: linear-gradient(to left, black calc(100% - 1.5em), transparent);
	}
	/* el chip es el compartido (`.kv-tag.on`, style.scss); acá solo el lugar del botón de sacar */
	.chip {
		list-style: none;
		display: inline-flex;
		flex: none;
		align-items: center;
		:global(.kv-tag) {
			align-self: stretch;
			max-width: 100%;
			padding-inline-end: 0;
			overflow: hidden;
		}
		button {
			display: inline-flex;
			align-items: center;
			align-self: stretch;
			border: 0;
			background: transparent;
			color: inherit;
			padding: 0 0.5em 0 0.35em;
			border-radius: 0 2em 2em 0;
			cursor: pointer;
			&:hover,
			&:focus-visible {
				background: color-mix(in srgb, black 20%, transparent);
				outline: none;
			}
		}
	}
	.clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		border: 0;
		background: transparent;
		color: var(--1);
		padding: 0;
		border-radius: 50%;
		cursor: pointer;
		margin-left: auto;
		&:hover,
		&:focus-visible {
			background: color-mix(in srgb, var(--1) 12%, transparent);
			outline: none;
		}
	}
	.menu {
		z-index: 10;
		min-width: min(22rem, calc(100vw - 2rem));
		margin: 0;
		padding: 0.3em;
		max-height: min(18rem, 50vh);
		overflow-y: auto;
		/* la lista cambia entera con cada etiqueta elegida: que el navegador no la corra para
		   «seguir» una sugerencia que ya no está (como hacía con melt-ui) */
		overflow-anchor: none;
		background: white;
		border-radius: var(--radius-m);
		outline: 1px solid var(--1-light);
		box-shadow: 0 0.4em 1.2em color-mix(in srgb, var(--1-dark) 20%, transparent);
		font-size: var(--step--1);
	}
	.suggestion,
	.empty {
		list-style: none;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1em;
		padding: 0.45em 0.7em;
		border-radius: var(--radius-s);
	}
	.suggestion {
		cursor: pointer;
		color: color-mix(in srgb, black 25%, var(--tag-color));
		&[data-highlighted] {
			background: color-mix(in srgb, var(--tag-color) 14%, white);
			outline: 1px solid var(--tag-color);
		}
	}
	.icon {
		display: inline-block;
		min-width: 1.3em;
	}
	.alias {
		opacity: 0.7;
	}
	.count {
		flex: none;
		font-variant-numeric: tabular-nums;
		background: color-mix(in srgb, var(--tag-color) 14%, white);
		border-radius: var(--radius-m);
		padding: 0.1em 0.55em;
		font-size: var(--step--2);
	}
	.empty {
		color: color-mix(in srgb, black 30%, var(--1));
		opacity: 0.8;
	}
</style>
