<!--
	A text field with suggestions that adds the picked values as chips (tags, organizers...).
	Keyboard: ↓/↑ move through suggestions, Enter or comma adds, Escape closes, Backspace on an
	empty field removes the last chip. Follows the ARIA 1.2 combobox + listbox pattern.
	`look="search"` gives it the public search look (a pill field with a magnifier, like the
	lists' TagSearch) for pages outside the panel, where no form styles surround it.
-->
<script context="module">
	let counter = 0;
</script>

<script>
	import { tick } from 'svelte';
	import { Search } from '@lucide/svelte';

	/**
	 * @typedef {object} Item
	 * @prop {string} value what gets added
	 * @prop {string} label
	 * @prop {string} [icon]
	 * @prop {string} [thumb]
	 * @prop {string} [detail]
	 * @prop {string} [color]
	 * @prop {boolean} [create] "create a new one" entry
	 * @prop {boolean} [disabled] informative entry that can't be picked
	 */
	/**
	 * @typedef {object} Chip
	 * @prop {string} label
	 * @prop {string} [icon]
	 * @prop {string} [thumb]
	 * @prop {string} [color]
	 * @prop {string} [title]
	 * @prop {boolean} [unknown] shown dashed (new tag / no profile)
	 */

	/** @type {string[]} */
	export let values = [];
	/** id of the text field (for an external <label for>) */
	export let id = `chip-combobox-${++counter}`;
	export let placeholder = '';
	/** @type {string|undefined} id of a help text */
	export let describedby = undefined;
	/** @type {(query: string, values: string[]) => Item[]} */
	export let search;
	/** @type {(query: string, values: string[], items: Item[]) => Item|null} */
	export let extra = () => null;
	/** @type {(value: string) => Chip} */
	export let chip = (value) => ({ label: value });
	/** What the remove button says, before the chip's name. */
	export let removeLabel = 'Quitar';
	/** @type {(value: string) => string} */
	export let addedMessage = (value) => `Agregado: ${value}`;
	/** @type {(values: string[]) => void} */
	export let onChange = () => {};
	/**
	 * How a picked value joins the list. Returns the new list, or the same array to add nothing.
	 * @type {(values: string[], value: string) => string[]}
	 */
	export let add = (values, value) => [...values, value];
	/**
	 * 'chips' (the panel's, styled by the surrounding form) or 'search' (public pill field).
	 * @type {'chips' | 'search'}
	 */
	export let look = 'chips';
	/**
	 * Extra attributes for the text field (e.g. `name` and `required` for a no-JavaScript
	 * fallback that submits what was typed).
	 * @type {Record<string, string | number | boolean | undefined>}
	 */
	export let inputAttrs = {};

	const listId = `${id}-list`;
	let query = '';
	let open = false;
	let active = -1;
	let announcement = '';
	/** @type {HTMLInputElement} */
	let input;

	$: found = open ? search(query, values) : [];
	$: more = open ? extra(query, values, found) : null;
	$: items = more ? [...found, more] : found;
	$: if (active >= items.length) active = items.length ? 0 : -1;
	$: activeId = open && active >= 0 && items[active] ? `${id}-opt-${active}` : undefined;

	/** @param {Item} item */
	async function pick(item) {
		if (!item || item.disabled) return;
		if (!values.includes(item.value)) {
			const next = add(values, item.value);
			if (next !== values) {
				values = next;
				onChange(values);
				announcement = addedMessage(chip(item.value).label);
			}
		}
		query = '';
		active = -1;
		await tick();
		input?.focus();
	}

	/** @param {number} index */
	function remove(index) {
		const [gone] = values.splice(index, 1);
		values = values;
		onChange(values);
		announcement = `${removeLabel}: ${chip(gone).label}`;
		input?.focus();
	}

	/** @param {number} delta */
	function move(delta) {
		open = true;
		if (!items.length) return;
		let next = active;
		for (let i = 0; i < items.length; i++) {
			next = (next + delta + items.length) % items.length;
			if (!items[next].disabled) break;
		}
		active = next;
		document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
	}

	/** @param {KeyboardEvent} e */
	function onKeydown(e) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Enter' || (e.key === ',' && query.trim())) {
			// Enter never submits the surrounding form from here.
			e.preventDefault();
			if (open && active >= 0 && items[active]) pick(items[active]);
		} else if (e.key === 'Escape') {
			if (open) {
				e.preventDefault();
				open = false;
			} else query = '';
		} else if (e.key === 'Backspace' && !query && values.length) {
			remove(values.length - 1);
		}
	}

	function onInput() {
		open = true;
		// Highlight the best match while typing, so Enter adds it.
		active = query.trim() ? 0 : -1;
	}
</script>

