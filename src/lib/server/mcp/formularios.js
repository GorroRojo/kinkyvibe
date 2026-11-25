/**
 * Formularios en el conector de Claude (docs/conector-claude.md, «Formularios»;
 * docs/formularios.md). Solo con el interruptor `formularios` prendido, además de los del conector:
 * apagado, ni aparecen en las herramientas.
 *
 * - **Leer** (`buscar` y `leer` con `tipo: formulario`): la definición (nombre, dirección, texto,
 *   quién responde, evento, privacidad, quién ve las respuestas, preguntas), la dirección pública,
 *   si recibe respuestas y CUÁNTAS tiene. Nunca las respuestas ni quién respondió.
 * - **Crear** (`crear_borrador` con `tipo: formulario`) y **editar** (`editar_objeto`): con la
 *   misma vista previa y aplicar que lo demás, por las acciones del panel («Formulario nuevo»,
 *   «Guardar» y «Recibe respuestas» del editor), que validan con `checkFormSave` y dejan su fila en
 *   Actividad (`form.create`, `form.save`, `form.open`, `form.close`) a nombre de le admin. Un
 *   formulario nuevo nace cerrado: abrirlo es una edición aparte (`abierto: true`).
 * - **Sin historial**: los formularios no guardan versiones (no son objetos de
 *   `object_revisions`), así que `historial` y `deshacer` no los cubren. Sumarlos pediría una
 *   migración.
 * - Nada de mails: mandar el link a quienes tenían entrada, desde el panel.
 */
import { isFlagOn } from '$lib/server/flags.js';
import { checkFormSave } from '$lib/server/formularios/admin.js';
import { getFormDefaults } from '$lib/server/formularios/defaults.js';
import { getForm, listForms, slugTaken } from '$lib/server/formularios/store.js';
import {
	ACCESS_LABELS,
	AUDIENCE_LABELS,
	PRIVACY_LABELS,
	QUESTION_KIND_LABELS,
	formPath,
	longText,
	oneLine,
	privacyChangeWarning
} from '$lib/utils/formularios.js';
import { foldText } from '$lib/utils/text.js';
import { ToolInputError, resolveEvent } from './tools.js';
import { failMessage, runPanelAction, valueText } from './objetos.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./edicion.js').Plan} Plan */
/** @typedef {import('$lib/server/formularios/store.js').Form} Form */
/** @typedef {import('$lib/utils/formularios.js').Question} Question */

/** El `tipo` de los formularios en el conector. */
export const FORM_TYPE = 'formulario';

/** Las claves de `cambios` de un formulario. */
export const FORM_FIELDS = Object.freeze([
	'nombre',
	'direccion',
	'texto',
	'quien_responde',
	'evento',
	'privacidad',
	'quien_ve',
	'abierto',
	'preguntas'
]);

/** Las claves de cada pregunta. */
const QUESTION_FIELDS = Object.freeze([
	'id',
	'pregunta',
	'tipo',
	'obligatoria',
	'opciones',
	'ayuda',
	'bajo',
	'alto',
	'minimo',
	'maximo'
]);

/** Valores del conector → los del panel. */
const ACCESS_IN = /** @type {Record<string, string>} */ ({
	link: 'link',
	cuenta: 'account',
	entrada: 'ticket'
});
const PRIVACY_IN = /** @type {Record<string, string>} */ ({
	con_nombre: 'named',
	anonimo: 'anonymous',
	que_elija: 'choose'
});
const AUDIENCE_IN = /** @type {Record<string, string>} */ ({
	organizadores: 'organizers',
	admins: 'admins'
});
const KIND_IN = /** @type {Record<string, string>} */ ({
	texto: 'text',
	texto_corto: 'short',
	opciones: 'choice',
	varias_opciones: 'multi',
	lista: 'select',
	casilla: 'checkbox',
	puntaje: 'rating',
	numero: 'number',
	fecha: 'date',
	foto: 'photo'
});
const CLASS_OF = /** @type {Record<string, string>} */ ({
	form: 'formulario',
	survey: 'encuesta',
	template: 'plantilla'
});

