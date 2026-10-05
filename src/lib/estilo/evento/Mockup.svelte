<script>
	/**
	 * Maqueta de la página de un evento (pedido de gorrite): /estilo/evento/<opcion> con `actual`
	 * (la página real con los mismos datos inventados) y `final` (Final.svelte). Datos inventados
	 * (datos.js). Estados de `final` por la URL (`Opciones` en datos.js): `?entrada=unica|link|
	 * gratis`, `?estado=agotadas|cerrada|pronto|cancelado`, `?lugar=nombre|direccion|zona|oculto|
	 * texto|online`, `?sin-imagen=1`, `?sin-serie=1`, `?sin-partes=1`, `?pasado=1`, `?fin=otro-dia` y
	 * `?compra=lateral`. Solo existe en previews y en dev, como la galería /estilo
	 * (src/routes/estilo/evento/[opcion]/+page.js).
	 */
	import { page } from '$app/stores';
	import Actual from './Actual.svelte';
	import Final from './Final.svelte';
	import { OPCIONES } from './opciones.js';
	import { POR_DEFECTO } from './datos.js';

	/** @type {string} */
	export let opcion;
	// La misma marca que la galería: si esto llega al bundle de producción, el guard lo ve
	// (`node scripts/demo/guard.js bundle`).
	const MARCA = 'kv-estilo-galeria';
	$: q = $page.url.searchParams;
	/** @type {import('./datos.js').Opciones} */
	let opciones = POR_DEFECTO;
	$: opciones = {
		entrada: q.get('entrada') ?? POR_DEFECTO.entrada,
		estado: q.get('estado') ?? '',
		lugar: q.get('lugar') ?? POR_DEFECTO.lugar,
		imagen: q.get('sin-imagen') !== '1',
		serie: q.get('sin-serie') !== '1',
		partes: q.get('sin-partes') !== '1',
		pasado: q.get('pasado') === '1',
		finOtroDia: q.get('fin') === 'otro-dia'
	};
	/** @type {'texto' | 'lateral'} */
	let compra = 'texto';
	$: compra = q.get('compra') === 'lateral' ? 'lateral' : 'texto';
	/** Algunos estados de `final`, para pasar de uno a otro. */
	const VARIANTES = [
		['', 'por defecto'],
		['?entrada=unica', 'una sola entrada'],
		['?entrada=link', 'link de inscripción'],
		['?entrada=gratis', 'gratis'],
		['?estado=agotadas', 'agotadas'],
		['?estado=pronto', 'venta más adelante'],
		['?estado=cancelado', 'cancelado'],
		['?pasado=1', 'ya pasó'],
		['?lugar=zona', 'lugar privado'],
		['?lugar=online&sin-imagen=1&sin-serie=1&sin-partes=1', 'online, sin afiche ni serie'],
		['?compra=lateral', 'comprar en la columna']
	];
	$: actualQ = $page.url.search;
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
			{#each VARIANTES as [qs, nombre] (qs)}
				<a href="/estilo/evento/final{qs}" aria-current={qs === actualQ ? 'page' : undefined}
					>{nombre}</a
				>
			{/each}
		{/if}
	</nav>
	{#if opcion === 'actual'}
		<Actual />
	{:else if opcion === 'final'}
		<Final {opciones} {compra} />
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
