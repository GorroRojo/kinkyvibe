/**
 * La vista previa de «Textos del bot» (Ajustes › Comunicación › Textos del bot): arma, con lo que
 * está escrito en el formulario y datos de ejemplo, cómo se vería cada pantalla del bot (el texto
 * en HTML de Telegram y los botones). Es una aproximación: las pantallas de verdad las arma
 * src/lib/server/telegram/screens.js con los mismos textos.
 */
import { botTextField, escapeTelegramHtml, renderBotText } from '$lib/utils/botTexts.js';

/**
 * @typedef {{ text: string, disabled?: boolean, link?: boolean, primary?: boolean,
 *   success?: boolean }} PreviewButton
 * @typedef {{ html?: string, buttons?: PreviewButton[][], toast?: string, qr?: boolean,
 *   rich?: boolean, commands?: { command: string, description: string }[] }} PreviewScreen
 *   `qr`: la foto de un QR de ejemplo arriba del texto (la tarjeta de una entrada). `rich`: un
 *   mensaje enriquecido (títulos, párrafos y pie, en bloques).
 * @typedef {{ id: string, label: string, keys: string[],
 *   build: (t: (key: string, vars?: Record<string, string | number>) => string) => PreviewScreen }} PreviewDef
 */

const SAMPLE_EVENTS = [
	{ when: 'vie 10 ene · 21:00', title: 'Taller de ejemplo' },
	{ when: 'sáb 11 ene · 23:00', title: 'Fiesta de ejemplo' }
];

const SAMPLE_BODY =
	'Un texto de ejemplo que explica la práctica con calma: de qué se trata, cómo se habla antes, ' +
	'qué cuidados tener y dónde seguir aprendiendo con otres.';

const SAMPLE_DOCS = [
	{ title: '📚 Guía de ejemplo', line: 'Cómo empezar, paso a paso' },
	{ title: '📚 Otra guía de ejemplo', line: 'Material' }
];

/** @param {{ title: string, line: string }} d */
const docLine = (d) =>
	`<a href="https://kinkyvibe.ar">${escapeTelegramHtml(d.title)}</a>\n${escapeTelegramHtml(d.line)}`;

/** @param {{ when: string, title: string }} e */
const eventLine = (e) =>
	`${escapeTelegramHtml(e.when)}\n<a href="https://kinkyvibe.ar">${escapeTelegramHtml(e.title)}</a>`;

/**
 * Las pantallas, en el orden del selector. `keys`: los textos que muestra (al tocar uno de esos
 * campos, la vista previa salta a esa pantalla).
 * @type {readonly PreviewDef[]}
 */