/** @param {Record<string, string>} map @param {string} value */
const keyOf = (map, value) => Object.keys(map).find((k) => map[k] === value) ?? value;

/**
 * Lo que se suma a la descripción de cada herramienta con los formularios prendidos.
 * `historial` no: los formularios no tienen historial.
 */
const TOOL_TEXT = /** @type {Record<string, string>} */ ({
	buscar:
		' Con los formularios prendidos, también formularios (`tipo: formulario`): nombre, dirección, si recibe respuestas y cuántas tiene.',
	leer: ' Un formulario (`tipo: formulario`): su configuración y sus preguntas, la dirección pública, si recibe respuestas y cuántas tiene (nunca las respuestas ni quién respondió).',
	vista_previa:
		' Formularios: `crear_borrador` y `editar_objeto` con `tipo: formulario`. Uno nuevo nace cerrado: abrirlo es otra edición (`abierto: true`). Los formularios no tienen historial: no se deshacen.',
	aplicar: ''
});

/** Los campos de un formulario en `cambios` (la descripción de `vista_previa` y `aplicar`). */
const CAMBIOS_TEXT =
	' Formulario (crear_borrador o editar_objeto): nombre, direccion, texto (el de arriba), ' +
	'quien_responde (link, cuenta, entrada), evento (slug o nombre; vacío, sin evento), privacidad ' +
	'(con_nombre, anonimo, que_elija), quien_ve (organizadores, admins), abierto (sí/no; uno nuevo ' +
	'nace cerrado) y preguntas (la lista entera, en orden: `[{ id?, pregunta, tipo, obligatoria?, ' +
	'opciones?, ayuda?, bajo?, alto?, minimo?, maximo? }]`; `tipo`: texto (largo), texto_corto, ' +
	'opciones, varias_opciones, lista (desplegable, elegir una), casilla, puntaje, numero, fecha, ' +
	'foto (la persona sube una imagen; el conector nunca ve las fotos); ' +
	'`id`: el que da `leer`, para mantener una pregunta; varias_opciones y lista llevan de 2 a 40 ' +
	'opciones, varias_opciones ninguna con «|»; numero puede llevar minimo y maximo; fecha se ' +
	'responde aaaa-mm-dd).';

/** Las instrucciones del servidor con los formularios prendidos. @param {boolean} edit */
export const formsInstructions = (edit) =>
	' Con los formularios prendidos, `buscar` y `leer` con `tipo: formulario` muestran cada ' +
	'formulario y cuántas respuestas tiene, nunca las respuestas' +
	(edit
		? '; `crear_borrador` crea uno (nace cerrado) y `editar_objeto` lo cambia o lo abre. Los formularios no tienen historial ni se deshacen, y mandarlos por mail se hace desde el panel.'
		: '.');

/**
 * La definición de una herramienta con los formularios: `formulario` en el `tipo` y su texto.
 * @param {Record<string, any>} definition
 */
export function withForms(definition) {
	const name = String(definition.name);
	if (!(name in TOOL_TEXT)) return definition;
	const d = structuredClone(definition);
	d.description += TOOL_TEXT[name];
	const props = d.inputSchema?.properties ?? {};
	if (Array.isArray(props.tipo?.enum)) props.tipo.enum.push(FORM_TYPE);
	if (props.cambios) props.cambios.description += CAMBIOS_TEXT;
	return d;
}

/** ¿Están prendidos los formularios? @param {ToolContext} ctx */
export const formsOn = (ctx) => isFlagOn(ctx.db, 'formularios').catch(() => false);

/** Sin el interruptor `formularios`: un error claro. @param {ToolContext} ctx */
export async function requireForms(ctx) {
	if (!(await formsOn(ctx)))
		throw new ToolInputError(
			'Los formularios están apagados (Ajustes → Interruptores → «Formularios»).'
		);
}

/** Las direcciones de un formulario. @param {Form} f */
function formLinks(f) {
	return {
		panel: `/admin/comunidad/formularios/${f.id}`,
		...(f.kind === 'template' ? {} : { publico: formPath(f) })
	};
}

