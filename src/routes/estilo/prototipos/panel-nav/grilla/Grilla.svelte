<script>
	/**
	 * Opción B de la navegación del panel, «Grilla» (/estilo/prototipos/panel-nav/grilla): las
	 * secciones en una grilla de tejas con nombre y, debajo, las páginas de la sección en una lista.
	 * La variante «todo» (`?v=todo`) pone las 30 páginas en tejas, como se pidió, para comparar.
	 * Datos inventados.
	 */
	import { page } from '$app/stores';
	import Marco from '../../Marco.svelte';
	import ParaDecidir from '../../ParaDecidir.svelte';
	import Patron from '../Patron.svelte';
	import Pantalla from '../Pantalla.svelte';
	import LateralGrilla from '../LateralGrilla.svelte';
	import { PESTANAS_EVENTO, SECCIONES } from '../datos.js';
	import { enlace, leerEstado } from '../estado.js';

	$: estadoPagina = leerEstado($page.url);
	$: todo = estadoPagina.v === 'todo';

	const DECIDIR = [
		{
			pregunta:
				'¿Grilla de secciones con la lista de páginas debajo, o todas las páginas en tejas («Variante: todo»)?',
			propuesta:
				'las dos (botones de abajo). Recomiendo secciones + lista: las 30 tejas entran sin scroll a 1440 × 900, pero con nombres cortados y 30 íconos que no se reconocen sin leer (NN/g, íconos).'
		},
		{
			pregunta: '¿Nombres cortos en las tejas («Números» en vez de «Estadísticas»)?',
			propuesta:
				'«Números» porque «Estadísticas» no entra en media columna. Recomiendo no inventar nombres: si un nombre no entra, mejor la lista de A o C.'
		},
		{
			pregunta:
				'¿En la compu angosta y la tablet, riel de una columna con nombres y las páginas como pestañas arriba?',
			propuesta:
				'el riel de Material, con nombres. Recomiendo esto; probalo con «Compu angosta» y «Tablet».'
		},
		{
			pregunta: '¿Dos menús a la izquierda (grilla y lista) confunden?',
			propuesta:
				'la lista va separada y con el nombre de la sección como título. Recomiendo probarlo con une organizadore antes de elegir B.'
		}
	];
</script>

<Marco
	title="Navegación del panel · B. Grilla"
	explora="La barra lateral es una grilla de tejas (ícono y nombre) con todas las secciones; las páginas de la sección en la que estás aparecen debajo, sin scroll a 1440 × 900."
	back="/estilo/prototipos/panel-nav"
>
	<ParaDecidir items={DECIDIR} />
	<Patron opcion="grilla" />
	<nav class="variantes" aria-label="Variante">
		<a
			class="kv-link"
			href={enlace(estadoPagina, { v: '' })}
			data-sveltekit-noscroll
			aria-current={!todo ? 'true' : undefined}>Secciones + lista (recomendada)</a
		>
		<a
			class="kv-link"
			href={enlace(estadoPagina, { v: 'todo' })}
			data-sveltekit-noscroll
			aria-current={todo ? 'true' : undefined}>Variante: todo en tejas</a
		>
	</nav>
	<Pantalla
		opcion="B"
		secciones={SECCIONES}
		pestanasEvento={PESTANAS_EVENTO}
		tabsArriba="angosto"
		masModo="grilla"
	>
		<LateralGrilla slot="lateral" let:estado secciones={SECCIONES} {estado} {todo} />
	</Pantalla>
</Marco>

<style>
	.variantes {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: var(--space-xs);
		margin-top: var(--space-s);
		font-size: var(--text-sm);
	}
	.variantes a[aria-current] {
		font-weight: 700;
		text-decoration: none;
		color: var(--ink);
	}
</style>
