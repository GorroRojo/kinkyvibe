/**
 * Lo que se investigó para rediseñar la navegación del panel (11/10): hallazgos con su fuente, los
 * patrones que le sirven a un equipo chico (celu en la puerta, compu para planificar) y lo que hay
 * que evitar. Lo usan la página /estilo/prototipos/panel-nav/investigacion y la caja «Patrón» de
 * cada opción.
 */

/**
 * @typedef {{ label: string, url: string }} Fuente
 * @typedef {{ id: string, titulo: string, detalle: string, panel: string, fuentes: Fuente[] }} Hallazgo
 */

/** @type {Hallazgo[]} */
export const HALLAZGOS = [
	{
		id: 'escondido',
		titulo: 'Lo que está escondido se usa menos',
		detalle:
			'En un estudio de Nielsen Norman Group con 179 personas, en la compu la navegación escondida (detrás de un botón de menú) se usó en el 27 % de los casos contra el 48 % de la visible, y las tareas tardaron al menos un 39 % más. En el celu el efecto también está, pero es menor.',
		panel:
			'Las secciones tienen que estar a la vista en la compu. El modo «Se oculta» del PR #293 está bien como elección personal, no como modo por defecto.',
		fuentes: [
			{
				label: 'NN/g: Hamburger menus and hidden navigation hurt UX metrics',
				url: 'https://www.nngroup.com/articles/hamburger-menus/'
			},
			{
				label: 'NN/g: Basic patterns for mobile navigation (hidden vs. visible)',
				url: 'https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/'
			}
		]
	},
	{
		id: 'iconos',
		titulo: 'Un ícono sin nombre casi nunca se entiende',
		detalle:
			'Fuera de unos pocos (casa, buscar, imprimir), los íconos no tienen un significado compartido. NN/g pide el nombre siempre a la vista, sin depender del mouse («una palabra vale más que mil imágenes»).',
		panel:
			'La grilla (B) solo funciona con nombre en cada teja. Treinta tejas chiquitas, una por página, es justo lo que se desaconseja. «Solo íconos» (#293) queda como modo personal para quien ya conoce el panel.',
		fuentes: [
			{
				label: 'NN/g: Icon usability',
				url: 'https://www.nngroup.com/articles/icon-usability/'
			}
		]
	},
	{
		id: 'global-local',
		titulo: 'Navegación global y navegación local',
		detalle:
			'La global (las secciones) es la misma en todas las páginas. La local muestra las páginas hermanas de la sección en la que estás. Tiene que verse, pero menos que la global. Puede ir horizontal, debajo del título (sirve para 2 o 3 niveles), o vertical, en «L invertida».',
		panel:
			'Es la idea de gorrite: primero la sección en la barra lateral y después la pestaña. A y C ponen la local en pestañas arriba de la página; B, en una lista vertical debajo de la grilla.',
		fuentes: [
			{
				label: 'NN/g: Local navigation',
				url: 'https://www.nngroup.com/articles/local-navigation/'
			}
		]
	},
	{
		id: 'niveles',
		titulo: 'Más de dos niveles y la gente se pierde',
		detalle:
			'NN/g: los diseños con más de dos niveles de «abrir para ver más» suelen tener baja usabilidad. Lo frecuente va adelante y lo raro, un paso más atrás, con un nombre que diga qué hay.',
		panel:
			'Sección y pestaña ya son dos niveles. La ficha de un evento, con sus pestañas, es el tercero: hay que poder llegar directo (desde Inicio, desde Recientes o con «Ir a…»). En la barra lateral no van grupos dentro de grupos.',
		fuentes: [
			{
				label: 'NN/g: Progressive disclosure',
				url: 'https://www.nngroup.com/articles/progressive-disclosure/'
			}
		]
	},
	{
		id: 'pestanas',
		titulo: 'Pocas pestañas, cortas y en un solo renglón',
		detalle:
			'«Cuantas menos pestañas, mejor». Nombres de una o dos palabras, nunca en dos renglones. Cuando no entran se vuelven un carrusel y las de la punta casi no se descubren.',
		panel:
			'La ficha del evento tiene hoy 10 pestañas y Ajustes, 9 páginas. C baja la ficha a 5 pestañas y «Más». A y C agrupan Ajustes en 4 pestañas; B lo muestra como lista.',
		fuentes: [
			{
				label: 'NN/g: Tabs, used right',
				url: 'https://www.nngroup.com/articles/tabs-used-right/'
			}
		]
	},
	{
		id: 'atajos',
		titulo: 'Los atajos ayudan, pero siempre como un camino más',
		detalle:
			'NN/g: un atajo es una forma alternativa de hacer algo, que quien no lo conoce puede ignorar; no puede ser el único camino. En Linear, ⌘K corre cualquier acción o va a cualquier página escribiendo su nombre. En Shopify, ⌘K abre la búsqueda del admin.',
		panel:
			'El panel ya tiene un buscador con / y Ctrl/⌘K que encuentra secciones. C lo muestra como «Ir a…» y le suma acciones («crear evento», «marcar ingreso»). Sirve para les que ya conocen el panel; no reemplaza un menú claro.',
		fuentes: [
			{
				label: 'NN/g: UI accelerators',
				url: 'https://www.nngroup.com/articles/ui-accelerators/'
			},
			{
				label: 'Linear: Navigating Linear',
				url: 'https://linear.app/enablement/guide/navigating-linear'
			},
			{
				label: 'Shopify: Shopify admin overview',
				url: 'https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview'
			}
		]
	},
	{
		id: 'eventos',
		titulo: 'Los paneles de eventos: pocas secciones con ícono y nombre, y pestañas adentro',
		detalle:
			'Eventbrite usa 6 «espacios de trabajo» siempre visibles a la izquierda (Eventos, Órdenes, Marketing, Reportes, Finanzas, Ajustes), cada uno con su ícono y con pestañas adentro. En Luma, cada evento se maneja desde una página con pestañas (Guests, Registration, Blasts, Insights).',
		panel:
			'Los 7 grupos del menú de hoy ya tienen ese tamaño. La ficha del evento es el centro de todo lo de un evento: sus pestañas tienen que ser pocas y claras.',
		fuentes: [
			{
				label: 'Eventbrite: workspaces navigation',
				url: 'https://www.eventbrite.com/blog/eventbrite-workspaces-navigation/'
			},
			{
				label: 'Luma: Event insights (pestañas de «Manage Event»)',
				url: 'https://help.luma.com/p/event-insights'
			}
		]
	},
	{
		id: 'contraejemplo',
		titulo: 'El contraejemplo: pestañas que se mudan a la barra lateral',
		detalle:
			'Vercel (febrero de 2026) pasó sus pestañas horizontales a una barra lateral que se puede achicar u ocultar, con una barra flotante abajo en el celu. Stripe suma «Shortcuts» en la barra: las páginas fijadas y las últimas que visitaste.',
		panel:
			'Cuando una sección tiene muchas páginas (Ajustes), una lista vertical entra mejor que las pestañas: es lo que prueba B. Y tres «Recientes» ayudan a volver a lo de todos los días: lo prueba C.',
		fuentes: [
			{
				label: 'Vercel: Dashboard navigation redesign rollout',
				url: 'https://vercel.com/changelog/dashboard-navigation-redesign-rollout'
			},
			{
				label: 'Stripe: Dashboard basics (Shortcuts)',
				url: 'https://docs.stripe.com/dashboard/basics'
			}
		]
	},
	{
		id: 'celu',
		titulo: 'En el celu, pocas secciones abajo y las acciones afuera',
		detalle:
			'Apple recomienda de 2 a 5 pestañas en la barra de abajo del iPhone, para ir a lugares y no para acciones como «Agregar». Material usa la barra de abajo en pantallas compactas y un riel con nombres en las medianas y grandes.',
		panel:
			'Se queda la barra de abajo de hoy (Inicio, Eventos, Puerta, Ventas, Más). «Crear» va arriba, no en la barra de abajo. En la tablet y en la compu angosta, un riel con el nombre debajo de cada ícono.',
		fuentes: [
			{
				label: 'Apple HIG: Tab bars',
				url: 'https://developer.apple.com/design/human-interface-guidelines/tab-bars'
			},
			{
				label: 'Android: Build adaptive navigation (barra, riel, cajón)',
				url: 'https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation'
			}
		]
	}
];

