<script>
	/**
	 * Índice de los prototipos de navegación del panel (/estilo/prototipos/panel-nav): las tres
	 * opciones, la tabla de clics hasta las tareas de siempre, qué se ve siempre, pros y contras, y
	 * el link a la investigación. Pedido de gorrite (11/10) después de ver el PR #293.
	 */
	import { BookOpenCheck, ChevronRight } from '@lucide/svelte';
	import Marco from '../Marco.svelte';
	import ParaDecidir from '../ParaDecidir.svelte';
	import { OPCIONES, PROS_CONTRAS, SIEMPRE_VISIBLE, TAREAS } from './datos.js';
	import { PATRON_DE } from './investigacion.js';

	/** @type {('A' | 'B' | 'C')[]} */
	const LETRAS = ['A', 'B', 'C'];

	const DECIDIR = [
		{
			pregunta: '¿Cuál de las tres?',
			propuesta:
				'tres caminos. Recomiendo la C: la barra corta de A, la Puerta a un toque, «+ Crear» para todas las acciones e «Ir a…» como atajo.'
		},
		{
			pregunta: '¿Se hace todo junto o por partes?',
			propuesta:
				'un orden posible. Recomiendo por partes: 1) sacar «Cargar evento» de la barra y ponerlo en Eventos; 2) Puerta como sección; 3) la ficha del evento con 5 pestañas; 4) «+ Crear» y las acciones en el buscador.'
		},
		{
			pregunta: '¿Qué pasa con los modos de la barra del PR #293 (abierta, solo íconos, oculta)?',
			propuesta:
				'los mismos modos. Recomiendo mantenerlos como elección de cada admin, con «Siempre abierta» por defecto: lo escondido y los íconos solos se usan menos (ver la investigación).'
		}
	];
</script>

<Marco
	title="Navegación del panel: tres opciones"
	explora="Para que el panel no abrume: menos cosas en la barra lateral, las páginas de cada sección como pestañas y las acciones (crear) fuera del menú. Las tres usan el mismo evento y las mismas órdenes inventadas."
>
	<ParaDecidir items={DECIDIR} />

	<a class="investigacion" href="/estilo/prototipos/panel-nav/investigacion">
		<BookOpenCheck size={24} aria-hidden="true" />
		<span
			><strong>Investigación</strong><span
				>Qué hacen Shopify, Stripe, Linear, Vercel, Eventbrite y Luma, y qué dicen NN/g, Material y
				Apple. Cada opción se apoya en un patrón de ahí.</span
			></span
		>
		<ChevronRight size={20} aria-hidden="true" />
	</a>

	<ul class="opciones">
		{#each OPCIONES as o (o.slug)}
			<li>
				<a href="/estilo/prototipos/panel-nav/{o.slug}">
					<span class="letra" aria-hidden="true">{o.letra}</span>
					<span class="texto">
						<strong>{o.letra}. {o.nombre}</strong>
						<span>Patrón: {PATRON_DE[/** @type {keyof typeof PATRON_DE} */ (o.slug)].patron}</span>
					</span>
					<ChevronRight size={20} aria-hidden="true" />
				</a>
			</li>
		{/each}
	</ul>

	<section class="tabla">
		<h2>Clics hasta cada tarea</h2>
		<p class="nota">
			Desde el Inicio, contando el toque final. «Hoy» es el panel con el PR #293. Si el celu cambia
			la cuenta, va aparte.
		</p>
		<div class="scroll">
			<table class="kv-table">
				<thead>
					<tr><th>Tarea</th><th>Hoy</th><th>A</th><th>B</th><th>C</th></tr>
				</thead>
				<tbody>
					{#each TAREAS as t (t.tarea)}
						<tr>
							<th scope="row">{t.tarea}</th>
							<td>{t.hoy}</td>
							<td>{t.A}</td>
							<td>{t.B}</td>
							<td>{t.C}</td>
						</tr>
					{/each}
					<tr>
						<th scope="row">Siempre a la vista</th>
						<td>{SIEMPRE_VISIBLE.hoy}</td>
						{#each LETRAS as l (l)}<td>{SIEMPRE_VISIBLE[l]}</td>{/each}
					</tr>
				</tbody>
			</table>
		</div>
	</section>

	<section class="pros">
		<h2>Pros y contras</h2>
		<div class="cols">
			{#each OPCIONES as o, i (o.slug)}
				<div class="col">
					<h3>{o.letra}. {o.nombre}</h3>
					<ul class="mas">
						{#each PROS_CONTRAS[LETRAS[i]].pros as p (p)}<li>{p}</li>{/each}
					</ul>
					<ul class="menos">
						{#each PROS_CONTRAS[LETRAS[i]].contras as c (c)}<li>{c}</li>{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>
</Marco>

<style>
	.investigacion,
	.opciones a {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-s);
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-1);
		color: var(--ink);
		text-decoration: none;
	}
	.investigacion:hover,
	.opciones a:hover {
		box-shadow: var(--shadow-2);
	}
	.investigacion {
		max-width: 40rem;
		margin: var(--space-s) auto 0;
		box-sizing: border-box;
		border-left: 4px solid var(--2);
	}
	.investigacion > :global(svg:first-child) {
		color: var(--2-dark);
		flex: none;
	}
	.investigacion > span,
	.texto {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-3xs);
		font-size: var(--text-sm);
	}
	.investigacion strong,
	.texto strong {
		font-size: var(--text-base);
		color: var(--1-ink);
	}
	.opciones {
		list-style: none;
		margin: var(--space-s) auto 0;
		padding: 0;
		max-width: 40rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-2xs);
	}
	.letra {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 50%;
		background: var(--1);
		color: white;
		font-weight: 700;
		font-size: var(--text-lg);
	}
	.tabla,
	.pros {
		max-width: 72rem;
		margin: var(--space-l) auto 0;
	}
	h2 {
		font-size: var(--text-lg);
		margin: 0 0 var(--space-3xs);
	}
	.nota {
		margin: 0 0 var(--space-2xs);
		color: var(--muted);
		font-size: var(--text-sm);
	}
	.scroll {
		overflow-x: auto;
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-1);
	}
	table {
		width: 100%;
		min-width: 44rem;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	th,
	td {
		text-align: left;
		vertical-align: top;
		padding: var(--space-2xs) var(--space-xs);
		border-bottom: 1px solid var(--4-tint);
	}
	thead th {
		color: var(--2-dark);
	}
	tbody th {
		width: 14rem;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
		gap: var(--space-xs);
	}
	.col {
		background: var(--surface);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-1);
		padding: var(--space-xs) var(--space-s);
		font-size: var(--text-sm);
	}
	h3 {
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-base);
		color: var(--1-ink);
	}
	.mas,
	.menos {
		margin: 0 0 var(--space-2xs);
		padding-left: 1.4em;
	}
	.mas li::marker {
		content: '+  ';
		color: var(--3-dark);
		font-weight: 700;
	}
	.menos li::marker {
		content: '−  ';
		color: var(--1-dark);
		font-weight: 700;
	}
</style>