/** Una fila corta (búsquedas y opciones). Nunca respuestas: solo cuántas. @param {Form & { responses: number }} f */
export function formBrief(f) {
	return {
		tipo: FORM_TYPE,
		clase: CLASS_OF[f.kind],
		slug: f.slug,
		titulo: f.title,
		abierto: f.open,
		cantidad_de_respuestas: f.responses,
		enlaces: formLinks(f)
	};
}

/**
 * Los formularios que coinciden con el texto (cada palabra, sin tildes, en el nombre o la
 * dirección).
 * @param {ToolContext} ctx
 * @param {string} texto
 */
export async function searchForms(ctx, texto) {
	const words = foldText(texto).split(/\s+/).filter(Boolean);
	return (await listForms(ctx.db)).filter((f) => {
		const hay = foldText(`${f.title} ${f.slug}`);
		return words.every((w) => hay.includes(w));
	});
}

/**
 * Un formulario por su dirección o su nombre (uno solo), o un error con las opciones.
 * @param {ToolContext} ctx
 * @param {string} query
 */
export async function findForm(ctx, query) {
	const q = oneLine(query).slice(0, 200);
	if (!q) throw new ToolInputError('Falta el formulario (su dirección o su nombre).');
	const all = await listForms(ctx.db);
	const bySlug = all.find((f) => f.slug === q);
	if (bySlug) return bySlug;
	const f = foldText(q);
	const exact = all.filter((x) => foldText(x.title) === f);
	if (exact.length === 1) return exact[0];
	const found = exact.length ? exact : await searchForms(ctx, q);
	if (found.length === 1) return found[0];
	throw new ToolInputError(
		found.length
			? `Hay varios formularios que coinciden con «${q}»: ${found
					.slice(0, 10)
					.map((x) => `${x.title} (${x.slug})`)
					.join(', ')}. Volvé a pedir con la dirección (slug).`
			: `No encontré ningún formulario «${q}».`
	);
}

/** Una pregunta como la ve Claude. @param {Question} q */
function questionOut(q) {
	return {
		id: q.id,
		pregunta: q.label,
		tipo: keyOf(KIND_IN, q.kind),
		obligatoria: q.required,
		...(q.options.length ? { opciones: q.options } : {}),
		...(q.help ? { ayuda: q.help } : {}),
		...(q.kind === 'rating' ? { bajo: q.low, alto: q.high } : {}),
		...(q.min !== undefined ? { minimo: q.min } : {}),
		...(q.max !== undefined ? { maximo: q.max } : {})
	};
}

/** El título de un evento (o su dirección). @param {string | null} slug */
async function eventTitle(slug) {
	if (!slug) return null;
	const r = await resolveEvent(slug).catch(() => ({ event: null }));
	return r.event?.slug === slug ? r.event.title : slug;
}

/**
 * Lo que devuelve `leer` de un formulario: la definición, la dirección pública, si recibe
 * respuestas y cuántas tiene. NUNCA las respuestas, nombres ni mails.
 * @param {ToolContext} ctx
 * @param {Form & { responses: number }} f
 */
export async function formForClaude(ctx, f) {
	const links = formLinks(f);
	return {
		encontrado: true,
		tipo: FORM_TYPE,
		clase: CLASS_OF[f.kind],
		slug: f.slug,
		titulo: f.title,
		texto: f.intro,
		quien_responde: keyOf(ACCESS_IN, f.access),
		evento: f.eventSlug ? { slug: f.eventSlug, titulo: await eventTitle(f.eventSlug) } : null,
		privacidad: keyOf(PRIVACY_IN, f.privacy),
		quien_ve: keyOf(AUDIENCE_IN, f.audience),
		abierto: f.open,
		preguntas: f.questions.map(questionOut),
		cantidad_de_respuestas: f.responses,
		...(links.publico ? { url_publica: `${ctx.origin}${links.publico}` } : {}),
		editado: { cuando: new Date(f.updatedAt).toISOString() },
		enlaces: links
	};
}

/**
 * `cambios` de un formulario, sin validar todavía con las reglas del panel (eso lo hace
 * `checkFormSave`): las claves conocidas y los valores del panel.
 * @param {ToolContext} ctx
 * @param {unknown} raw
 */
