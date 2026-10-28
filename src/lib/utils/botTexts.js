/**
 * «Textos del bot»: todo lo que el bot de Telegram le dice a la gente (mensajes, botones, avisos de
 * los botones, descripciones de los comandos), con su texto original, dónde aparece y qué
 * variables lleva. Se editan en el panel (Ajustes › Comunicación › Textos del bot) y se guardan
 * solo los cambiados (src/lib/server/telegram/texts.js); sin nada guardado el bot dice lo mismo
 * que siempre, byte a byte (`bot.golden.json`). Sin dependencias: lo usan el bot, el panel (para
 * la vista previa) y las pruebas. Ver docs/telegram.md («Textos del bot»).
 *
 * Formato (como el de las plantillas de los mails, pero con variables de una llave):
 *
 * - **Mensajes** (`message`, `line`): texto común, `**negrita**` y `[texto](https://…)`. Todo lo
 *   demás sale tal cual: `<código>` se ve como «<código>» (se escapa para el HTML de Telegram) y
 *   algo que parece HTML (`<b>`) no se puede guardar.
 * - **Botones, avisos y comandos** (`button`, `toast`, `command`, `inline`): texto solo, sin
 *   formato (Telegram lo muestra tal cual).
 * - Variables: `{nombre}`. Solo las de cada texto; el valor nunca se vuelve formato ni link.
 *
 * Límites de Telegram: botones 64 bytes, avisos de un botón 200 caracteres, descripciones de
 * comandos 256 y mensajes 4096.
 */

/**
 * @typedef {'message' | 'line' | 'inline' | 'button' | 'toast' | 'command'} BotTextKind
 * @typedef {{ name: string, label: string, sample: string, html?: boolean }} BotTextVar
 *   `html`: el valor ya viene armado por el código (una fecha de Telegram, una lista): no se
 *   escapa. Solo en los textos con formato.
 * @typedef {object} BotTextField
 * @property {string} key la clave (`inicio.texto`)
 * @property {string} section la sección de la página ({@link BOT_TEXT_SECTIONS})
 * @property {BotTextKind} kind qué es (define formato y límite)
 * @property {string} label dónde aparece
 * @property {string} [help] qué cuidar
 * @property {string} value el original
 * @property {BotTextVar[]} vars las variables que puede llevar
 * @property {string[]} [required] las que tiene que llevar
 * @property {number} max largo máximo (caracteres; en los botones, bytes)
 */

/** Las secciones de la página, en orden. */
export const BOT_TEXT_SECTIONS = Object.freeze([
	{ id: 'inicio', label: 'Inicio y menú' },
	{ id: 'comandos', label: 'Comandos (el menú «/»)' },
	{ id: 'eventos', label: 'Eventos' },
	{ id: 'seguir', label: 'Seguir y avisos' },
	{ id: 'vincular', label: 'Vincular cuenta' },
	{ id: 'puerta', label: 'Puerta (admins)' },
	{ id: 'admin', label: 'Estado y avisos (admins)' },
	{ id: 'sitio', label: 'Buscar en todo el sitio y modo inline' },
	{ id: 'secciones', label: 'Secciones del sitio (Material, Kinkipedia, Amigues, Series)' },
	{ id: 'entradas', label: 'Mis entradas (con el QR para la puerta)' },
	{ id: 'miniapp', label: 'Mini App del calendario (la página /telegram/app)' },
	{ id: 'compartir', label: 'Mensajes enriquecidos y compartir desde la Mini App' },
	{ id: 'errores', label: 'Errores' }
]);

/** Límites de Telegram (y de este panel) por tipo de texto. */
export const BOT_TEXT_LIMITS = Object.freeze({
	message: 4096,
	line: 1000,
	inline: 200,
	button: 64,
	toast: 200,
	command: 256
});

/** Cómo se llama cada tipo en el panel. */
export const BOT_TEXT_KIND_LABELS = Object.freeze({
	message: 'mensaje',
	line: 'parte de un mensaje',
	inline: 'parte de un mensaje (texto solo)',
	button: 'botón',
	toast: 'aviso del botón',
	command: 'menú «/»'
});

/** ¿Lleva formato (negrita, links)? @param {BotTextKind} kind */
export const isFormattedKind = (kind) => kind === 'message' || kind === 'line';

// Variables que se repiten.
const V = Object.freeze({
	sitio: { name: 'sitio', label: 'la dirección del sitio', sample: 'https://kinkyvibe.ar' },
	evento: { name: 'evento', label: 'el título del evento', sample: 'Taller de cuerdas' },
	nombre: { name: 'nombre', label: 'la etiqueta o serie', sample: '🪢 Cuerdas' },
	busqueda: { name: 'busqueda', label: 'lo que se buscó', sample: 'cuerdas' },
	cantidad: { name: 'cantidad', label: 'cuántas cosas son', sample: '12' },
	etiqueta: { name: 'etiqueta', label: 'el nombre de la etiqueta', sample: 'Cuerdas' },
	rama: { name: 'rama', label: 'el nombre de la rama de la Kinkipedia', sample: 'Prácticas' }
});

/**
 * @param {string} key
 * @param {string} section
 * @param {BotTextKind} kind
 * @param {string} label
 * @param {string} value
 * @param {{ vars?: BotTextVar[], required?: string[], help?: string, max?: number }} [opts]
 * @returns {BotTextField}
 */
const f = (key, section, kind, label, value, opts = {}) => ({
	key,
	section,
	kind,
	label,
	value,
	vars: opts.vars ?? [],
	...(opts.required ? { required: opts.required } : {}),
	...(opts.help ? { help: opts.help } : {}),
	max: opts.max ?? BOT_TEXT_LIMITS[kind]
});

const MINIAPP = 'Es la página de la Mini App, no un mensaje: va tal cual, sin formato.';

const GROUP_ARROW = 'En un grupo, el código le suma « ↗» (abre el chat privado con el bot).';

