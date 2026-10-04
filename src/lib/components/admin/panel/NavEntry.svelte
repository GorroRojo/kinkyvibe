<script>
	/**
	 * Una sección del menú del panel (barra lateral o panel "Más" del celu), según su estado en
	 * `$lib/admin/nav.js` (`navState`): lista, "prueba" (interruptor apagado) o próximamente (gris
	 * y punteada, con "fase N", y lleva a su página "Próximamente").
	 * Props: `item` (NavItem), `state`, `active` (página actual), `count` (contador amarillo),
	 * `variant` ('side' | 'tile').
	 */
	import NavIcon from './NavIcon.svelte';

	/** @type {import('$lib/admin/nav.js').NavItem} */
	export let item;
	/** @type {'soon' | 'prueba' | 'hidden' | 'ready'} */
	export let state = 'ready';
	export let active = false;
	export let count = 0;
	/** @type {'side' | 'tile'} */
	export let variant = 'side';
</script>

<a
	href={item.href}
	class={variant}
	class:on={active}
	class:soon={state === 'soon'}
	class:hl={variant === 'tile' && item.highlight && state !== 'soon'}
	aria-current={active ? 'page' : undefined}
	><NavIcon {item} size={variant === 'side' ? 18 : 20} /><span class="label">{item.label}</span
	>{#if state === 'soon'}<span class="tag">fase {item.phase}</span
		>{:else if state === 'prueba'}<span
			class="tag prueba"
			title="Su interruptor está apagado: solo lo ven les superadmins">prueba</span
		>{/if}{#if count && state !== 'soon'}<span class="count" title="Pendientes">{count}</span
		>{/if}</a
>

<style lang="scss">
	a {
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		text-decoration: none;
		color: var(--accent);
		font-weight: 700;
		min-width: 0;
	}
	.label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.side {
		padding: 0.38rem var(--space-xs) 0.38rem var(--space-l);
		border-radius: var(--round);
		font-size: var(--text-sm);
		transition: background 100ms;
		&:hover {
			background: var(--surface-2);
			color: var(--accent);
		}
		&.on {
			background: var(--link-bg);
			color: var(--link);
		}
	}
	.tile {
		background: var(--surface);
		border-radius: var(--round);
		box-shadow: var(--shadow);
		padding: var(--space-xs) var(--space-xs);
		&.hl {
			background: var(--accent);
			color: var(--accent-ink);
		}
		&.on {
			color: var(--link);
			box-shadow: inset 0 0 0 2px var(--link);
		}
	}
	/* Lo que viene: gris y punteado, al final de su área. */
	.soon {
		color: var(--muted);
		font-weight: 400;
		outline: 1.5px dashed var(--line);
		outline-offset: -1.5px;
		&.tile {
			background: transparent;
			box-shadow: none;
		}
		&:hover {
			color: var(--text);
		}
		:global(svg) {
			opacity: 0.7;
		}
	}
	.tag {
		margin-left: auto;
		font-size: var(--text-xs);
		font-weight: 400;
		border: 1px solid var(--line);
		color: var(--muted);
		border-radius: 2em;
		padding: 0 0.5em;
		white-space: nowrap;
		&.prueba {
			border-color: var(--warn, var(--line));
			color: var(--warn, var(--muted));
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
	.tag + .count {
		margin-left: 0.3rem;
	}
</style>