async function readInputs(ctx, raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw))
		throw new ToolInputError(`\`cambios\` es un objeto con alguno de: ${FORM_FIELDS.join(', ')}.`);
	const input = /** @type {Record<string, unknown>} */ (raw);
	const unknown = Object.keys(input).filter((k) => !FORM_FIELDS.includes(k));
	if (unknown.length)
		throw new ToolInputError(
			`Un formulario no tiene ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')}. Lo que sí: ${FORM_FIELDS.join(', ')}.`
		);
	/** @type {Record<string, unknown>} */
	const out = {};
	/** @param {string} k @param {Record<string, string>} map */
	const pick = (k, map) => {
		const raw = input[k];
		if (raw === undefined) return;
		const v = typeof raw === 'string' ? raw.trim() : '';
		if (!Object.hasOwn(map, v))
			throw new ToolInputError(`\`${k}\` es uno de: ${Object.keys(map).join(', ')}.`);
		out[k] = map[v];
	};
	if (input.nombre !== undefined) out.nombre = oneLine(input.nombre).slice(0, 500);
	if (input.direccion !== undefined) out.direccion = oneLine(input.direccion).slice(0, 200);
	if (input.texto !== undefined) out.texto = longText(input.texto).slice(0, 5000);
	pick('quien_responde', ACCESS_IN);
	pick('privacidad', PRIVACY_IN);
	pick('quien_ve', AUDIENCE_IN);
	if (input.abierto !== undefined) {
		if (typeof input.abierto !== 'boolean')
			throw new ToolInputError('`abierto` va como `true` (recibe respuestas) o `false`.');
		out.abierto = input.abierto;
	}
	if (input.evento !== undefined) {
		const q = oneLine(input.evento).slice(0, 200);
		if (!q) out.evento = null;
		else {
			const r = await resolveEvent(q);
			if (!r.event)
				throw new ToolInputError(
					r.options?.length
						? `Hay varios eventos que coinciden con «${q}»: ${r.options
								.map((o) => `${o.titulo} (${o.slug})`)
								.join(', ')}. Volvé a pedir con el slug.`
						: `No encontré ningún evento «${q}».`
				);
			out.evento = r.event.slug;
		}
	}
	if (input.preguntas !== undefined) out.preguntas = questionsInput(input.preguntas);
	return out;
}

/**
 * Las preguntas como las manda el editor del panel (`{ id, label, kind, required, options… }`).
 * La validación es la del panel (`validateQuestions`, en `checkFormSave`).
 * @param {unknown} raw
 */
function questionsInput(raw) {
	if (!Array.isArray(raw))
		throw new ToolInputError(
			'`preguntas` es la lista entera, en orden: `[{ id?, pregunta, tipo, obligatoria?, opciones?, ayuda?, bajo?, alto?, minimo?, maximo? }]`.'
		);
	return raw.map((item, i) => {
		if (!item || typeof item !== 'object' || Array.isArray(item))
			throw new ToolInputError(`La pregunta ${i + 1} es un objeto \`{ pregunta, tipo, … }\`.`);
		const q = /** @type {Record<string, unknown>} */ (item);
		const unknown = Object.keys(q).filter((k) => !QUESTION_FIELDS.includes(k));
		if (unknown.length)
			throw new ToolInputError(
				`La pregunta ${i + 1} no lleva ${unknown.map((k) => `«${k.slice(0, 30)}»`).join(', ')}. Lo que sí: ${QUESTION_FIELDS.join(', ')}.`
			);
		const tipo = typeof q.tipo === 'string' ? q.tipo.trim() : '';
		if (!Object.hasOwn(KIND_IN, tipo))
			throw new ToolInputError(
				`El \`tipo\` de la pregunta ${i + 1} es uno de: ${Object.keys(KIND_IN).join(', ')}.`
			);
		if (q.obligatoria !== undefined && typeof q.obligatoria !== 'boolean')
			throw new ToolInputError(`\`obligatoria\` (pregunta ${i + 1}) va como \`true\` o \`false\`.`);
		if (q.opciones !== undefined && !Array.isArray(q.opciones))
			throw new ToolInputError(`\`opciones\` (pregunta ${i + 1}) es una lista de textos.`);
		for (const k of /** @type {const} */ (['minimo', 'maximo']))
			if (q[k] !== undefined && q[k] !== null && typeof q[k] !== 'number')
				throw new ToolInputError(`\`${k}\` (pregunta ${i + 1}) va como número.`);
		return {
			...(typeof q.id === 'string' && q.id ? { id: q.id } : {}),
			label: q.pregunta,
			kind: KIND_IN[tipo],
			required: q.obligatoria === true,
			options: Array.isArray(q.opciones) ? q.opciones.map((o) => String(o ?? '')) : [],
			help: q.ayuda,
			low: q.bajo,
			high: q.alto,
			min: q.minimo ?? undefined,
			max: q.maximo ?? undefined
		};
	});
}