/** @type {ReadonlyArray<Readonly<BotTextField>>} */
export const BOT_TEXT_FIELDS = Object.freeze(
	[
		// -----------------------------------------------------------------------------------------
		// Inicio y menú
		// -----------------------------------------------------------------------------------------
		f(
			'inicio.texto',
			'inicio',
			'message',
			'El mensaje de inicio (/start y «🏠 Inicio»)',
			'**Hola, soy el bot de Kinky Vibe** 🖤\n\n' +
				'Podés pedirme lo que hay hoy, esta semana o el finde: tocá un botón o escribí un comando ' +
				'(/semana, /proximos, /evento <nombre>). Para todo lo demás, /ayuda.'
		),
		f('inicio.boton_hoy', 'inicio', 'button', 'Botón del inicio: hoy', 'Hoy'),
		f('inicio.boton_semana', 'inicio', 'button', 'Botón del inicio: semana', 'Semana'),
		f('inicio.boton_finde', 'inicio', 'button', 'Botón del inicio: finde', 'Finde'),
		f('inicio.boton_buscar', 'inicio', 'button', 'Botón del inicio: buscar', '🔎 Buscar'),
		f('inicio.boton_sigo', 'inicio', 'button', 'Botón del inicio: Lo que sigo', '⭐ Lo que sigo', {
			help: `Solo con «Lo que sigo» prendido. ${GROUP_ARROW}`,
			max: 60
		}),
		f('inicio.boton_fondo', 'inicio', 'button', 'Botón del inicio: Fondo', '💗 Fondo'),
		f('inicio.boton_ayuda', 'inicio', 'button', 'Botón del inicio: ayuda', '❓ Ayuda'),
		f(
			'inicio.boton_calendario',
			'inicio',
			'button',
			'Botón del inicio: el calendario (Mini App, solo en privado)',
			'📅 Calendario'
		),
		f(
			'inicio.boton_sitio',
			'inicio',
			'button',
			'Botón del inicio: abrir el sitio',
			'Abrir {sitio} ↗',
			{
				vars: [{ name: 'sitio', label: 'el dominio del sitio', sample: 'kinkyvibe.ar' }]
			}
		),
		f(
			'inicio.boton_inicio',
			'inicio',
			'button',
			'Botón «Inicio» (abajo de cada pantalla)',
			'🏠 Inicio'
		),
		f(
			'inicio.boton_volver',
			'inicio',
			'button',
			'Botón «Volver» (tarjetas, Seguir y las listas del sitio)',
			'‹ Volver'
		),
		f(
			'inicio.ayuda',
			'inicio',
			'message',
			'La ayuda (/ayuda y «❓ Ayuda»)',
			'Hola, soy el bot de Kinky Vibe. Podés pedirme:\n\n' +
				'/proximos: los próximos eventos (tocá uno para ver el detalle)\n' +
				'/hoy, /semana, /finde: lo que hay hoy, en los próximos 7 días o este fin de semana\n' +
				'/evento: elegí un evento de la lista\n' +
				'/evento <nombre>: buscá un evento por nombre o por fecha (por ejemplo «sábado» o «15/10»)\n' +
				'/buscar <texto>: buscá en todo el sitio (eventos, material, Kinkipedia y amigues)\n' +
				'/fondo: cuánto juntó el Fondo Kinky Vibe este mes\n' +
				'/inicio: volver al inicio, con botones para todo\n' +
				'{cuenta}\n' +
				'Para comprar entradas y ver todo lo demás, entrá a {sitio}',
			{
				vars: [
					{
						name: 'cuenta',
						label: 'los comandos de la cuenta (el texto de abajo), solo con «Lo que sigo» prendido',
						sample: '',
						html: true
					},
					V.sitio
				]
			}
		),
		f(
			'inicio.ayuda_cuenta',
			'inicio',
			'line',
			'La ayuda: los comandos de la cuenta (va en {cuenta})',
			'Con tu cuenta del sitio (por chat privado):\n' +
				'/vincular <código>: conectá este chat (el código está en Mi rincón → Lo que sigo)\n' +
				'/entradas: tus entradas, con el QR para la puerta\n' +
				'/silenciar: pausá todos los avisos · /reanudar: volvé a recibirlos\n' +
				'/desvincular: desconectá este chat'
		),
		f('inicio.fondo_titulo', 'inicio', 'line', 'Fondo: el título', '**💗 Fondo Kinky Vibe**'),
		f(
			'inicio.fondo_juntado',
			'inicio',
			'line',
			'Fondo: cuánto se juntó',
			'Este mes juntamos **{juntado}** de {meta} ({porcentaje} % de la meta).',
			{
				vars: [
					{ name: 'juntado', label: 'lo juntado este mes', sample: '$ 150.000' },
					{ name: 'meta', label: 'la meta del mes', sample: '$ 300.000' },
					{ name: 'porcentaje', label: 'el porcentaje de la meta', sample: '50' }
				]
			}
		),
		f(
			'inicio.fondo_descuento',
			'inicio',
			'line',
			'Fondo: el descuento de este mes',
			'Descuento del Fondo en las entradas de eventos de Kinky Vibe: **{descuento} %**.',
			{ vars: [{ name: 'descuento', label: 'el descuento de este mes', sample: '10' }] }
		),
		f(
			'inicio.fondo_viejo',
			'inicio',
			'line',
			'Fondo: sin números de este mes',
			'Todavía no hay números de este mes: son los del mes pasado.'
		),
		f(
			'inicio.fondo_actualizado',
			'inicio',
			'line',
			'Fondo: cuándo se actualizó',
			'Actualizado: {fecha}',
			{
				vars: [
					{
						name: 'fecha',
						label: 'la fecha (Telegram la muestra en la hora de quien lee)',
						sample: 'mié 8 ene · 12:00',
						html: true
					}
				]
			}
		),
		f(
			'inicio.fondo_pie',
			'inicio',
			'line',
			'Fondo: la última línea',
			'El Fondo baja el precio de las entradas para todes con aportes de la comunidad.'
		),
		f(
			'inicio.fondo_sin_numeros',
			'inicio',
			'message',
			'Fondo: si no se pudieron leer los números',
			'**💗 Fondo Kinky Vibe**\n\nAhora no pude leer los números del Fondo. Mirálos en {fondo}',
			{ vars: [{ name: 'fondo', label: 'la dirección del Fondo', sample: 'fondo.kinkyvibe.ar' }] }
		),
		f('inicio.fondo_boton', 'inicio', 'button', 'Fondo: el botón', 'Sumate al Fondo ↗'),

		// -----------------------------------------------------------------------------------------
		// Comandos
		// -----------------------------------------------------------------------------------------
		...[
			['inicio', 'Volver al inicio del bot'],
			['proximos', 'Los próximos eventos públicos'],
			['hoy', 'Los eventos de hoy'],
			['semana', 'Lo que hay en los próximos 7 días'],
			['finde', 'Lo que hay este fin de semana'],
			['evento', 'Buscá un evento por nombre, fecha o lugar'],
			['buscar', 'Buscá en todo el sitio: eventos, material, Kinkipedia y amigues'],
			['fondo', 'Cuánto juntó el Fondo Kinky Vibe este mes'],
			['ayuda', 'Qué podés pedirme']
		].map(([command, value]) =>
			f(`comandos.${command}`, 'comandos', 'command', `/${command}`, value)
		),
		...[
			['vincular', 'Conectá tu cuenta (código de Mi rincón)'],
			['sigo', 'Lo que seguís en Lo que sigo'],
			['entradas', 'Tus entradas, con el QR para la puerta'],
			['silenciar', 'Pausá tus avisos por Telegram'],
			['reanudar', 'Volvé a recibir tus avisos'],
			['desvincular', 'Desconectá este chat de tu cuenta']
		].map(([command, value]) =>
			f(`comandos.${command}`, 'comandos', 'command', `/${command}`, value, {
				help: 'Solo en chats privados y con «Lo que sigo» prendido.'
			})
		),

		// -----------------------------------------------------------------------------------------
		// Eventos
		// -----------------------------------------------------------------------------------------
		f('eventos.titulo_hoy', 'eventos', 'inline', 'Lista de hoy: el título', 'Hoy'),
		f(
			'eventos.titulo_semana',
			'eventos',
			'inline',
			'Lista de la semana: el título',
			'En los próximos 7 días'
		),
		f('eventos.titulo_finde', 'eventos', 'inline', 'Lista del finde: el título', 'Este finde'),
		f(
			'eventos.titulo_proximos',
			'eventos',
			'inline',
			'Lista de próximos: el título',
			'Próximos eventos'
		),
		f(
			'eventos.vacio_hoy',
			'eventos',
			'message',
			'Lista de hoy, sin eventos',
			'Hoy no hay eventos públicos. Mirá lo que viene con /proximos.'
		),
		f(
			'eventos.vacio_semana',
			'eventos',
			'message',
			'Lista de la semana, sin eventos',
			'No hay eventos públicos en los próximos 7 días. Mirá lo que viene con /proximos.'
		),
		f(
			'eventos.vacio_finde',
			'eventos',
			'message',
			'Lista del finde, sin eventos',
			'Este finde no hay eventos públicos. Mirá lo que viene con /proximos.'
		),
		f(
			'eventos.vacio_proximos',
			'eventos',
			'message',
			'Lista de próximos, sin eventos',
			'Por ahora no hay eventos próximos. Mirá el calendario en {sitio}/calendario',
			{ vars: [V.sitio] }
		),
		f(
			'eventos.boton_ver',
			'eventos',
			'button',
			'Botón de cada evento en una lista',
			'Ver: {evento}',
			{
				vars: [{ ...V.evento, label: 'el título del evento (hasta 32 letras)' }],
				required: ['evento']
			}
		),
		f(
			'eventos.elegir',
			'eventos',
			'line',
			'/evento sin nada: arriba de la lista',
			'Tocá el evento que querés ver. También podés decirme qué evento buscás, por ejemplo: /evento taller de shibari'
		),
		f(
			'eventos.ver_todo',
			'eventos',
			'inline',
			'Tarjeta de un evento: el link al sitio',
			'Ver todo en el sitio'
		),
		f(
			'eventos.boton_comprar',
			'eventos',
			'button',
			'Tarjeta: comprar entradas (verde)',
			'🎟 Comprar en el sitio'
		),
		f(
			'eventos.boton_abrir',
			'eventos',
			'button',
			'Tarjeta: abrir en el sitio (sin entradas acá)',
			'Abrir en el sitio'
		),
		f(
			'eventos.boton_calendario',
			'eventos',
			'button',
			'Tarjeta: agregar al calendario',
			'📅 Agregar al calendario'
		),
		f('eventos.boton_mapa', 'eventos', 'button', 'Tarjeta: cómo llegar', '🗺 Cómo llegar'),
		f(
			'eventos.no_encontrado',
			'eventos',
			'message',
			'/evento <texto> sin resultados',
			'No encontré ese evento entre los próximos. Probá con /proximos para ver la lista.'
		),
		f(
			'eventos.varios',
			'eventos',
			'line',
			'/evento <texto> con varios resultados: el encabezado',
			'Encontré varios eventos. ¿Cuál querés ver? Tocá uno.'
		),
		f(
			'eventos.buscar',
			'eventos',
			'message',
			'Buscar: el mensaje que pide qué buscar',
			'🔎 Escribí qué buscás: un nombre, «sábado», «15/10», una dirección… Respondé a este mensaje.',
			{
				help: 'El bot reconoce la respuesta por este mensaje: cambiarlo no rompe los que ya se mandaron.'
			}
		),
		f(
			'eventos.buscar_grupo',
			'eventos',
			'message',
			'Buscar en un grupo',
			'Para buscar acá, escribí /evento y lo que buscás, por ejemplo: /evento cuerdas'
		),
		f('eventos.boton_cancelar', 'eventos', 'button', 'Buscar: cancelar', 'Cancelar'),
		f(
			'eventos.sin_resultados',
			'eventos',
			'message',
			'Buscar: sin resultados',
			'No encontré nada para «{busqueda}» entre los próximos eventos.',
			{ vars: [V.busqueda] }
		),
		f(
			'eventos.resultado_uno',
			'eventos',
			'line',
			'Buscar: un resultado (el encabezado)',
			'**Encontré esto para «{busqueda}»**',
			{ vars: [V.busqueda] }
		),
		f(
			'eventos.resultados',
			'eventos',
			'line',
			'Buscar: varios resultados (el encabezado)',
			'**Encontré estos para «{busqueda}»**',
			{ vars: [V.busqueda] }
		),
		f(
			'eventos.boton_buscar_otra',
			'eventos',
			'button',
			'Buscar: buscar otra cosa (también en todo el sitio)',
			'🔎 Buscar otra cosa'
		),

		// -----------------------------------------------------------------------------------------
		// Seguir y avisos
		// -----------------------------------------------------------------------------------------
		f('seguir.boton', 'seguir', 'button', 'Tarjeta: el botón Seguir', '⭐ Seguir', {
			help: GROUP_ARROW,
			max: 60
		}),
		f(
			'seguir.opciones',
			'seguir',
			'message',
			'Seguir: las opciones de un evento',
			'**⭐ Seguir**\n\nDe «{evento}» podés seguir estas etiquetas y series (tocá una):\n\n' +
				'Te avisamos cuando se anuncie algo nuevo, como en el sitio. Si querés esos avisos por acá, ' +
				'prendé la columna Telegram en Mi rincón → Lo que sigo.',
			{ vars: [V.evento] }
		),
		f(
			'seguir.sin_opciones',
			'seguir',
			'message',
			'Seguir: un evento sin nada para seguir',
			'**⭐ Seguir**\n\nDe «{evento}» no hay etiquetas para seguir desde acá.',
			{ vars: [V.evento] }
		),
		f('seguir.boton_etiqueta', 'seguir', 'button', 'Seguir: una etiqueta o serie', '⭐ {nombre}', {
			vars: [{ ...V.nombre, label: 'la etiqueta o serie (hasta 40 letras)' }],
			required: ['nombre']
		}),
		f(
			'seguir.boton_ya',
			'seguir',
			'button',
			'Seguir: una que ya sigue (deshabilitado)',
			'✓ Ya seguís {nombre}',
			{
				vars: [{ ...V.nombre, label: 'la etiqueta o serie (hasta 40 letras)' }],
				required: ['nombre']
			}
		),
		f(
			'seguir.boton_rincon',
			'seguir',
			'button',
			'Botón a Mi rincón → Lo que sigo',
			'Abrir Mi rincón → Lo que sigo ↗'
		),
		f('seguir.listo', 'seguir', 'toast', 'Aviso al seguir algo', 'Listo: ahora seguís {nombre}.', {
			vars: [V.nombre],
			required: ['nombre'],
			help: 'Junto con la línea de abajo, hasta 200 caracteres: si no entra, se acorta el nombre.'
		}),
		f(
			'seguir.listo_telegram',
			'seguir',
			'toast',
			'Aviso al seguir: si se prendieron los avisos por Telegram (segunda línea)',
			'Te aviso por acá cuando haya algo nuevo. Podés apagarlo en Mi rincón.',
			{ max: 150 }
		),
		f('seguir.ya', 'seguir', 'toast', 'Aviso: ya lo seguía', 'Ya lo seguías.'),
		f(
			'seguir.no_esta',
			'seguir',
			'toast',
			'Aviso: la etiqueta ya no está',
			'Esa etiqueta ya no está para seguir.'
		),
		f(
			'seguir.lleno',
			'seguir',
			'toast',
			'Aviso: sigue el máximo',
			'Ya seguís el máximo de cosas: dejá de seguir alguna en Mi rincón → Lo que sigo.'
		),
		f(
			'seguir.muchos',
			'seguir',
			'toast',
			'Aviso: muchos cambios seguidos',
			'Hiciste muchos cambios seguidos. Esperá un rato y probá de nuevo.'
		),
		f(
			'seguir.lo_que_sigo',
			'seguir',
			'message',
			'Lo que sigo (/sigo y «⭐ Lo que sigo»)',
			'**⭐ Lo que seguís**\n\n{lista}\n\nQué te avisamos (por mail o por acá) y dejar de seguir: en Mi rincón → Lo que sigo.',
			{
				vars: [
					{
						name: 'lista',
						label: 'lo que sigue (una por línea, hasta 15) o el texto de abajo',
						sample: '• Serie inventada\n• 🪢 Cuerdas',
						html: true
					}
				],
				required: ['lista']
			}
		),
		f(
			'seguir.nada',
			'seguir',
			'line',
			'Lo que sigo: si no sigue nada',
			'Todavía no seguís nada. En la tarjeta de un evento tocá «⭐ Seguir».'
		),
		f('seguir.mas', 'seguir', 'line', 'Lo que sigo: si sigue más de 15', '… y {cantidad} más.', {
			vars: [{ name: 'cantidad', label: 'cuántas más', sample: '3' }]
		}),
		f(
			'seguir.sin_vincular',
			'seguir',
			'message',
			'Seguir o Lo que sigo sin el chat conectado',
			'Para seguir etiquetas y series desde acá, conectá este chat con tu cuenta: en Mi rincón → ' +
				'Lo que sigo tocá «Conectar Telegram» y mandame el código con /vincular.'
		),
		f(
			'seguir.solo_privado',
			'seguir',
			'message',
			'Seguir o Lo que sigo en un grupo',
			'Esto se hace por chat privado con el bot, con tu cuenta conectada.'
		),
		f(
			'seguir.boton_privado',
			'seguir',
			'button',
			'En un grupo: abrir el chat privado',
			'Abrir el bot por privado ↗'
		),
		f(
			'seguir.aviso_nuevo',
			'seguir',
			'line',
			'Aviso por Telegram: algo nuevo (la primera línea)',
			'🆕 Se anunció algo nuevo',
			{ help: 'Abajo van solo el título, la fecha y el link del evento.' }
		),
		f(
			'seguir.aviso_recordatorio',
			'seguir',
			'line',
			'Aviso por Telegram: recordatorio (la primera línea)',
			'⏰ Recordatorio: falta poco',
			{ help: 'Abajo van solo el título, la fecha y el link del evento.' }
		),

		// -----------------------------------------------------------------------------------------
		// Vincular cuenta
		// -----------------------------------------------------------------------------------------
		f(
			'vincular.listo',
			'vincular',
			'message',
			'/vincular: el chat quedó conectado',
			'Listo: este chat quedó conectado a tu cuenta de Kinky Vibe. ' +
				'Elegí qué avisos querés por Telegram en Mi rincón → Lo que sigo: {link}\n\n' +
				'Para pausarlos: /silenciar. Para desconectar: /desvincular.',
			{
				vars: [
					{
						name: 'link',
						label: 'el link a Mi rincón → Lo que sigo',
						sample: 'https://kinkyvibe.ar/mi-rincon/sigo'
					}
				]
			}
		),
		f(
			'vincular.pedir_codigo',
			'vincular',
			'message',
			'/vincular sin el código',
			'Mandame el código que aparece en Mi rincón → Lo que sigo → «Conectar Telegram», así: /vincular ABCD-2345'
		),
		f(
			'vincular.codigo_malo',
			'vincular',
			'message',
			'/vincular con un código que no sirve',
			'Ese código no sirve: puede estar mal escrito, ya usado o vencido (duran 15 minutos). Pedí uno nuevo en Mi rincón → Lo que sigo.'
		),
		f(
			'vincular.muchos',
			'vincular',
			'message',
			'Muchos intentos de vincular (también de admins)',
			'Probaste muchos códigos seguidos. Esperá un rato y probá de nuevo.'
		),
		f(
			'vincular.solo_privado',
			'vincular',
			'message',
			'Vincular o los comandos de la cuenta en un grupo (también el link de admins)',
			'Esto se hace por chat privado con el bot, no en grupos: escribime directamente.'
		),
		f(
			'vincular.apagado',
			'vincular',
			'toast',
			'Con «Lo que sigo» apagado',
			'Todavía no se puede conectar una cuenta con el bot.',
			{ help: 'Sale como mensaje y como aviso de un botón (sin formato).' }
		),
		f(
			'vincular.sin_vincular',
			'vincular',
			'message',
			'/desvincular, /silenciar o /reanudar sin el chat conectado',
			'Este chat no está conectado a ninguna cuenta. Para conectarlo: /vincular <código>.'
		),
		f(
			'vincular.desvinculado',
			'vincular',
			'message',
			'/desvincular',
			'Listo: desconecté este chat de tu cuenta. No te va a llegar ningún aviso más por acá.'
		),
		f(
			'vincular.silenciado',
			'vincular',
			'message',
			'/silenciar',
			'Listo: pausé todos los avisos por Telegram. Cuando quieras volver a recibirlos: /reanudar.'
		),
		f(
			'vincular.reanudado',
			'vincular',
			'message',
			'/reanudar',
			'Listo: vas a volver a recibir los avisos que elegiste en Lo que sigo.'
		),

		// -----------------------------------------------------------------------------------------
		// Puerta (admins)
		// -----------------------------------------------------------------------------------------
		f(
			'puerta.listo',
			'puerta',
			'message',
			'Le admin vinculó su Telegram para la puerta',
			'Listo: este Telegram quedó vinculado a le admin **{login}** del panel, para la puerta. Para desvincularlo: panel → Ajustes → Admins.',
			{
				vars: [
					{ name: 'login', label: 'el usuario de GitHub de le admin', sample: 'admin-de-prueba' }
				]
			}
		),
		f('puerta.boton', 'puerta', 'button', 'El botón que abre la puerta', '🚪 Abrir la puerta'),
		f(
			'puerta.boton_inicio',
			'puerta',
			'button',
			'Botón «Puerta» del inicio (solo admins vinculades, en privado)',
			'🚪 Puerta'
		),
		f(
			'puerta.link_malo',
			'puerta',
			'message',
			'Link de admin que no sirve',
			'Ese link no sirve: puede estar vencido (duran 15 minutos), ya usado o incompleto. Generá otro en el panel → Ajustes → Admins → «Vincular Telegram».'
		),
		f(
			'puerta.apagada',
			'puerta',
			'message',
			'Link de admin con la puerta apagada',
			'Ahora no se puede vincular una cuenta de admin con el bot.'
		),

		// -----------------------------------------------------------------------------------------
		// Estado y avisos (admins, decisión 0041)
		// -----------------------------------------------------------------------------------------
		f(
			'admin.boton_estado',
			'admin',
			'button',
			'Botón «Estado» del inicio (solo admins vinculades, en privado)',
			'📊 Estado'
		),
		f(
			'admin.boton_avisos',
			'admin',
			'button',
			'Botón «Mis avisos» del inicio y del estado (solo admins vinculades)',
			'🔔 Mis avisos'
		),
		f(
			'admin.elegir',
			'admin',
			'message',
			'Estado: elegir un evento',
			'**📊 Estado de la venta**\n\nElegí un evento para ver cuántas entradas se vendieron y qué hay para revisar.',
			{ help: 'Abajo el bot suma la fecha y el título de cada evento.' }
		),
		f(
			'admin.sin_eventos',
			'admin',
			'message',
			'Estado: no hay próximos eventos con entradas',
			'**📊 Estado de la venta**\n\nNo hay eventos con venta de entradas para hoy ni para los próximos días.'
		),
		f('admin.boton_evento', 'admin', 'button', 'Estado: el botón de cada evento', '📊 {evento}', {
			vars: [V.evento],
			help: 'El código acorta el título para que el botón entre en 64 bytes.'
		}),
		f('admin.cancelado', 'admin', 'inline', 'Estado: marca de un evento cancelado', '❌ Cancelado'),
		f('admin.titulo', 'admin', 'line', 'Estado de un evento: el título', '**📊 {evento}**', {
			vars: [V.evento],
			required: ['evento']
		}),
		f(
			'admin.tipo',
			'admin',
			'line',
			'Estado: un tipo de entrada con cupo',
			'🎟 **{tipo}**: {vendidas} de {cupo} vendidas',
			{
				vars: [
					{ name: 'tipo', label: 'el tipo de entrada', sample: 'General' },
					{ name: 'vendidas', label: 'cuántas se vendieron', sample: '12' },
					{ name: 'cupo', label: 'el cupo del tipo', sample: '40' }
				],
				required: ['vendidas']
			}
		),
		f(
			'admin.tipo_sin_cupo',
			'admin',
			'line',
			'Estado: un tipo de entrada sin cupo',
			'🎟 **{tipo}**: {vendidas} vendidas (sin cupo)',
			{
				vars: [
					{ name: 'tipo', label: 'el tipo de entrada', sample: 'A la gorra' },
					{ name: 'vendidas', label: 'cuántas se vendieron', sample: '3' }
				],
				required: ['vendidas']
			}
		),
		f(
			'admin.tramo',
			'admin',
			'line',
			'Estado: un tramo de precio con cantidad',
			'↳ {tramo}: {vendidas} de {cantidad}',
			{
				vars: [
					{ name: 'tramo', label: 'el nombre del tramo', sample: 'Preventa 1' },
					{ name: 'vendidas', label: 'cuántas se vendieron', sample: '10' },
					{ name: 'cantidad', label: 'cuántas tiene el tramo', sample: '10' }
				],
				required: ['vendidas']
			}
		),
		f(
			'admin.tramo_sin_cantidad',
			'admin',
			'line',
			'Estado: un tramo de precio sin cantidad',
			'↳ {tramo}: {vendidas}',
			{
				vars: [
					{ name: 'tramo', label: 'el nombre del tramo', sample: 'Precio final' },
					{ name: 'vendidas', label: 'cuántas se vendieron', sample: '2' }
				],
				required: ['vendidas']
			}
		),
		f(
			'admin.tramo_vigente',
			'admin',
			'inline',
			'Estado: marca del tramo que se vende ahora',
			'← a la venta'
		),
		f(
			'admin.total',
			'admin',
			'line',
			'Estado: el total (todos los tipos con cupo)',
			'**Total**: {vendidas} de {cupo} vendidas',
			{
				vars: [
					{ name: 'vendidas', label: 'cuántas se vendieron', sample: '15' },
					{ name: 'cupo', label: 'el cupo de todo el evento', sample: '60' }
				],
				required: ['vendidas']
			}
		),
		f(
			'admin.total_sin_cupo',
			'admin',
			'line',
			'Estado: el total (algún tipo sin cupo)',
			'**Total**: {vendidas} vendidas',
			{
				vars: [{ name: 'vendidas', label: 'cuántas se vendieron', sample: '15' }],
				required: ['vendidas']
			}
		),
		f(
			'admin.reservas',
			'admin',
			'line',
			'Estado: reservas sin pagar (solo si hay)',
			'⏳ Reservas sin pagar: {cantidad} · vencen en la próxima hora: {por_vencer}',
			{
				vars: [
					{ name: 'cantidad', label: 'cuántas entradas están reservadas', sample: '4' },
					{ name: 'por_vencer', label: 'cuántas vencen en la próxima hora', sample: '1' }
				],
				required: ['cantidad']
			}
		),
		f(
			'admin.transferencias',
			'admin',
			'line',
			'Estado: transferencias por confirmar (solo si hay)',
			'💸 Transferencias por confirmar: {cantidad}',
			{
				vars: [{ name: 'cantidad', label: 'cuántas órdenes', sample: '2' }],
				required: ['cantidad']
			}
		),
		f(
			'admin.revisar',
			'admin',
			'line',
			'Estado: órdenes para revisar (solo si hay)',
			'⚠️ Órdenes para revisar: {cantidad}',
			{
				vars: [{ name: 'cantidad', label: 'cuántas órdenes', sample: '1' }],
				required: ['cantidad']
			}
		),
		f(
			'admin.espera',
			'admin',
			'line',
			'Estado: personas en la lista de espera (solo si hay)',
			'📝 En la lista de espera: {cantidad}',
			{
				vars: [{ name: 'cantidad', label: 'cuántas personas', sample: '5' }],
				required: ['cantidad']
			}
		),
		f(
			'admin.nada_pendiente',
			'admin',
			'line',
			'Estado: sin reservas ni nada para revisar',
			'✅ Sin reservas sin pagar ni nada para revisar.'
		),
		f(
			'admin.pie',
			'admin',
			'line',
			'Estado: el pie',
			'Solo cantidades: lo de cada compra está en el panel.'
		),
		f('admin.boton_actualizar', 'admin', 'button', 'Estado: actualizar', '🔄 Actualizar'),
		f(
			'admin.boton_panel',
			'admin',
			'button',
			'Estado: abrir el evento en el panel',
			'Ver en el panel ↗'
		),
		f(
			'admin.avisos',
			'admin',
			'message',
			'Mis avisos: la pantalla',
			'**🔔 Tus avisos de admin**\n\nElegí qué querés que te avise el bot por acá. Vienen todos apagados y los cambiás cuando quieras.\n\n• **Resumen diario**: lo vendido en el día, por evento.\n• **Cada venta** y **Cada transferencia**: un aviso en el momento.\n• **Día del evento**: un resumen ese día.\n• **Recordatorios**: el evento de mañana, o si falta el lugar o el link de la transmisión.\n\nEl resumen diario, el día del evento y los recordatorios salen a las 9 (hora de Argentina); cada venta y cada transferencia, en el momento. Solo cantidades y links, nunca datos de quienes compran.'
		),
		f('admin.aviso_diario', 'admin', 'button', 'Mis avisos: resumen diario', 'Resumen diario', {
			max: 56,
			help: 'El bot le suma ✅ o ⬜ adelante.'
		}),
		f('admin.aviso_venta', 'admin', 'button', 'Mis avisos: cada venta', 'Cada venta', {
			max: 56,
			help: 'El bot le suma ✅ o ⬜ adelante.'
		}),
		f(
			'admin.aviso_transferencia',
			'admin',
			'button',
			'Mis avisos: cada transferencia',
			'Cada transferencia',
			{ max: 56, help: 'El bot le suma ✅ o ⬜ adelante.' }
		),
		f('admin.aviso_dia', 'admin', 'button', 'Mis avisos: día del evento', 'Día del evento', {
			max: 56,
			help: 'El bot le suma ✅ o ⬜ adelante.'
		}),
		f(
			'admin.aviso_recordatorios',
			'admin',
			'button',
			'Mis avisos: recordatorios',
			'Recordatorios',
			{ max: 56, help: 'El bot le suma ✅ o ⬜ adelante.' }
		),
		f('admin.prendido', 'admin', 'toast', 'Mis avisos: al prender uno', 'Prendido: {aviso}', {
			vars: [{ name: 'aviso', label: 'el aviso', sample: 'Resumen diario' }]
		}),
		f('admin.apagado', 'admin', 'toast', 'Mis avisos: al apagar uno', 'Apagado: {aviso}', {
			vars: [{ name: 'aviso', label: 'el aviso', sample: 'Resumen diario' }]
		}),
		f(
			'admin.venta',
			'admin',
			'line',
			'Aviso «Cada venta»: una entrada',
			'🎟 Se vendió {entradas} de **{evento}** · {vendidas}',
			{
				vars: [
					{
						name: 'entradas',
						label: 'cuántas, el tipo y el tramo',
						sample: '1 General (Preventa 1)'
					},
					V.evento,
					{
						name: 'vendidas',
						label: 'las vendidas del tipo contra su cupo (o solo las vendidas, sin cupo)',
						sample: '23/50'
					}
				],
				required: ['entradas', 'evento'],
				help: 'Solo cantidades: nunca dice quién compró.'
			}
		),
		f(
			'admin.ventas',
			'admin',
			'line',
			'Aviso «Cada venta»: más de una entrada',
			'🎟 Se vendieron {entradas} de **{evento}** · {vendidas}',
			{
				vars: [
					{
						name: 'entradas',
						label: 'cuántas, el tipo y el tramo',
						sample: '2 General (Preventa 1)'
					},
					V.evento,
					{
						name: 'vendidas',
						label: 'las vendidas del tipo contra su cupo (o solo las vendidas, sin cupo)',
						sample: '25/50'
					}
				],
				required: ['entradas', 'evento'],
				help: 'Solo cantidades: nunca dice quién compró.'
			}
		),
		f(
			'admin.transferencia',
			'admin',
			'line',
			'Aviso «Cada transferencia»: llegó una para confirmar',
			'💸 Transferencia para confirmar: {entradas} de **{evento}** · {pendientes} por confirmar',
			{
				vars: [
					{ name: 'entradas', label: 'cuántas, el tipo y el tramo', sample: '2 General' },
					V.evento,
					{
						name: 'pendientes',
						label: 'cuántas transferencias del evento esperan confirmación',
						sample: '3'
					}
				],
				required: ['entradas', 'evento'],
				help: 'Solo cantidades: nunca dice quién compró.'
			}
		),
		f(
			'admin.contracargo',
			'admin',
			'line',
			'Aviso «Cada venta»: un contracargo de Mercado Pago',
			'⚠️ Contracargo en Mercado Pago: orden {orden} de **{evento}** ({monto}). El banco revirtió el pago; las entradas quedaron anuladas.',
			{
				vars: [
					{ name: 'orden', label: 'la referencia de la orden', sample: 'KV-1A2B3C4D' },
					V.evento,
					{ name: 'monto', label: 'el total de la orden', sample: '$ 10.000' }
				],
				required: ['orden', 'evento'],
				help: 'Les llega a quienes prendieron «Cada venta». Nunca dice quién compró.'
			}
		),
		f(
			'admin.resumen_titulo',
			'admin',
			'line',
			'Resumen diario: el título (uno por evento)',
			'☀️ **Resumen diario · {evento}**',
			{ vars: [V.evento], required: ['evento'] }
		),
		f(
			'admin.resumen_vendidas',
			'admin',
			'line',
			'Resumen diario: lo vendido desde ayer',
			'🎟 Desde ayer a las {hora}: {cantidad} vendidas · en total: {vendidas}',
			{
				vars: [
					{ name: 'hora', label: 'la hora del resumen', sample: '9:00' },
					{ name: 'cantidad', label: 'cuántas se vendieron desde ayer', sample: '5' },
					{
						name: 'vendidas',
						label: 'las vendidas del evento contra el cupo (o solo las vendidas, sin cupo)',
						sample: '23/50'
					}
				],
				required: ['cantidad']
			}
		),
		f(
			'admin.resumen_transferencias',
			'admin',
			'line',
			'Resumen diario: transferencias que llegaron desde ayer (solo si hay)',
			'💸 Transferencias nuevas desde ayer: {cantidad}',
			{
				vars: [{ name: 'cantidad', label: 'cuántas órdenes', sample: '2' }],
				required: ['cantidad']
			}
		),
		f(
			'admin.resumen_reservas',
			'admin',
			'line',
			'Resumen diario: reservas sin pagar (solo si hay)',
			'⏳ Reservas sin pagar: {cantidad} · vencen en las próximas 24 horas: {por_vencer}',
			{
				vars: [
					{ name: 'cantidad', label: 'cuántas entradas están reservadas', sample: '4' },
					{ name: 'por_vencer', label: 'cuántas vencen en las próximas 24 horas', sample: '2' }
				],
				required: ['cantidad']
			}
		),
		f(
			'admin.dia_titulo',
			'admin',
			'line',
			'Día del evento: el título del resumen de ese día',
			'📣 **Hoy: {evento}**',
			{ vars: [V.evento], required: ['evento'] }
		),
		f(
			'admin.manana_titulo',
			'admin',
			'line',
			'Recordatorios: el título del de la víspera (el evento es mañana)',
			'⏰ **Mañana: {evento}**',
			{ vars: [V.evento], required: ['evento'] }
		),
		f(
			'admin.falta_titulo',
			'admin',
			'line',
			'Recordatorios: el título del del mismo día, si todavía falta el lugar o el link',
			'⚠️ **Hoy: {evento}**',
			{
				vars: [V.evento],
				required: ['evento'],
				help: 'Solo sale si falta algo, y no a quien prendió «Día del evento» (su resumen ya lo dice).'
			}
		),
		f(
			'admin.falta_lugar',
			'admin',
			'line',
			'Día del evento y recordatorios: un evento presencial sin lugar (solo si falta)',
			'📍 Todavía no tiene lugar: cargalo en el panel.'
		),
		f(
			'admin.falta_link',
			'admin',
			'line',
			'Día del evento y recordatorios: un evento online sin el link de la transmisión (solo si falta)',
			'🔗 Todavía falta el link de la transmisión: cargalo en el panel y mandáselo a todes.'
		),

		// -----------------------------------------------------------------------------------------
		// Buscar en todo el sitio y modo inline (#298)
		// -----------------------------------------------------------------------------------------
		f(
			'sitio.buscar',
			'sitio',
			'message',
			'Buscar en todo el sitio: el mensaje que pide qué buscar',
			'🔎 Escribí qué buscás: un evento, un tema, una persona o un proyecto, un lugar… Respondé a este mensaje.',
			{
				help: 'El bot reconoce la respuesta por este mensaje: cambiarlo no rompe los que ya se mandaron.'
			}
		),
		f(
			'sitio.buscar_grupo',
			'sitio',
			'message',
			'Buscar en todo el sitio, en un grupo',
			'Para buscar acá, escribí /buscar y lo que buscás, por ejemplo: /buscar cuerdas'
		),
		f(
			'sitio.encontre_uno',
			'sitio',
			'line',
			'Buscar en todo el sitio: un resultado (el encabezado)',
			'**Encontré esto para «{busqueda}»**',
			{ vars: [V.busqueda] }
		),
		f(
			'sitio.encontre',
			'sitio',
			'line',
			'Buscar en todo el sitio: varios resultados (el encabezado)',
			'**Encontré {cantidad} para «{busqueda}»**',
			{ vars: [V.cantidad, V.busqueda] }
		),
		f(
			'sitio.sin_resultados',
			'sitio',
			'message',
			'Buscar en todo el sitio: sin resultados',
			'No encontré nada para «{busqueda}» en el sitio. Probá con otra palabra.',
			{ vars: [V.busqueda] }
		),
		f(
			'sitio.sugerencias',
			'sitio',
			'line',
			'Sin resultados: arriba de las búsquedas parecidas (los botones)',
			'**¿Quisiste decir…?** Tocá una.'
		),
		f(
			'sitio.boton_sugerencia',
			'sitio',
			'button',
			'Sin resultados: una búsqueda parecida',
			'🔎 {busqueda} ({cantidad})',
			{
				vars: [
					{ ...V.busqueda, label: 'la búsqueda parecida (hasta 30 letras)' },
					{ ...V.cantidad, label: 'cuántas cosas trae' }
				],
				required: ['busqueda']
			}
		),
		f(
			'sitio.seguir_etiqueta',
			'sitio',
			'line',
			'Sin resultados: lo buscado es una etiqueta (con «Lo que sigo» prendido, por chat privado)',
			'Todavía no hay nada con «{nombre}». Seguila y te avisamos cuando aparezca algo.',
			{ vars: [{ ...V.nombre, label: 'la etiqueta (hasta 40 letras)' }] }
		),
		f(
			'sitio.boton_seguir',
			'sitio',
			'button',
			'Sin resultados: seguir la etiqueta buscada',
			'⭐ Seguir {nombre}',
			{
				vars: [{ ...V.nombre, label: 'la etiqueta (hasta 40 letras)' }],
				required: ['nombre']
			}
		),
		f(
			'sitio.proximos',
			'sitio',
			'line',
			'Sin resultados: arriba de los próximos eventos',
			'**Mientras tanto, lo que viene:**'
		),
		f(
			'sitio.boton_ver',
			'sitio',
			'button',
			'Tarjeta compacta y modo inline: abrir la página en el sitio',
			'Ver en el sitio',
			{ help: 'Sin https (en local) va como link en el texto del mensaje.' }
		),
		f(
			'sitio.boton_entradas',
			'sitio',
			'button',
			'Modo inline: la tarjeta de un evento que vende entradas acá',
			'🎟 Entradas'
		),
		f(
			'sitio.inline_sin_resultados',
			'sitio',
			'button',
			'Modo inline: el botón arriba cuando no hay resultados (abre el bot)',
			'No encontré nada. Probá en el bot'
		),
		f(
			'sitio.inline_sugerencia',
			'sitio',
			'button',
			'Modo inline: el botón arriba cuando no hay resultados y se muestran los de una búsqueda parecida (abre el bot)',
			'Nada para «{busqueda}». Te muestro «{sugerencia}»',
			{
				vars: [
					{ ...V.busqueda, label: 'lo que se buscó (hasta 16 letras)' },
					{ name: 'sugerencia', label: 'la búsqueda parecida (hasta 16 letras)', sample: 'cuerdas' }
				],
				required: ['sugerencia']
			}
		),
		f(
			'sitio.inline_vacio',
			'sitio',
			'button',
			'Modo inline: el botón arriba cuando el sitio todavía no tiene nada',
			'Todavía no hay nada para mostrar. Abrí el bot'
		),
		f(
			'sitio.tipo_serie',
			'sitio',
			'inline',
			'La descripción de una serie (sin resumen)',
			'Serie de eventos'
		),
		f(
			'sitio.tipo_wiki',
			'sitio',
			'inline',
			'La descripción de una entrada de la Kinkipedia sin resumen',
			'Kinkipedia'
		),
		f(
			'sitio.tipo_material',
			'sitio',
			'inline',
			'La descripción de un material sin resumen',
			'Material'
		),

		// -----------------------------------------------------------------------------------------
		// Secciones del sitio
		// -----------------------------------------------------------------------------------------
		f(
			'secciones.boton_material',
			'secciones',
			'button',
			'Botón del inicio: Material',
			'📚 Material'
		),
		f(
			'secciones.boton_kinkipedia',
			'secciones',
			'button',
			'Botón del inicio: Kinkipedia',
			'📖 Kinkipedia'
		),
		f('secciones.boton_amigues', 'secciones', 'button', 'Botón del inicio: Amigues', '👥 Amigues'),
		f('secciones.boton_series', 'secciones', 'button', 'Botón del inicio: Series', '🔁 Series'),
		f(
			'secciones.titulo_material',
			'secciones',
			'line',
			'Material: el título de la lista',
			'**📚 Material**'
		),
		f(
			'secciones.titulo_kinkipedia',
			'secciones',
			'line',
			'Kinkipedia: el título de la lista',
			'**📖 Kinkipedia**'
		),
		f(
			'secciones.titulo_amigues',
			'secciones',
			'line',
			'Amigues: el título de la lista',
			'**👥 Amigues**'
		),
		f(
			'secciones.titulo_series',
			'secciones',
			'line',
			'Series: el título de la lista',
			'**🔁 Series**'
		),
		f(
			'secciones.con_etiqueta',
			'secciones',
			'line',
			'Una lista filtrada: la etiqueta (va después del título)',
			'🏷 {etiqueta}',
			{ vars: [V.etiqueta] }
		),
		f(
			'secciones.vacio',
			'secciones',
			'message',
			'Una sección sin nada para mostrar',
			'Todavía no hay nada para mostrar acá.'
		),
		f(
			'secciones.vacio_etiqueta',
			'secciones',
			'message',
			'Una sección filtrada sin nada con esa etiqueta',
			'No hay nada con la etiqueta «{etiqueta}» acá.',
			{ vars: [V.etiqueta] }
		),
		f(
			'secciones.boton_filtrar',
			'secciones',
			'button',
			'Botón de la lista: elegir una etiqueta',
			'🏷 Filtrar por etiqueta'
		),
		f(
			'secciones.boton_sin_filtro',
			'secciones',
			'button',
			'Botón para sacar el filtro (en la lista y en las etiquetas)',
			'✖ Sin filtro'
		),
		f(
			'secciones.elegir_etiqueta',
			'secciones',
			'message',
			'Las etiquetas de una sección (va abajo del título)',
			'Elegí una etiqueta para ver solo lo que la tiene:'
		),
		f(
			'secciones.sin_etiquetas',
			'secciones',
			'message',
			'Una sección sin etiquetas para filtrar',
			'Todavía no hay etiquetas para filtrar acá.'
		),
		f(
			'secciones.boton_etiqueta',
			'secciones',
			'button',
			'Botón de una etiqueta (con cuántas cosas la tienen)',
			'{etiqueta} · {cantidad}',
			{
				vars: [V.etiqueta, V.cantidad],
				required: ['etiqueta'],
				help: 'El nombre de la etiqueta se acorta para que el botón entre.'
			}
		),
		f(
			'secciones.no_esta',
			'secciones',
			'toast',
			'Algo de una sección que ya no está (botón viejo)',
			'Eso ya no está disponible.'
		),
		f(
			'secciones.rama',
			'secciones',
			'line',
			'Kinkipedia: la rama abierta (va después del título)',
			'📂 {rama}',
			{ vars: [V.rama], required: ['rama'] }
		),
		f(
			'secciones.boton_rama',
			'secciones',
			'button',
			'Kinkipedia: el botón de una rama (abre lo de adentro)',
			'📂 {rama}',
			{
				vars: [V.rama],
				required: ['rama'],
				help: 'El nombre de la rama se acorta para que el botón entre.'
			}
		),
		f(
			'secciones.rama_cantidad',
			'secciones',
			'line',
			'Kinkipedia: la línea de una rama en la lista (cuántas cosas tiene adentro)',
			'Adentro: {cantidad}',
			{ vars: [V.cantidad] }
		),

		// -----------------------------------------------------------------------------------------
		// Mis entradas
		// -----------------------------------------------------------------------------------------
		f(
			'entradas.boton_inicio',
			'entradas',
			'button',
			'Botón del inicio: Mis entradas',
			'🎟 Mis entradas',
			{
				help: `Solo con «Lo que sigo» prendido. ${GROUP_ARROW}`,
				max: 60
			}
		),
		f(
			'entradas.titulo',
			'entradas',
			'line',
			'La lista: el título (las de los próximos eventos)',
			'**🎟 Tus entradas**'
		),
		f(
			'entradas.titulo_pasadas',
			'entradas',
			'line',
			'La lista: el título (las de eventos que ya pasaron)',
			'**🕘 Tus entradas pasadas**'
		),
		f(
			'entradas.una',
			'entradas',
			'line',
			'La lista: cuántas entradas hay para un evento (una)',
			'1 entrada'
		),
		f(
			'entradas.varias',
			'entradas',
			'line',
			'La lista: cuántas entradas hay para un evento (más de una)',
			'{cantidad} entradas',
			{ vars: [V.cantidad] }
		),
		f(
			'entradas.vacio',
			'entradas',
			'message',
			'Sin entradas para los próximos eventos',
			'No tenés entradas para los próximos eventos. Acá aparecen las que se compran con el mail ' +
				'de tu cuenta.'
		),
		f(
			'entradas.vacio_pasadas',
			'entradas',
			'message',
			'Sin entradas de eventos que ya pasaron',
			'No tenés entradas de eventos que ya pasaron.'
		),
		f(
			'entradas.boton_entrada',
			'entradas',
			'button',
			'La lista: el botón de cada entrada',
			'🎟 {titular} · {evento}',
			{
				vars: [
					{ name: 'titular', label: 'el nombre de la entrada', sample: 'Persona de ejemplo' },
					V.evento
				],
				help: 'El nombre y el título se acortan para que el botón entre.'
			}
		),
		f('entradas.boton_pasadas', 'entradas', 'button', 'La lista: ver las pasadas', '🕘 Pasadas'),
		f(
			'entradas.boton_proximas',
			'entradas',
			'button',
			'La lista de pasadas: volver a las de los próximos eventos',
			'🎟 Próximas'
		),
		f(
			'entradas.titular',
			'entradas',
			'line',
			'La entrada: el nombre (y los pronombres)',
			'👤 {titular}',
			{
				vars: [
					{
						name: 'titular',
						label: 'el nombre de la entrada (y sus pronombres)',
						sample: 'Persona de ejemplo (elle)'
					}
				]
			}
		),
		f(
			'entradas.tipo_codigo',
			'entradas',
			'line',
			'La entrada: el tipo y el código corto',
			'🎫 {tipo} · código **{codigo}**',
			{
				vars: [
					{ name: 'tipo', label: 'el tipo de entrada', sample: 'General' },
					{ name: 'codigo', label: 'el código corto (para la puerta)', sample: 'ABC 234' }
				],
				required: ['codigo']
			}
		),
		f('entradas.tipo', 'entradas', 'line', 'La entrada: el tipo (sin código corto)', '🎫 {tipo}', {
			vars: [{ name: 'tipo', label: 'el tipo de entrada', sample: 'General' }]
		}),
		f(
			'entradas.valida',
			'entradas',
			'line',
			'La entrada: válida',
			'✅ Válida. Mostrá este QR en la puerta (si no se puede escanear, el código).'
		),
		f(
			'entradas.usada',
			'entradas',
			'line',
			'La entrada: ya se usó',
			'☑️ Ya se usó: ingresó {fecha}.',
			{
				vars: [{ name: 'fecha', label: 'cuándo ingresó', sample: 'sáb 11 ene · 23:40', html: true }]
			}
		),
		f(
			'entradas.online',
			'entradas',
			'line',
			'La entrada de un evento online (no lleva QR)',
			'💻 Es online: el link de la transmisión está en tu entrada, en el sitio.'
		),
		f(
			'entradas.ver_qr',
			'entradas',
			'line',
			'La entrada sin la foto del QR (si no se pudo mandar)',
			'Tocá «Ver la entrada» para ver el QR.'
		),
		f(
			'entradas.boton_ver',
			'entradas',
			'button',
			'La entrada: el botón a su página en el sitio (con el QR)',
			'🔗 Ver la entrada'
		),
		f(
			'entradas.sin_vincular',
			'entradas',
			'message',
			'Mis entradas sin el chat conectado',
			'Para ver tus entradas acá, conectá este chat con tu cuenta: en Mi rincón → Lo que sigo ' +
				'tocá «Conectar Telegram» y mandame el código con /vincular.'
		),
		f(
			'entradas.no_esta',
			'entradas',
			'toast',
			'Una entrada que ya no está (botón viejo)',
			'Esa entrada ya no está acá.'
		),

		// -----------------------------------------------------------------------------------------
		// Mini App del calendario (/telegram/app): una página, no un mensaje del bot. Texto solo.
		// -----------------------------------------------------------------------------------------
		f('miniapp.titulo', 'miniapp', 'inline', 'El título de la página', 'Calendario', {
			help: `${MINIAPP} También va en la pestaña: «<título> · Kinky Vibe».`,
			max: 60
		}),
		f(
			'miniapp.bajada',
			'miniapp',
			'inline',
			'La línea abajo del título',
			'Lo que viene en Kinky Vibe. Para comprar entradas se abre el sitio.',
			{ help: MINIAPP }
		),
		f(
			'miniapp.boton_inicio',
			'miniapp',
			'button',
			'Botón «agregar a la pantalla de inicio» (solo si Telegram dice que se puede)',
			'📲 Agregar a la pantalla de inicio',
			{ help: MINIAPP }
		),
		f(
			'miniapp.agregada',
			'miniapp',
			'inline',
			'Después de agregarla a la pantalla de inicio',
			'Listo: quedó en tu pantalla de inicio.',
			{ help: MINIAPP }
		),
		f(
			'miniapp.vacio',
			'miniapp',
			'inline',
			'Sin eventos próximos',
			'Por ahora no hay eventos próximos.',
			{ help: MINIAPP }
		),
		f(
			'miniapp.cancelado',
			'miniapp',
			'inline',
			'Un evento cancelado (va después de la hora y el lugar)',
			'Cancelado',
			{ help: MINIAPP, max: 60 }
		),
		f(
			'miniapp.boton_comprar',
			'miniapp',
			'button',
			'Botón para comprar entradas (abre el sitio)',
			'Comprar en el sitio',
			{
				help: `${MINIAPP} El código le suma «🎟 » adelante y « ↗» al final. Los otros estados de la venta («Agotadas»…) son los del sitio.`
			}
		),
		f(
			'miniapp.ver_todo',
			'miniapp',
			'inline',
			'El link del final, al calendario del sitio',
			'Ver el calendario completo en el sitio ↗',
			{ help: MINIAPP }
		),

		// -----------------------------------------------------------------------------------------
		// Mensajes enriquecidos y compartir desde la Mini App (interruptor `telegram_enriquecido`)
		// -----------------------------------------------------------------------------------------
		f(
			'compartir.sigue',
			'compartir',
			'line',
			'Mensaje enriquecido: abajo del texto, cuando es largo y se cortó',
			'Esto es el comienzo. El resto está en el sitio: tocá «Ver en el sitio».',
			{ help: 'El texto de la página llega hasta unos 2500 caracteres; si sigue, va esta línea.' }
		),
		f(
			'compartir.pie',
			'compartir',
			'inline',
			'Mensaje enriquecido: el pie (la última línea, chiquita)',
			'{tipo} · Kinky Vibe',
			{
				vars: [
					{ name: 'tipo', label: 'qué es (Kinkipedia, Material, Evento…)', sample: 'Kinkipedia' }
				]
			}
		),
		f(
			'compartir.tipo_evento',
			'compartir',
			'inline',
			'Mensaje enriquecido: qué es, en el pie de un evento',
			'Evento',
			{
				max: 40,
				help: 'Los otros tipos son los de «Buscar en todo el sitio» (Kinkipedia, Material, Serie de eventos).'
			}
		),
		f(
			'compartir.boton_calendario',
			'compartir',
			'button',
			'Un evento mandado (modo inline o desde la Mini App): abre la Mini App del calendario en ese evento',
			'📅 Abrir en el calendario',
			{ help: 'Solo con el usuario del bot cargado (TELEGRAM_BOT_USERNAME).' }
		),
		f(
			'compartir.miniapp_boton',
			'compartir',
			'button',
			'Mini App del calendario: el botón de cada evento para mandarlo a un chat',
			'📤 Mandar a un chat',
			{ help: MINIAPP }
		),
		f(
			'compartir.miniapp_mandado',
			'compartir',
			'inline',
			'Mini App del calendario: después de mandar un evento',
			'Listo, ya lo mandaste.',
			{ help: MINIAPP }
		),
		f(
			'compartir.miniapp_error',
			'compartir',
			'inline',
			'Mini App del calendario: si no se pudo mandar',
			'No se pudo mandar. Probá de nuevo en un rato.',
			{ help: MINIAPP }
		),
		f(
			'compartir.miniapp_destacado',
			'compartir',
			'inline',
			'Mini App del calendario: arriba del evento cuando se abre desde «Abrir en el calendario»',
			'📌 Te pasaron este evento',
			{ help: MINIAPP, max: 60 }
		),

		// -----------------------------------------------------------------------------------------
		// Errores
		// -----------------------------------------------------------------------------------------
		f(
			'errores.no_disponible',
			'errores',
			'toast',
			'Un evento que ya no está (botón viejo o link)',
			'Ese evento ya no está disponible.',
			{ help: 'Sale como mensaje y como aviso de un botón (sin formato).' }
		),
		f(
			'errores.no_entendi',
			'errores',
			'toast',
			'Un comando o botón que no conoce',
			'No entendí ese comando. Probá con /ayuda.',
			{ help: 'Sale como mensaje y como aviso de un botón (sin formato).' }
		),
		f(
			'errores.algo_salio_mal',
			'errores',
			'toast',
			'Algo falló de nuestro lado',
			'Algo salió mal de nuestro lado. Probá de nuevo en un rato.',
			{ help: 'Sale como mensaje y como aviso de un botón (sin formato).' }
		),
		f('errores.despacio', 'errores', 'toast', 'Telegram pide ir más despacio', 'Más despacio 🙂'),
		f(
			'errores.grupo_link',
			'errores',
			'toast',
			'En un grupo, si no se puede mostrar solo a quien tocó (con link)',
			'Abrí el bot por privado para ver esto.'
		),
		f(
			'errores.grupo',
			'errores',
			'toast',
			'En un grupo, si no se puede mostrar solo a quien tocó (sin link)',
			'Escribile al bot por privado para ver esto.'
		)
	].map((x) => Object.freeze(x))
);

