<script>
	/**
	 * Ajustes: la portada (decisión 0041). Los subgrupos de `$lib/admin/nav.js` (Plata,
	 * Comunicación, Equipo, Sistema) con una tarjeta por sección: ícono, nombre, qué hay (`desc`) y
	 * una línea de estado (`data.status`, de $lib/server/admin/ajustesStatus.js). Cada sección
	 * vuelve acá con «← Ajustes» (`areaBackLink`).
	 */
	import PageHeader from '$lib/components/admin/panel/PageHeader.svelte';
	import NavIcon from '$lib/components/admin/panel/NavIcon.svelte';
	import { navAreaSections, navState } from '$lib/admin/nav.js';

	export let data;

	/** @type {Record<string, boolean>} */
	$: flags = data.navFlags ?? {};
	/** @type {Record<string, import('$lib/server/admin/ajustesStatus.js').AjusteStatus>} */
	$: status = data.status ?? {};
	$: groups = navAreaSections('ajustes', { flags });
</script>

<PageHeader
	title="Ajustes"
	subtitle="Lo que se configura una vez y cambia poco. Tocá una tarjeta para entrar."
/>

<nav class="groups" aria-label="Secciones de Ajustes">
	{#each groups as group (group.id)}
		<section class="group" aria-labelledby="ajustes-{group.id}">
			<h2 id="ajustes-{group.id}">{group.label}</h2>
			<ul class="cards">
				{#each group.items as item (item.id)}
					{@const state = navState(item, flags)}
					{@const st = status[item.id]}
					<li>
						{#if state === 'soon'}
							<div class="card soon" aria-disabled="true">
								<span class="icon"><NavIcon {item} size={20} /></span>
								<b class="name">{item.label}</b>
								{#if item.desc}<span class="desc">{item.desc}</span>{/if}
								<span class="status">Próximamente</span>
							</div>
						{:else}
							<a class="card" href={item.href}>
								<span class="icon"><NavIcon {item} size={20} /></span>
								<b class="name"
									>{item.label}{#if state === 'prueba'}<span class="tag">prueba</span>{/if}</b
								>
								{#if item.desc}<span class="desc">{item.desc}</span>{/if}
								{#if st}<span class="status" class:warn={st.tone === 'warn'}>{st.text}</span>{/if}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</nav>

<style lang="scss">
	.groups {
		display: grid;
		gap: var(--space-m);
	}
	h2 {
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
		margin: 0 0 var(--space-2xs);
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: var(--space-xs);
	}
	li {
		display: flex;
	}
	.card {
		flex: 1;
		display: grid;
		grid-template-columns: 2.25rem 1fr;
		grid-template-rows: auto 1fr auto;
		column-gap: var(--space-xs);
		row-gap: var(--space-3xs);
		align-content: start;
		background: var(--surface);
		color: var(--text);
		border-radius: var(--card-round);
		box-shadow: var(--shadow);
		padding: var(--space-xs) var(--space-s);
		text-decoration: none;
		outline: 2px solid transparent;
		outline-offset: -2px;
		transition: outline-color 0.15s;
		&:hover,
		&:focus-visible {
			outline-color: var(--link);
		}
	}
	.icon {
		grid-row: 1 / span 3;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-m);
		background: var(--link-bg);
		color: var(--link);
		display: grid;
		place-items: center;
	}
	.name {
		font-size: var(--text-sm);
		display: flex;
		align-items: center;
		gap: var(--space-2xs);
		flex-wrap: wrap;
	}
	.desc {
		color: var(--muted);
		font-size: var(--text-xs);
	}
	.status {
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--link);
		&.warn {
			color: var(--warn);
		}
	}
	.tag {
		font-size: var(--text-xs);
		font-weight: 400;
		border: 1px solid var(--warn);
		color: var(--warn);
		border-radius: 2em;
		padding: 0 0.5em;
	}
	.soon {
		background: transparent;
		box-shadow: none;
		outline: 1.5px dashed var(--line);
		color: var(--muted);
		.status {
			color: var(--muted);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
	}
</style>
