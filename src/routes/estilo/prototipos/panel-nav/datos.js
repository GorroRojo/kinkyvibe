/**
 * Datos de los prototipos de navegación del panel (/estilo/prototipos/panel-nav/*): el mapa de
 * secciones de cada opción, un evento, órdenes y cifras INVENTADAS (las mismas en las tres, para
 * poder comparar) y la tabla de clics del índice. Nada de esto toca el panel de verdad: el mapa
 * real sigue en src/lib/admin/nav.js.
 *
 * El estado de cada prototipo va en la URL (`?s=sección&t=pestaña&e=evento&et=pestaña-del-evento`)
 * para que cada pantalla tenga su link y se pueda volver con «atrás».
 */
import {
	BookOpen,
	CalendarDays,
	CalendarRange,
	ChartLine,
	ClipboardList,
	FileSpreadsheet,
	House,
	IdCard,
	KeyRound,
	LayoutDashboard,
	Library,
	Mail,
	MapPin,
	Pencil,
	ReceiptText,
	Repeat,
	ScanLine,
	ScrollText,
	Send,
	Settings,
	Tags,
	Ticket,
	TicketPercent,
	ToggleRight,
	UserCheck,
	Users,
	Workflow,
	ArrowRightLeft,
	Database,
	EyeOff,
	HandCoins,
	Landmark,
	Share2,
	HandHeart,
	Eye
} from '@lucide/svelte';

/**
 * @typedef {{ id: string, label: string, icon?: any, count?: number, partes?: { id: string, label: string, icon?: any }[] }} Pestana
 * @typedef {{ id: string, label: string, corto?: string, icon: any, tabs: Pestana[], foot?: true, accion?: { label: string, t: string } }} Seccion
 */

/** Las secciones de hoy (menú agrupado de nav.js), sin sub-ítems en la barra: A y B. */
/** @type {Seccion[]} */
export const SECCIONES = [
	{ id: 'inicio', label: 'Inicio', icon: House, tabs: [{ id: 'hoy', label: 'Hoy' }] },
	{
		id: 'eventos',
		label: 'Eventos',
		icon: CalendarRange,
		accion: { label: 'Crear evento', t: 'crear' },
		tabs: [
			{ id: 'proximos', label: 'Próximos', icon: CalendarRange },
			{ id: 'agenda', label: 'Agenda', icon: CalendarDays },
			{ id: 'puerta', label: 'Puerta', icon: ScanLine },
			{ id: 'series', label: 'Series', icon: Repeat },
			{ id: 'lugares', label: 'Lugares', icon: MapPin },
			{ id: 'roles', label: 'Roles y preguntas', icon: UserCheck }
		]
	},
	{
		id: 'ventas',
		label: 'Ventas',
		icon: Ticket,
		tabs: [
			{ id: 'todas', label: 'Todas', icon: Ticket },
			{ id: 'transferencias', label: 'Transferencias', icon: ArrowRightLeft, count: 2 },
			{ id: 'codigos', label: 'Códigos', icon: TicketPercent }
		]
	},
	{
		id: 'comunidad',
		label: 'Comunidad',
		icon: Users,
		tabs: [
			{ id: 'personas', label: 'Personas', icon: IdCard },
			{ id: 'perfiles', label: 'Perfiles', icon: HandHeart },
			{ id: 'cuentas', label: 'Cuentas', icon: KeyRound },
			{ id: 'plantillas', label: 'Plantillas de mails', icon: Mail }
		]
	},
	{
		id: 'contenido',
		label: 'Contenido',
		icon: BookOpen,
		tabs: [
			{ id: 'material', label: 'Material', icon: BookOpen },
			{ id: 'biblioteca', label: 'Biblioteca', icon: Library },
			{ id: 'no-listadas', label: 'No listadas', icon: EyeOff },
			{ id: 'base', label: 'En la base', icon: Database },
			{ id: 'etiquetas', label: 'Etiquetas', icon: Tags }
		]
	},
	{
		id: 'estadisticas',
		label: 'Estadísticas',
		corto: 'Números',
		icon: ChartLine,
		tabs: [
			{ id: 'ventas', label: 'Ventas', icon: ChartLine },
			{ id: 'asistencia', label: 'Asistencia', icon: UserCheck },
			{ id: 'visitas', label: 'Visitas', icon: Eye }
		]
	},
	{
		id: 'ajustes',
		label: 'Ajustes',
		icon: Settings,
		foot: true,
		// Nueve páginas no entran como pestañas (NN/g: pocas y cortas): cuatro grupos, y cada
		// grupo muestra sus páginas como tarjetas.
		tabs: [
			{
				id: 'plata',
				label: 'Plata',
				icon: Landmark,
				partes: [
					{ id: 'cobros', label: 'Cobros', icon: Landmark },
					{ id: 'fondo', label: 'Fondo', icon: HandHeart },
					{ id: 'propinas', label: 'Propinas', icon: HandCoins }
				]
			},
			{
				id: 'comunicacion',
				label: 'Comunicación',
				icon: Mail,
				partes: [
					{ id: 'mails', label: 'Mails y envíos', icon: Mail },
					{ id: 'vistas-previas', label: 'Vistas previas al compartir', icon: Share2 }
				]
			},
			{
				id: 'equipo',
				label: 'Equipo',
				icon: Users,
				partes: [{ id: 'admins', label: 'Admins', icon: Users }]
			},
			{
				id: 'sistema',
				label: 'Sistema',
				icon: ToggleRight,
				partes: [
					{ id: 'interruptores', label: 'Interruptores', icon: ToggleRight },
					{ id: 'automatizaciones', label: 'Automatizaciones', icon: Workflow },
					{ id: 'actividad', label: 'Actividad', icon: ScrollText }
				]
			}
		]
	}
];