/** @typedef {Record<string, string>} BotTexts */

/** Los originales, por clave. @type {Readonly<BotTexts>} */
export const BOT_TEXT_DEFAULTS = Object.freeze(
	Object.fromEntries(BOT_TEXT_FIELDS.map((x) => [x.key, x.value]))
);

/** @type {ReadonlyMap<string, Readonly<BotTextField>>} */
const FIELD_BY_KEY = new Map(BOT_TEXT_FIELDS.map((x) => [x.key, x]));

/** El campo de una clave, o `undefined`. @param {string} key */
export const botTextField = (key) => FIELD_BY_KEY.get(key);

// ---------------------------------------------------------------------------------------------
// Validar
// ---------------------------------------------------------------------------------------------

const VAR_RE = /\{([a-z_]+)\}/g;
/** Etiquetas de HTML (las de Telegram y las comunes): no se pueden escribir. */
const HTML_TAG_RE =
	/<\/?(?:b|strong|i|em|u|ins|s|strike|del|a|code|pre|span|tg-spoiler|tg-emoji|tg-time|blockquote|br|p|div|img|script|style|iframe|html|body)\b[^>]*>/i;
const LINK_RE = /\[([^\]\n]+)\]\(([^)\s]*)\)/g;
const SAFE_URL_RE = /^(?:https?:\/\/|tg:\/\/)[^\s"<>]+$/i;

/** Bytes en UTF-8. @param {string} s */
export const byteLength = (s) => new TextEncoder().encode(s).length;

/** Las variables escritas en un texto. @param {string} text */
const variablesIn = (text) => [...text.matchAll(VAR_RE)].map((m) => m[1]);

/**
 * Limpia lo que vino del formulario: los textos solos quedan en una línea; los mensajes, con sus
 * saltos de línea (sin más de un renglón vacío seguido).
 * @param {Readonly<BotTextField>} field
 * @param {string} raw
 */
export function cleanBotText(field, raw) {
	const text = String(raw ?? '').replace(/\r\n?/g, '\n');
	if (!isFormattedKind(field.kind)) return text.replace(/\s+/g, ' ').trim();
	return text
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * El error de un texto (en castellano, para el panel), o `null` si está bien.
 * @param {Readonly<BotTextField>} field
 * @param {string} value ya limpio
 */
export function botTextError(field, value) {
	const size = field.kind === 'button' ? byteLength(value) : value.length;
	if (size > field.max) {
		return field.kind === 'button'
			? `Hasta ${field.max} bytes: tiene ${size} (los emojis y las letras con tilde ocupan más de uno).`
			: `Hasta ${field.max} caracteres: tiene ${size}.`;
	}
	if (HTML_TAG_RE.test(value)) {
		return isFormattedKind(field.kind)
			? 'No se puede usar HTML: escribí texto común (para negrita, **así**; para un link, [texto](https://…)).'
			: 'Acá va texto solo, sin HTML: Telegram lo muestra tal cual.';
	}
	if (!isFormattedKind(field.kind)) {
		if (value.includes('**') || /\[[^\]\n]+\]\([^)]*\)/.test(value))
			return 'Acá va texto solo, sin negrita ni links: Telegram lo muestra tal cual.';
	} else {
		if ((value.match(/\*\*/g) ?? []).length % 2 !== 0)
			return 'Hay un ** sin cerrar: la negrita va entre dos pares, **así**.';
		for (const m of value.matchAll(LINK_RE)) {
			const url = m[2].trim();
			if (!/^\{[a-z_]+\}$/.test(url) && !SAFE_URL_RE.test(url))
				return 'Los links van así: [texto](https://…), con una dirección que empiece con https://.';
		}
	}
	const allowed = new Set(field.vars.map((v) => v.name));
	const unknown = [...new Set(variablesIn(value).filter((n) => !allowed.has(n)))];
	if (unknown.length) {
		const list = unknown.map((n) => `{${n}}`).join(', ');
		const can = field.vars.length
			? ` Podés usar: ${field.vars.map((v) => `{${v.name}}`).join(', ')}.`
			: ' Este texto no lleva variables.';
		return `${unknown.length === 1 ? 'Esta variable no existe' : 'Estas variables no existen'} en este texto: ${list}.${can}`;
	}
	if (/[{}]/.test(value.replace(VAR_RE, '')))
		return 'Hay llaves { } sueltas: las variables van así, {nombre}, y solo las de la lista.';
	for (const name of field.required ?? []) {
		if (!value.includes(`{${name}}`)) return `Tiene que llevar {${name}}: ahí va lo que cambia.`;
	}
	return null;
}

