/**
 * Las secciones de la galería /estilo (docs/estilo.md, «Componentes»): un componente por concepto,
 * con su import y cuándo usarlo y cuándo no (sale de «Piezas» en docs/estilo.md). Solo la usa la
 * galería, que existe en previews y en dev.
 */

/**
 * @typedef {{
 *   id: string,
 *   nombre: string,
 *   importa: string,
 *   cuando: string,
 *   cuandoNo: string,
 *   soloPanel?: boolean
 * }} Seccion
 */

/** @type {Seccion[]} */
export const SECCIONES = [
	{
		id: 'button',
		nombre: 'Button',
		importa: "import { Button } from '$lib/components/ui';",
		cuando:
			'Cualquier acción. Principal: píldora rosa llena, una por pantalla. Secundario: blanca con borde y texto rosa. Destructivo (rosa oscuro, con ícono): lo que se puede deshacer. Permanente (rojo): solo lo que no tiene vuelta atrás. Solo ícono: con `label`. Link: acciones de texto violetas.',
		cuandoNo:
			'No para comprar entradas (ese botón es otro y queda distinto). No en rojo si se puede deshacer. No inventes tamaños: hay normal (44px) y chico.'
	},
	{
		id: 'chip',
		nombre: 'TagChip y Chip',
		importa: "import { TagChip, Chip } from '$lib/components/ui';",
		cuando:
			'TagChip para una etiqueta: pone su emoji y su color solos (en el panel, la ficha del evento y los filtros del sitio). Elegido: lleno. Chip para filtros o selecciones que no son etiquetas del árbol.',
		cuandoNo:
			'No armes el chip a mano con colores sueltos ni uses el rosa teñido igual para todas las etiquetas. Para un estado (pagada, agotadas…) va Badge.'
	},
	{
		id: 'tabs',
		nombre: 'Tabs',
		importa: "import { Tabs } from '$lib/components/ui';",
		cuando:
			'Pestañas que son direcciones (las del evento, las de una sección). La actual es una tarjeta blanca con texto violeta sobre el fondo gris.',
		cuandoNo:
			'No para elegir un valor dentro de un formulario (eso es Segmented). El menú lateral y el del sitio tienen su propio «estás acá» (violeta sobre lila).',
		soloPanel: true
	},
	{
		id: 'badge',
		nombre: 'Badge',
		importa: "import { Badge } from '$lib/components/ui';",
		cuando:
			'Un estado chiquito: siempre con ícono (si no pasás `icon`, va el del tono). Muchas para comparar: el color dice qué significa; pocas: que combine con el componente.',
		cuandoNo: 'No para etiquetas del árbol (TagChip) ni como botón: no se toca.',
		soloPanel: true
	},
	{
		id: 'field',
		nombre: 'Field',
		importa: "import { Field } from '$lib/components/ui';",
		cuando:
			'Campos de texto con etiqueta, ayuda y error: rectángulo neutro de 44px, letra de 16px, borde rosa con foco. Buscador (`type="search"`): en píldora. Grande: solo en el flujo de compra.',
		cuandoNo:
			'No le bajes la letra de 16px (Safari en iPhone hace zoom). No pongas el texto de ejemplo en rosa ni en violeta: sale gris y en cursiva solo.',
		soloPanel: true
	},
	{
		id: 'checkbox',
		nombre: 'Checkbox',
		importa: "import { Checkbox } from '$lib/components/ui';",
		cuando: 'Opciones que se guardan con un botón Guardar.',
		cuandoNo: 'Si el cambio se guarda apenas se toca, es Switch.',
		soloPanel: true
	},
	{
		id: 'switch',
		nombre: 'Switch',
		importa: "import { Switch } from '$lib/components/ui';",
		cuando:
			'Prender o apagar algo al instante, sin Guardar (como Ajustes › Interruptores), con «Guardando…» → «Guardado ✓» al lado.',
		cuandoNo: 'En un formulario con botón Guardar va Checkbox.',
		soloPanel: true
	},
	{
		id: 'segmented',
		nombre: 'Segmented',
		importa: "import { Segmented } from '$lib/components/ui';",
		cuando:
			'Elegir una entre pocas opciones cortas (Entradas | Plata, Día | Semana), como «Mostrar | Ocultar» del sitio.',
		cuandoNo:
			'Si cada opción necesita una descripción, ChoiceCard. Si cada opción es una página, Tabs.'
	},
	{
		id: 'choice',
		nombre: 'ChoiceCard',
		importa: "import { ChoiceCard } from '$lib/components/ui';",
		cuando:
			'Elegir una entre pocas opciones que llevan descripción (como el medio de pago de la compra).',
		cuandoNo: 'Para opciones cortas sin descripción, Segmented.'
	},
	{
		id: 'card',
		nombre: 'Card',
		importa: "import { Card } from '$lib/components/ui';",
		cuando:
			'Agrupar contenido en una tarjeta blanca lisa. `status` pone un borde de color a la izquierda (solo si hay un estado); `filled` la llena de color para destacar.',
		cuandoNo:
			'No le pongas borde de color «para decorar». La entrada conserva su borde punteado (no es una Card).',
		soloPanel: true
	},
	{
		id: 'notice',
		nombre: 'Notice',
		importa: "import { Notice } from '$lib/components/ui';",
		cuando:
			'Avisos en la página: verde para lo que salió bien, amarillo para avisos, rojo para errores y malas noticias.',
		cuandoNo:
			'«Guardado ✓» y «Deshacer» nunca en rojo. Si el aviso lleva Deshacer, es UndoToast. Para el estado de un guardado automático, SaveStatus.',
		soloPanel: true
	},
	{
		id: 'empty',
		nombre: 'EmptyState',
		importa: "import { EmptyState } from '$lib/components/ui';",
		cuando: 'Una lista vacía: ícono de Lucide, título y una línea gris; si hace falta, un botón.',
		cuandoNo: 'Sin emoji. «Próximamente» sigue con su caja punteada.',
		soloPanel: true
	},
	{
		id: 'dialog',
		nombre: 'Dialog y askConfirm',
		importa: "import { Dialog, askConfirm } from '$lib/components/ui';",
		cuando:
			'«¿Seguro?»: `askConfirm({ title, text, confirmLabel, tone })`, con `tone` primary, danger o permanent. Dialog solo para un diálogo propio con contenido.',
		cuandoNo:
			'Nunca `window.confirm`. Para borrar desde el panel, la página de borrar mantiene su escribir para confirmar.',
		soloPanel: true
	},
	{
		id: 'sheet',
		nombre: 'Sheet',
		importa: "import { Sheet } from '$lib/components/ui';",
		cuando:
			'Una hoja que sube desde abajo en el celu (en compu, ventana centrada). Se cierra arrastrando hacia abajo y con la X: las dos.',
		cuandoNo: 'Para una pregunta de sí o no, askConfirm.',
		soloPanel: true
	},
	{
		id: 'pageheader',
		nombre: 'PageHeader',
		importa: "import { PageHeader } from '$lib/components/ui';",
		cuando:
			'El encabezado de cada página del panel: título, subtítulo y acciones. Con `image` o `icon`, como la ficha de un evento (imagen, título, fecha, chips y acciones; sin imagen, el ícono grande del tipo).',
		cuandoNo: 'No armes otro encabezado a mano en cada página.',
		soloPanel: true
	},
	{
		id: 'savestatus',
		nombre: 'SaveStatus',
		importa: "import { SaveStatus } from '$lib/components/ui';",
		cuando: 'En qué quedó un guardado automático: «Guardando…», «Guardado ✓» o el error, en rojo.',
		cuandoNo:
			'No para la barra de guardar del formulario de eventos (tiene la suya). No uses rojo para «Guardado».',
		soloPanel: true
	},
	{
		id: 'table',
		nombre: 'Table',
		importa: "import { Table } from '$lib/components/ui';",
		cuando: 'Tablas para leer: encabezados violetas, una línea por fila, se desliza en el celu.',
		cuandoNo: 'El estilo de planilla editable va solo donde se edita.',
		soloPanel: true
	}
];