/**
 * Las preguntas que vienen sin `id` toman el de una pregunta de ahora con el mismo texto (así
 * siguen siendo «la misma» en el resumen de las respuestas).
 * @param {Array<Record<string, unknown>>} list
 * @param {Question[]} current
 */
function keepIds(list, current) {
	const used = new Set(list.map((q) => q.id).filter(Boolean));
	return list.map((q) => {
		if (q.id) return q;
		const label = oneLine(q.label);
		const same = current.find((c) => c.label === label && !used.has(c.id));
		if (!same) return q;
		used.add(same.id);
		return { ...q, id: same.id };
	});
}

/** Los errores de `checkFormSave` en una línea. @param {{ message: string, errors: Record<string, string>, questionErrors: Record<number, Record<string, string>> }} r */
function checkMessage(r) {
	const parts = [
		...Object.values(r.errors),
		...Object.entries(r.questionErrors).map(
			([i, e]) => `Pregunta ${Number(i) + 1}: ${Object.values(e).join(' ')}`
		)
	];
	return parts.length ? `${r.message} ${parts.join(' ')}` : r.message;
}

/** Una pregunta en el antes y después. @param {Question} q */
function questionText(q) {
	const kind = /** @type {Record<string, string>} */ (QUESTION_KIND_LABELS)[q.kind] ?? q.kind;
	return [
		`«${q.label}» (${kind}${q.required ? ', obligatoria' : ''})`,
		q.options.length ? `: ${q.options.join(' / ')}` : '',
		q.help ? `; ayuda: ${q.help}` : '',
		q.kind === 'rating' ? `; de «${q.low}» a «${q.high}»` : '',
		q.min !== undefined ? `; mínimo ${q.min}` : '',
		q.max !== undefined ? `; máximo ${q.max}` : ''
	].join('');
}

/**
 * El antes y después de las preguntas, por id.
 * @param {Question[]} before
 * @param {Question[]} after
 */
function questionChanges(before, after) {
	const changes = [];
	const old = new Map(before.map((q) => [q.id, q]));
	after.forEach((q, i) => {
		const prev = old.get(q.id);
		if (!prev)
			changes.push({ campo: `pregunta ${i + 1} (nueva)`, antes: '', despues: questionText(q) });
		else if (JSON.stringify(prev) !== JSON.stringify(q))
			changes.push({
				campo: `pregunta ${i + 1}`,
				antes: questionText(prev),
				despues: questionText(q)
			});
	});
	const now = new Set(after.map((q) => q.id));
	for (const q of before) {
		if (!now.has(q.id))
			changes.push({ campo: 'pregunta que se saca', antes: questionText(q), despues: '(se saca)' });
	}
	const kept = before.filter((q) => now.has(q.id)).map((q) => q.id);
	const order = after.filter((q) => old.has(q.id)).map((q) => q.id);
	if (kept.join() !== order.join())
		changes.push({
			campo: 'orden de las preguntas',
			antes: before.map((q) => `«${q.label}»`).join(', '),
			despues: after.map((q) => `«${q.label}»`).join(', ')
		});
	return changes;
}

/** @param {string | null} slug */
const eventText = async (slug) => (slug ? `${await eventTitle(slug)} (${slug})` : 'sin evento');

/** Abierto o cerrado, en palabras. @param {boolean} open */
const openText = (open) => (open ? 'sí (recibe respuestas)' : 'no (cerrado)');

