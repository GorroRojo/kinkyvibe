/**
 * Editor de perfiles del panel (Contenido → Amigues, y Eventos → Lugares): edita el perfil en la
 * base, con publicación inmediata (sin PRs) y control de versión: si alguien guardó mientras se
 * editaba, no se guarda nada y la página muestra qué cambió, con lo que se había escrito intacto.
 *
 * Escribe solo con saveObject(). `kind` lo puede cambiar une admin (por ejemplo, al revisar la
 * clasificación de la importación); al cambiarlo se sacan los campos que el tipo nuevo no tiene.
 */
import { error } from '@sveltejs/kit';
import {
	ObjectError,
	VersionConflictError,
	getObject,
	saveObject,
	slugify
} from '$lib/server/objects/index.js';
import { PROFILE_TYPE, profileKind } from '$lib/server/cuentas/perfiles.js';
import perfilType, { PROFILE_KINDS, VENUE_FIELDS } from '$lib/server/objects/types/perfil.js';
import { approveNewStatement, approvalOf } from './approvals.js';
import { resolveProfileSlug } from './profiles.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/** Campos de texto (una línea o varias) que el editor manda tal cual. */
export const EDITOR_TEXT_FIELDS = Object.freeze([
	'bio',
	'body',
	'pronouns',
	'pronouns_url',
	'link_text',
	'email',
	'tel',
	'bday',
	'gender_identity',
	'job_title',
	'address',
	'area',
	'city',
	'accessibility',
	'how_to_get_there'
]);

/** Listas: una por línea (las etiquetas y autores también separadas por comas). */
export const EDITOR_LIST_FIELDS = Object.freeze(['links', 'tags', 'authors']);

/** Lo que el editor no toca y queda como estaba (imágenes y fechas de la ficha vieja, avatar). */
const KEEP_FIELDS = Object.freeze([
	'avatar',
	'featured',
	'photo',
	'logo',
	'published_date',
	'updated_date'
]);

/**
 * @typedef {{
 *   title: string, kind: string, visibility: string, version: number,
 *   text: Record<string, string>, lists: Record<string, string>,
 *   unlisted: boolean, show_members: boolean, lat: string, lng: string, venue_privacy: string
 * }} ProfileFormValues
 */

