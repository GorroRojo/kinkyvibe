/**
 * Formularios en D1 (migración 0079; docs/formularios.md). Las reglas de forma (preguntas,
 * respuestas, privacidad) están en src/lib/utils/formularios.js.
 *
 * - `forms`: cada formulario, encuesta de evento o plantilla, con sus preguntas en orden (JSON).
 * - `form_responses`: cada respuesta. Si es anónima, NO se escribe nombre, mail, cuenta, orden ni
 *   hora: {@link saveResponse} ni siquiera los manda (y un CHECK de la tabla lo controla igual).
 * - `form_sends`: el link personal de un formulario para quienes tenían entrada (send.js) y si ya
 *   se usó (sirve una vez).
 *
 * Borrar es suave (`deleted_at`, migración 0080, decisión 0033): lo borrado no se lista, no se
 * responde ni se manda, y vuelve con sus respuestas desde Actividad (`deleteForm`, `restoreForm`).
 */
import { argDate } from '$lib/utils/dates.js';
import { parseFormAnswers, parseStoredQuestions, uniqueSlug } from '$lib/utils/formularios.js';
import { getFormDefaults } from './defaults.js';
import { SURVEY_TEMPLATE_SLUG, ensureTemplates } from './templates.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/formularios.js').Question} Question */
/** @typedef {import('$lib/utils/formularios.js').FormAnswer} FormAnswer */
/** @typedef {import('$lib/utils/formularios.js').Access} Access */
/** @typedef {import('$lib/utils/formularios.js').Privacy} Privacy */
/** @typedef {import('$lib/utils/formularios.js').Audience} Audience */

/**
 * @typedef {{
 *   id: number,
 *   slug: string,
 *   kind: 'form' | 'survey' | 'template',
 *   title: string,
 *   intro: string,
 *   questions: Question[],
 *   access: Access,
 *   privacy: Privacy,
 *   audience: Audience,
 *   eventSlug: string | null,
 *   open: boolean,
 *   sendAt: number | null,
 *   createdAt: number,
 *   updatedAt: number,
 *   updatedBy: string,
 *   mailSubject: string,
 *   mailBody: string
 * }} Form
 */

export { SURVEY_TEMPLATE_SLUG };

const COLUMNS = `id, slug, kind, title, intro, questions, access, privacy, audience, event_slug, open,
	send_at, created_at, updated_at, updated_by, mail_subject, mail_body`;

/** Lo que no está borrado (borrado suave, migración 0080). */
const LIVE = 'deleted_at IS NULL';

/**
 * @param {Record<string, unknown>} r
 * @returns {Form}
 */
export function rowToForm(r) {
	const kind = r.kind === 'survey' || r.kind === 'template' ? r.kind : 'form';
	return {
		id: Number(r.id),
		slug: String(r.slug),
		kind,
		title: String(r.title ?? ''),
		intro: String(r.intro ?? ''),
		questions: parseStoredQuestions(r.questions),
		access: /** @type {Access} */ (r.access),
		privacy: /** @type {Privacy} */ (r.privacy),
		audience: /** @type {Audience} */ (r.audience),
		eventSlug: r.event_slug == null ? null : String(r.event_slug),
		open: Number(r.open) === 1,
		sendAt: r.send_at == null ? null : Number(r.send_at),
		createdAt: Number(r.created_at),
		updatedAt: Number(r.updated_at),
		updatedBy: String(r.updated_by ?? ''),
		mailSubject: String(r.mail_subject ?? ''),
		mailBody: String(r.mail_body ?? '')
	};
}

/**
 * Todos los formularios (y encuestas y plantillas), con cuántas respuestas tiene cada uno.
 *
 * @param {D1Database} db
 * @returns {Promise<(Form & { responses: number })[]>}
 */
