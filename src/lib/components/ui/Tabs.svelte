<script>
	/**
	 * Pestañas como links (cada una es una URL), con el estilo del menú del sitio: rosas en negrita
	 * y la actual en una tarjeta blanca con texto violeta (decisión de gorrite, 4/10; el menú
	 * lateral sigue con violeta sobre lila). En el celu se deslizan de costado.
	 * Props: `tabs`: { href, label, count?, soon?, icon? }[] (`icon`: componente de Lucide,
	 * opcional); `current` (opcional): el href activo. Si no se pasa, se usa la URL actual.
	 * `label` (opcional): nombre de la barra para los lectores de pantalla.
	 */
	import { page } from '$app/stores';
	/** @type {{ href: string, label: string, count?: number, soon?: boolean, icon?: any }[]} */
	export let tabs = [];
	/** @type {string | undefined} */
	export let current = undefined;
	export let label = 'Pestañas';
	$: active = current ?? $page.url.pathname.replace(/\/+$/, '');
</script>

<nav class="tabs" aria-label={label}>
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
		padding: var(--space-3xs) 0.1rem;
	}
	.tab {
		padding: var(--space-2xs) var(--space-xs);
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
	/* «Estás acá» en las pestañas: tarjeta blanca sobre el fondo gris, texto violeta. */
	.tab.on {
		color: var(--link);
		background: var(--surface);
		box-shadow: var(--shadow-1);
	}
	.tab.off {
		color: var(--muted);
		font-weight: 400;
	}
	.count {
		background: var(--counter);
		color: var(--counter-ink);
		font-size: var(--text-xs);
		border-radius: var(--radius-m);
		padding: 0 0.5em;
	}
</style>
