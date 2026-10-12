<script>
	/**
	 * «+ Crear ▾» (opción C, parte 2, gorrite 11/10): el botón de la barra de arriba (y del header del
	 * celu, solo el «+») que abre un menú con todo lo que se puede crear (`createItems` de
	 * `$lib/admin/createMenu.js`). Lo que viene va al final, gris y sin link, con «Próximamente».
	 *
	 * Teclado (patrón «menu button»): Enter, Espacio o ↓ abren el menú con el foco en el primero;
	 * ↑/↓, Inicio y Fin recorren; Escape (o Tab hacia afuera, o tocar afuera) lo cierra y el foco
	 * vuelve al botón. Elegir uno lo cierra y navega. Los links precargan la página al pasar el mouse.
	 *
	 * Props: `flags` (`data.navFlags`), `hideSoon` («Ocultar lo que viene»), `compact` (solo el «+»,
	 * para el header del celu; el menú ocupa el ancho de la pantalla).
	 */
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { ChevronDown, Plus } from '@lucide/svelte';
	import { createItems } from '$lib/admin/createMenu.js';

	/** @type {Record<string, boolean>} */
	export let flags = {};
	export let hideSoon = false;
	export let compact = false;

	$: items = createItems({ flags, hideSoon });
	const uid = Math.random().toString(36).slice(2, 8);
	let open = false;
	/** @type {HTMLButtonElement | undefined} */
	let button;
	/** @type {HTMLElement | undefined} */
	let menu;

	/** Los ítems que se pueden enfocar (también los «Próximamente», que se leen pero no abren). */
	const focusables = () =>
		/** @type {HTMLElement[]} */ ([...(menu?.querySelectorAll('[role="menuitem"]') ?? [])]);

	/** @param {'first' | 'last'} [where] */
	async function openMenu(where = 'first') {
		open = true;
		await tick();
		const all = focusables();
		(where === 'last' ? all[all.length - 1] : all[0])?.focus();
	}
	/** @param {boolean} [focusButton] */
	function close(focusButton = false) {
		if (!open) return;
		open = false;
		if (focusButton) button?.focus();
	}
	afterNavigate(() => {
		open = false;
	});

	/** @param {KeyboardEvent} e */
	function onButtonKey(e) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			openMenu('first');
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			openMenu('last');
		} else if (e.key === 'Escape' && open) {
			e.preventDefault();
			close(true);
		}
	}
	/** @param {KeyboardEvent} e */
	function onMenuKey(e) {
		const all = focusables();
		const i = all.indexOf(/** @type {HTMLElement} */ (document.activeElement));
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close(true);
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
			all[next]?.focus();
		} else if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			all[e.key === 'Home' ? 0 : all.length - 1]?.focus();
		} else if (e.key === 'Tab') {
			close();
		}
	}
	/** @param {FocusEvent} e */
	function onFocusOut(e) {
		const to = /** @type {Node | null} */ (e.relatedTarget);
		if (open && to && !(/** @type {HTMLElement} */ (e.currentTarget).contains(to))) open = false;
	}
	/** @param {MouseEvent} e */
	function onWindowClick(e) {
		if (open && !button?.parentElement?.contains(/** @type {Node} */ (e.target))) open = false;
	}
</script>

<svelte:window on:click={onWindowClick} />

<div class="create" class:compact on:focusout={onFocusOut}>
	<button
		type="button"
		class="kv-btn"
		class:icon={compact}
		class:small={compact}
		bind:this={button}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls="kv-create-{uid}"
		aria-label={compact ? 'Crear' : undefined}
		title={compact ? 'Crear' : undefined}
		on:click={() => (open ? close() : openMenu())}
		on:keydown={onButtonKey}
		><Plus size={18} strokeWidth={2.5} aria-hidden="true" />{#if !compact}Crear<ChevronDown
				size={16}
				aria-hidden="true"
				class="chev"
			/>{/if}</button
	>
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions (las flechas y Escape) -->
	<ul
		class="menu"
		id="kv-create-{uid}"
		role="menu"
		aria-label="Crear"
		hidden={!open}
		bind:this={menu}
		on:keydown={onMenuKey}
		data-sveltekit-preload-data="hover"
	>
		{#each items as item, i (item.id)}
			<li role="none" class:first-soon={item.soon && i > 0 && !items[i - 1].soon}>
				{#if item.soon}
					<span
						role="menuitem"
						class="item off"
						aria-disabled="true"
						tabindex="-1"
						title={item.phase ? `Próximamente (fase ${item.phase})` : 'Próximamente'}
						><svelte:component this={item.icon} size={18} aria-hidden="true" /><span class="txt"
							>{item.label}</span
						><span class="tag">Próximamente</span></span
					>
				{:else}
					<a role="menuitem" class="item" href={item.href} tabindex="-1" on:click={() => close()}
						><svelte:component this={item.icon} size={18} aria-hidden="true" /><span class="txt"
							>{item.label}<small>{item.hint}</small></span
						></a
					>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.create {
		position: relative;
		flex: none;
	}
	.create :global(.chev) {
		margin-left: -0.15rem;
		transition: transform 150ms;
	}
	button[aria-expanded='true'] :global(.chev) {
		transform: rotate(180deg);
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.35rem);
		z-index: 25;
		width: min(22rem, calc(100vw - 32px));
		max-height: min(32rem, calc(100dvh - 6rem));
		overflow-y: auto;
		margin: 0;
		padding: var(--space-3xs);
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--round);
		box-shadow: var(--shadow-2);
	}
	.menu[hidden] {
		display: none;
	}
	/* En el celu el menú va de borde a borde (con el margen de 16 px), debajo del header. */
	.compact .menu {
		position: fixed;
		left: 16px;
		right: 16px;
		top: 3.75rem;
		width: auto;
	}
	.first-soon {
		margin-top: var(--space-3xs);
		padding-top: var(--space-3xs);
		border-top: 1px solid var(--line);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 0.65em;
		min-height: var(--tap);
		padding: var(--space-3xs) var(--space-xs);
		border-radius: var(--radius-s);
		color: var(--accent);
		font-weight: 700;
		text-decoration: none;
		outline-offset: -2px;
	}
	.item :global(svg) {
		flex: none;
	}
	a.item:hover,
	a.item:focus-visible,
	a.item:focus {
		background: var(--surface-2);
		color: var(--link);
	}
	.txt {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.25;
	}
	.txt small {
		font-weight: 400;
		font-size: var(--text-xs);
		color: var(--muted);
	}
	.item.off {
		color: var(--muted);
		font-weight: 400;
		cursor: default;
	}
	.item.off:focus {
		background: var(--surface-2);
	}
	.tag {
		margin-left: auto;
		font-size: var(--text-xs);
		border: 1px solid var(--line);
		border-radius: 2em;
		padding: 0 0.5em;
		white-space: nowrap;
	}
</style>
