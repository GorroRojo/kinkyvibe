<script>
	/**
	 * Pestañas como links (cada una es una URL), con el estilo del menú del sitio: rosas en negrita
	 * y la actual en una tarjeta blanca con texto violeta. En el celu se deslizan de costado.
	 * Props: `tabs`: { href, label, count?, soon?, icon? }[] (`icon`: componente de Lucide,
	 * opcional); `current` (opcional): el href activo. Si no se pasa, se usa la URL actual.
	 */
	import { page } from '$app/stores';
	/** @type {{ href: string, label: string, count?: number, soon?: boolean, icon?: any }[]} */
	export let tabs = [];
	/** @type {string | undefined} */
	export let current = undefined;
	$: active = current ?? $page.url.pathname.replace(/\/+$/, '');
</script>

<nav class="tabs" aria-label="Pestañas">
	{#each tabs as tab (tab.href)}
		{#if tab.soon}
			<span class="tab off" aria-disabled="true" title="Próximamente"
				>{#if tab.icon}<svelte:component
						this={tab.icon}
						size={16}
						aria-hidden="true"
					/>{/if}{tab.label}</span
			>
		{:else}
			<a
				class="tab"
				class:on={active === tab.href}
				href={tab.href}
				aria-current={active === tab.href ? 'page' : undefined}
				>{#if tab.icon}<svelte:component
						this={tab.icon}
						size={16}
						aria-hidden="true"
					/>{/if}{tab.label}{#if tab.count}<span class="count">{tab.count}</span>{/if}</a
			>
		{/if}
	{/each}
</nav>

<style>
	.tabs {
		display: flex;
		gap: 0.2rem;
		overflow-x: auto;
		scrollbar-width: thin;
		margin-bottom: 1rem;
		padding: 0.3rem 0.1rem;
	}
	.tab {
		padding: 0.5rem 0.9rem;
		border-radius: var(--round);
		font-weight: 700;
		color: var(--accent);
		white-space: nowrap;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
	}
	a.tab:hover {
		color: var(--accent);
		background: color-mix(in srgb, var(--surface) 55%, transparent);
	}
	.tab.on {
		color: var(--link);
		background: var(--surface);
		box-shadow: 0 0 0.5em rgba(1, 1, 1, 0.1);
	}
	.tab.off {
		color: var(--muted);
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
