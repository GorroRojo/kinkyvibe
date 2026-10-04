<script>
	/**
	 * Maquetas de la página de un evento para elegir (pedido de gorrite): /estilo/evento/<opcion>
	 * con `actual` (la página real con los mismos datos), `a`, `b` y `c`. Datos inventados
	 * (datos.js). `?pasado=1` muestra cómo queda un evento que ya pasó (en las maquetas).
	 * Solo existe en previews y en dev, como la galería /estilo (src/routes/estilo/evento/[opcion]/+page.js).
	 */
	import { page } from '$app/stores';
	import Actual from './Actual.svelte';
	import OpcionA from './OpcionA.svelte';
	import OpcionB from './OpcionB.svelte';
	import OpcionC from './OpcionC.svelte';
	import { OPCIONES } from './opciones.js';

	/** @type {string} */
	export let opcion;
	// La misma marca que la galería: si esto llega al bundle de producción, el guard lo ve
	// (`node scripts/demo/guard.js bundle`).
	const MARCA = 'kv-estilo-galeria';
	const COMPONENTES = { a: OpcionA, b: OpcionB, c: OpcionC };
	$: past = $page.url.searchParams.get('pasado') === '1';
	$: actual = OPCIONES.find((o) => o.id === opcion);
	$: Componente = actual
		? COMPONENTES[/** @type {keyof typeof COMPONENTES} */ (actual.id)]
		: undefined;
</script>

<div class="maqueta" data-kv-estilo={MARCA}>
	<nav class="opciones" aria-label="Maquetas de la página de un evento">
		<span>Maqueta (datos inventados):</span>
		{#each OPCIONES as o (o.id)}
			<a
				href="/estilo/evento/{o.id}{past ? '?pasado=1' : ''}"
				aria-current={o.id === opcion ? 'page' : undefined}>{o.nombre}</a
			>
		{/each}
	</nav>
	{#if actual?.id === 'actual'}
		<Actual />
	{:else if actual}
		<svelte:component this={Componente} {past} />
	{/if}
</div>

<style>
	.opciones {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-3xs) var(--space-2xs);
		padding: var(--space-2xs) var(--space-xs);
		background: var(--2-tint);
		color: var(--2-dark);
		font-size: var(--text-xs);
	}
	.opciones a {
		padding: var(--space-3xs) var(--space-2xs);
		border-radius: var(--radius-pill);
		color: var(--2-dark);
	}
	.opciones a[aria-current='page'] {
		background: var(--surface);
		box-shadow: var(--shadow-1);
		font-weight: 700;
		text-decoration: none;
	}
</style>