<div class="chip-combobox" class:open class:search={look === 'search'}>
	{#if values.length}
		<ul class="chips" aria-label="Elegidas">
			{#each values as value, i}
				{@const c = chip(value)}
				<li class="chip" class:unknown={c.unknown} style:--chip-color={c.color} title={c.title}>
					{#if c.thumb}<img src={c.thumb} alt="" class="avatar" />{/if}
					<span
						>{#if c.icon}<span aria-hidden="true">{c.icon}</span>
						{/if}{c.label}</span
					>
					<button type="button" on:click={() => remove(i)} aria-label="{removeLabel} {c.label}"
						>×</button
					>
				</li>
			{/each}
		</ul>
	{/if}
	<!-- Between the chips and the text field, so the suggestions list never covers it. -->
	<slot name="after-chips" />
	<div class="field">
		{#if look === 'search'}<Search size="1.1em" aria-hidden="true" class="search-icon" />{/if}
		<input
			{...inputAttrs}
			bind:this={input}
			{id}
			type="text"
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={open && items.length > 0}
			aria-controls={listId}
			aria-activedescendant={activeId}
			aria-describedby={describedby}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			{placeholder}
			bind:value={query}
			on:input={onInput}
			on:focus={() => (open = true)}
			on:blur={() => (open = false)}
			on:click={() => (open = true)}
			on:keydown={onKeydown}
		/>
		<ul id={listId} role="listbox" class="options" hidden={!open || !items.length}>
			{#each items as item, i}
				<!-- Keyboard is handled on the input (aria-activedescendant), as the combobox pattern says. -->
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<li
					id="{id}-opt-{i}"
					role="option"
					aria-selected={i === active}
					aria-disabled={item.disabled ? 'true' : undefined}
					class:active={i === active}
					class:create={item.create}
					class:disabled={item.disabled}
					style:--option-color={item.color}
					on:mousedown|preventDefault
					on:click={() => pick(item)}
					on:mousemove={() => !item.disabled && (active = i)}
				>
					{#if item.thumb}<img src={item.thumb} alt="" class="avatar" />{/if}
					{#if item.icon}<span class="icon" aria-hidden="true">{item.icon}</span>{/if}
					<span class="text">
						<span class="label" style:--chip-color={item.color}>{item.label}</span>
						{#if item.detail}<small>{item.detail}</small>{/if}
					</span>
				</li>
			{/each}
		</ul>
	</div>
	<p class="sr-only" aria-live="polite">{announcement}</p>
</div>

<style lang="scss">
	.chip-combobox {
		display: flex;
		flex-direction: column;
		gap: 0.4em;
		min-width: 0;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35em;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		max-width: 100%;
		padding: 0.15em 0.2em 0.15em 0.7em;
		border-radius: 2em;
		background: var(--chip-color, var(--1));
		color: white;
		font-size: var(--step--1);
		line-height: 1.3;
		&.unknown {
			background: var(--surface, white);
			color: var(--1-dark);
			outline: 2px dashed var(--1-light);
			outline-offset: -2px;
		}
		> span {
			overflow-wrap: anywhere;
		}
		button {
			border: 0;
			background: rgba(255, 255, 255, 0.25);
			color: inherit;
			width: 1.6em;
			height: 1.6em;
			border-radius: 50%;
			cursor: pointer;
			font-size: 1em;
			line-height: 1;
			flex: none;
			&:hover,
			&:focus-visible {
				background: rgba(0, 0, 0, 0.25);
			}
		}
		&.unknown button {
			background: var(--surface-2, #f3eef6);
		}
	}
	.chip .avatar {
		margin-left: -0.5em;
	}
	.avatar {
		width: 1.6em;
		height: 1.6em;
		border-radius: 50%;
		object-fit: cover;
		flex: none;
		background: var(--surface-2, #f3eef6);
	}
	.field {
		position: relative;
	}
	.options {
		position: absolute;
		z-index: 20;
		left: 0;
		right: 0;
		top: calc(100% + 0.3em);
		margin: 0;
		padding: 0.3em;
		list-style: none;
		background: var(--surface, white);
		border-radius: 0.8em;
		box-shadow: 0 0.2em 1em rgba(0, 0, 0, 0.18);
		max-height: 18em;
		overflow: auto;
	}
	[role='option'] {
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.4em 0.6em;
		border-radius: 0.6em;
		cursor: pointer;
		&.active {
			background: var(--surface-2, #f3eef6);
		}
		&.create {
			border-top: 1px solid var(--line, #eee);
			color: var(--1-dark);
			font-weight: bold;
		}
		&.disabled {
			cursor: default;
			opacity: 0.75;
			font-style: italic;
		}
		.text {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		.label {
			overflow-wrap: anywhere;
		}
		small {
			font-size: var(--step--2, 0.75em);
			opacity: 0.7;
		}
	}
	/* look="search": the public pill field, like TagSearch on the lists */
	.search {
		.field {
			display: flex;
			align-items: center;
			gap: 0.4em;
			background: var(--surface, white);
			border-radius: var(--round-pill);
			outline: 1px solid var(--1-light);
			box-shadow: var(--shadow);
			min-height: var(--tap);
			padding: 0.3em 0.9em;
			box-sizing: border-box;
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
			min-width: 0;
			height: 2em;
			border: 0;
			outline: none;
			padding: 0.3em 0.2em;
			font: inherit;
			font-size: var(--step-0);
			background: transparent;
			color: inherit;
			&::placeholder {
				color: color-mix(in srgb, var(--1-ink) 70%, white);
			}
		}
		.options {
			outline: 1px solid var(--1-light);
			box-shadow: 0 0.4em 1.2em color-mix(in srgb, var(--1-dark) 20%, transparent);
			font-size: var(--step--1);
		}
		[role='option'] {
			padding: 0.45em 0.7em;
			border-radius: 0.5em;
			color: color-mix(in srgb, black 25%, var(--option-color, var(--1)));
			&.active {
				background: color-mix(in srgb, var(--option-color, var(--1)) 14%, white);
				outline: 1px solid var(--option-color, var(--1));
			}
			.icon {
				display: inline-block;
				min-width: 1.3em;
			}
		}
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		margin: -1px;
	}
</style>