/**
 * El aviso de cambiar las preguntas de un formulario que ya tiene respuestas.
 * @param {number} responses
 */
export function questionsChangeWarning(responses) {
	return `Ya ${responses === 1 ? 'llegó 1 respuesta' : `llegaron ${responses} respuestas`}: cada una guarda las preguntas como estaban cuando se respondió. Cambiar o sacar una pregunta no cambia lo que ya llegó (en el resumen, una pregunta sacada sigue con lo que ya respondieron).`;
}

/** El «Guardar» del editor de un formulario. @param {ToolContext} c @param {number} id @param {Record<string, unknown>} s @param {Question[]} questions */
async function savePanelForm(c, id, s, questions) {
	const { actions } =
		await import('../../../routes/(authed)/admin/comunidad/formularios/[id]/+page.server.js');
	const form = new FormData();
	form.set('title', String(s.title));
	form.set('intro', String(s.intro));
	form.set('slug', String(s.slug));
	form.set('access', String(s.access));
	form.set('privacy', String(s.privacy));
	form.set('audience', String(s.audience));
	form.set('eventSlug', s.eventSlug ? String(s.eventSlug) : '');
	form.set('questions', JSON.stringify(questions));
	const r = /** @type {any} */ (
		await runPanelAction(c, actions.save, {
			path: `/admin/comunidad/formularios/${id}?/save`,
			params: { id: String(id) },
			form
		})
	);
	if (r?.save?.ok) return { ok: true };
	const save = r?.data?.save;
	return {
		ok: false,
		message: save ? checkMessage({ questionErrors: {}, errors: {}, ...save }) : failMessage(r)
	};
}

/** «Recibe respuestas» del editor (abrir o cerrar). @param {ToolContext} c @param {number} id @param {boolean} open */
async function setPanelOpen(c, id, open) {
	const { actions } =
		await import('../../../routes/(authed)/admin/comunidad/formularios/[id]/+page.server.js');
	const form = new FormData();
	if (open) form.set('open', 'on');
	const r = /** @type {any} */ (
		await runPanelAction(c, actions.setOpen, {
			path: `/admin/comunidad/formularios/${id}?/setOpen`,
			params: { id: String(id) },
			form
		})
	);
	return r?.open?.ok ? { ok: true } : { ok: false, message: failMessage(r, 'open') };
}

/**
 * `editar_objeto` de un formulario: lo mismo que el «Guardar» del editor (y «Recibe respuestas»
 * si cambia `abierto`), con el aviso de la privacidad y el de las preguntas si ya hay respuestas.
 * La versión es la fecha del último guardado del formulario.
 *
 * @param {ToolContext} ctx
 * @param {string} operation
 * @param {string} query
 * @param {unknown} cambios
 * @returns {Promise<Plan>}
 */
