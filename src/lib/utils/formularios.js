/**
 * Formularios (docs/formularios.md, decisión 0057): funciones puras, sin base. Las usan el
 * servidor (guardar un formulario, validar una respuesta), la página pública, el editor compartido
 * de preguntas (también el de las preguntas de inscripción) y la página de respuestas del panel.
 *
 * Un formulario tiene una lista de preguntas en su orden. Los tipos, sus nombres y cómo se valida
 * cada pregunta y cada respuesta son los mismos que los de las preguntas de inscripción
 * (src/lib/utils/questions.js, en común); lo único que es solo de los formularios es «Foto». Cada
 * respuesta guarda la pregunta como estaba (`{ id, label, value }`), como las de inscripción; la de
 * una «Foto», la clave privada del archivo en R2 (`formularios/<formulario>/<sha-256>.<ext>`,
 * {@link isPhotoKey}), nunca los bytes ni una dirección pública.
 */
import { slugify } from './text.js';
import {
	DEFAULT_HIGH,
	DEFAULT_LOW,
	QUESTION_KINDS,
	isQuestionKind,
	longText,
	oneLine,
	parseQuestionSettings,
	tallyOptions,
	validateAnswerValue,
	validateQuestion
} from './questions.js';

export {
	CHECKBOX_YES,
	DEFAULT_HIGH,
	DEFAULT_LOW,
	HELP_MAX,
	LABEL_MAX,
	MAX_MULTI_OPTIONS,
	MAX_OPTIONS,
	MULTI_SEPARATOR,
	NUMBER_ABS_MAX,
	OPTION_MAX,
	QUESTION_KINDS,
	QUESTION_KIND_LABELS,
	SCALE_LABEL_MAX,
	hasOptions,
	isIsoDate,
	isQuestionKind,
	longText,
	maxOptionsFor,
	oneLine,
	parseNumber,
	showAnswer,
	showNumber,
	splitMulti,
	validateQuestion
} from './questions.js';
/** @typedef {import('./questions.js').QuestionKind} QuestionKind */

/**
 * «Foto»: la imagen va a R2 bajo {@link PHOTO_PREFIX}, que NO es la biblioteca pública (`img/`,
 * servida en /media): solo la leen la página de respuestas del panel y la API de Gancho
 * (docs/formularios.md, «Foto»). La respuesta guarda la clave.
 */
export const PHOTO_PREFIX = 'formularios/';
/** Lo que más puede pesar una foto (como las imágenes de la biblioteca). */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** Lo que marca una respuesta con foto en el CSV (el CSV nunca lleva la foto ni una dirección). */
export const PHOTO_CSV_MARK = 'sí';
const PHOTO_KEY = /^formularios\/[1-9]\d{0,15}\/[0-9a-f]{64}\.(jpg|png|webp|gif|avif)$/;

/**
 * La clave en R2 de la foto de una respuesta: por formulario y por contenido.
 * @param {number} formId @param {string} hash sha-256 en hex @param {string} ext
 */
export const photoKey = (formId, hash, ext) => `${PHOTO_PREFIX}${formId}/${hash}.${ext}`;

/** ¿Es la clave de una foto de formulario? @param {unknown} v @returns {v is string} */
export const isPhotoKey = (v) => typeof v === 'string' && PHOTO_KEY.test(v);

/** El archivo de una clave de foto (`<sha-256>.<ext>`), para las direcciones. @param {string} key */
export const photoFile = (key) => key.slice(key.lastIndexOf('/') + 1);

/** Preguntas por formulario. */
export const MAX_QUESTIONS = 30;
/** Largo de una respuesta de texto. */
export const FORM_ANSWER_MAX = 1000;
export const TITLE_MAX = 120;
export const INTRO_MAX = 1000;
export const SLUG_MAX = 80;
/** Nombre y mail de quien responde (formularios con nombre y sin cuenta). */
export const NAME_MAX = 120;
/** Largo máximo de los pronombres (como en la compra). */
export const PRONOUNS_MAX = 40;
export const EMAIL_MAX = 254;