/** Patrones que le sirven a un equipo chico: la puerta en el celu, la planificación en la compu. */
export const PATRONES = [
	'Secciones con ícono y nombre siempre a la vista en la compu (global), y las páginas de la sección como navegación local: pestañas o lista.',
	'La Puerta a un toque, en el celu y en la compu: es lo único que se hace con gente esperando.',
	'Las acciones fuera del menú: un botón principal en el encabezado de su sección («Crear evento») y, si hay varias, un «Crear» general arriba.',
	'La ficha del evento como centro: todo lo de un evento en sus pestañas, pocas y cortas.',
	'En la tablet, un riel con nombres; en el celu, la barra de abajo con 5 lugares y la hoja «Más».',
	'Un buscador «Ir a…» (⌘K) como atajo opcional para les que usan el panel todos los días.'
];

/** Lo que hay que evitar. */
export const ANTIPATRONES = [
	'Grupos dentro de grupos en la barra lateral (más de dos niveles).',
	'Íconos sin nombre, o con el nombre solo al pasar el mouse, como modo por defecto.',
	'El mismo destino en dos lugares del menú (la Puerta en la barra y también como pestaña de Eventos) o una acción disfrazada de lugar («Cargar evento» como ítem del menú).',
	'Pestañas que no entran (carrusel) o en dos renglones.',
	'Esconder toda la navegación en la compu.',
	'Atajos de teclado como único camino a algo.'
];

/** El patrón de cada opción y los hallazgos en los que se apoya. */
export const PATRON_DE = {
	secciones: {
		patron: 'Navegación global + navegación local en pestañas («hub and spoke» por sección)',
		hallazgos: ['global-local', 'niveles', 'eventos', 'pestanas']
	},
	grilla: {
		patron: 'Riel de secciones con nombre, en grilla, + navegación local vertical («L invertida»)',
		hallazgos: ['iconos', 'global-local', 'contraejemplo', 'celu']
	},
	propuesta: {
		patron:
			'Global + local + aceleradores: las acciones fuera del menú, la Puerta a un toque y «Ir a…» (⌘K) opcional',
		hallazgos: ['atajos', 'celu', 'pestanas', 'contraejemplo', 'escondido']
	}
};