/** @param {FormData} form @param {string} key @param {number} [max] */
function field(form, key, max = 25_000) {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Lo que mandó el formulario del editor.
 *
 * @param {FormData} form
 * @returns {ProfileFormValues}
 */
export function readProfileForm(form) {
	/** @type {Record<string, string>} */
	const text = {};
	for (const key of EDITOR_TEXT_FIELDS) text[key] = field(form, key);
	/** @type {Record<string, string>} */
	const lists = {};
	for (const key of EDITOR_LIST_FIELDS) lists[key] = field(form, key, 10_000);
	return {
		title: field(form, 'title', 400),
		kind: field(form, 'kind', 20),
		visibility: field(form, 'visibility', 20),
		version: Number(field(form, 'version', 20)),
		text,
		lists,
		unlisted: form.get('unlisted') === 'on',
		show_members: form.get('show_members') === 'on',
		lat: field(form, 'lat', 40),
		lng: field(form, 'lng', 40),
		venue_privacy: field(form, 'venue_privacy', 20)
	};
}

/**
 * Los valores del formulario a partir de un perfil guardado (para abrir el editor, o para
 * mostrar lo que guardó otra persona en un conflicto).
 *
 * @param {StoredObject} o
 * @returns {ProfileFormValues}
 */
export function profileFormValues(o) {
	const d = o.data;
	/** @type {Record<string, string>} */
	const text = {};
	for (const key of EDITOR_TEXT_FIELDS) text[key] = typeof d[key] === 'string' ? d[key] : '';
	/** @type {Record<string, string>} */
	const lists = {};
	for (const key of EDITOR_LIST_FIELDS) lists[key] = Array.isArray(d[key]) ? d[key].join('\n') : '';
	return {
		title: o.title,
		kind: profileKind(d),
		visibility: o.visibility,
		version: o.version,
		text,
		lists,
		unlisted: d.unlisted === true,
		show_members: d.show_members === true,
		lat: typeof d.lat === 'number' ? String(d.lat) : '',
		lng: typeof d.lng === 'number' ? String(d.lng) : '',
		venue_privacy: typeof d.venue_privacy === 'string' ? d.venue_privacy : ''
	};
}

/**
 * Un formulario vacío (perfil nuevo).
 *
 * @param {string} [kind]
 * @returns {ProfileFormValues}
 */
export function emptyFormValues(kind = 'persona') {
	return {
		title: '',
		kind,
		visibility: 'public',
		version: 0,
		text: Object.fromEntries(EDITOR_TEXT_FIELDS.map((k) => [k, ''])),
		lists: Object.fromEntries(EDITOR_LIST_FIELDS.map((k) => [k, ''])),
		unlisted: false,
		show_members: false,
		lat: '',
		lng: '',
		venue_privacy: ''
	};
}

/**
 * Lista escrita una por línea (y, para etiquetas y autores, también con comas).
 *
 * @param {string} key
 * @param {string} raw
 * @returns {string[]}
 */
export function parseList(key, raw) {
	const parts = key === 'links' ? raw.split(/\r?\n/) : raw.split(/[\r\n,]+/);
	return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Un número escrito a mano ("-34,6037" o "-34.6037"), o `undefined` si está vacío. Lo que no es
 * un número queda como texto para que la validación del tipo lo marque.
 *
 * @param {string} raw
 * @returns {number | string | undefined}
 */
export function parseCoordinate(raw) {
	const t = raw.trim().replace(',', '.');
	if (!t) return undefined;
	const n = Number(t);
	return Number.isFinite(n) ? n : t;
}

/**
 * `data` del perfil a partir del formulario. Lo que el editor no maneja queda como estaba; al
 * cambiar de tipo se sacan los campos que el tipo nuevo no tiene (integrantes, campos de lugar).
 *
 * @param {ProfileFormValues} values
 * @param {Record<string, unknown>} [current]
 * @returns {Record<string, unknown>}
 */
export function formToData(values, current = {}) {
	const kind = values.kind;
	/** @type {Record<string, unknown>} */
	const data = { kind };
	for (const key of KEEP_FIELDS) if (current[key] !== undefined) data[key] = current[key];
	for (const key of EDITOR_TEXT_FIELDS) {
		if (kind !== 'lugar' && VENUE_FIELDS.includes(key)) continue;
		const v = values.text[key] ?? '';
		if (v.trim()) data[key] = v;
	}
	for (const key of EDITOR_LIST_FIELDS) {
		const list = parseList(key, values.lists[key] ?? '');
		if (list.length) data[key] = list;
	}
	if (values.unlisted) data.unlisted = true;
	if (kind === 'grupo') data.show_members = values.show_members;
	if (kind === 'lugar') {
		const lat = parseCoordinate(values.lat);
		const lng = parseCoordinate(values.lng);
		if (lat !== undefined) data.lat = lat;
		if (lng !== undefined) data.lng = lng;
		if (values.venue_privacy) data.venue_privacy = values.venue_privacy;
	}
	return data;
}

/**
 * Los campos que difieren entre dos versiones del formulario (para el aviso de conflicto).
 *
 * @param {ProfileFormValues} a
 * @param {ProfileFormValues} b
 * @returns {string[]} claves (las de `text`/`lists` sin prefijo)
 */
export function changedFields(a, b) {
	/** @type {string[]} */
	const out = [];
	for (const key of ['title', 'kind', 'visibility', 'lat', 'lng', 'venue_privacy']) {
		if (String(/** @type {any} */ (a)[key] ?? '') !== String(/** @type {any} */ (b)[key] ?? ''))
			out.push(key);
	}
	for (const key of ['unlisted', 'show_members']) {
		if (Boolean(/** @type {any} */ (a)[key]) !== Boolean(/** @type {any} */ (b)[key])) out.push(key);
	}
	for (const key of EDITOR_TEXT_FIELDS) {
		if ((a.text[key] ?? '').trim() !== (b.text[key] ?? '').trim()) out.push(key);
	}
	for (const key of EDITOR_LIST_FIELDS) {
		if (parseList(key, a.lists[key] ?? '').join('\n') !== parseList(key, b.lists[key] ?? '').join('\n'))
			out.push(key);
	}
	return out;
}

/**
 * El nombre para mostrar de un campo del editor (los del tipo `perfil`, más nombre y visibilidad).
 *
 * @param {string} key
 */
export function fieldLabel(key) {
	if (key === 'title') return 'Nombre';
	if (key === 'visibility') return 'Visibilidad';
	return perfilType.fields[key]?.label ?? key;
}

/**
 * Lo que cambió otra persona, para el aviso de conflicto: campo, nombre y lo que quedó guardado.
 *
 * @param {ProfileFormValues} yours
 * @param {ProfileFormValues} theirs
 * @returns {{ field: string, label: string, theirs: string }[]}
 */
export function conflictChanges(yours, theirs) {
	return changedFields(yours, theirs).map((field) => {
		const t = /** @type {any} */ (theirs);
		const value =
			field in theirs.text
				? theirs.text[field]
				: field in theirs.lists
					? theirs.lists[field]
					: typeof t[field] === 'boolean'
						? t[field]
							? 'sí'
							: 'no'
						: String(t[field] ?? '');
		return { field, label: fieldLabel(field), theirs: value };
	});
}

/** Admin que mira (las lecturas del panel ven también lo oculto). */
const ADMIN_VIEWER = /** @type {const} */ ({ role: 'admin', id: 'panel' });

/**
 * El perfil que abre el editor, por la dirección de /amigues (vieja o nueva). `null` si no hay
 * perfil con esa dirección o está borrado.
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 */
export async function loadEditableProfile(db, urlSlug) {
	const ref = await resolveProfileSlug(db, urlSlug);
	if (!ref) return null;
	const object = await getObject(db, { id: ref.id }, ADMIN_VIEWER);
	if (!object || object.type !== PROFILE_TYPE) return null;
	const source = await db
		.prepare(
			`SELECT legacy_slug, suggested_kind, kind_reason, kind_confirmed_at, kind_confirmed_by,
				imported_at FROM profile_sources WHERE profile_id = ?1`
		)
		.bind(object.id)
		.first();
	return {
		object,
		legacySlug: ref.legacySlug,
		approval: await approvalOf(db, object.id),
		source: source
			? {
					legacySlug: String(source.legacy_slug),
					suggestedKind: String(source.suggested_kind),
					reason: String(source.kind_reason ?? ''),
					confirmedAt: source.kind_confirmed_at == null ? null : Number(source.kind_confirmed_at),
					confirmedBy: source.kind_confirmed_by == null ? null : String(source.kind_confirmed_by),
					importedAt: Number(source.imported_at)
				}
			: null
	};
}

/**
 * @typedef {{ ok: true, profile: StoredObject }
 *   | { ok: false, status: number, message: string, errors?: Record<string, string>,
 *       conflict?: { version: number, changes: { field: string, label: string, theirs: string }[] } }} EditorSaveResult
 */

/**
 * Traduce los errores de saveObject al formulario.
 *
 * @param {unknown} e
 * @returns {EditorSaveResult}
 */
function saveFailure(e) {
	if (e instanceof ObjectError) {
		/** @type {Record<string, string>} */
		const errors = {};
		for (const x of e.errors) errors[x.path.split('.')[0] || 'form'] ??= x.message;
		return { ok: false, status: e.status === 409 ? 409 : 400, message: e.message, errors };
	}
	throw e;
}

/**
 * Guarda lo que mandó el editor sobre un perfil existente.
 *
 * @param {D1Database} db
 * @param {StoredObject} current el perfil como estaba al recibir el pedido
 * @param {ProfileFormValues} values
 * @param {{ actor: string, now?: number }} opts
 * @returns {Promise<EditorSaveResult>}
 */
export async function saveProfileFromPanel(db, current, values, { actor, now = Date.now() }) {
	if (!(/** @type {readonly string[]} */ (PROFILE_KINDS).includes(values.kind))) {
		return {
			ok: false,
			status: 400,
			message: 'Elegí el tipo de perfil.',
			errors: { kind: 'Elegí persona, grupo o lugar.' }
		};
	}
	try {
		const profile = await saveObject(
			db,
			{
				id: current.id,
				type: PROFILE_TYPE,
				version: values.version,
				title: values.title.trim(),
				data: formToData(values, current.data),
				visibility: /** @type {any} */ (values.visibility || current.visibility)
			},
			{ actor, now }
		);
		return { ok: true, profile };
	} catch (e) {
		if (e instanceof VersionConflictError) {
			const latest = await getObject(db, { id: current.id }, ADMIN_VIEWER, { includeDeleted: true });
			if (!latest) return { ok: false, status: 404, message: 'Ese perfil ya no existe.' };
			const theirs = profileFormValues(latest);
			return {
				ok: false,
				status: 409,
				message:
					'Alguien más guardó cambios en este perfil mientras lo editabas, así que no guardamos los tuyos. Tus cambios siguen en el formulario; abajo ves qué cambió.',
				conflict: { version: latest.version, changes: conflictChanges(values, theirs) }
			};
		}
		return saveFailure(e);
	}
}

/**
 * Crea un perfil desde el panel (por ejemplo, un lugar nuevo). Nace aprobado para /amigues.
 *
 * @param {D1Database} db
 * @param {ProfileFormValues} values
 * @param {{ actor: string, now?: number }} opts
 * @returns {Promise<EditorSaveResult>}
 */
export async function createProfileFromPanel(db, values, { actor, now = Date.now() }) {
	if (!(/** @type {readonly string[]} */ (PROFILE_KINDS).includes(values.kind))) {
		return { ok: false, status: 400, message: 'Elegí el tipo de perfil.' };
	}
	const title = values.title.trim();
	const base = slugify(title) || 'perfil';
	for (const slug of [base, `${base.slice(0, 80)}-${Date.now().toString(36).slice(-5)}`]) {
		try {
			const profile = await saveObject(
				db,
				{
					type: PROFILE_TYPE,
					title,
					slug,
					data: formToData(values),
					visibility: /** @type {any} */ (values.visibility || 'public')
				},
				{ actor, now, also: (self) => [approveNewStatement(db, self, actor, now)] }
			);
			return { ok: true, profile };
		} catch (e) {
			if (e instanceof ObjectError && e.code === 'slug_taken') continue;
			return saveFailure(e);
		}
	}
	return { ok: false, status: 409, message: 'No pudimos armar una dirección para ese nombre.' };
}

/**
 * Marca como confirmado el tipo de una ficha importada (sale de "a confirmar").
 *
 * @param {D1Database} db
 * @param {number} profileId
 * @param {string} by
 * @param {{ now?: number }} [opts]
 */
export async function confirmKind(db, profileId, by, { now = Date.now() } = {}) {
	const r = await db
		.prepare(
			`UPDATE profile_sources SET kind_confirmed_at = ?2, kind_confirmed_by = ?3
			WHERE profile_id = ?1`
		)
		.bind(profileId, now, by)
		.run();
	return r.meta.changes > 0;
}

/**
 * Para las rutas del editor: el perfil o 404.
 *
 * @param {D1Database} db
 * @param {string} urlSlug
 */
export async function requireEditableProfile(db, urlSlug) {
	const found = await loadEditableProfile(db, urlSlug);
	if (!found) error(404, 'No encontramos ese perfil.');
	return found;
}
