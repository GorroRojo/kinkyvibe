<script>
	/**
	 * Filtro por tipo de perfil en /amigues (personas, proyectos, lugares), con links `?tipo=`.
	 * Props: `kinds` ({ clave: etiqueta }) y `current` (la clave elegida, o '' para todes).
	 * Cada link conserva lo demás de la dirección (las etiquetas `?tags=` y la búsqueda `?q=` de
	 * PostList): cambiar de tipo no borra el filtro por etiqueta.
	 */
	import { page } from '$app/stores';

	/** @type {Record<string, string>} */
	export let kinds;
	export let current = '';

	/** @param {URL} url @param {string} value */
	function kindHref(url, value) {
		const next = new URL(url);
		if (value) next.searchParams.set('tipo', value);
		else next.searchParams.delete('tipo');
		return next.pathname + next.search;
	}
</script>

<nav class="kinds" aria-label="Tipo de perfil">
	<a
		class="tap-target"
		href={kindHref($page.url, '')}
		aria-current={current === '' ? 'page' : undefined}>Todes</a
	>
	{#each Object.entries(kinds) as [value, label] (value)}
		<a
			class="tap-target"
			href={kindHref($page.url, value)}
			aria-current={current === value ? 'page' : undefined}>{label}</a
		>
	{/each}
</nav>

<style>
	.kinds {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5em;
		margin: 0 auto 1.5em;
		padding-inline: var(--space-xs);
		font-size: var(--step-0);
	}
	a {
		padding: 0.25em 0.8em;
		border-radius: var(--radius-pill);
		border: 1px solid color-mix(in srgb, var(--1, hotpink) 50%, transparent);
		color: inherit;
		text-decoration: none;
	}
	a[aria-current='page'] {
		background: var(--1, hotpink);
		border-color: var(--1, hotpink);
		color: white;
		font-weight: bold;
	}
</style>
