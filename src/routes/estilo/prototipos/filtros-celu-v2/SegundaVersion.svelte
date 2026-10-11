<script>
	/**
	 * Prototipo «Filtros en el celu», versión 2 (/estilo/prototipos/filtros-celu-v2), con las
	 * respuestas de gorrite a la versión 1 (/estilo/prototipos/filtros-celu, que queda para
	 * comparar):
	 * - los chips de las etiquetas más usadas en la barra y varias etiquetas achican la lista:
	 *   quedan como estaban;
	 * - a la hoja va SOLO el árbol de etiquetas; el buscador, «Ver como lista | grilla» y «Eventos
	 *   pasados» quedan donde están hoy en la página;
	 * - la barra va en TODAS las listas: acá, sobre el calendario y sobre material (ListaV2, que
	 *   cuenta cómo entraría en PostList);
	 * - en compu, con lugar, el árbol sigue en su columna; la hoja es solo para pantallas angostas;
	 * - todos los controles de la barra con la misma medida (BarraFiltros).
	 *
	 * Datos inventados y estado local (más los stores de filtros de siempre, que no se guardan).
	 * Solo en previews y en dev.
	 */
	import { Segmented } from '$lib/components/ui';
	import Marco from '../Marco.svelte';
	import ParaDecidir from '../ParaDecidir.svelte';
	import ListaV2 from './ListaV2.svelte';
	import { eventos, materiales } from './datos.js';

	let lista = 'calendario';
	// Solo lo que sigue abierto (lo que gorrite ya contestó está arriba, en el comentario).
	const PREGUNTAS_ABIERTAS = [
		{
			pregunta: '¿Desde qué ancho va el árbol en su columna en vez de la hoja?',
			propuesta:
				'el mismo corte que hoy (la lista con 1300px o más); más angosto, tablets incluidas, la hoja.'
		},
		{
			pregunta: 'En compu, con el árbol al costado, ¿siguen los chips arriba de la lista?',
			propuesta: 'sí, como atajo; sin «Filtros» ni «Más filtros», que ahí no hacen falta.'
		},
		{
			pregunta: '¿Hacen falta los dos botones que abren la hoja?',
			propuesta:
				'«Filtros (N)» siempre a la vista, con cuántas hay elegidas, y «Más filtros» al final de los chips.'
		},
		{
			pregunta: '¿La hoja necesita un buscador de etiquetas?',
			propuesta: 'no: el buscador de arriba de la lista ya sugiere etiquetas.'
		},
		{
			pregunta: '¿La barra queda fija arriba al bajar por la lista?',
			propuesta: 'sí, en todas las listas.'
		}
	];
	const LISTAS = [
		{ value: 'calendario', label: 'Calendario' },
		{ value: 'material', label: 'Material' }
	];
</script>

<Marco
	title="Filtros en el celu (versión 2)"
	explora="La barra de chips en todas las listas y, en el celu, el árbol de etiquetas en una hoja. Probalo con el ancho de un celu y también en la compu."
>
	<nav class="versiones" aria-label="Versiones del prototipo">
		<a class="kv-link" href="/estilo/prototipos/filtros-celu">Versión 1</a>
		<span aria-current="page">Versión 2</span>
	</nav>

	<div class="selector">
		<Segmented options={LISTAS} bind:value={lista} label="Qué lista mirar" />
	</div>

	<h2 class="titulo-lista">{lista === 'calendario' ? 'Calendario' : 'Material'}</h2>
	{#key lista}
		<ListaV2
			posts={lista === 'calendario' ? eventos : materiales}
			eventos={lista === 'calendario'}
		/>
	{/key}

	<ParaDecidir items={PREGUNTAS_ABIERTAS} />
</Marco>

<style>
	.versiones,
	.selector {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		max-width: 40rem;
		margin: 0 auto var(--space-s);
		font-size: var(--text-sm);
	}
	.versiones [aria-current] {
		font-weight: 700;
	}
	.titulo-lista {
		margin: 0 0 var(--space-2xs);
		font-size: var(--text-2xl);
		color: var(--1);
		text-align: center;
	}
</style>