/** El nombre del campo trampa (invisible: si llega lleno, es un robot). */
export const HONEYPOT_FIELD = 'sitio_web';
/** La casilla «Responder anónimamente» de los formularios «Que cada persona elija». */
export const ANONYMOUS_FIELD = 'anonima';

export const ACCESS = /** @type {const} */ (['link', 'account', 'ticket']);
/** @typedef {typeof ACCESS[number]} Access */
export const ACCESS_LABELS = Object.freeze({
	link: 'Cualquiera con el link',
	account: 'Personas con cuenta',
	ticket: 'Quienes tenían entrada para un evento'
});
export const ACCESS_HELP = Object.freeze({
	link: 'No hace falta entrar. Tiene un límite por persona para frenar el spam.',
	account: 'Tienen que entrar con su cuenta para responder.',
	ticket: 'Les llega un link personal por mail, que sirve una sola vez.'
});

export const PRIVACY = /** @type {const} */ (['named', 'anonymous', 'choose']);
/** @typedef {typeof PRIVACY[number]} Privacy */
export const PRIVACY_LABELS = Object.freeze({
	named: 'Con nombre',
	anonymous: 'Anónimo',
	choose: 'Que cada persona elija'
});
export const PRIVACY_HELP = Object.freeze({
	named: 'Se guarda quién respondió.',
	anonymous:
		'No se guarda nombre, pronombre, mail, cuenta ni compra: solo las respuestas y el día.',
	choose: 'El formulario muestra «Responder anónimamente». Si la marcan, se guarda como anónima.'
});

export const AUDIENCE = /** @type {const} */ (['organizers', 'admins']);
/** @typedef {typeof AUDIENCE[number]} Audience */
export const AUDIENCE_LABELS = Object.freeze({
	organizers: 'Admins y les organizadores del evento',
	admins: 'Solo admins'
});

/**
 * @typedef {{
 *   id: string,
 *   kind: QuestionKind,
 *   label: string,
 *   required: boolean,
 *   options: string[],
 *   help?: string,
 *   low?: string,
 *   high?: string,
 *   min?: number,
 *   max?: number
 * }} Question
 * @typedef {{ id: string, label: string, value: string }} FormAnswer
 */

/** @param {unknown} v @returns {v is Access} */
export const isAccess = (v) => /** @type {readonly unknown[]} */ (ACCESS).includes(v);
/** @param {unknown} v @returns {v is Privacy} */
export const isPrivacy = (v) => /** @type {readonly unknown[]} */ (PRIVACY).includes(v);
/** @param {unknown} v @returns {v is Audience} */
export const isAudience = (v) => /** @type {readonly unknown[]} */ (AUDIENCE).includes(v);

const QUESTION_ID = /^[a-z0-9]{1,12}$/;

/**
 * Un id nuevo para una pregunta (`p1`, `p2`…), que no esté en `taken`.
 * @param {Iterable<string>} taken
 */
export function newQuestionId(taken) {
	const used = new Set(taken);
	let n = used.size + 1;
	while (used.has(`p${n}`)) n++;
	return `p${n}`;
}

/**
 * Valida la lista entera (lo que manda el editor, en su orden). Cada pregunta conserva su id si
 * es válido y no está repetido; si no, recibe uno nuevo. Los errores van por posición.
 *
 * @param {unknown} raw lista o JSON
 * @param {{ kinds?: readonly string[], max?: number }} [opts]
 * @returns {{ ok: true, questions: Question[] }
 *   | { ok: false, message: string, errors: Record<number, Record<string, string>> }}
 */
