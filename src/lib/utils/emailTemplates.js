/**
 * Plantillas editables de los mails (big-list, ítem 4). Pura: la usan el servidor (al armar y
 * mandar cada mail) y el editor del panel (para documentar las variables y avisar de las que no
 * existen mientras se escribe).
 *
 * Qué se puede editar de cada mail: el **asunto**, el **título** y el **texto de arriba** (el
 * saludo y lo que quieran agregar). Lo demás (datos del evento, precios, entradas con su QR y
 * código, links, número de orden, política de devoluciones) lo sigue poniendo el código: una
 * plantilla nunca puede romper un QR ni un link.
 *
 * Formato seguro (no es HTML):
 * - `{{variable}}` se reemplaza por su valor, siempre escapado (un nombre con `<b>` se ve tal
 *   cual, no como HTML). Una variable que no es de esa plantilla no se puede guardar.
 * - Todo el resto del texto también se escapa. Lo único que se interpreta es `**negrita**`,
 *   una línea en blanco (párrafo nuevo) y un salto de línea.
 */
import { escapeHtml } from './escape.js';

/** @typedef {{ name: string, label: string, sample: string }} TemplateVar */
/**
 * @typedef {{ subject: string, heading: string, body: string }} TemplateText
 * @typedef {{ id: TemplateId, label: string, when: string, fixed: string, vars: TemplateVar[],
 *   defaults: TemplateText }} TemplateDef
 * @typedef {'tickets' | 'transfer' | 'stream' | 'reminder' | 'refund'} TemplateId
 */

/** Largo máximo de cada parte. */
export const TEMPLATE_LIMITS = Object.freeze({ subject: 200, heading: 200, body: 4000 });

/** @type {Record<string, TemplateVar>} */
const V = {
	nombre: { name: 'nombre', label: 'nombre de quien compró', sample: 'Persona de Ejemplo' },
	evento: { name: 'evento', label: 'título del evento', sample: 'Fiesta de ejemplo' },
	fecha: {
		name: 'fecha',
		label: 'fecha y hora del evento',
		sample: 'sábado, 10 de octubre de 2026, 22:00 hs'
	},
	lugar: {
		name: 'lugar',
		label: 'lugar (u "Online")',
		sample: 'Lugar de ejemplo · Calle Falsa 123'
	},
	tipo: { name: 'tipo', label: 'tipo de entrada', sample: 'General' },
	cantidad: { name: 'cantidad', label: 'cantidad de entradas (número)', sample: '2' },
	entradas: { name: 'entradas', label: '"una entrada" o "N entradas"', sample: '2 entradas' },
	total: { name: 'total', label: 'total pagado', sample: '$ 15.307' },
	referencia: {
		name: 'referencia',
		label: 'referencia de la compra (KV-…)',
		sample: 'KV-3F2B8C1E'
	},
	horas: { name: 'horas', label: 'horas de reserva', sample: '2' },
	vence: {
		name: 'vence',
		label: 'cuándo vence la reserva',
		sample: 'jueves, 1 de octubre de 2026, 11:00 hs'
	},
	link_estado: {
		name: 'link_estado',
		label: 'dirección de la página de la compra',
		sample: 'https://kinkyvibe.ar/entradas/…/estado'
	},
	cuando: {
		name: 'cuando',
		label: '"es hoy", "es en unas horas" o "se acerca"',
		sample: 'se acerca'
	}
};

