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
 *   commands?: { command: string, description: string }[] }} PreviewScreen
 *   `qr`: la foto de un QR de ejemplo arriba del texto (la tarjeta de una entrada).
 * @typedef {{ id: string, label: string, keys: string[],
 *   build: (t: (key: string, vars?: Record<string, string | number>) => string) => PreviewScreen }} PreviewDef
 */

const SAMPLE_EVENTS = [
	{ when: 'vie 10 ene · 21:00', title: 'Taller de ejemplo' },
	{ when: 'sáb 11 ene · 23:00', title: 'Fiesta de ejemplo' }
];

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
				[
					{ text: t('inicio.boton_calendario') },
					{ text: t('inicio.boton_sitio', { sitio: 'kinkyvibe.ar' }), link: true }
				],
				[{ text: t('puerta.boton_inicio') }]
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
			buttons: [[{ text: t('puerta.boton') }]]
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