export function validateQuestions(raw, { kinds = QUESTION_KINDS, max = MAX_QUESTIONS } = {}) {
	let list = raw;
	if (typeof raw === 'string') {
		try {
			list = JSON.parse(raw);
		} catch {
			return { ok: false, message: 'No se pudieron leer las preguntas.', errors: {} };
		}
	}
	if (!Array.isArray(list))
		return { ok: false, message: 'No se pudieron leer las preguntas.', errors: {} };
	if (list.length > max) return { ok: false, message: `Hasta ${max} preguntas.`, errors: {} };
	/** @type {Record<number, Record<string, string>>} */
	const errors = {};
	/** @type {Question[]} */
	const questions = [];
	/** @type {Set<string>} */
	const ids = new Set();
	list.forEach((item, i) => {
		const r = validateQuestion(item, kinds);
		if (!r.ok) {
			errors[i] = r.errors;
			return;
		}
		const rawId = typeof item?.id === 'string' ? item.id : '';
		const id = QUESTION_ID.test(rawId) && !ids.has(rawId) ? rawId : '';
		questions.push({ id, ...r.question });
		if (id) ids.add(id);
	});
	if (Object.keys(errors).length) {
		const n = Object.keys(errors).length;
		return {
			ok: false,
			message: n === 1 ? 'Revisá 1 pregunta.' : `Revisá ${n} preguntas.`,
			errors
		};
	}
	for (const q of questions) {
		if (!q.id) {
			q.id = newQuestionId(ids);
			ids.add(q.id);
		}
	}
	return { ok: true, questions };
}

/**
 * Lo guardado en `forms.questions` (JSON), sin confiar en la forma: lo que no es una pregunta se
 * saltea.
 * @param {unknown} json
 * @returns {Question[]}
 */
export function parseStoredQuestions(json) {
	let list;
	try {
		list = typeof json === 'string' ? JSON.parse(json) : json;
	} catch {
		return [];
	}
	if (!Array.isArray(list)) return [];
	/** @type {Question[]} */
	const out = [];
	for (const q of list) {
		if (!q || typeof q !== 'object' || typeof q.id !== 'string' || !isQuestionKind(q.kind))
			continue;
		/** @type {Question} */
		const item = {
			id: q.id,
			kind: q.kind,
			label: String(q.label ?? ''),
			required: q.required === true,
			options: Array.isArray(q.options) ? q.options.map(String) : []
		};
		Object.assign(item, parseQuestionSettings(q.kind, q));
		out.push(item);
	}
	return out;
}

/**
 * El `name` del campo de una pregunta en el formulario público.
 * @param {string} id
 */
export const answerName = (id) => `p_${id}`;

/**
 * Todos los valores que llegaron con un `name` (las casillas de «Varias opciones» repiten el
 * `name`): `getAll` de un FormData; de un Map, el valor (o la lista) que tenga.
 * @param {{ get(name: string): unknown, getAll?: (name: string) => unknown[] }} form
 * @param {string} name
 * @returns {unknown[]}
 */
