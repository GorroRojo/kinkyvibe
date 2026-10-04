/**
 * Plantillas editables de los mails (big-list, ítem 4). Pura: la usan el servidor (al armar y
 * mandar cada mail) y el editor del panel (para documentar las variables y avisar de las que no
 * existen mientras se escribe).
 *
 * Qué se puede editar de cada mail: el **asunto**, el **título** y el **texto de arriba** (el
 * saludo y lo que quieran agregar) y, si quieren, la **etiqueta** gris de arriba del título, el
 * **texto del botón**, la **línea de ayuda** de abajo del botón y el **por qué te llega** del pie
 * (`TEMPLATE_EXTRAS`: vacíos = el texto de siempre). Lo demás (datos del evento, precios, entradas con su QR y
 * código, links, número de orden, política de devoluciones) lo sigue poniendo el código: una
 * plantilla nunca puede romper un QR ni un link.
 *
 * Formato seguro (no es HTML):
 * - `{{variable}}` se reemplaza por su valor, siempre escapado (un nombre con `<b>` se ve tal
 *   cual, no como HTML). Una variable que no es de esa plantilla no se puede guardar.
 * - Todo el resto del texto también se escapa. Lo único que se interpreta es `**negrita**`,
 *   una línea en blanco (párrafo nuevo) y un salto de línea. La etiqueta y el botón son texto
 *   solo (sin negrita); la ayuda y el pie, una línea con negrita.
 * - Algo que parece una etiqueta HTML (`<a href…>`, `</p>`) no se puede guardar: igual se vería
 *   tal cual, pero así nadie cree que funciona.
 *
 * Por evento: cada campo se puede cambiar solo para los mails de un evento
 * (`event_email_templates`, migración 0034). Orden: lo del evento → la plantilla general → el
 * texto del código ({@link mergeTemplates}).
 */
import { escapeHtml } from './escape.js';

/** @typedef {{ name: string, label: string, sample: string }} TemplateVar */
/**
 * @typedef {'label' | 'button' | 'help' | 'why'} ExtraKey
 * @typedef {'subject' | 'heading' | 'body' | ExtraKey} TemplateKey
 * @typedef {{ subject: string, heading: string, body: string, label?: string, button?: string,
 *   help?: string, why?: string }} TemplateText
 * Lo que sale de validar: las principales siempre ('' = sin texto propio, solo por evento) y
 * las opcionales solo si tienen texto.
 * @typedef {TemplateText} TemplateValue
 * Una plantilla (o una capa de una: la del evento, la general) con las partes que tiene; las que
 * faltan o están vacías salen del texto del código.
 * @typedef {Partial<Record<TemplateKey, string | null>>} TemplateParts
 * @typedef {{ default: string, note?: string }} ExtraDef
 * @typedef {{ id: TemplateId, label: string, when: string, fixed: string, vars: TemplateVar[],
 *   defaults: TemplateText, extras: Partial<Record<ExtraKey, ExtraDef>> }} TemplateDef
 * @typedef {'tickets' | 'transfer' | 'stream' | 'reminder' | 'refund'} TemplateId
 */

/** Largo máximo de cada parte. */
export const TEMPLATE_LIMITS = Object.freeze({
	subject: 200,
	heading: 200,
	body: 4000,
	label: 60,
	button: 60,
	help: 500,
	why: 300
});

/** Las partes principales (en la plantilla general no pueden quedar vacías). */
export const TEMPLATE_MAIN = /** @type {const} */ (['subject', 'heading', 'body']);
/** Las partes opcionales (vacías = el texto de siempre). */
export const TEMPLATE_EXTRAS = /** @type {const} */ (['label', 'button', 'help', 'why']);
/** @type {readonly TemplateKey[]} */
export const TEMPLATE_KEYS = Object.freeze([...TEMPLATE_MAIN, ...TEMPLATE_EXTRAS]);

/** Nombre de cada parte en el panel. */
export const TEMPLATE_FIELD_LABELS = Object.freeze({
	subject: 'Asunto',
	heading: 'Título',
	body: 'Texto de arriba',
	label: 'Etiqueta de arriba del título',
	button: 'Texto del botón',
	help: 'Línea de ayuda (abajo del botón)',
	why: 'Por qué te llega (pie del mail)'
});

/** Por qué llegan los mails de entradas (pie de la plantilla común). */
export const WHY_BOUGHT = 'Te llega porque compraste entradas en kinkyvibe.ar.';
export const WHY_RESERVED = 'Te llega porque reservaste entradas en kinkyvibe.ar.';

