<script>
	/**
	 * Opción A de la navegación del panel, «Secciones y pestañas» (/estilo/prototipos/panel-nav/
	 * secciones): la barra lateral muestra solo las secciones; cada sección abre con sus pestañas
	 * arriba y «Crear evento» es el botón principal del encabezado de Eventos. Datos inventados.
	 */
	import Marco from '../../Marco.svelte';
	import ParaDecidir from '../../ParaDecidir.svelte';
	import Patron from '../Patron.svelte';
	import Pantalla from '../Pantalla.svelte';
	import LateralSecciones from '../LateralSecciones.svelte';
	import { PESTANAS_EVENTO, SECCIONES } from '../datos.js';

	const DECIDIR = [
		{
			pregunta:
				'¿«Crear evento» sale de la barra lateral y queda solo en el encabezado de Eventos?',
			propuesta:
				'«Crear evento» solo en el encabezado de Eventos. Recomiendo hacerlo con cualquier opción: la barra es para ir a lugares y crear es una acción.'
		},
		{
			pregunta: '¿La Puerta queda como pestaña de Eventos?',
			propuesta:
				'la Puerta como pestaña: en la compu cuesta un clic más (en el celu sigue en la barra de abajo). Recomiendo darle su propia sección, como en la opción C.'
		},
		{
			pregunta:
				'¿Ajustes en 4 pestañas (Plata, Comunicación, Equipo, Sistema), con una tarjeta por página?',
			propuesta:
				'cuatro pestañas con tarjetas. Recomiendo esto: 9 pestañas no entran en un renglón (NN/g), y son los subgrupos de hoy.'
		},
		{
			pregunta: '¿Mensajes sigue dentro de Comunidad y Etiquetas dentro de Contenido?',
			propuesta: 'los grupos del PR #293. Recomiendo no tocarlos en este cambio.'
		}
	];
</script>

<Marco
	title="Navegación del panel · A. Secciones y pestañas"
	explora="La barra lateral muestra solo las secciones. Cada sección abre con sus pestañas arriba, y «Crear evento» pasa a ser el botón del encabezado de Eventos."
	back="/estilo/prototipos/panel-nav"
>
	<ParaDecidir items={DECIDIR} />
	<Patron opcion="secciones" />
	<Pantalla opcion="A" secciones={SECCIONES} pestanasEvento={PESTANAS_EVENTO}>
		<LateralSecciones slot="lateral" let:estado secciones={SECCIONES} {estado} />
	</Pantalla>
</Marco>