function allValues(form, name) {
	if (typeof form.getAll === 'function') return form.getAll(name);
	const v = form.get(name);
	return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

/**
 * Valida una respuesta contra las preguntas. Las vacías de preguntas opcionales no se guardan; si
 * todas quedaron vacías, error (no se guarda una respuesta en blanco).
 *
 * @param {readonly Question[]} questions
 * @param {{ get(name: string): unknown, getAll?: (name: string) => unknown[] }} form FormData o
 *   un Map
 * @returns {{ ok: true, answers: FormAnswer[] }
 *   | { ok: false, message: string, errors: Record<string, string> }}
 */
export function validateFormAnswers(questions, form) {
	/** @type {Record<string, string>} */
	const errors = {};
	/** @type {FormAnswer[]} */
	const answers = [];
	for (const q of questions) {
		const name = answerName(q.id);
		/** @type {string | null} */
		let value = null;
		if (q.kind === 'photo') {
			// La subida ya pasó (public.js, `takePhotos`): acá llega la clave o nada.
			const raw = form.get(name);
			const key = typeof raw === 'string' ? raw : '';
			if (!key) {
				if (q.required) errors[q.id] = 'Subí una foto.';
			} else if (!isPhotoKey(key)) errors[q.id] = 'Subí una foto.';
			else value = key;
		} else {
			// Las casillas de «Varias opciones» repiten el `name`: llegan todas.
			const raw = q.kind === 'multi' ? allValues(form, name) : form.get(name);
			const r = validateAnswerValue(q, raw, { textMax: FORM_ANSWER_MAX });
			if ('error' in r) errors[q.id] = r.error;
			else value = r.value;
		}
		if (value !== null && !errors[q.id]) answers.push({ id: q.id, label: q.label, value });
	}
	if (Object.keys(errors).length) {
		return { ok: false, message: 'Revisá lo marcado.', errors };
	}
	if (!answers.length) {
		return {
			ok: false,
			message: 'Contestá al menos una pregunta para mandarlo.',
			errors: {}
		};
	}
	return { ok: true, answers };
}

/**
 * Lo guardado en `form_responses.answers`, sin confiar en la forma.
 * @param {unknown} json
 * @returns {FormAnswer[]}
 */
export function parseFormAnswers(json) {
	let list;
	try {
		list = typeof json === 'string' ? JSON.parse(json) : json;
	} catch {
		return [];
	}
	if (!Array.isArray(list)) return [];
	return list
		.filter((a) => a && typeof a === 'object' && typeof a.id === 'string')
		.map((a) => ({ id: a.id, label: String(a.label ?? ''), value: String(a.value ?? '') }));
}

/**
 * ¿Se guarda esta respuesta como anónima? En «Anónimo», siempre; en «Que cada persona elija», si
 * marcó «Responder anónimamente»; en «Con nombre», nunca.
 *
 * @param {Privacy} privacy
 * @param {unknown} checkbox lo que mandó la casilla
 */
export function isAnonymousResponse(privacy, checkbox) {
	if (privacy === 'anonymous') return true;
	if (privacy === 'choose') return checkbox === 'on' || checkbox === '1' || checkbox === true;
	return false;
}

/**
 * ¿El panel muestra quién respondió? Solo si la respuesta no es anónima Y el formulario hoy no es
 * anónimo: pasar un formulario con nombre a «Anónimo» esconde los nombres de lo que ya llegó.
 *
 * @param {Privacy} privacy la de hoy
 * @param {{ anonymous: boolean }} response
 */
export function showsIdentity(privacy, response) {
	return privacy !== 'anonymous' && !response.anonymous;
}

/**
 * Qué pasa con lo que ya llegó al cambiar la privacidad (el aviso del editor). `null` si no hay
 * nada que avisar.
 *
 * @param {Privacy} from
 * @param {Privacy} to
 * @param {number} responses cuántas respuestas ya hay
 */
export function privacyChangeWarning(from, to, responses) {
	if (from === to) return null;
	if (to === 'anonymous') {
		return responses
			? 'Las respuestas que ya llegaron con nombre se van a ver sin nombre. Las anónimas siguen anónimas.'
			: 'Desde ahora no se guarda quién responde.';
	}
	if (from === 'anonymous') {
		return responses
			? 'Las respuestas que ya llegaron siguen anónimas: nunca guardamos quién las mandó. Las nuevas se guardan con nombre.'
			: 'Desde ahora se guarda quién responde.';
	}
	return to === 'choose'
		? 'Desde ahora cada persona elige si responde con nombre o anónimamente.'
		: 'Desde ahora se guarda quién responde. Las respuestas anónimas siguen anónimas.';
}

/**
 * La dirección pública de un formulario: la encuesta de un evento en
 * `/calendario/<evento>/encuesta`; los demás en `/formularios/<dirección>`.
 *
 * @param {{ kind: string, slug: string, eventSlug: string | null }} form
 */
export function formPath(form) {
	return form.kind === 'survey' && form.eventSlug
		? `/calendario/${encodeURIComponent(form.eventSlug)}/encuesta`
		: `/formularios/${encodeURIComponent(form.slug)}`;
}

/**
 * La dirección de un formulario a partir de su nombre (o lo que escribió le admin).
 * @param {unknown} text
 */
export function formSlug(text) {
	return slugify(text).slice(0, SLUG_MAX).replace(/-+$/, '');
}

/** Direcciones que no puede usar un formulario (las de las plantillas). */
export function isReservedSlug(/** @type {string} */ slug) {
	return slug.startsWith('plantilla-');
}

/**
 * Una dirección libre: `base`, o `base-2`, `base-3`… si ya está usada.
 * @param {string} base
 * @param {(slug: string) => boolean} taken
 */
export function uniqueSlug(base, taken) {
	const slug0 = formSlug(base);
	const root = (isReservedSlug(slug0) ? slug0.slice('plantilla-'.length) : slug0) || 'formulario';
	if (!taken(root)) return root;
	for (let n = 2; n < 1000; n++) {
		const suffix = `-${n}`;
		const slug = `${root.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
		if (!taken(slug)) return slug;
	}
	return `${root.slice(0, 60)}-${Date.now().toString(36)}`;
}

/**
 * Mezcla una lista (las respuestas anónimas en el panel no van en el orden en que llegaron, así
 * el orden no ayuda a adivinar quién fue). `random` para las pruebas.
 *
 * @template T
 * @param {readonly T[]} list
 * @param {() => number} [random]
 * @returns {T[]}
 */
export function shuffled(list, random = Math.random) {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * @typedef {{ answers: FormAnswer[], anonymous: boolean, name?: string | null,
 *   pronouns?: string | null, email?: string | null, day: string }} ResponseRow
 */

/**
 * El resumen de la página de respuestas, por pregunta (las de hoy en su orden; después las que solo
 * están en respuestas viejas): promedio y distribución de un puntaje, cuántas veces se eligió cada
 * opción (y cuántas se marcó una casilla; en «Varias opciones», cada respuesta cuenta en todas las
 * que eligió), y la lista de textos.
 *
 * @typedef {{ id: string, label: string, kind: QuestionKind, answered: number,
 *   average?: number | null, distribution?: number[], low?: string, high?: string,
 *   counts?: { option: string, count: number }[], texts?: string[] }} SummaryItem
 *
 * @param {readonly Question[]} questions
 * @param {readonly ResponseRow[]} responses
 * @returns {SummaryItem[]}
 */
export function summarize(questions, responses) {
	/**
	 * @type {Map<string, { id: string, label: string, kind: QuestionKind, options: string[],
	 *   low?: string, high?: string }>}
	 */
	const cols = new Map(
		questions.map((q) => [
			q.id,
			{ id: q.id, label: q.label, kind: q.kind, options: q.options, low: q.low, high: q.high }
		])
	);
	for (const r of responses) {
		for (const a of r.answers) {
			// Una pregunta que ya no está: su tipo no se sabe, salvo una foto (por su clave).
			if (!cols.has(a.id))
				cols.set(a.id, {
					id: a.id,
					label: a.label,
					kind: isPhotoKey(a.value) ? 'photo' : 'text',
					options: []
				});
		}
	}
	return [...cols.values()].map((c) => {
		const values = responses
			.map((r) => r.answers.find((a) => a.id === c.id)?.value)
			.filter((v) => v !== undefined && v !== '');
		const base = { id: c.id, label: c.label, kind: c.kind, answered: values.length };
		// Las fotos se ven en cada respuesta (solo en el panel), no en el resumen.
		if (c.kind === 'photo') return base;
		if (c.kind === 'rating') {
			const nums = values.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
			return {
				...base,
				average: nums.length
					? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
					: null,
				distribution: [1, 2, 3, 4, 5].map((n) => nums.filter((x) => x === n).length),
				low: c.low || DEFAULT_LOW,
				high: c.high || DEFAULT_HIGH
			};
		}
		if (c.kind === 'multi' || c.kind === 'choice' || c.kind === 'select' || c.kind === 'checkbox') {
			// En «Varias opciones», cada respuesta cuenta en cada opción que eligió.
			return {
				...base,
				counts: tallyOptions(c, /** @type {string[]} */ (values)).map(({ option, count }) => ({
					option,
					count
				}))
			};
		}
		return { ...base, texts: /** @type {string[]} */ (values) };
	});
}

/**
 * Las filas del CSV de respuestas: una columna por pregunta y, si el formulario hoy muestra
 * nombres, «nombre», «pronombres» y «mail» (vacías en las anónimas). Fecha: solo el día. Una
 * «Foto» va como {@link PHOTO_CSV_MARK} (o vacía): nunca la foto ni su clave.
 *
 * @param {readonly Question[]} questions
 * @param {readonly ResponseRow[]} responses ya en el orden en que van
 * @param {Privacy} privacy la de hoy
 * @returns {string[][]} con la fila de títulos primero
 */
export function responsesCsvRows(questions, responses, privacy) {
	const cols = summarize(questions, responses).map((c) => ({
		id: c.id,
		label: c.label,
		photo: c.kind === 'photo'
	}));
	const withNames = privacy !== 'anonymous';
	const head = [
		'día',
		...(withNames ? ['nombre', 'pronombres', 'mail'] : []),
		...cols.map((c) => c.label)
	];
	const rows = responses.map((r) => {
		const show = showsIdentity(privacy, r);
		return [
			r.day,
			...(withNames
				? [show ? (r.name ?? '') : '', show ? (r.pronouns ?? '') : '', show ? (r.email ?? '') : '']
				: []),
			...cols.map((c) => {
				const v = r.answers.find((a) => a.id === c.id)?.value ?? '';
				return c.photo ? (v ? PHOTO_CSV_MARK : '') : v;
			})
		];
	});
	return [head, ...rows];
}

/**
 * Valida lo general de un formulario (nombre, texto de arriba, dirección, quién responde,
 * privacidad, quién ve las respuestas y el evento). Que el evento exista y venda entradas lo
 * mira el servidor. En una encuesta, quién responde es siempre «quienes tenían entrada».
 *
 * @param {Record<string, unknown>} raw
 * @param {{ kind?: 'form' | 'survey' | 'template' }} [opts]
 * @returns {{ ok: true, settings: { title: string, intro: string, slug: string, access: Access,
 *   privacy: Privacy, audience: Audience, eventSlug: string | null } }
 *   | { ok: false, errors: Record<string, string> }}
 */
export function validateFormSettings(raw, { kind = 'form' } = {}) {
	/** @type {Record<string, string>} */
	const errors = {};
	const title = oneLine(raw?.title);
	if (title.length < 2 || title.length > TITLE_MAX)
		errors.title = `Poné un nombre (entre 2 y ${TITLE_MAX} letras).`;
	const intro = longText(raw?.intro);
	if (intro.length > INTRO_MAX) errors.intro = `El texto de arriba, hasta ${INTRO_MAX} letras.`;
	const slug = formSlug(oneLine(raw?.slug) || title);
	if (kind === 'form') {
		if (!slug) errors.slug = 'Poné una dirección (letras, números y guiones).';
		else if (isReservedSlug(slug)) errors.slug = 'Esa dirección está reservada: elegí otra.';
	}
	const access = kind === 'survey' ? 'ticket' : raw?.access;
	if (!isAccess(access)) errors.access = 'Elegí quién puede responder.';
	const privacy = raw?.privacy;
	if (!isPrivacy(privacy)) errors.privacy = 'Elegí si es con nombre o anónimo.';
	const audience = raw?.audience;
	if (!isAudience(audience)) errors.audience = 'Elegí quién ve las respuestas.';
	const eventSlug = oneLine(raw?.eventSlug) || null;
	if (access === 'ticket' && !eventSlug && kind !== 'template')
		errors.eventSlug = 'Elegí el evento.';
	if (
		Object.keys(errors).length ||
		!isAccess(access) ||
		!isPrivacy(privacy) ||
		!isAudience(audience)
	)
		return { ok: false, errors };
	return {
		ok: true,
		settings: { title, intro, slug, access, privacy, audience, eventSlug }
	};
}

/**
 * ¿Les organizadores ven las respuestas? Solo si el formulario lo dice y es de un evento (sin
 * evento no hay organizadores: quedan para admins).
 * @param {{ audience: Audience, eventSlug: string | null }} form
 */
export function organizersSee(form) {
	return form.audience === 'organizers' && Boolean(form.eventSlug);
}
