<script>
	import { createCombobox, melt } from '@melt-ui/svelte';
	import { tick } from 'svelte';
	import { writable } from 'svelte/store';
	import { Search, X } from 'lucide-svelte';
	import { filteredTags, searchText, tagManager } from '$lib/utils/stores';
	import { filterPosts, suggestTags, aliasIndex, canonicalTag } from '$lib/utils/postSearch';

	/** Posts the search runs over (before tag/text filtering).
	 * @type {Array<{meta: {tags?: string[]}}>} */
	export let posts = [];

	/** @type {import('svelte/store').Writable<Array<{value: string, label?: string}>>} */
	const selected = writable([]);

	const {
		elements: { menu, input, option, label },
		states: { open, inputValue, highlightedItem }
	} = createCombobox({
		multiple: true,
		selected,
		preventScroll: false,
		positioning: { placement: 'bottom-start', sameWidth: false, gutter: 6 },
		// Selecting a suggestion adds it to the filter and clears the typed text.
		onSelectedChange: ({ next }) => {
			const ids = (next ?? []).map((o) => canonicalTag($tagManager, o.value));
			filteredTags.set([...new Set(ids)]);
			inputValue.set('');
			return next;
		}
	});

	// Keep Melt's selection mirrored from the shared store (FilterBar, inline tags and the URL write it too).
	$: selected.set($filteredTags.map((t) => ({ value: t, label: t })));

	// The typed text doubles as the free-text search.
	$: searchText.set($inputValue);
	$: if ($searchText !== $inputValue) inputValue.set($searchText);

	$: aliases = aliasIndex($tagManager);
	$: suggestions = suggestTags(
		filterPosts(posts, { tags: $filteredTags }, $tagManager),
		{ selected: $filteredTags, text: $inputValue, aliases },
		$tagManager
	);
	// The list re-renders on every keystroke; never keep a highlight on a removed option.
	// Whenever the list changes or opens: with a query, highlight the top suggestion so
	// Enter picks it; with an empty query, highlight nothing so Enter adds no tag.
	// (Also avoids keeping a highlight on an option that was just removed.)
	$: suggestions, $open, highlightFirst();

	/** @type {HTMLElement} */
	let menuEl;
	async function highlightFirst() {
		await tick();
		const first = menuEl?.querySelector('[role=option]:not([data-disabled])');
		if ($open && $inputValue.trim() != '' && first instanceof HTMLElement) {
			highlightedItem.set(first);
			first.scrollIntoView({ block: 'nearest' });
		} else highlightedItem.set(null);
	}

	/** @param {string} id */
	function removeTag(id) {
		filteredTags.update((tags) => tags.filter((t) => t != id));
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		const el = /** @type {HTMLInputElement} */ (e.currentTarget);
		if (e.key == 'Backspace' && el.value == '' && $filteredTags.length > 0) {
			e.preventDefault();
			removeTag($filteredTags[$filteredTags.length - 1]);
		}
	}

	/** @type {HTMLInputElement} */
	let inputEl;
</script>

<div class="tag-search">
	<!-- svelte-ignore a11y-label-has-associated-control -->
	<label class="visually-hidden" use:melt={$label}>Buscar por etiquetas o texto</label>
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div class="field" on:click={() => inputEl?.focus()}>
		<Search size="1.1em" aria-hidden="true" class="search-icon" />
		{#if $filteredTags.length > 0}
			<ul class="chips" aria-label="Etiquetas seleccionadas">
				{#each $filteredTags as id (id)}
					{@const tag = $tagManager.get(id)}
					<li class="chip" style:--tag-color={tag?.getColor() ?? 'var(--1)'}>
						<span>{tag?.icon ?? ''} {tag?.visible_name ?? id}</span>
						<button
							type="button"
							aria-label="Quitar etiqueta {tag?.visible_name ?? id}"
							on:click|stopPropagation={() => {
								removeTag(id);
								inputEl?.focus();
							}}><X size="0.9em" aria-hidden="true" /></button
						>
					</li>
				{/each}
			</ul>
		{/if}
		<input
			bind:this={inputEl}
			use:melt={$input}
			on:keydown={onKeydown}
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
	<ul class="menu" bind:this={menuEl} use:melt={$menu}>
		{#each suggestions as s (s.id)}
			{@const tag = $tagManager.get(s.id)}
			<li
				class="suggestion"
				style:--tag-color={tag?.getColor() ?? 'var(--1)'}
				use:melt={$option({ value: s.id, label: s.name })}
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
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	.field {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3em;
		background: white;
		border-radius: 1.3em;
		outline: 1px solid var(--1-light);
		padding: 0.3em 0.5em 0.3em 0.8em;
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
	input {
		flex: 1 1 10em;
		min-width: 6em;
		border: 0;
		outline: none;
		padding: 0.3em 0.2em;
		font: inherit;
		background: transparent;
		&::placeholder {
			color: color-mix(in srgb, var(--1-dark) 55%, white);
		}
	}
	.chips {
		display: contents;
	}
	.chip {
		list-style: none;
		display: inline-flex;
		align-items: center;
		background: var(--tag-color);
		color: white;
		border-radius: 2em;
		line-height: 1;
		padding-left: 0.6em;
		max-width: 100%;
		span {
			padding-block: 0.3em;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		button {
			display: inline-flex;
			align-items: center;
			border: 0;
			background: transparent;
			color: inherit;
			padding: 0.3em 0.5em 0.3em 0.35em;
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
		border: 0;
		background: transparent;
		color: var(--1);
		padding: 0.3em;
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
		background: white;
		border-radius: 0.8em;
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
		border-radius: 0.5em;
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
		border-radius: 1em;
		padding: 0.1em 0.55em;
		font-size: var(--step--2);
	}
	.empty {
		color: color-mix(in srgb, black 30%, var(--1));
		opacity: 0.8;
	}
</style>