export async function listForms(db) {
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS}, (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = forms.id)
				AS responses
			FROM forms WHERE ${LIVE} ORDER BY kind = 'template', updated_at DESC, id DESC`
		)
		.all();
	return results.map((r) => ({ ...rowToForm(r), responses: Number(r.responses ?? 0) }));
}

/**
 * @param {D1Database} db
 * @param {number} id
 * @returns {Promise<Form | null>}
 */
export async function getForm(db, id) {
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	const r = await db
		.prepare(`SELECT ${COLUMNS} FROM forms WHERE id = ?1 AND ${LIVE}`)
		.bind(id)
		.first();
	return r ? rowToForm(r) : null;
}

/**
 * Un formulario común por su dirección (las plantillas y las encuestas no tienen página propia).
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<Form | null>}
 */
export async function getFormBySlug(db, slug) {
	const r = await db
		.prepare(`SELECT ${COLUMNS} FROM forms WHERE slug = ?1 AND kind = 'form' AND ${LIVE}`)
		.bind(slug)
		.first();
	return r ? rowToForm(r) : null;
}

/**
 * La encuesta de un evento, si ya existe.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<Form | null>}
 */
export async function getEventSurvey(db, eventSlug) {
	const r = await db
		.prepare(`SELECT ${COLUMNS} FROM forms WHERE kind = 'survey' AND event_slug = ?1 AND ${LIVE}`)
		.bind(eventSlug)
		.first();
	return r ? rowToForm(r) : null;
}

/**
 * Los formularios de un evento que pueden ver sus organizadores (no las plantillas ni los que son
 * solo para admins), con cuántas respuestas tiene cada uno.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 */
export async function organizerForms(db, eventSlug) {
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS}, (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = forms.id)
				AS responses
			FROM forms WHERE event_slug = ?1 AND audience = 'organizers' AND kind != 'template'
				AND ${LIVE}
			ORDER BY kind = 'survey' DESC, id`
		)
		.bind(eventSlug)
		.all();
	return results.map((r) => ({ ...rowToForm(r), responses: Number(r.responses ?? 0) }));
}

/**
 * ¿La encuesta de este evento está borrada? (Borrarla la apaga para ese evento.)
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 */
export async function eventSurveyDeleted(db, eventSlug) {
	const r = await db
		.prepare(
			"SELECT id FROM forms WHERE kind = 'survey' AND event_slug = ?1 AND deleted_at IS NOT NULL"
		)
		.bind(eventSlug)
		.first();
	return r ? Number(r.id) : null;
}

/**
 * Los formularios de un evento (su encuesta y los que lo eligieron), para su ficha: sin plantillas
 * ni borrados, la encuesta primero, con cuántas respuestas tiene cada uno.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 */
