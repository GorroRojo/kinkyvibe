<script>
	/**
	 * Pestañas como links (cada una es una URL). En el celu se deslizan de costado.
	 * Props: `tabs`: { href, label, count?, soon? }[]; `current` (opcional): el href activo. Si no se
	 * pasa, se marca la que coincide con la URL actual.
	 */
	import { page } from '$app/stores';
	/** @type {{ href: string, label: string, count?: number, soon?: boolean }[]} */
	export let tabs = [];
	/** @type {string | undefined} */
	export let current = undefined;
	$: active = current ?? $page.url.pathname.replace(/\/+$/, '');
</script>

<nav class="tabs" aria-label="Pestañas">
	{#each tabs as tab (tab.href)}
		{#if tab.soon}
			<span class="tab off" aria-disabled="true" title="Próximamente">{tab.label}</span>
		{:else}
			<a
				class="tab"
				class:on={active === tab.href}
				href={tab.href}
				aria-current={active === tab.href ? 'page' : undefined}
				>{tab.label}{#if tab.count}<span class="count">{tab.count}</span>{/if}</a
			>
		{/if}
	{/each}
</nav>

<style>
	.tabs {
		display: flex;
		gap: 0.3rem;
		border-bottom: 1px solid var(--line);
		overflow-x: auto;
		scrollbar-width: thin;
		margin-bottom: 1rem;
	}
	.tab {
		padding: 0.6rem 0.9rem;
		border-bottom: 3px solid transparent;
		font-weight: 700;
		color: var(--muted);
		white-space: nowrap;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
	}
	.tab.on {
		color: var(--text);
		border-color: var(--accent);
	}
	.tab.off {
		opacity: 0.55;
		font-weight: 400;
	}
	.count {
		background: var(--counter);
		color: var(--counter-ink);
		font-size: 0.72rem;
		border-radius: 1em;
		padding: 0 0.5em;
	}
</style>
