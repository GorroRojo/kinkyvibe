<script>
	/**
	 * Maqueta de la página de un evento (pedido de gorrite): /estilo/evento/<opcion> con `actual`
	 * (la página real con los mismos datos inventados) y `final` (Final.svelte). Datos inventados
	 * (datos.js). Variantes de `final` por la URL: `?entrada=unica`, `?compra=lateral`,
	 * `?pasado=1`. Solo existe en previews y en dev, como la galería /estilo
	 * (src/routes/estilo/evento/[opcion]/+page.js).
	 */
	import { page } from '$app/stores';
	import Actual from './Actual.svelte';
	import Final from './Final.svelte';
	import { OPCIONES } from './opciones.js';

	/** @type {string} */
	export let opcion;
	// La misma marca que la galería: si esto llega al bundle de producción, el guard lo ve
	// (`node scripts/demo/guard.js bundle`).
	const MARCA = 'kv-estilo-galeria';
	$: q = $page.url.searchParams;
	$: past = q.get('pasado') === '1';
	$: unica = q.get('entrada') === 'unica';
	/** @type {'texto' | 'lateral'} */
	let compra = 'texto';
	$: compra = q.get('compra') === 'lateral' ? 'lateral' : 'texto';
	/** Las variantes de `final`, para pasar de una a otra. */
	$: variantes = [
		{
			href: '/estilo/evento/final',
			nombre: 'por defecto',
			actual: !unica && compra === 'texto' && !past
		},
		{ href: '/estilo/evento/final?entrada=unica', nombre: 'una sola entrada', actual: unica },
		{
			href: '/estilo/evento/final?compra=lateral',
			nombre: 'comprar en la columna',
			actual: compra === 'lateral'
		},
		{ href: '/estilo/evento/final?pasado=1', nombre: 'ya pasó', actual: past }
	];
</script>

<div class="maqueta" data-kv-estilo={MARCA}>
	<nav class="opciones" aria-label="Maquetas de la página de un evento">
		<span>Maqueta (datos inventados):</span>
		{#each OPCIONES as o (o.id)}
			<a href="/estilo/evento/{o.id}" aria-current={o.id === opcion ? 'page' : undefined}
				>{o.nombre}</a
			>
		{/each}
		{#if opcion === 'final'}
			<span>·</span>
			{#each variantes as v (v.href)}
				<a href={v.href} aria-current={v.actual ? 'page' : undefined}>{v.nombre}</a>
			{/each}
		{/if}
	</nav>
	{#if opcion === 'actual'}
		<Actual />
	{:else if opcion === 'final'}
		<Final {past} {unica} {compra} />
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