/**
 * Valida el formulario del panel (una entrada por clave; vacío o igual al original = el
 * original). `value` trae solo los cambiados: es lo que se guarda.
 * @param {Record<string, unknown>} form
 * @returns {{ ok: true, value: BotTexts } | { ok: false, errors: Record<string, string>, values: BotTexts }}
 */
export function validateBotTexts(form) {
	/** @type {Record<string, string>} */
	const errors = {};
	/** @type {BotTexts} */
	const value = {};
	/** @type {BotTexts} */
	const values = {};
	for (const field of BOT_TEXT_FIELDS) {
		const raw = form[field.key];
		if (typeof raw !== 'string') continue;
		const v = cleanBotText(field, raw);
		values[field.key] = v;
		if (!v || v === field.value) continue;
		const error = botTextError(field, v);
		if (error) errors[field.key] = error;
		else value[field.key] = v;
	}
	return Object.keys(errors).length ? { ok: false, errors, values } : { ok: true, value };
}

/**
 * Los textos cambiados que valen (solo claves conocidas, no vacíos, distintos del original y sin
 * errores): un dato viejo o roto nunca rompe el bot, sale el original.
 * @param {unknown} overrides
 * @returns {BotTexts}
 */
export function cleanBotTextOverrides(overrides) {
	/** @type {BotTexts} */
	const out = {};
	if (!overrides || typeof overrides !== 'object') return out;
	for (const [key, raw] of Object.entries(overrides)) {
		const field = FIELD_BY_KEY.get(key);
		if (!field || typeof raw !== 'string') continue;
		const v = cleanBotText(field, raw);
		if (!v || v === field.value || botTextError(field, v) !== null) continue;
		out[key] = v;
	}
	return out;
}

