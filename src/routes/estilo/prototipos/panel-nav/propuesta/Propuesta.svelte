<script>
	/**
	 * Opción C de la navegación del panel, la propuesta (/estilo/prototipos/panel-nav/propuesta):
	 * secciones con nombre en la barra (la Puerta es una), pestañas arriba, «+ Crear» para todo lo
	 * que se crea, «Ir a…» (⌘K) y Recientes; la ficha del evento con 5 pestañas y «Más».
	 * Datos inventados.
	 */
	import Marco from '../../Marco.svelte';
	import ParaDecidir from '../../ParaDecidir.svelte';
	import Patron from '../Patron.svelte';
	import Pantalla from '../Pantalla.svelte';
	import LateralSecciones from '../LateralSecciones.svelte';
	import { PESTANAS_EVENTO_C, PESTANAS_EVENTO_C_MAS, RECIENTES, SECCIONES_C } from '../datos.js';

	const DECIDIR = [
		{
			pregunta: '¿«+ Crear» arriba para todo lo que se crea, y además el botón en Eventos?',
			propuesta:
				'los dos. Recomiendo los dos: no es un destino repetido, el menú junta las 6 acciones de crear y el botón es la acción principal de Eventos.'
		},
		{
			pregunta: '¿La Puerta es una sección propia (y deja de ser pestaña de Eventos)?',
			propuesta:
				'la Puerta arriba de Eventos, a un toque en la compu y en el celu, abierta en el evento de hoy. Recomiendo esto.'
		},
		{
			pregunta: '¿El buscador de hoy (/ y Ctrl/⌘K) se muestra como «Ir a…» y suma acciones?',
			propuesta:
				'«Ir a… o buscar» con páginas y acciones (probá ⌘K). Recomiendo extender el buscador que ya existe (commands.js), no hacer otro.'
		},
		{
			pregunta: '¿Tres «Recientes» en la barra lateral?',
			propuesta:
				'tres recientes de cada admin, guardados en su navegador. Recomiendo probarlos y sacarlos si nadie los usa.'
		},
		{
			pregunta:
				'¿La ficha del evento con 5 pestañas y «Más» (Ventas dentro de Órdenes, los dos mails juntos)?',
			propuesta:
				'Resumen, Órdenes, Puerta, Editar y Mails, y en «Más» Transferencias, Códigos y Preguntas. Recomiendo esto.'
		}
	];
</script>

<Marco
	title="Navegación del panel · C. Secciones, «Crear» e «Ir a…»"
	explora="La propuesta: lo que mejor anduvo de A y B, con lo que dice la investigación."
	back="/estilo/prototipos/panel-nav"
>
	<ParaDecidir items={DECIDIR} />
	<Patron opcion="propuesta">
		<p class="porque">
			<strong>Por qué así.</strong> La barra muestra pocos lugares con nombre (NN/g: lo escondido y los
			íconos solos se usan menos), y las páginas de cada sección son pestañas cortas. Crear sale del menú
			porque es una acción, no un lugar: un solo «+ Crear» para todo. La Puerta queda a un toque, porque
			se usa en el celu con gente esperando. Y «Ir a…» (⌘K) es el atajo para les que usan el panel todos
			los días, sin reemplazar el menú.
		</p>
	</Patron>
	<Pantalla
		opcion="C"
		secciones={SECCIONES_C}
		pestanasEvento={PESTANAS_EVENTO_C}
		pestanasEventoMas={PESTANAS_EVENTO_C_MAS}
	>
		<LateralSecciones
			slot="lateral"
			let:estado
			secciones={SECCIONES_C}
			{estado}
			resaltar={['puerta']}
			recientes={RECIENTES}
		/>
	</Pantalla>
</Marco>

<style>
	.porque {
		margin: 0 0 var(--space-2xs);
	}
</style>