/** @type {Record<string, TemplateVar>} */
const V = {
	nombre: { name: 'nombre', label: 'nombre de quien compró', sample: 'Persona de Ejemplo' },
	evento: { name: 'evento', label: 'título del evento', sample: 'Fiesta de ejemplo' },
	fecha: {
		name: 'fecha',
		label: 'fecha y hora del evento',
		sample: 'sábado 10 de octubre de 2026, 22:00'
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
		sample: 'jueves 1 de octubre de 2026, 11:00'
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
		},
		extras: {
			label: { default: 'Tus entradas' },
			button: {
				default: 'Ver mis entradas',
				note: 'En un evento online con el link cargado, el botón lleva a la transmisión y dice «Entrar a la transmisión».'
			},
			help: {
				default: '',
				note: 'Sin texto propio: cómo se usa el QR en la puerta (o, si es online, cómo llega el link).'
			},
			why: { default: WHY_BOUGHT }
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
		},
		extras: {
			label: { default: 'Tu reserva' },
			button: {
				default: 'Ver el estado de tu compra',
				note: 'Si hay que confirmar la reserva, el botón lleva a confirmarla y dice «Confirmar mi reserva».'
			},
			help: { default: '', note: 'Sin texto propio, este mail no tiene línea de ayuda.' },
			why: { default: WHY_RESERVED }
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
		},
		extras: {
			label: { default: 'Transmisión' },
			button: { default: 'Entrar a la transmisión' },
			help: {
				default: '',
				note: 'Sin texto propio: los links a cada entrada. Con texto propio, esos links pasan más abajo.'
			},
			why: { default: WHY_BOUGHT }
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
		},
		extras: {
			label: { default: 'Recordatorio' },
			button: {
				default: 'Ver mis entradas',
				note: 'En un evento online con el link cargado, el botón lleva a la transmisión y dice «Entrar a la transmisión».'
			},
			help: { default: '', note: 'Sin texto propio, este mail no tiene línea de ayuda.' },
			why: { default: WHY_BOUGHT }
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
		},
		// Sin botón (ni línea de ayuda debajo).
		extras: {
			label: { default: 'Reembolso' },
			why: { default: WHY_BOUGHT }
		}
	}
]);

/** @param {unknown} id @returns {TemplateDef | undefined} */
export function templateDef(id) {
	return EMAIL_TEMPLATES.find((t) => t.id === id);
}

/**
 * Las partes que se pueden editar en ese mail (las principales y las opcionales que tiene).
 * @param {TemplateId} id
 * @returns {TemplateKey[]}
 */
export function templateKeys(id) {
	const def = templateDef(id);
	if (!def) return [];
	return [...TEMPLATE_MAIN, ...TEMPLATE_EXTRAS.filter((k) => def.extras[k])];
}

/**
 * Junta capas de plantilla, de la que manda a la que menos: para cada parte, la primera que
 * tenga texto. Normalmente `mergeTemplates(delEvento, general)`; lo que no está en ninguna sale
 * del texto del código. `null` si ninguna capa tiene nada (el mail sale como siempre).
 *
 * @param {...(TemplateParts | null | undefined)} layers
 * @returns {TemplateParts | null}
 */
export function mergeTemplates(...layers) {
	/** @type {TemplateParts} */
	const out = {};
	for (const key of TEMPLATE_KEYS) {
		for (const layer of layers) {
			const v = layer?.[key];
			if (typeof v === 'string' && v.trim()) {
				out[key] = v;
				break;
			}
		}
	}
	return Object.keys(out).length ? out : null;
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
 * @param {Partial<Record<TemplateKey, string | null>>} tpl
 */
export function unknownVariables(id, tpl) {
	const allowed = new Set(templateDef(id)?.vars.map((v) => v.name) ?? []);
	return findVariables(TEMPLATE_KEYS.map((k) => tpl[k] ?? '').join('\n')).filter(
		(n) => !allowed.has(n)
	);
}

/** Algo que parece una etiqueta HTML: `<a …>`, `</p>`, `<br/>`, `<!-- -->`. */
const HTML_TAG_RE = /<\/?[a-z!?][^<>]*>/i;

/**
 * Valida y limpia una plantilla del formulario.
 *
 * - En la plantilla general (`optional: false`), asunto, título y texto no pueden quedar vacíos.
 * - Por evento (`optional: true`), todo puede quedar vacío: vacío = lo de la plantilla general.
 * - Las partes opcionales siempre pueden quedar vacías. Las que ese mail no tiene quedan vacías.
 *
 * @param {TemplateId} id
 * @param {Record<string, unknown>} form
 * @param {{ optional?: boolean }} [opts]
 * @returns {{ ok: true, value: TemplateValue } | { ok: false, errors: Partial<Record<TemplateKey, string>>, value: TemplateValue }}
 */
export function validateTemplate(id, form, { optional = false } = {}) {
	/** @param {unknown} v */
	const line = (v) =>
		String(v ?? '')
			.replace(/[\r\n\t]+/g, ' ')
			.trim();
	const keys = new Set(templateKeys(id));
	/** @type {TemplateValue} */
	const value = {
		subject: line(form.subject),
		heading: line(form.heading),
		body: String(form.body ?? '')
			.replace(/\r\n?/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim(),
		...Object.fromEntries(
			TEMPLATE_EXTRAS.filter((k) => keys.has(k))
				.map((k) => [k, line(form[k])])
				.filter(([, v]) => v)
		)
	};
	/** @type {Partial<Record<TemplateKey, string>>} */
	const errors = {};
	if (!templateDef(id)) return { ok: false, errors: { subject: 'No existe ese mail.' }, value };
	for (const key of TEMPLATE_KEYS) {
		const required = !optional && TEMPLATE_MAIN.includes(/** @type {any} */ (key));
		const text = value[key] ?? '';
		if (!text) {
			if (required) errors[key] = 'No puede quedar vacío.';
		} else if (text.length > TEMPLATE_LIMITS[key])
			errors[key] = `Hasta ${TEMPLATE_LIMITS[key]} caracteres.`;
		else if (HTML_TAG_RE.test(text))
			errors[key] =
				'No se puede usar HTML: escribí texto común (para negrita, **así**; para un dato, una {{variable}}).';
		else {
			const unknown = unknownVariables(id, { [key]: text });
			if (unknown.length)
				errors[key] =
					`${unknown.length === 1 ? 'Esta variable no existe' : 'Estas variables no existen'} en este mail: ` +
					unknown.map((n) => `{{${n}}}`).join(', ') +
					'.';
			else if (/\{\{|\}\}/.test(text.replace(VAR_RE, '')))
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