/** @type {readonly TemplateDef[]} */
export const EMAIL_TEMPLATES = Object.freeze([
	{
		id: 'tickets',
		label: 'Entradas',
		when: 'Cuando se aprueba una compra (Mercado Pago, sin cargo o transferencia confirmada) y al reenviar las entradas.',
		fixed:
			'Evento con fecha y lugar, detalle del precio, instrucciones para la puerta (o el link de la transmisión), cada entrada con su QR, código y link, número de orden y política de devoluciones.',
		vars: [
			V.nombre,
			V.evento,
			V.fecha,
			V.lugar,
			V.tipo,
			V.cantidad,
			V.entradas,
			V.total,
			V.referencia
		],
		defaults: {
			subject: 'Tus entradas para {{evento}}',
			heading: '¡Ya tenés tus entradas!',
			body: 'Hola {{nombre}}, gracias por tu compra.'
		}
	},
	{
		id: 'transfer',
		label: 'Datos para transferir',
		when: 'Cuando alguien reserva pagando por transferencia.',
		fixed:
			'Botón para confirmar la reserva (si corresponde), evento, detalle del precio, datos para transferir, referencia para el concepto, cómo mandar el comprobante, link al estado de la compra y política de devoluciones.',
		vars: [
			V.nombre,
			V.evento,
			V.fecha,
			V.tipo,
			V.cantidad,
			V.total,
			V.referencia,
			V.horas,
			V.vence,
			V.link_estado
		],
		defaults: {
			subject: 'Datos para transferir · {{evento}} ({{referencia}})',
			heading: 'Reservamos tus entradas',
			body: 'Hola {{nombre}}, para confirmarlas transferí **{{total}}**. Te reservamos el lugar {{horas}} horas (hasta el **{{vence}}**) mientras mandás el comprobante por mail.'
		}
	},
	{
		id: 'stream',
		label: 'Link de la transmisión',
		when: 'Con "Enviar el link a todes" en un evento online.',
		fixed:
			'El link de la transmisión en un recuadro, links a cada entrada, número de orden y política de devoluciones.',
		vars: [V.nombre, V.evento, V.fecha],
		defaults: {
			subject: 'Link de la transmisión: {{evento}}',
			heading: 'Ya está el link de la transmisión',
			body: 'Hola {{nombre}}, este es el link para **{{evento}}** ({{fecha}}).'
		}
	},
	{
		id: 'reminder',
		label: 'Recordatorio',
		when: 'Antes de cada evento, según Ajustes → Mails → Recordatorios.',
		fixed:
			'Evento con fecha y lugar, qué llevar (o el link de la transmisión), la lista de entradas con su link y código, número de orden y política de devoluciones.',
		vars: [V.nombre, V.evento, V.fecha, V.lugar, V.cuando, V.tipo, V.cantidad, V.entradas],
		defaults: {
			subject: 'Recordatorio: {{evento}} {{cuando}}',
			heading: '¡{{evento}} {{cuando}}!',
			body: 'Hola {{nombre}}, te recordamos que tenés {{entradas}} ({{tipo}}).'
		}
	},
	{
		id: 'refund',
		label: 'Reembolso',
		when: 'Cuando se reembolsa una compra (desde el panel o desde Mercado Pago).',
		fixed:
			'Cómo se devuelve la plata (según el medio de pago), que las entradas ya no valen, número de orden y contacto.',
		vars: [V.nombre, V.evento, V.fecha, V.tipo, V.cantidad, V.total],
		defaults: {
			subject: 'Reembolso de tu compra · {{evento}}',
			heading: 'Reembolsamos tu compra',
			body: 'Hola {{nombre}}, hicimos el reembolso de {{total}} de tu compra de {{cantidad}} × {{tipo}} para **{{evento}}** ({{fecha}}).'
		}
	}
]);

/** @param {unknown} id @returns {TemplateDef | undefined} */
export function templateDef(id) {
	return EMAIL_TEMPLATES.find((t) => t.id === id);
}

const VAR_RE = /\{\{\s*([^{}\s]*)\s*\}\}/g;

/**
 * Nombres de variable usados en un texto (en orden, sin repetir).
 * @param {string} text
 */
export function findVariables(text) {
	return [...new Set([...String(text ?? '').matchAll(VAR_RE)].map((m) => m[1]))];
}

/**
 * Variables que no existen en esa plantilla.
 * @param {TemplateId} id
 * @param {Partial<TemplateText>} tpl
 */
export function unknownVariables(id, tpl) {
	const allowed = new Set(templateDef(id)?.vars.map((v) => v.name) ?? []);
	return findVariables([tpl.subject, tpl.heading, tpl.body].join('\n')).filter(
		(n) => !allowed.has(n)
	);
}