export async function planFormEdit(ctx, operation, query, cambios) {
	await requireForms(ctx);
	const form = await findForm(ctx, query);
	const input = await readInputs(ctx, cambios);
	if (!Object.keys(input).length) throw new ToolInputError('No hay nada para cambiar.');
	if (
		form.kind === 'survey' &&
		['direccion', 'quien_responde', 'evento'].some((k) => input[k] !== undefined)
	)
		throw new ToolInputError(
			'La encuesta de un evento no cambia de dirección, de quién responde ni de evento.'
		);
	if (form.kind === 'template' && input.abierto !== undefined)
		throw new ToolInputError('Las plantillas no se abren.');
	const raw = {
		title: input.nombre ?? form.title,
		intro: input.texto ?? form.intro,
		slug: input.direccion ?? form.slug,
		access: input.quien_responde ?? form.access,
		privacy: input.privacidad ?? form.privacy,
		audience: input.quien_ve ?? form.audience,
		eventSlug: input.evento !== undefined ? (input.evento ?? '') : (form.eventSlug ?? '')
	};
	const questionsRaw = input.preguntas
		? keepIds(/** @type {Array<Record<string, unknown>>} */ (input.preguntas), form.questions)
		: form.questions;
	const checked = await checkFormSave(form, raw, questionsRaw);
	if (!checked.ok) throw new ToolInputError(checkMessage(checked));
	const s = checked.settings;
	const questions = checked.questions;
	const open = input.abierto === undefined ? form.open : Boolean(input.abierto);
	if (form.kind === 'form' && s.slug !== form.slug && (await slugTaken(ctx.db, s.slug, form.id)))
		throw new ToolInputError('Esa dirección ya la usa otro formulario: elegí otra.');
	if (open && !questions.length)
		throw new ToolInputError('Agregá al menos una pregunta antes de abrirlo.');

	const before = {
		title: form.title,
		intro: form.intro,
		slug: form.slug,
		access: form.access,
		privacy: form.privacy,
		audience: form.audience,
		eventSlug: form.eventSlug
	};
	const settingsChanged =
		JSON.stringify(before) !== JSON.stringify({ ...before, ...s }) ||
		JSON.stringify(form.questions) !== JSON.stringify(questions);
	const changes = [];
	/** @param {string} campo @param {unknown} a @param {unknown} b @param {(v: any) => string | Promise<string>} [show] */
	const diff = async (campo, a, b, show = valueText) => {
		if (a !== b) changes.push({ campo, antes: await show(a), despues: await show(b) });
	};
	await diff('nombre', form.title, s.title);
	if (form.kind === 'form') await diff('dirección', formPath(form), formPath({ ...form, ...s }));
	await diff('texto de arriba', form.intro, s.intro);
	await diff('quién responde', form.access, s.access, (v) => /** @type {any} */ (ACCESS_LABELS)[v]);
	await diff('evento', form.eventSlug, s.eventSlug, eventText);
	await diff('privacidad', form.privacy, s.privacy, (v) => /** @type {any} */ (PRIVACY_LABELS)[v]);
	await diff(
		'quién ve las respuestas',
		form.audience,
		s.audience,
		(v) => /** @type {any} */ (AUDIENCE_LABELS)[v]
	);
	const qChanges = questionChanges(form.questions, questions);
	changes.push(...qChanges);
	await diff('recibe respuestas', form.open, open, openText);
	if (!changes.length && !settingsChanged)
		throw new ToolInputError('Eso ya está así: no hay nada para cambiar.');

	/** @type {string[]} */
	const warnings = [];
	const privacy = privacyChangeWarning(form.privacy, s.privacy, form.responses);
	if (privacy) warnings.push(privacy);
	if (qChanges.length && form.responses) warnings.push(questionsChangeWarning(form.responses));

	const after = { ...form, ...s, questions, open };
	return {
		operation,
		tipo: FORM_TYPE,
		head: `Cambiar en el formulario «${form.title}»:`,
		target: `${FORM_TYPE}:${form.id}`,
		targetTitle: s.title,
		targetLog: { targetType: 'form', targetId: String(form.id) },
		inputs: { settings: s, questions, abierto: open },
		base: String(form.updatedAt),
		changes,
		warnings,
		links: formLinks(after),
		apply: async (c) => {
			if (settingsChanged) {
				const r = await savePanelForm(c, form.id, s, questions);
				if (!r.ok) return { ok: false, stale: false, message: String(r.message) };
			}
			if (open !== form.open) {
				const r = await setPanelOpen(c, form.id, open);
				if (!r.ok)
					return {
						ok: false,
						stale: false,
						message: settingsChanged
							? `Se guardó lo demás, pero no se pudo ${open ? 'abrir' : 'cerrar'}: ${r.message}`
							: String(r.message)
					};
			}
			return { ok: true, warnings: [] };
		}
	};
}

/**
 * `crear_borrador` de un formulario: «Formulario nuevo» del panel (cerrado, con lo de «Cómo salen
 * por defecto») y, enseguida, el «Guardar» del editor con lo que se pidió. Siempre nace cerrado:
 * abrirlo es otra edición.
 *
 * @param {ToolContext} ctx
 * @param {unknown} cambios
 * @returns {Promise<Plan>}
 */