// ---------------------------------------------------------------------------------------------
// Armar
// ---------------------------------------------------------------------------------------------

/**
 * Escapa para el HTML de Telegram (igual que `escapeHtml` de telegram/format.js).
 * @param {string} text
 */
export function escapeTelegramHtml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const MARK_OPEN = '';
const MARK_CLOSE = '';
const MARK_RE = /(\d+)/g;

/**
 * Un texto con formato → HTML de Telegram: el texto escapado, `**…**` → `<b>…</b>`,
 * `[texto](https://…)` → `<a href="…">…</a>` y las variables (escapadas, salvo las `html`).
 * @param {string} template
 * @param {Readonly<BotTextField>} field
 * @param {Record<string, string | number>} vars
 */
function formatted(template, field, vars) {
	/** @type {{ value: string, html: boolean }[]} */
	const slots = [];
	const marked = template.replace(VAR_RE, (whole, name) => {
		const def = field.vars.find((v) => v.name === name);
		if (!def) return whole;
		slots.push({ value: String(vars[name] ?? ''), html: Boolean(def.html) });
		return `${MARK_OPEN}${slots.length - 1}${MARK_CLOSE}`;
	});
	/** @param {string} s */
	const raw = (s) => s.replace(MARK_RE, (_, i) => slots[Number(i)].value);
	return escapeTelegramHtml(marked)
		.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>')
		.replace(LINK_RE, (whole, text, url) => {
			// La dirección: el texto escrito (ya escapado) o una variable.
			const href = raw(url.replace(/&amp;/g, '&'));
			return SAFE_URL_RE.test(href) ? `<a href="${escapeTelegramHtml(href)}">${text}</a>` : whole;
		})
		.replace(MARK_RE, (_, i) => {
			const slot = slots[Number(i)];
			return slot.html ? slot.value : escapeTelegramHtml(slot.value);
		});
}