/**
 * Valida y limpia una plantilla del formulario.
 * @param {TemplateId} id
 * @param {Record<string, unknown>} form
 * @returns {{ ok: true, value: TemplateText } | { ok: false, errors: Partial<Record<keyof TemplateText, string>>, value: TemplateText }}
 */
export function validateTemplate(id, form) {
	const value = {
		subject: String(form.subject ?? '')
			.replace(/[\r\n\t]+/g, ' ')
			.trim(),
		heading: String(form.heading ?? '')
			.replace(/[\r\n\t]+/g, ' ')
			.trim(),
		body: String(form.body ?? '')
			.replace(/\r\n?/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	};
	/** @type {Partial<Record<keyof TemplateText, string>>} */
	const errors = {};
	if (!templateDef(id)) return { ok: false, errors: { subject: 'No existe ese mail.' }, value };
	for (const key of /** @type {const} */ (['subject', 'heading', 'body'])) {
		if (!value[key]) errors[key] = 'No puede quedar vacío.';
		else if (value[key].length > TEMPLATE_LIMITS[key])
			errors[key] = `Hasta ${TEMPLATE_LIMITS[key]} caracteres.`;
		else {
			const unknown = unknownVariables(id, { [key]: value[key] });
			if (unknown.length)
				errors[key] =
					`${unknown.length === 1 ? 'Esta variable no existe' : 'Estas variables no existen'} en este mail: ` +
					unknown.map((n) => `{{${n}}}`).join(', ') +
					'.';
			else if (/\{\{|\}\}/.test(value[key].replace(VAR_RE, '')))
				errors[key] = 'Hay llaves {{ }} sin cerrar.';
		}
	}
	return Object.keys(errors).length ? { ok: false, errors, value } : { ok: true, value };
}

/**
 * Reemplaza las variables (las que no existen quedan vacías).
 * @param {string} text
 * @param {Record<string, string | number>} vars
 * @param {(value: string) => string} [map] cómo se escribe cada valor
 */
function fill(text, vars, map = (v) => v) {
	return String(text ?? '').replace(VAR_RE, (_, name) =>
		Object.hasOwn(vars, name) ? map(String(vars[name])) : ''
	);
}

/**
 * Texto plano (asunto y versión de texto del mail): sin `**`.
 * @param {string} text
 * @param {Record<string, string | number>} vars
 */
export function renderPlain(text, vars) {
	return fill(String(text ?? '').replace(/\*\*/g, ''), vars);
}

/**
 * Una línea en HTML: todo escapado, `**negrita**` y saltos de línea como <br>.
 * Las variables se ponen al final (con marcadores), así su valor nunca se interpreta: ni HTML
 * ni `**`.
 * @param {string} text
 * @param {Record<string, string | number>} vars
 */
export function renderInlineHtml(text, vars) {
	/** @type {string[]} */
	const values = [];
	const marked = fill(text, vars, (v) => {
		values.push(v);
		return `\u0000${values.length - 1}\u0000`;
	});
	return (
		escapeHtml(marked)
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\n/g, '<br>')
			// eslint-disable-next-line no-control-regex -- los marcadores de las variables usan \u0000
			.replace(/\u0000(\d+)\u0000/g, (_, i) => escapeHtml(values[Number(i)]))
	);
}

/**
 * Párrafos en HTML (una línea en blanco = párrafo nuevo).
 * @param {string} text
 * @param {Record<string, string | number>} vars
 */
export function renderBlockHtml(text, vars) {
	return String(text ?? '')
		.replace(/\r\n?/g, '\n')
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter(Boolean)
		.map((p) => `<p>${renderInlineHtml(p, vars)}</p>`)
		.join('\n\t\t');
}

/**
 * Valores de ejemplo de una plantilla (para la vista previa).
 * @param {TemplateId} id
 */
export function sampleVars(id) {
	return Object.fromEntries((templateDef(id)?.vars ?? []).map((v) => [v.name, v.sample]));
}
