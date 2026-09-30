/**
 * Tipo núcleo `evento`. Los campos siguen los nombres de los .md de calendario de hoy
 * (src/lib/utils/eventDraft.js) para que la migración futura sea directa. El lugar NO es un campo:
 * es un edge `lugar` hacia un objeto de tipo `lugar`.
 *
 * Todavía no se usa: los eventos siguen siendo archivos .md.
 */

/**
 * @typedef {{
 *   summary?: string,
 *   status?: 'anunciado' | 'abierto' | 'agotadas' | 'cancelado',
 *   start: string,
 *   end?: string,
 *   link?: string,
 *   link_text?: string,
 *   body?: string
 * }} EventoData
 */

export const EVENT_STATUSES = /** @type {const} */ ([
	'anunciado',
	'abierto',
	'agotadas',
	'cancelado'
]);

/** @type {import('./index.js').CoreType} */
const evento = {
	type: 'evento',
	label: 'Evento',
	fields: {
		summary: { kind: 'text', label: 'Resumen', max: 500 },
		status: { kind: 'option', label: 'Estado', options: EVENT_STATUSES },
		start: { kind: 'datetime', label: 'Empieza', required: true },
		end: { kind: 'datetime', label: 'Termina' },
		link: { kind: 'url', label: 'Link de acción' },
		link_text: { kind: 'text', label: 'Texto del link', max: 80 },
		body: { kind: 'longtext', label: 'Descripción' }
	},
	edges: {
		lugar: { label: 'Lugar', to: ['lugar'], max: 1 }
	},
	check(data) {
		const start = Date.parse(String(data.start));
		const end = data.end ? Date.parse(String(data.end)) : NaN;
		if (!Number.isNaN(end) && end < start) {
			return [{ path: 'end', message: 'Termina: no puede ser antes de que empiece' }];
		}
		return [];
	},
	searchText(data) {
		return [data.summary, data.body].filter(Boolean).join('\n');
	}
};

export default evento;