export async function planFormCreate(ctx, cambios) {
	await requireForms(ctx);
	const input = await readInputs(ctx, cambios);
	if (input.abierto === true)
		throw new ToolInputError(
			'Un formulario nuevo nace cerrado. Para que reciba respuestas, abrilo después con `editar_objeto` (`abierto: true`).'
		);
	const title = typeof input.nombre === 'string' ? input.nombre : '';
	if (title.length < 2) throw new ToolInputError('Falta `nombre` (al menos 2 letras).');
	if (title.length > 120) throw new ToolInputError('El nombre puede tener hasta 120 letras.');
	const d = await getFormDefaults(ctx.db);
	const given = typeof input.direccion === 'string' && input.direccion !== '';
	const raw = {
		title,
		intro: input.texto ?? '',
		slug: given ? input.direccion : title,
		access: input.quien_responde ?? d.formAccess,
		privacy: input.privacidad ?? d.formPrivacy,
		audience: input.quien_ve ?? 'admins',
		eventSlug: input.evento ?? ''
	};
	const checked = await checkFormSave(
		{ kind: 'form' },
		raw,
		/** @type {unknown[]} */ (input.preguntas ?? [])
	);
	if (!checked.ok) throw new ToolInputError(checkMessage(checked));
	const s = checked.settings;
	const questions = checked.questions;
	const taken = await slugTaken(ctx.db, s.slug);
	if (given && taken)
		throw new ToolInputError('Esa dirección ya la usa otro formulario: elegí otra.');
	const changes = [
		{ campo: 'nombre', antes: '', despues: s.title },
		{
			campo: 'dirección',
			antes: '',
			despues:
				given || !taken
					? `/formularios/${s.slug}`
					: `/formularios/${s.slug}-… (${s.slug} ya está usada: el panel le suma un número)`
		},
		...(s.intro ? [{ campo: 'texto de arriba', antes: '', despues: s.intro }] : []),
		{ campo: 'quién responde', antes: '', despues: ACCESS_LABELS[s.access] },
		...(s.eventSlug ? [{ campo: 'evento', antes: '', despues: await eventText(s.eventSlug) }] : []),
		{ campo: 'privacidad', antes: '', despues: PRIVACY_LABELS[s.privacy] },
		{ campo: 'quién ve las respuestas', antes: '', despues: AUDIENCE_LABELS[s.audience] },
		...questionChanges([], questions),
		{
			campo: 'recibe respuestas',
			antes: '',
			despues: 'no: nace cerrado (se abre después con `editar_objeto`)'
		}
	];
	return {
		operation: 'crear_borrador',
		tipo: FORM_TYPE,
		head: 'Crear un formulario (cerrado):',
		target: `${FORM_TYPE}:nuevo:${s.slug}`,
		targetTitle: s.title,
		targetLog: { targetType: 'form', targetId: s.title },
		inputs: { settings: s, questions, direccion: given },
		base: 'nuevo',
		changes,
		warnings: [],
		links: { panel: '/admin/comunidad/formularios' },
		apply: async (c) => {
			const { actions } =
				await import('../../../routes/(authed)/admin/comunidad/formularios/+page.server.js');
			const form = new FormData();
			form.set('title', s.title);
			const r = /** @type {any} */ (
				await runPanelAction(c, actions.create, {
					path: '/admin/comunidad/formularios?/create',
					params: {},
					form
				})
			);
			const m = /\/admin\/comunidad\/formularios\/(\d+)/.exec(String(r?.redirected ?? ''));
			if (!m) return { ok: false, stale: false, message: failMessage(r, 'create') };
			const created = await getForm(c.db, Number(m[1]));
			if (!created) return { ok: false, stale: false, message: 'No se pudo crear.' };
			const saved = await savePanelForm(
				c,
				created.id,
				{ ...s, slug: given ? s.slug : created.slug },
				questions
			);
			if (!saved.ok)
				return {
					ok: false,
					stale: false,
					message: `Se creó el formulario «${s.title}» (cerrado, solo con el nombre, en /formularios/${created.slug}), pero no se guardó lo demás: ${saved.message} Completalo con \`editar_objeto\` o desde el panel.`
				};
			const now = (await getForm(c.db, created.id)) ?? created;
			return {
				ok: true,
				warnings: [],
				created: { slug: now.slug, links: formLinks(now) }
			};
		}
	};
}