/**
 * El texto de una clave, con lo cambiado en el panel (si vale) o el original, y las variables.
 * Los textos con formato salen en HTML de Telegram; los demás, texto solo (quien lo pone en un
 * mensaje lo escapa).
 *
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @param {Record<string, string> | null} [overrides] los cambiados (ya limpios con
 *   {@link cleanBotTextOverrides})
 * @returns {string}
 */
export function renderBotText(key, vars = {}, overrides = null) {
	const field = FIELD_BY_KEY.get(key);
	if (!field) throw new Error(`[bot] texto desconocido: ${key}`);
	const own = overrides?.[key];
	const template = typeof own === 'string' && own ? own : field.value;
	if (isFormattedKind(field.kind)) return formatted(template, field, vars);
	return template.replace(VAR_RE, (whole, name) =>
		field.vars.some((v) => v.name === name) ? String(vars[name] ?? '') : whole
	);
}

/**
 * Lo que ve quien lee un texto, como texto solo, armado desde lo escrito (nunca desde HTML):
 * `**x**` → `x`, `[texto](https://…)` → `texto` y las variables tal cual. No arma ni lee HTML:
 * sirve para comparar con lo que devuelve Telegram (la respuesta a «Buscar»), nunca para ponerlo
 * en un mensaje con formato.
 *
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @param {Record<string, string> | null} [overrides]
 * @returns {string}
 */
export function renderBotTextPlain(key, vars = {}, overrides = null) {
	const field = FIELD_BY_KEY.get(key);
	if (!field) throw new Error(`[bot] texto desconocido: ${key}`);
	if (!isFormattedKind(field.kind)) return renderBotText(key, vars, overrides);
	const own = overrides?.[key];
	const template = typeof own === 'string' && own ? own : field.value;
	/** @type {string[]} */
	const slots = [];
	const marked = template.replace(VAR_RE, (whole, name) => {
		if (!field.vars.some((v) => v.name === name)) return whole;
		slots.push(String(vars[name] ?? ''));
		return `${MARK_OPEN}${slots.length - 1}${MARK_CLOSE}`;
	});
	return marked
		.replace(/\*\*([\s\S]+?)\*\*/g, '$1')
		.replace(LINK_RE, (whole, text, url) => {
			const href = url.replace(
				MARK_RE,
				(/** @type {string} */ _, /** @type {string} */ i) => slots[Number(i)]
			);
			return SAFE_URL_RE.test(href) ? text : whole;
		})
		.replace(MARK_RE, (_, i) => slots[Number(i)]);
}