/**
 * Opción C: lo mismo, con la Puerta como sección propia (es lo más urgente y se usa en el celu,
 * con gente esperando) en vez de una pestaña de Eventos. No queda en los dos lugares: un solo
 * camino por destino.
 * @type {Seccion[]}
 */
export const SECCIONES_C = [
	SECCIONES[0],
	{
		id: 'puerta',
		label: 'Puerta',
		icon: ScanLine,
		tabs: [{ id: 'hoy', label: 'Hoy' }]
	},
	{
		...SECCIONES[1],
		tabs: SECCIONES[1].tabs.filter((t) => t.id !== 'puerta')
	},
	...SECCIONES.slice(2)
];

/** Las pestañas de la ficha de un evento como están hoy (EVENT_TABS de nav.js): A y B. */
/** @type {Pestana[]} */
export const PESTANAS_EVENTO = [
	{ id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
	{ id: 'editar', label: 'Editar', icon: Pencil },
	{ id: 'ventas', label: 'Ventas', icon: Ticket },
	{ id: 'ordenes', label: 'Órdenes', icon: ReceiptText },
	{ id: 'transferencias', label: 'Transferencias', icon: ArrowRightLeft },
	{ id: 'puerta', label: 'Puerta', icon: ScanLine },
	{ id: 'codigos', label: 'Códigos', icon: TicketPercent },
	{ id: 'mail', label: 'Mail a compradores', icon: Send },
	{ id: 'plantillas', label: 'Plantillas de mails', icon: Mail },
	{ id: 'preguntas', label: 'Preguntas', icon: ClipboardList }
];

/**
 * Opción C: cinco pestañas de una o dos palabras y lo que se usa poco en «Más» (NN/g: pocas
 * pestañas, nunca en dos renglones). Ventas y Órdenes van juntas; los dos mails, también.
 * @type {Pestana[]}
 */
export const PESTANAS_EVENTO_C = [
	{ id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
	{ id: 'ordenes', label: 'Órdenes', icon: ReceiptText },
	{ id: 'puerta', label: 'Puerta', icon: ScanLine },
	{ id: 'editar', label: 'Editar', icon: Pencil },
	{ id: 'mail', label: 'Mails', icon: Send }
];
/** @type {Pestana[]} */
export const PESTANAS_EVENTO_C_MAS = [
	{ id: 'transferencias', label: 'Transferencias', icon: ArrowRightLeft },
	{ id: 'codigos', label: 'Códigos', icon: TicketPercent },
	{ id: 'preguntas', label: 'Preguntas', icon: ClipboardList }
];

/** Lo que se crea desde el panel: el menú «Crear» (+) de la opción C. */
export const CREAR = [
	{ id: 'evento', label: 'Evento', icon: CalendarRange, s: 'eventos', t: 'crear' },
	{ id: 'codigo', label: 'Código de descuento', icon: TicketPercent, s: 'ventas', t: 'codigos' },
	{ id: 'perfil', label: 'Perfil de amigue', icon: HandHeart, s: 'comunidad', t: 'perfiles' },
	{ id: 'material', label: 'Material', icon: BookOpen, s: 'contenido', t: 'material' },
	{ id: 'plantilla', label: 'Plantilla de mail', icon: Mail, s: 'comunidad', t: 'plantillas' },
	{
		id: 'importar',
		label: 'Importar planilla de eventos',
		icon: FileSpreadsheet,
		s: 'eventos',
		t: 'importar'
	}
];

/** Recientes de la opción C (como los «Shortcuts» de Stripe): lo último que abriste. */
export const RECIENTES = [
	{ label: 'Fiesta de Primavera · Órdenes', s: 'eventos', e: 'fiesta-primavera', et: 'ordenes' },
	{ label: 'Ventas · Transferencias', s: 'ventas', t: 'transferencias' },
	{ label: 'Ajustes · Cobros', s: 'ajustes', t: 'plata' }
];

// ── Datos inventados (los mismos en las tres opciones) ─────────────────────────────────────────

export const EVENTO = {
	slug: 'fiesta-primavera',
	nombre: 'Fiesta de Primavera',
	fecha: 'Sáb 18/10 · 22 h',
	lugar: 'Lugar de ejemplo',
	vendidas: 86,
	cupo: 120,
	recaudado: '$ 1.032.000',
	transferencias: 2
};

export const EVENTOS = [
	EVENTO,
	{
		slug: 'taller-cuerdas',
		nombre: 'Taller de cuerdas para principiantes',
		fecha: 'Mié 22/10 · 19 h',
		lugar: 'Sala de prueba',
		vendidas: 14,
		cupo: 16
	},
	{
		slug: 'charla-consentimiento',
		nombre: 'Charla: consentimiento y cuidados',
		fecha: 'Jue 30/10 · 20 h',
		lugar: 'En línea',
		vendidas: 41,
		cupo: 0
	},
	{
		slug: 'picnic',
		nombre: 'Picnic de amigues',
		fecha: 'Dom 2/11 · 15 h',
		lugar: 'Plaza inventada',
		vendidas: 0,
		cupo: 0
	}
];

export const ORDENES = [
	{ id: 'A-1041', nombre: 'Ana Ejemplo', entradas: 2, tipo: 'Anticipada', estado: 'Pagada' },
	{ id: 'A-1040', nombre: 'Bruno Prueba', entradas: 1, tipo: 'General', estado: 'Pagada' },
	{ id: 'A-1039', nombre: 'Cami Inventade', entradas: 1, tipo: 'General', estado: 'Transferencia' },
	{ id: 'A-1038', nombre: 'Dani Demo', entradas: 3, tipo: 'Anticipada', estado: 'Pagada' },
	{ id: 'A-1037', nombre: 'Eli Ficticie', entradas: 1, tipo: 'Invitación', estado: 'Pagada' }
];

/** La lista de la puerta (las mismas personas: cada entrada, una fila). */
export const PUERTA = [
	{ id: 'p1', nombre: 'Ana Ejemplo', tipo: 'Anticipada', dni: '…123' },
	{ id: 'p2', nombre: 'Acompañante de Ana Ejemplo', tipo: 'Anticipada', dni: '…456' },
	{ id: 'p3', nombre: 'Bruno Prueba', tipo: 'General', dni: '…789' },
	{ id: 'p4', nombre: 'Dani Demo', tipo: 'Anticipada', dni: '…246' },
	{ id: 'p5', nombre: 'Eli Ficticie', tipo: 'Invitación', dni: '…135' }
];

/** Ventas por semana, para el gráfico de barras de Estadísticas. */
export const VENTAS_SEMANA = [
	{ semana: '15/9', n: 12 },
	{ semana: '22/9', n: 18 },
	{ semana: '29/9', n: 9 },
	{ semana: '6/10', n: 27 },
	{ semana: '13/10', n: 20 }
];

// ── Comparación (índice) ───────────────────────────────────────────────────────────────────────

/** Las tres opciones (el patrón de cada una está en investigacion.js, `PATRON_DE`). */
export const OPCIONES = [
	{
		slug: 'secciones',
		letra: 'A',
		nombre: 'Secciones y pestañas'
	},
	{
		slug: 'grilla',
		letra: 'B',
		nombre: 'Grilla'
	},
	{
		slug: 'propuesta',
		letra: 'C',
		nombre: 'Secciones, «Crear» e «Ir a…»'
	}
];

/**
 * Clics desde el Inicio hasta terminar cada tarea (contando el toque final). «Hoy» es el panel con
 * el PR #293. Si el celu cambia la cuenta, va entre paréntesis.
 */
export const TAREAS = [
	{
		tarea: 'Crear un evento',
		hoy: '1 (ítem «Cargar evento»)',
		A: '2 (Eventos → Crear evento)',
		B: '2 (Eventos → Crear evento)',
		C: '2 (+ Crear → Evento), o ⌘K «crear evento»'
	},
	{
		tarea: 'Ver las órdenes de un evento',
		hoy: '3 (Eventos → evento → Órdenes)',
		A: '3',
		B: '3',
		C: '3, o 1 desde Recientes / ⌘K'
	},
	{
		tarea: 'Marcar un ingreso en la puerta',
		hoy: '2 (Puerta → marcar)',
		A: '3 (Eventos → Puerta → marcar); 2 en el celu',
		B: '3 (Eventos → Puerta → marcar); 2 en el celu',
		C: '2 (Puerta → marcar), igual en el celu'
	},
	{
		tarea: 'Cambiar un ajuste (Interruptores)',
		hoy: '1–2 (abrir Ajustes al pie → Interruptores)',
		A: '2 (Ajustes → Sistema)',
		B: '2 (Ajustes → Interruptores)',
		C: '2 (Ajustes → Sistema), o ⌘K'
	},
	{
		tarea: 'Ver estadísticas',
		hoy: '1',
		A: '1',
		B: '1',
		C: '1'
	}
];

export const SIEMPRE_VISIBLE = {
	hoy: 'Unos 30 links en 6 grupos abiertos (con scroll a 900 px de alto), con «Cargar evento» y «Puerta» resaltados.',
	A: '7 secciones con nombre. Las pestañas de la sección en la que estás, arriba de la página.',
	B: 'Una grilla de 7 secciones con nombre y, debajo, las páginas de la sección en la que estás. Variante: las 30 páginas en tejas.',
	C: '8 secciones con nombre (la Puerta es una), el botón «+ Crear», «Ir a… ⌘K» y 3 recientes.'
};

export const PROS_CONTRAS = {
	A: {
		pros: [
			'La barra más corta y tranquila: 7 nombres.',
			'Cada sección se ve igual: título, botón de crear, pestañas.',
			'Se parece a Eventbrite y Luma, que les organizadores ya conocen.'
		],
		contras: [
			'Un clic más para crear un evento y para la Puerta en la compu.',
			'Ajustes no entra en pestañas: hay que agruparlo (4 grupos).',
			'La ficha del evento suma un tercer nivel de pestañas.'
		]
	},
	B: {
		pros: [
			'Todo a la vista sin scroll: secciones arriba, páginas de la sección abajo.',
			'Las páginas se ven en una lista vertical: entran las 9 de Ajustes sin agrupar.',
			'Se achica bien: riel con nombres en la tablet, barra de abajo en el celu.'
		],
		contras: [
			'Tejas chicas: los nombres largos se cortan («Estadísticas»).',
			'La variante «todo en tejas» son 30 íconos: muchos no se reconocen sin leer.',
			'Dos menús a la izquierda (grilla y lista) pueden confundirse.'
		]
	},
	C: {
		pros: [
			'Las acciones salen del menú: un «+ Crear» para todo lo que se crea.',
			'La Puerta queda a un toque en la compu y en el celu.',
			'«Ir a…» (⌘K) lleva a cualquier página o acción sin aprender el mapa.',
			'La ficha del evento baja de 10 a 5 pestañas + «Más».'
		],
		contras: [
			'Más piezas para construir (menú Crear, comandos en el buscador, recientes).',
			'«Ir a…» lo usan les que ya conocen el panel: no reemplaza un menú claro.',
			'Cambia los nombres de algunas pestañas del evento (hay que avisar).'
		]
	}
};

// ── De dónde sale cada página (para que ninguna se pierda) ─────────────────────────────────────

/**
 * Cada ítem del menú de hoy (`NAV` de src/lib/admin/nav.js, sin lo que viene) y dónde queda en
 * los prototipos: `sección:página` (en Ajustes, la página suelta). «Cargar evento» no es un lugar:
 * pasa a ser una acción (`accion`). Lo controla prototipos.test.js, así si el menú suma una
 * sección, la comparación no queda vieja sin que se note.
 * @type {Record<string, string>}
 */
export const DESDE_NAV = {
	inicio: 'inicio:hoy',
	eventos: 'eventos:proximos',
	'eventos-nuevo': 'accion',
	'eventos-agenda': 'eventos:agenda',
	'eventos-importar': 'eventos:importar',
	checkin: 'eventos:puerta',
	'eventos-series': 'eventos:series',
	'eventos-lugares': 'eventos:lugares',
	'ajustes-personas': 'eventos:roles',
	entradas: 'ventas:todas',
	'entradas-transferencias': 'ventas:transferencias',
	'entradas-codigos': 'ventas:codigos',
	personas: 'comunidad:personas',
	amigues: 'comunidad:perfiles',
	cuentas: 'comunidad:cuentas',
	'ajustes-plantillas': 'comunidad:plantillas',
	etiquetas: 'contenido:etiquetas',
	material: 'contenido:material',
	biblioteca: 'contenido:biblioteca',
	'no-listadas': 'contenido:no-listadas',
	'contenido-base': 'contenido:base',
	estadisticas: 'estadisticas:ventas',
	'estadisticas-asistencia': 'estadisticas:asistencia',
	'estadisticas-visitas': 'estadisticas:visitas',
	'ajustes-cobros': 'ajustes:cobros',
	'ajustes-fondo': 'ajustes:fondo',
	propinas: 'ajustes:propinas',
	'ajustes-mails': 'ajustes:mails',
	'ajustes-vistas-previas': 'ajustes:vistas-previas',
	'ajustes-admins': 'ajustes:admins',
	'ajustes-interruptores': 'ajustes:interruptores',
	'ajustes-automatizaciones': 'ajustes:automatizaciones',
	actividad: 'ajustes:actividad'
};

/**
 * Cada pestaña de la ficha de hoy (`EVENT_TABS`) y dónde queda en C, que junta algunas.
 * @type {Record<string, string>}
 */
export const PESTANAS_EVENTO_DESDE_HOY = {
	resumen: 'resumen',
	editar: 'editar',
	ventas: 'ordenes',
	ordenes: 'ordenes',
	transferencias: 'transferencias',
	ingreso: 'puerta',
	codigos: 'codigos',
	mail: 'mail',
	mails: 'mail',
	preguntas: 'preguntas'
};