export const PREVIEW_SCREENS = Object.freeze([
	{
		id: 'inicio',
		label: 'Inicio (como lo ve une admin vinculade)',
		keys: [
			'inicio.texto',
			'inicio.boton_hoy',
			'inicio.boton_semana',
			'inicio.boton_finde',
			'inicio.boton_buscar',
			'inicio.boton_sigo',
			'entradas.boton_inicio',
			'inicio.boton_fondo',
			'inicio.boton_ayuda',
			'inicio.boton_calendario',
			'inicio.boton_sitio',
			'puerta.boton_inicio',
			'admin.boton_estado',
			'admin.boton_avisos',
			'secciones.boton_material',
			'secciones.boton_kinkipedia',
			'secciones.boton_amigues',
			'secciones.boton_series'
		],
		build: (t) => ({
			html: t('inicio.texto'),
			buttons: [
				[
					{ text: t('inicio.boton_hoy'), primary: true },
					{ text: t('inicio.boton_semana'), primary: true },
					{ text: t('inicio.boton_finde'), primary: true }
				],
				[{ text: t('inicio.boton_buscar') }, { text: t('inicio.boton_sigo') }],
				[{ text: t('entradas.boton_inicio') }],
				[{ text: t('secciones.boton_material') }, { text: t('secciones.boton_kinkipedia') }],
				[{ text: t('secciones.boton_amigues') }, { text: t('secciones.boton_series') }],
				[{ text: t('inicio.boton_fondo') }, { text: t('inicio.boton_ayuda') }],
				[{ text: t('admin.boton_estado') }, { text: t('admin.boton_avisos') }],
				[{ text: t('puerta.boton_inicio') }],
				[
					{ text: t('inicio.boton_calendario') },
					{ text: t('inicio.boton_sitio', { sitio: 'kinkyvibe.ar' }), link: true }
				]
			]
		})
	},
	{
		id: 'ayuda',
		label: 'Ayuda (con los comandos de la cuenta)',
		keys: ['inicio.ayuda', 'inicio.ayuda_cuenta', 'inicio.boton_inicio'],
		build: (t) => ({
			html: t('inicio.ayuda', {
				cuenta: `\n${t('inicio.ayuda_cuenta')}\n`,
				sitio: 'https://kinkyvibe.ar'
			}),
			buttons: [[{ text: t('inicio.boton_inicio') }]]
		})
	},
	{
		id: 'comandos',
		label: 'El menú «/»',
		keys: [],
		build: (t) => ({
			commands: [
				'inicio',
				'proximos',
				'hoy',
				'semana',
				'finde',
				'evento',
				'buscar',
				'fondo',
				'ayuda',
				'vincular',
				'sigo',
				'entradas',
				'silenciar',
				'reanudar',
				'desvincular'
			].map((command) => ({ command, description: t(`comandos.${command}`) }))
		})
	},
	{
		id: 'lista',
		label: 'Lista de la semana',
		keys: ['eventos.titulo_semana', 'eventos.boton_ver'],
		build: (t) => ({
			html: `<b>${escapeTelegramHtml(t('eventos.titulo_semana'))}</b>\n\n${SAMPLE_EVENTS.map(eventLine).join('\n\n')}`,
			buttons: [
				...SAMPLE_EVENTS.map((e) => [{ text: t('eventos.boton_ver', { evento: e.title }) }]),
				[{ text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'tarjeta',
		label: 'Tarjeta de un evento',
		keys: [
			'eventos.ver_todo',
			'eventos.boton_comprar',
			'eventos.boton_calendario',
			'eventos.boton_mapa',
			'seguir.boton',
			'inicio.boton_volver'
		],
		build: (t) => ({
			html:
				`<b>Taller de ejemplo</b>\n📅 vie 10 ene · 21:00\n📍 Lugar de ejemplo\n\n` +
				`<a href="https://kinkyvibe.ar">${escapeTelegramHtml(t('eventos.ver_todo'))}</a>`,
			buttons: [
				[{ text: t('eventos.boton_comprar'), success: true, link: true }],
				[
					{ text: t('eventos.boton_calendario'), link: true },
					{ text: t('eventos.boton_mapa'), link: true }
				],
				[{ text: t('seguir.boton') }],
				[{ text: '‹' }, { text: '1/2', disabled: true }, { text: '›' }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'buscar',
		label: 'Buscar',
		keys: ['eventos.buscar', 'eventos.boton_cancelar'],
		build: (t) => ({
			html: t('eventos.buscar'),
			buttons: [[{ text: t('eventos.boton_cancelar') }]]
		})
	},
	{
		id: 'resultados',
		label: 'Resultados de una búsqueda',
		keys: ['eventos.resultados', 'eventos.boton_buscar_otra'],
		build: (t) => ({
			html: `${t('eventos.resultados', { busqueda: 'taller' })}\n\n${SAMPLE_EVENTS.map(eventLine).join('\n\n')}`,
			buttons: [
				...SAMPLE_EVENTS.map((e) => [{ text: t('eventos.boton_ver', { evento: e.title }) }]),
				[{ text: t('eventos.boton_buscar_otra') }],
				[{ text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'sitio_buscar',
		label: 'Buscar en todo el sitio',
		keys: ['sitio.buscar'],
		build: (t) => ({
			html: t('sitio.buscar'),
			buttons: [[{ text: t('eventos.boton_cancelar') }]]
		})
	},
	{
		id: 'sitio_resultados',
		label: 'Resultados de buscar en todo el sitio',
		keys: ['sitio.encontre', 'sitio.encontre_uno'],
		build: (t) => ({
			html: `${t('sitio.encontre', { busqueda: 'cuerdas', cantidad: 2 })}\n\n${SAMPLE_DOCS.map(docLine).join('\n\n')}`,
			buttons: [
				...SAMPLE_DOCS.map((d) => [{ text: d.title }]),
				[{ text: t('eventos.boton_buscar_otra') }],
				[{ text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'sitio_sin_resultados',
		label: 'Buscar en todo el sitio: sin resultados (con una etiqueta para seguir)',
		keys: [
			'sitio.sin_resultados',
			'sitio.sugerencias',
			'sitio.boton_sugerencia',
			'sitio.seguir_etiqueta',
			'sitio.boton_seguir',
			'sitio.proximos'
		],
		build: (t) => ({
			html: [
				t('sitio.sin_resultados', { busqueda: 'shibari' }),
				t('sitio.sugerencias'),
				t('sitio.seguir_etiqueta', { nombre: '🪢 Shibari' }),
				`${t('sitio.proximos')}\n${SAMPLE_EVENTS.map(eventLine).join('\n')}`
			].join('\n\n'),
			buttons: [
				[{ text: t('sitio.boton_sugerencia', { busqueda: 'suspensión', cantidad: 3 }) }],
				[{ text: t('sitio.boton_sugerencia', { busqueda: 'cuerdas', cantidad: 12 }) }],
				[{ text: t('sitio.boton_seguir', { nombre: '🪢 Shibari' }) }],
				[{ text: t('secciones.boton_material') }],
				[{ text: t('eventos.boton_buscar_otra') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'sitio_tarjeta',
		label: 'Tarjeta compacta (material, Kinkipedia, amigues, series)',
		keys: ['sitio.boton_ver', 'sitio.tipo_material', 'sitio.tipo_wiki', 'sitio.tipo_serie'],
		build: (t) => ({
			html: `<b>📚 Guía de ejemplo</b>\n${escapeTelegramHtml(t('sitio.tipo_material'))}`,
			buttons: [
				[{ text: t('sitio.boton_ver'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'rico_wiki',
		label: 'Mensaje enriquecido: una entrada de la Kinkipedia (tarjeta del bot y modo inline)',
		keys: ['compartir.sigue', 'compartir.pie'],
		build: (t) => ({
			html: [
				`<h3>${escapeTelegramHtml('📖 Entrada de ejemplo')}</h3>`,
				`<p><i>${escapeTelegramHtml('Una definición corta de ejemplo.')}</i></p>`,
				`<p>${escapeTelegramHtml(SAMPLE_BODY)}</p>`,
				`<p><i>${t('compartir.sigue')}</i></p>`,
				`<footer>${escapeTelegramHtml(t('compartir.pie', { tipo: t('sitio.tipo_wiki') }))}</footer>`
			].join(''),
			rich: true,
			buttons: [
				[{ text: t('sitio.boton_ver'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'rico_evento',
		label: 'Mensaje enriquecido: un evento mandado (modo inline o desde la Mini App)',
		keys: ['compartir.tipo_evento', 'compartir.boton_calendario'],
		build: (t) => ({
			html: [
				`<h3>${escapeTelegramHtml(SAMPLE_EVENTS[0].title)}</h3>`,
				`<p>📅 ${escapeTelegramHtml(SAMPLE_EVENTS[0].when)}</p>`,
				`<p>📍 ${escapeTelegramHtml('Barrio de ejemplo')}</p>`,
				`<p><i>${escapeTelegramHtml('Un resumen de ejemplo del evento.')}</i></p>`,
				`<footer>${escapeTelegramHtml(t('compartir.pie', { tipo: t('compartir.tipo_evento') }))}</footer>`
			].join(''),
			rich: true,
			buttons: [
				[
					{ text: t('sitio.boton_ver'), link: true },
					{ text: t('sitio.boton_entradas'), link: true }
				],
				[{ text: t('compartir.boton_calendario'), link: true }]
			]
		})
	},
	{
		id: 'miniapp_compartir',
		label: 'Mini App del calendario: mandar un evento a un chat (la página, aproximada)',
		keys: ['compartir.miniapp_boton', 'compartir.miniapp_mandado', 'compartir.miniapp_destacado'],
		build: (t) => ({
			html: [
				`<b>${escapeTelegramHtml(t('compartir.miniapp_destacado'))}</b>`,
				escapeTelegramHtml(`21:00 · Barrio de ejemplo`),
				`<b>${escapeTelegramHtml(SAMPLE_EVENTS[0].title)}</b>`,
				'',
				escapeTelegramHtml(t('compartir.miniapp_mandado'))
			].join('\n'),
			buttons: [[{ text: t('compartir.miniapp_boton') }]]
		})
	},
	{
		id: 'miniapp_compartir_error',
		label: 'Mini App del calendario: si no se pudo mandar',
		keys: ['compartir.miniapp_error'],
		build: (t) => ({
			html: [
				escapeTelegramHtml(`21:00 · Barrio de ejemplo`),
				`<b>${escapeTelegramHtml(SAMPLE_EVENTS[0].title)}</b>`,
				'',
				escapeTelegramHtml(t('compartir.miniapp_error'))
			].join('\n'),
			buttons: [[{ text: t('compartir.miniapp_boton') }]]
		})
	},
	{
		id: 'seccion',
		label: 'Una sección (Material, filtrada por una etiqueta)',
		keys: [
			'secciones.titulo_material',
			'secciones.titulo_kinkipedia',
			'secciones.titulo_amigues',
			'secciones.titulo_series',
			'secciones.con_etiqueta',
			'secciones.boton_filtrar',
			'secciones.boton_sin_filtro'
		],
		build: (t) => ({
			html: `${t('secciones.titulo_material')} · ${t('secciones.con_etiqueta')} · 1/3\n\n${SAMPLE_DOCS.map(docLine).join('\n\n')}`,
			buttons: [
				...SAMPLE_DOCS.map((d) => [{ text: d.title }]),
				[{ text: '1/3', disabled: true }, { text: '›' }],
				[{ text: t('secciones.boton_filtrar') }, { text: t('secciones.boton_sin_filtro') }],
				[{ text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'etiquetas',
		label: 'Una sección: elegir una etiqueta',
		keys: ['secciones.elegir_etiqueta', 'secciones.boton_etiqueta'],
		build: (t) => ({
			html: `${t('secciones.titulo_material')}\n\n${t('secciones.elegir_etiqueta')}`,
			buttons: [
				[
					{ text: t('secciones.boton_etiqueta', { etiqueta: 'Cuerdas', cantidad: 12 }) },
					{ text: t('secciones.boton_etiqueta', { etiqueta: 'Cuidados', cantidad: 5 }) }
				],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'kinkipedia_rama',
		label: 'Kinkipedia: una rama del árbol',
		keys: ['secciones.rama', 'secciones.boton_rama', 'secciones.rama_cantidad'],
		build: (t) => ({
			html: [
				`${t('secciones.titulo_kinkipedia')} · ${t('secciones.rama', { rama: 'Prácticas' })}`,
				'',
				`📖 <a href="https://kinkyvibe.ar">${escapeTelegramHtml('Prácticas')}</a>\n${escapeTelegramHtml('Lo que se hace en una escena')}`,
				'',
				`📂 <b>${escapeTelegramHtml('Cuerdas')}</b>\n${t('secciones.rama_cantidad', { cantidad: 4 })}`
			].join('\n'),
			buttons: [
				[{ text: '📖 Prácticas' }],
				[{ text: t('secciones.boton_rama', { rama: 'Cuerdas' }) }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'miniapp',
		label: 'Mini App del calendario (la página, aproximada)',
		keys: [
			'miniapp.titulo',
			'miniapp.bajada',
			'miniapp.boton_inicio',
			'miniapp.cancelado',
			'miniapp.boton_comprar',
			'miniapp.ver_todo'
		],
		build: (t) => ({
			html: [
				`<b>${escapeTelegramHtml(t('miniapp.titulo'))}</b>`,
				escapeTelegramHtml(t('miniapp.bajada')),
				'',
				'<b>JUEVES 9 DE ENERO</b>',
				escapeTelegramHtml(`21:00 · ${SAMPLE_EVENTS[0].title}`),
				escapeTelegramHtml(`23:00 · ${SAMPLE_EVENTS[1].title} · ${t('miniapp.cancelado')}`),
				'',
				`<a href="https://kinkyvibe.ar">${escapeTelegramHtml(t('miniapp.ver_todo'))}</a>`
			].join('\n'),
			buttons: [
				[{ text: t('miniapp.boton_inicio'), primary: true }],
				[{ text: `🎟 ${t('miniapp.boton_comprar')} ↗`, link: true }]
			]
		})
	},
	{
		id: 'miniapp_vacia',
		label: 'Mini App del calendario: sin eventos, y recién agregada a la pantalla de inicio',
		keys: ['miniapp.vacio', 'miniapp.agregada'],
		build: (t) => ({
			html: [
				`<b>${escapeTelegramHtml(t('miniapp.titulo'))}</b>`,
				escapeTelegramHtml(t('miniapp.bajada')),
				escapeTelegramHtml(t('miniapp.agregada')),
				'',
				escapeTelegramHtml(t('miniapp.vacio'))
			].join('\n')
		})
	},
	{
		id: 'fondo',
		label: 'Fondo',
		keys: [
			'inicio.fondo_titulo',
			'inicio.fondo_juntado',
			'inicio.fondo_descuento',
			'inicio.fondo_actualizado',
			'inicio.fondo_pie',
			'inicio.fondo_boton'
		],
		build: (t) => ({
			html: [
				t('inicio.fondo_titulo'),
				'',
				t('inicio.fondo_juntado', { juntado: '$ 150.000', meta: '$ 300.000', porcentaje: 50 }),
				t('inicio.fondo_descuento', { descuento: 10 }),
				'',
				t('inicio.fondo_actualizado', { fecha: 'mié 8 ene · 12:00' }),
				'',
				t('inicio.fondo_pie')
			].join('\n'),
			buttons: [
				[{ text: t('inicio.fondo_boton'), link: true }],
				[{ text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'seguir',
		label: 'Seguir',
		keys: ['seguir.opciones', 'seguir.boton_etiqueta', 'seguir.boton_ya', 'seguir.boton_rincon'],
		build: (t) => ({
			html: t('seguir.opciones', { evento: 'Taller de ejemplo' }),
			buttons: [
				[{ text: t('seguir.boton_etiqueta', { nombre: 'Serie de ejemplo' }) }],
				[{ text: t('seguir.boton_ya', { nombre: '🪢 Cuerdas' }), disabled: true }],
				[{ text: t('seguir.boton_rincon'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'seguido',
		label: 'Aviso al seguir algo',
		keys: ['seguir.listo', 'seguir.listo_telegram'],
		build: (t) => ({
			toast: `${t('seguir.listo', { nombre: '🪢 Cuerdas' })}\n${t('seguir.listo_telegram')}`
		})
	},
	{
		id: 'sigo',
		label: 'Lo que sigo',
		keys: ['seguir.lo_que_sigo', 'seguir.mas'],
		build: (t) => ({
			html: t('seguir.lo_que_sigo', {
				lista: `• Serie de ejemplo\n• 🪢 Cuerdas\n${t('seguir.mas', { cantidad: 3 })}`
			}),
			buttons: [
				[{ text: t('seguir.boton_rincon'), link: true }],
				[{ text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'entradas',
		label: 'Mis entradas',
		keys: [
			'entradas.titulo',
			'entradas.una',
			'entradas.varias',
			'entradas.boton_entrada',
			'entradas.boton_pasadas'
		],
		build: (t) => ({
			html: [
				t('entradas.titulo'),
				'',
				`${escapeTelegramHtml(SAMPLE_EVENTS[0].when)}\n<b>${escapeTelegramHtml(SAMPLE_EVENTS[0].title)}</b> · ${t('entradas.varias', { cantidad: 2 })}`,
				'',
				`${escapeTelegramHtml(SAMPLE_EVENTS[1].when)}\n<b>${escapeTelegramHtml(SAMPLE_EVENTS[1].title)}</b> · ${t('entradas.una')}`
			].join('\n'),
			buttons: [
				[{ text: t('entradas.boton_entrada', { evento: SAMPLE_EVENTS[0].title }) }],
				[
					{
						text: t('entradas.boton_entrada', {
							titular: 'Otra persona',
							evento: SAMPLE_EVENTS[0].title
						})
					}
				],
				[{ text: t('entradas.boton_entrada', { evento: SAMPLE_EVENTS[1].title }) }],
				[{ text: t('entradas.boton_pasadas') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'entrada',
		label: 'Mis entradas: una entrada (con el QR)',
		keys: [
			'entradas.titular',
			'entradas.tipo_codigo',
			'entradas.tipo',
			'entradas.valida',
			'entradas.boton_ver'
		],
		build: (t) => ({
			qr: true,
			html: [
				`🎟 <b>${escapeTelegramHtml(SAMPLE_EVENTS[0].title)}</b>`,
				`📅 ${escapeTelegramHtml(SAMPLE_EVENTS[0].when)}`,
				t('entradas.titular'),
				t('entradas.tipo_codigo'),
				'',
				t('entradas.valida')
			].join('\n'),
			buttons: [
				[{ text: t('entradas.boton_ver'), link: true }],
				[{ text: '1/3', disabled: true }, { text: '›' }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'entrada_usada',
		label: 'Mis entradas: una entrada ya usada',
		keys: ['entradas.usada'],
		build: (t) => ({
			qr: true,
			html: [
				`🎟 <b>${escapeTelegramHtml(SAMPLE_EVENTS[0].title)}</b>`,
				`📅 ${escapeTelegramHtml(SAMPLE_EVENTS[0].when)}`,
				t('entradas.titular'),
				t('entradas.tipo_codigo'),
				'',
				t('entradas.usada')
			].join('\n'),
			buttons: [
				[{ text: t('entradas.boton_ver'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'entrada_sin_foto',
		label: 'Mis entradas: una entrada sin la foto del QR',
		keys: ['entradas.ver_qr'],
		build: (t) => ({
			html: [
				`🎟 <b>${escapeTelegramHtml(SAMPLE_EVENTS[0].title)}</b>`,
				`📅 ${escapeTelegramHtml(SAMPLE_EVENTS[0].when)}`,
				t('entradas.titular'),
				t('entradas.tipo_codigo'),
				'',
				t('entradas.valida'),
				t('entradas.ver_qr')
			].join('\n'),
			buttons: [
				[{ text: t('entradas.boton_ver'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'entrada_online',
		label: 'Mis entradas: una entrada de un evento online',
		keys: ['entradas.online'],
		build: (t) => ({
			html: [
				`🎟 <b>${escapeTelegramHtml('Charla online de ejemplo')}</b>`,
				`📅 ${escapeTelegramHtml(SAMPLE_EVENTS[1].when)}`,
				t('entradas.titular'),
				t('entradas.tipo', { tipo: 'A la gorra' }),
				'',
				t('entradas.online')
			].join('\n'),
			buttons: [
				[{ text: t('entradas.boton_ver'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'entradas_vacio',
		label: 'Mis entradas: sin entradas',
		keys: ['entradas.vacio'],
		build: (t) => ({
			html: t('entradas.vacio'),
			buttons: [[{ text: t('entradas.boton_pasadas') }, { text: t('inicio.boton_inicio') }]]
		})
	},
	{
		id: 'entradas_pasadas',
		label: 'Mis entradas: las pasadas',
		keys: ['entradas.titulo_pasadas', 'entradas.vacio_pasadas', 'entradas.boton_proximas'],
		build: (t) => ({
			html: [
				t('entradas.titulo_pasadas'),
				'',
				`${escapeTelegramHtml('dom 1 dic · 23:00')}\n<b>${escapeTelegramHtml('Fiesta pasada de ejemplo')}</b> · ${t('entradas.una')}`
			].join('\n'),
			buttons: [
				[{ text: t('entradas.boton_entrada', { evento: 'Fiesta pasada de ejemplo' }) }],
				[{ text: t('entradas.boton_proximas') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'entradas_sin_vincular',
		label: 'Mis entradas sin el chat conectado',
		keys: ['entradas.sin_vincular'],
		build: (t) => ({
			html: t('entradas.sin_vincular'),
			buttons: [
				[{ text: t('seguir.boton_rincon'), link: true }],
				[{ text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'aviso',
		label: 'Aviso por Telegram (algo nuevo)',
		keys: ['seguir.aviso_nuevo'],
		build: (t) => ({
			html: `${t('seguir.aviso_nuevo')}\n\n<b>Taller de ejemplo</b>\nvie 10 ene · 21:00\nhttps://kinkyvibe.ar/calendario/taller-de-ejemplo`
		})
	},
	{
		id: 'vinculado',
		label: 'Cuenta conectada',
		keys: ['vincular.listo'],
		build: (t) => ({ html: t('vincular.listo', { link: 'https://kinkyvibe.ar/mi-rincon/sigo' }) })
	},
	{
		id: 'puerta',
		label: 'Puerta: admin vinculade',
		keys: ['puerta.listo', 'puerta.boton'],
		build: (t) => ({
			html: t('puerta.listo', { login: 'admin-de-prueba' }),
			buttons: [
				[{ text: t('puerta.boton') }],
				[{ text: t('admin.boton_estado') }, { text: t('admin.boton_avisos') }]
			]
		})
	},
	{
		id: 'admin_eventos',
		label: 'Estado (admins): elegir un evento',
		keys: ['admin.elegir', 'admin.boton_evento', 'admin.cancelado'],
		build: (t) => ({
			html: `${t('admin.elegir')}\n\n${SAMPLE_EVENTS.map(
				(e, i) =>
					`${escapeTelegramHtml(e.when)}\n<b>${escapeTelegramHtml(e.title)}</b>${i === 1 ? ` · ${escapeTelegramHtml(t('admin.cancelado'))}` : ''}`
			).join('\n\n')}`,
			buttons: [
				...SAMPLE_EVENTS.map((e) => [{ text: t('admin.boton_evento', { evento: e.title }) }]),
				[{ text: t('admin.boton_avisos') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'admin_sin_eventos',
		label: 'Estado (admins): sin próximos eventos con entradas',
		keys: ['admin.sin_eventos'],
		build: (t) => ({
			html: t('admin.sin_eventos'),
			buttons: [[{ text: t('admin.boton_avisos') }, { text: t('inicio.boton_inicio') }]]
		})
	},
	{
		id: 'admin_estado',
		label: 'Estado (admins): un evento',
		keys: [
			'admin.titulo',
			'admin.tipo',
			'admin.tipo_sin_cupo',
			'admin.tramo',
			'admin.tramo_sin_cantidad',
			'admin.tramo_vigente',
			'admin.total',
			'admin.reservas',
			'admin.transferencias',
			'admin.revisar',
			'admin.espera',
			'admin.pie',
			'admin.boton_actualizar',
			'admin.boton_panel'
		],
		build: (t) => ({
			html: [
				`${t('admin.titulo', { evento: 'Taller de ejemplo' })}\n📅 vie 10 ene · 21:00`,
				[
					t('admin.tipo', { tipo: 'General', vendidas: 12, cupo: 40 }),
					t('admin.tramo', { tramo: 'Preventa 1', vendidas: 10, cantidad: 10 }),
					`${t('admin.tramo_sin_cantidad', { tramo: 'Precio final', vendidas: 2 })} ${escapeTelegramHtml(t('admin.tramo_vigente'))}`,
					t('admin.tipo', { tipo: 'Con ayuda del Fondo', vendidas: 3, cupo: 20 }),
					t('admin.total', { vendidas: 15, cupo: 60 })
				].join('\n'),
				[
					t('admin.reservas', { cantidad: 4, por_vencer: 1 }),
					t('admin.transferencias', { cantidad: 2 }),
					t('admin.revisar', { cantidad: 1 }),
					t('admin.espera', { cantidad: 5 })
				].join('\n'),
				t('admin.pie')
			].join('\n\n'),
			buttons: [
				[{ text: t('admin.boton_actualizar') }, { text: t('admin.boton_panel'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'admin_estado_vacio',
		label: 'Estado (admins): un evento sin ventas ni pendientes',
		keys: ['admin.tipo_sin_cupo', 'admin.total_sin_cupo', 'admin.nada_pendiente'],
		build: (t) => ({
			html: [
				`${t('admin.titulo', { evento: 'Fiesta de ejemplo' })}\n📅 sáb 11 ene · 23:00`,
				[
					t('admin.tipo_sin_cupo', { tipo: 'A la gorra', vendidas: 0 }),
					t('admin.tipo', { tipo: 'General', vendidas: 0, cupo: 50 }),
					t('admin.total_sin_cupo', { vendidas: 0 })
				].join('\n'),
				t('admin.nada_pendiente'),
				t('admin.pie')
			].join('\n\n'),
			buttons: [
				[{ text: t('admin.boton_actualizar') }, { text: t('admin.boton_panel'), link: true }],
				[{ text: t('inicio.boton_volver') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'admin_avisos',
		label: 'Mis avisos (admins)',
		keys: [
			'admin.avisos',
			'admin.aviso_diario',
			'admin.aviso_venta',
			'admin.aviso_transferencia',
			'admin.aviso_dia',
			'admin.aviso_recordatorios'
		],
		build: (t) => ({
			html: t('admin.avisos'),
			buttons: [
				[{ text: `✅ ${t('admin.aviso_diario')}` }],
				[{ text: `⬜ ${t('admin.aviso_venta')}` }],
				[{ text: `⬜ ${t('admin.aviso_transferencia')}` }],
				[{ text: `⬜ ${t('admin.aviso_dia')}` }],
				[{ text: `⬜ ${t('admin.aviso_recordatorios')}` }],
				[{ text: t('admin.boton_estado') }, { text: t('inicio.boton_inicio') }]
			]
		})
	},
	{
		id: 'admin_aviso_tocado',
		label: 'Mis avisos (admins): aviso al prender o apagar uno',
		keys: ['admin.prendido', 'admin.apagado'],
		build: (t) => ({
			toast: `${t('admin.prendido', { aviso: t('admin.aviso_diario') })}\n${t('admin.apagado', { aviso: t('admin.aviso_venta') })}`
		})
	},
	{
		id: 'admin_aviso_venta',
		label: 'Avisos (admins): cada venta y cada transferencia',
		keys: ['admin.venta', 'admin.ventas', 'admin.transferencia'],
		build: (t) => ({
			html: [
				t('admin.venta', {
					entradas: '1 General (Preventa 1)',
					evento: 'Fiesta de ejemplo',
					vendidas: '23/50'
				}),
				t('admin.ventas', {
					entradas: '2 General (Preventa 1)',
					evento: 'Fiesta de ejemplo',
					vendidas: '25/50'
				}),
				t('admin.transferencia', {
					entradas: '2 General',
					evento: 'Fiesta de ejemplo',
					pendientes: 3
				})
			].join('\n\n'),
			buttons: [[{ text: t('admin.boton_panel'), link: true }]]
		})
	},
	{
		id: 'admin_resumen',
		label: 'Avisos (admins): el resumen diario de un evento',
		keys: [
			'admin.resumen_titulo',
			'admin.resumen_vendidas',
			'admin.resumen_transferencias',
			'admin.resumen_reservas'
		],
		build: (t) => ({
			html: [
				`${t('admin.resumen_titulo', { evento: 'Fiesta de ejemplo' })}\n📅 sáb 11 ene · 23:00`,
				[
					t('admin.resumen_vendidas', { hora: '9:00', cantidad: 5, vendidas: '23/50' }),
					t('admin.resumen_transferencias', { cantidad: 2 })
				].join('\n'),
				[
					t('admin.resumen_reservas', { cantidad: 4, por_vencer: 2 }),
					t('admin.transferencias', { cantidad: 2 }),
					t('admin.revisar', { cantidad: 1 }),
					t('admin.espera', { cantidad: 5 })
				].join('\n'),
				t('admin.pie')
			].join('\n\n'),
			buttons: [[{ text: t('admin.boton_panel'), link: true }]]
		})
	}
]);

/** Módulos de un QR de mentira (no se puede escanear): 25 × 25. */
export const SAMPLE_QR_SIZE = 25;

/**
 * Los módulos oscuros de un QR de ejemplo, para la vista previa de la tarjeta de una entrada: los
 * tres cuadrados de las esquinas y el resto al azar (siempre el mismo). Es un dibujo, no un QR.
 *
 * @returns {[number, number][]}
 */
export function sampleQrCells() {
	const n = SAMPLE_QR_SIZE;
	/** @param {number} x @param {number} y */
	const finder = (x, y) => {
		for (const [ox, oy] of [
			[0, 0],
			[n - 7, 0],
			[0, n - 7]
		]) {
			const dx = x - ox;
			const dy = y - oy;
			if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
				const ring = Math.min(dx, dy, 6 - dx, 6 - dy);
				return ring !== 1;
			}
			if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return false;
		}
		return null;
	};
	/** @type {[number, number][]} */
	const cells = [];
	let seed = 7;
	for (let y = 0; y < n; y++) {
		for (let x = 0; x < n; x++) {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			const f = finder(x, y);
			if (f === true || (f === null && seed % 100 < 45)) cells.push([x, y]);
		}
	}
	return cells;
}

/** La pantalla «solo este texto», para los que no están en ninguna de arriba. */
export const SINGLE_SCREEN = 'solo';

/**
 * La pantalla que muestra una clave (la primera que la tiene), o {@link SINGLE_SCREEN}.
 * @param {string} key
 */
export function screenForKey(key) {
	if (key.startsWith('comandos.')) return 'comandos';
	return PREVIEW_SCREENS.find((s) => s.keys.includes(key))?.id ?? SINGLE_SCREEN;
}

/**
 * Los textos de ejemplo de una clave (las muestras de sus variables).
 * @param {string} key
 */
function samples(key) {
	return Object.fromEntries((botTextField(key)?.vars ?? []).map((v) => [v.name, v.sample]));
}

/**
 * Arma una pantalla con lo escrito (`values`, por clave; vacío = el original).
 * @param {string} id una de {@link PREVIEW_SCREENS} o {@link SINGLE_SCREEN}
 * @param {Record<string, string>} values
 * @param {string} [focused] la clave de {@link SINGLE_SCREEN}
 * @returns {PreviewScreen}
 */
export function buildPreview(id, values, focused) {
	/** @param {string} key @param {Record<string, string | number>} [vars] */
	const t = (key, vars) => renderBotText(key, { ...samples(key), ...vars }, values);
	const def = PREVIEW_SCREENS.find((s) => s.id === id);
	if (def) return def.build(t);
	const field = focused ? botTextField(focused) : null;
	if (!field || !focused) return { html: t('inicio.texto') };
	if (field.kind === 'button') return { html: '…', buttons: [[{ text: t(focused) }]] };
	if (field.kind === 'toast') return { toast: t(focused) };
	if (field.kind === 'inline') return { html: `<b>${escapeTelegramHtml(t(focused))}</b>` };
	return { html: t(focused) };
}