export async function eventForms(db, eventSlug) {
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS}, (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = forms.id)
				AS responses
			FROM forms WHERE event_slug = ?1 AND kind != 'template' AND ${LIVE}
			ORDER BY kind = 'survey' DESC, id`
		)
		.bind(eventSlug)
		.all();
	return results.map((r) => ({ ...rowToForm(r), responses: Number(r.responses ?? 0) }));
}

/**
 * ¿Está usada esta dirección (por otro formulario que `exceptId`)?
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {number} [exceptId]
 */
export async function slugTaken(db, slug, exceptId = 0) {
	const r = await db
		.prepare('SELECT 1 FROM forms WHERE slug = ?1 AND id != ?2')
		.bind(slug, exceptId)
		.first();
	return Boolean(r);
}

/**
 * Una dirección libre a partir de `base` (ver `uniqueSlug`).
 * @param {D1Database} db
 * @param {string} base
 */
async function freeSlug(db, base) {
	const root = uniqueSlug(base, () => false);
	const { results } = await db
		.prepare("SELECT slug FROM forms WHERE slug = ?1 OR slug LIKE ?1 || '-%'")
		.bind(root)
		.all();
	const taken = new Set(results.map((r) => String(r.slug)));
	return uniqueSlug(base, (s) => taken.has(s));
}

/**
 * Copia un formulario (o una plantilla) en uno nuevo, cerrado. Para la encuesta de un evento:
 * `kind: 'survey'` y `eventSlug`.
 *
 * @param {D1Database} db
 * @param {number} sourceId
 * @param {{ by: string, now?: number, kind?: 'form' | 'survey', eventSlug?: string | null,
 *   open?: boolean, title?: string, privacy?: Privacy, audience?: Audience }} opts `privacy` y
 *   `audience`: en vez de los del origen (la encuesta nueva toma los de «Cómo salen por defecto»)
 * @returns {Promise<number | null>} el id nuevo, o `null` si no existe el de origen
 */
export async function copyForm(
	db,
	sourceId,
	{ by, now = Date.now(), kind = 'form', eventSlug = null, open = false, title, privacy, audience }
) {
	const source = await getForm(db, sourceId);
	if (!source) return null;
	const newTitle = title ?? (source.kind === 'template' ? source.title : `${source.title} (copia)`);
	const slug = await freeSlug(db, kind === 'survey' ? `encuesta-${eventSlug}` : newTitle);
	const evt = kind === 'survey' ? eventSlug : (eventSlug ?? source.eventSlug);
	// Un «quienes tenían entrada» sin evento no se puede responder: queda «cualquiera con el link».
	const access =
		kind === 'survey' ? 'ticket' : source.access === 'ticket' && !evt ? 'link' : source.access;
	const row = await db
		.prepare(
			`INSERT INTO forms (slug, kind, title, intro, questions, access, privacy, audience,
				event_slug, open, created_at, updated_at, updated_by, mail_subject, mail_body)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12, ?13, ?14)
			ON CONFLICT DO NOTHING RETURNING id`
		)
		.bind(
			slug,
			kind,
			newTitle.slice(0, 120),
			source.intro,
			JSON.stringify(source.questions),
			access,
			privacy ?? source.privacy,
			audience ?? source.audience,
			evt,
			open ? 1 : 0,
			now,
			by,
			source.mailSubject,
			source.mailBody
		)
		.first();
	return row ? Number(row.id) : null;
}

/**
 * La encuesta del evento: la que ya tiene o una copia nueva de la plantilla de la encuesta, con la
 * privacidad y quién ve las respuestas de «Cómo salen por defecto» (`defaults.js`). Abierta (se
 * manda sola) si la encuesta sale sola, salvo que se pida otra cosa con `open`.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ by: string, now?: number, open?: boolean,
 *   defaults?: import('./defaults.js').FormDefaults }} opts
 * @returns {Promise<Form | null>} `null` si no hay plantilla
 */
export async function ensureEventSurvey(db, eventSlug, { by, now = Date.now(), open, defaults }) {
	const found = await getEventSurvey(db, eventSlug);
	if (found) return found;
	// Una encuesta borrada apaga la encuesta de ese evento (hasta que se recupere desde Actividad).
	if (await eventSurveyDeleted(db, eventSlug)) return null;
	const d = defaults ?? (await getFormDefaults(db));
	await ensureTemplates(db, now);
	const template = await db
		.prepare("SELECT id FROM forms WHERE slug = ?1 AND kind = 'template'")
		.bind(SURVEY_TEMPLATE_SLUG)
		.first();
	if (!template) return null;
	// Si dos pedidos la crean a la vez, el índice único de la encuesta deja una sola.
	await copyForm(db, Number(template.id), {
		by,
		now,
		kind: 'survey',
		eventSlug,
		open: open ?? d.surveyAuto,
		privacy: d.surveyPrivacy,
		audience: d.surveyAudience
	});
	return getEventSurvey(db, eventSlug);
}

/**
 * Crea un formulario vacío (cerrado), con una dirección libre a partir de su nombre, y quién
 * responde y la privacidad de «Cómo salen por defecto» (`defaults.js`; si no se cambiaron,
 * cualquiera con el link y con nombre). Las respuestas, solo admins.
 *
 * @param {D1Database} db
 * @param {{ title: string }} input
 * @param {{ by: string, now?: number, defaults?: import('./defaults.js').FormDefaults }} opts
 */
export async function createForm(db, { title }, { by, now = Date.now(), defaults }) {
	const d = defaults ?? (await getFormDefaults(db));
	const slug = await freeSlug(db, title);
	const row = await db
		.prepare(
			`INSERT INTO forms (slug, kind, title, access, privacy, audience, open, created_at,
				updated_at, updated_by)
			VALUES (?1, 'form', ?2, ?5, ?6, 'admins', 0, ?3, ?3, ?4) RETURNING id`
		)
		.bind(slug, title.slice(0, 120), now, by, d.formAccess, d.formPrivacy)
		.first();
	return Number(row?.id);
}

/**
 * Guarda un formulario: lo general (ya validado) y sus preguntas (ya validadas, en su orden).
 * Devuelve `'slug'` si la dirección ya es de otro, `'missing'` si no existe.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {{ title: string, intro: string, slug: string, access: Access, privacy: Privacy,
 *   audience: Audience, eventSlug: string | null, questions: Question[] }} input
 * @param {{ by: string, now?: number }} opts
 * @returns {Promise<'ok' | 'slug' | 'missing'>}
 */
export async function saveForm(db, id, input, { by, now = Date.now() }) {
	const form = await getForm(db, id);
	if (!form) return 'missing';
	// Las encuestas y las plantillas conservan su dirección (no tienen página propia).
	const slug = form.kind === 'form' ? input.slug : form.slug;
	if (form.kind === 'form' && (await slugTaken(db, slug, id))) return 'slug';
	const access = form.kind === 'survey' ? 'ticket' : input.access;
	const eventSlug = form.kind === 'survey' ? form.eventSlug : input.eventSlug;
	try {
		await db
			.prepare(
				`UPDATE forms SET slug = ?2, title = ?3, intro = ?4, questions = ?5, access = ?6,
					privacy = ?7, audience = ?8, event_slug = ?9, updated_at = ?10, updated_by = ?11
				WHERE id = ?1`
			)
			.bind(
				id,
				slug,
				input.title,
				input.intro,
				JSON.stringify(input.questions),
				access,
				input.privacy,
				input.audience,
				eventSlug,
				now,
				by
			)
			.run();
	} catch (e) {
		if (/UNIQUE/i.test(String(e))) return 'slug';
		throw e;
	}
	return 'ok';
}

/**
 * Abre o cierra un formulario (en una encuesta: también si se manda).
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {boolean} open
 * @param {{ by: string, now?: number }} opts
 */
export async function setFormOpen(db, id, open, { by, now = Date.now() }) {
	const res = await db
		.prepare(
			"UPDATE forms SET open = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1 AND kind != 'template'"
		)
		.bind(id, open ? 1 : 0, now, by)
		.run();
	return res.meta.changes === 1;
}

/**
 * Pide mandar el link personal de un formulario «quienes tenían entrada» (no encuesta): desde
 * ahora, a las órdenes aprobadas de su evento (lo manda el cron, send.js).
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {{ by: string, now?: number }} opts
 */
export async function requestFormSend(db, id, { by, now = Date.now() }) {
	const res = await db
		.prepare(
			`UPDATE forms SET send_at = ?2, open = 1, updated_at = ?2, updated_by = ?3
			WHERE id = ?1 AND kind = 'form' AND access = 'ticket'`
		)
		.bind(id, now, by)
		.run();
	return res.meta.changes === 1;
}

/**
 * Quién respondió, solo en las respuestas con nombre (nombre, pronombre y mail son lo que define si
 * una respuesta es anónima: una anónima no guarda ninguno).
 * @typedef {{ name?: string | null, pronouns?: string | null, email?: string | null,
 *   accountId?: string | null, orderId?: string | null }} Identity
 */

/**
 * Guarda una respuesta. Con `identity: null` es anónima: solo las respuestas y el día (ni la
 * hora). Con `invite` (el link personal de quien tenía entrada) la guarda solo si ese link no se
 * usó, y lo marca usado en la MISMA tanda: dos envíos a la vez no guardan dos respuestas.
 *
 * @param {D1Database} db
 * @param {{ formId: number, answers: FormAnswer[], identity: Identity | null,
 *   invite?: { orderId: string } | null, now?: number }} input
 * @returns {Promise<'ok' | 'used'>}
 */
export async function saveResponse(
	db,
	{ formId, answers, identity, invite = null, now = Date.now() }
) {
	const day = argDate(new Date(now));
	const json = JSON.stringify(answers.map(({ id, label, value }) => ({ id, label, value })));
	const insert = identity
		? db
				.prepare(
					`INSERT INTO form_responses (form_id, answers, day, anonymous, name, email, account_id,
						order_id, created_at, pronouns)
					SELECT ?1, ?2, ?3, 0, ?4, ?5, ?6, ?7, ?8, ?10
					WHERE ?9 IS NULL OR EXISTS (SELECT 1 FROM form_sends
						WHERE form_id = ?1 AND order_id = ?9 AND used = 0)`
				)
				.bind(
					formId,
					json,
					day,
					identity.name?.slice(0, 120) || null,
					identity.email?.slice(0, 254) || null,
					identity.accountId || null,
					identity.orderId || null,
					now,
					invite?.orderId ?? null,
					identity.pronouns?.slice(0, 60) || null
				)
		: db
				.prepare(
					`INSERT INTO form_responses (form_id, answers, day, anonymous)
					SELECT ?1, ?2, ?3, 1
					WHERE ?4 IS NULL OR EXISTS (SELECT 1 FROM form_sends
						WHERE form_id = ?1 AND order_id = ?4 AND used = 0)`
				)
				.bind(formId, json, day, invite?.orderId ?? null);
	if (!invite) {
		await insert.run();
		return 'ok';
	}
	const [inserted] = await db.batch([
		insert,
		db
			.prepare('UPDATE form_sends SET used = 1 WHERE form_id = ?1 AND order_id = ?2 AND used = 0')
			.bind(formId, invite.orderId)
	]);
	return inserted.meta.changes === 1 ? 'ok' : 'used';
}

/**
 * ¿Ya se usó el link personal de esta orden? `null` si no hay link (no se le mandó).
 *
 * @param {D1Database} db
 * @param {number} formId
 * @param {string} orderId
 * @returns {Promise<boolean | null>}
 */
export async function inviteUsed(db, formId, orderId) {
	const r = await db
		.prepare('SELECT used FROM form_sends WHERE form_id = ?1 AND order_id = ?2')
		.bind(formId, orderId)
		.first();
	return r ? Number(r.used) === 1 : null;
}

/**
 * @typedef {{ id: number, answers: FormAnswer[], anonymous: boolean, name: string | null,
 *   pronouns: string | null, email: string | null, accountId: string | null, orderId: string | null, day: string,
 *   createdAt: number | null }} StoredResponse
 */

/**
 * Las respuestas de un formulario, de la más vieja a la más nueva (quien las muestra decide si
 * van mezcladas).
 *
 * @param {D1Database} db
 * @param {number} formId
 * @returns {Promise<StoredResponse[]>}
 */
export async function listResponses(db, formId) {
	const { results } = await db
		.prepare(
			`SELECT id, answers, anonymous, name, pronouns, email, account_id, order_id, day, created_at
			FROM form_responses WHERE form_id = ?1 ORDER BY id`
		)
		.bind(formId)
		.all();
	return results.map((r) => ({
		id: Number(r.id),
		answers: parseFormAnswers(r.answers),
		anonymous: Number(r.anonymous) === 1,
		name: r.name == null ? null : String(r.name),
		pronouns: r.pronouns == null ? null : String(r.pronouns),
		email: r.email == null ? null : String(r.email),
		accountId: r.account_id == null ? null : String(r.account_id),
		orderId: r.order_id == null ? null : String(r.order_id),
		day: String(r.day),
		createdAt: r.created_at == null ? null : Number(r.created_at)
	}));
}

/**
 * Cuántas respuestas tiene un formulario.
 * @param {D1Database} db
 * @param {number} formId
 */
export async function responseCount(db, formId) {
	const r = await db
		.prepare('SELECT COUNT(*) AS n FROM form_responses WHERE form_id = ?1')
		.bind(formId)
		.first();
	return Number(r?.n ?? 0);
}

/**
 * Cómo van los links personales de un formulario: mandados, fallados, pendientes de reintento y
 * usados.
 *
 * @param {D1Database} db
 * @param {number} formId
 */
export async function sendStats(db, formId) {
	const r = await db
		.prepare(
			`SELECT
				SUM(status = 'sent') AS sent,
				SUM(status = 'failed') AS failed,
				SUM(status IN ('sending', 'retry')) AS pending,
				SUM(used) AS used
			FROM form_sends WHERE form_id = ?1`
		)
		.bind(formId)
		.first();
	return {
		sent: Number(r?.sent ?? 0),
		failed: Number(r?.failed ?? 0),
		pending: Number(r?.pending ?? 0),
		used: Number(r?.used ?? 0)
	};
}

/**
 * Guarda el asunto y el texto del mail con el link personal de un formulario (encuesta o «quienes
 * tenían entrada»). Vacío = lo de «Cómo salen por defecto». Ya validados.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {{ subject: string, body: string }} mail
 * @param {{ by: string, now?: number }} opts
 */
export async function saveFormMail(db, id, { subject, body }, { by, now = Date.now() }) {
	const res = await db
		.prepare(
			`UPDATE forms SET mail_subject = ?2, mail_body = ?3, updated_at = ?4, updated_by = ?5
			WHERE id = ?1 AND ${LIVE}`
		)
		.bind(id, subject, body, now, by)
		.run();
	return res.meta.changes === 1;
}

/** `panel_deletions.path` de un formulario (decisión 0033). @param {number} id */
export const formDeletionPath = (id) => `formulario:${id}`;

/**
 * Borra un formulario (suave): queda con sus respuestas y vuelve desde Actividad. Una encuesta
 * borrada no se manda más (es como apagarla para ese evento). Las plantillas no se borran (se
 * vuelven a crear solas). La fila de «Borrados que podés recuperar» va en la misma tanda.
 *
 * @param {D1Database} db
 * @param {Form} form
 * @param {{ by: string, now?: number }} opts
 * @returns {Promise<boolean>}
 */
export async function deleteForm(db, form, { by, now = Date.now() }) {
	if (form.kind === 'template') return false;
	const { softDeletionStatement } = await import('$lib/server/admin/deletions.js');
	const [res] = await db.batch([
		db
			.prepare(
				`UPDATE forms SET deleted_at = ?2, open = 0, updated_at = ?2, updated_by = ?3
				WHERE id = ?1 AND ${LIVE} AND kind != 'template'`
			)
			.bind(form.id, now, by),
		await softDeletionStatement(
			db,
			{
				kind: 'calendario',
				slug: form.eventSlug ?? '',
				title: form.kind === 'survey' ? `Encuesta de ${form.eventSlug}` : form.title,
				path: formDeletionPath(form.id),
				object: form.id
			},
			{ login: by, now }
		)
	]);
	return res.meta.changes === 1;
}

/**
 * La sentencia que vuelve a poner un formulario borrado, con sus respuestas (para la tanda de
 * `undoDeletion`). Vuelve cerrado (borrarlo lo cerró): una encuesta se prende desde la ficha del
 * evento, así no sale sola de golpe.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {{ by: string, now?: number }} opts
 */
export async function restoreFormStatement(db, id, { by, now = Date.now() }) {
	return db
		.prepare(
			`UPDATE forms SET deleted_at = NULL, updated_at = ?2, updated_by = ?3
			WHERE id = ?1 AND deleted_at IS NOT NULL`
		)
		.bind(id, now, by);
}

/**
 * Los links personales que fallaron todos sus intentos (no se reintentan solos), por formulario:
 * para «Para revisar». Sin los formularios borrados.
 *
 * @param {D1Database} db
 */
export function failedFormSendsStatement(db) {
	return db.prepare(
		`SELECT f.id, f.kind, f.title, f.event_slug, COUNT(*) AS n FROM form_sends s
		JOIN forms f ON f.id = s.form_id AND f.deleted_at IS NULL
		WHERE s.status = 'failed' GROUP BY f.id ORDER BY f.id`
	);
}

/**
 * @param {Record<string, unknown>[]} rows lo que devolvió {@link failedFormSendsStatement}
 * @returns {{ id: number, kind: string, title: string, eventSlug: string | null, count: number }[]}
 */
export function readFailedFormSends(rows) {
	return rows.map((r) => ({
		id: Number(r.id),
		kind: String(r.kind),
		title: String(r.title ?? ''),
		eventSlug: r.event_slug == null ? null : String(r.event_slug),
		count: Number(r.n ?? 0)
	}));
}

/**
 * «Reintentar» desde «Para revisar»: los links de un formulario que fallaron vuelven a la cola
 * (con sus intentos en cero; los manda el próximo cron). Devuelve cuántos.
 *
 * @param {D1Database} db
 * @param {number} formId
 */
export async function retryFailedFormSends(db, formId) {
	const res = await db
		.prepare(
			`UPDATE form_sends SET status = 'retry', attempts = 0
			WHERE form_id = ?1 AND status = 'failed'`
		)
		.bind(formId)
		.run();
	return res.meta.changes ?? 0;
}

/**
 * Al duplicar un evento: la copia lleva su encuesta como estaba (prendida o apagada, preguntas,
 * privacidad, quién ve las respuestas y el mail), sin respuestas ni envíos. Si el original no tenía
 * encuesta (o la tenía borrada), nada: la copia arranca con lo de «Cómo salen por defecto». Si la
 * copia ya tiene encuesta, no se toca. Devuelve el id nuevo o `null`.
 *
 * Los demás formularios atados al evento original no se copian: son de ese evento (sus links
 * personales ya salieron a quienes tenían entrada para él).
 *
 * @param {D1Database} db
 * @param {string} fromSlug
 * @param {string} toSlug
 * @param {{ by: string, now?: number }} opts
 */
export async function copyEventSurvey(db, fromSlug, toSlug, { by, now = Date.now() }) {
	const source = await getEventSurvey(db, fromSlug);
	if (!source || (await getEventSurvey(db, toSlug))) return null;
	return copyForm(db, source.id, {
		by,
		now,
		kind: 'survey',
		eventSlug: toSlug,
		open: source.open,
		title: source.title
	});
}
