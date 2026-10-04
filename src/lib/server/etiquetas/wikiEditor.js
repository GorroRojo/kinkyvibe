/**
 * Etiquetas › «Entrada de la Kinkipedia» (`/admin/etiquetas/wiki/<dirección>`): el texto de la wiki
 * de una etiqueta, editado y guardado en la base al momento (sin GitHub; «solo base»). Es la
 * página de `/wiki/<dirección>` (src/lib/server/etiquetas/wikiPages.js).
 *
 * - Escribe solo con saveObject(), sobre la etiqueta: cambia su texto de la wiki y nada más (ni su
 *   nombre, ni sus relaciones, ni su descripción). Cada guardado queda en el historial
 *   (`object_revisions`) y en Actividad.
 * - Control de versión: si alguien guardó la etiqueta mientras se editaba, no se guarda nada y la
 *   página lo avisa, con lo escrito intacto.
 * - Cómo se muestra el texto (`wiki_body_html`): como en los eventos, si no cambió queda como
 *   estaba; si cambió, HTML libre si guarda une superadmin (todes les admins del panel, decisión
 *   0003) y la lista corta si no.
 */
import { VersionConflictError, ObjectError } from '$lib/server/objects/errors.js';
import { saveObject } from '$lib/server/objects/save.js';
import { TAG_TYPE } from '$lib/server/objects/types/etiqueta.js';
import { readFicha } from '$lib/server/contenido/fichas.js';
import { revisionStatement } from '$lib/server/contenido/revisions.js';
import { asTextList as strList, asText as str } from '$lib/utils/text.js';
import { clearTagSourceCache } from './source.js';
import { hasWikiPage, wikiBodyHtmlFor, withWikiPage } from './wikiPages.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/objects/read.js').StoredObject} StoredObject */

/**
 * @typedef {{ title: string, summary: string, authors: string, tags: string, body: string, version: number }} WikiFormValues
 *   `authors` y `tags`: una por línea (o separadas por comas).
 */

/** @param {FormData} form @param {string} key @param {number} max */
function field(form, key, max) {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, max) : '';
}

/**
 * Lo que mandó el formulario.
 * @param {FormData} form
 * @returns {WikiFormValues}
 */
export function readWikiForm(form) {
	return {
		title: field(form, 'title', 200),
		summary: field(form, 'summary', 1000),
		authors: field(form, 'authors', 2000),
		tags: field(form, 'tags', 4000),
		body: field(form, 'body', 50_000),
		version: Number(field(form, 'version', 20))
	};
}

/** @param {string} raw */
const listOf = (raw) =>
	raw
		.split(/[\r\n,]+/)
		.map((s) => s.trim())
		.filter(Boolean);

/**
 * Los valores del formulario a partir de la etiqueta guardada.
 * @param {StoredObject} tag
 * @returns {WikiFormValues}
 */
export function wikiFormValues(tag) {
	const d = tag.data;
	return {
		title: str(d.wiki_title),
		summary: str(d.wiki_summary),
		authors: strList(d.wiki_authors).join('\n'),
		tags: strList(d.wiki_tags).join('\n'),
		body: String(d.body ?? ''),
		version: tag.version
	};
}

/**
 * La etiqueta cuya página es `/wiki/<slug>` (tenga o no texto de la wiki), o `null`.
 *
 * @param {D1Database} db
 * @param {string} slug
 */
export async function loadWikiEditor(db, slug) {
	const found = await readFicha(db, 'wiki', slug);
	if (!found) return null;
	const tag = found.object;
	return {
		tag: {
			id: tag.id,
			key: String(tag.data.key),
			title: tag.title,
			slug: found.slug,
			version: tag.version,
			updatedAt: tag.updated_at,
			updatedBy: tag.updated_by,
			hidden: tag.visibility === 'hidden'
		},
		exists: hasWikiPage(tag.data),
		values: wikiFormValues(tag),
		object: tag
	};
}

/**
 * @typedef {{ ok: true, tag: StoredObject } | { ok: false, status: number, message: string, conflict?: boolean }} WikiSaveResult
 */

/**
 * Guarda (o saca, con `remove`) el texto de la wiki de la etiqueta.
 *
 * @param {D1Database} db
 * @param {StoredObject} tag la etiqueta como estaba al recibir el pedido
 * @param {WikiFormValues} values
 * @param {{ actor: string, superadmin: boolean, remove?: boolean, now?: number }} opts
 * @returns {Promise<WikiSaveResult>}
 */
export async function saveWikiPage(db, tag, values, { actor, superadmin, remove = false, now }) {
	const page = remove
		? { title: '', summary: '', authors: [], tags: [], body: '' }
		: {
				title: values.title.trim(),
				summary: values.summary.trim(),
				authors: listOf(values.authors),
				tags: listOf(values.tags),
				body: values.body
					.replace(/\r\n?/g, '\n')
					.replace(/^(?:[ \t]*\n)+/, '')
					.trimEnd()
			};
	if (!remove && !page.body && !page.title && !page.summary) {
		return {
			ok: false,
			status: 400,
			message:
				'Escribí al menos el título, el resumen o el texto (para sacar la entrada, usá «Sacar la entrada»).'
		};
	}
	const data = withWikiPage(tag.data, page, wikiBodyHtmlFor(tag.data, page.body, superadmin));
	try {
		const saved = await saveObject(
			db,
			{ id: tag.id, type: TAG_TYPE, version: values.version, title: tag.title, data },
			{
				actor,
				...(now ? { now } : {}),
				also: (self) => [revisionStatement(db, self, 'panel')]
			}
		);
		return { ok: true, tag: saved };
	} catch (e) {
		if (e instanceof VersionConflictError) {
			return {
				ok: false,
				status: 409,
				conflict: true,
				message:
					'Alguien más guardó cambios en esta etiqueta mientras editabas, así que no guardamos los tuyos. Copiá tu texto, recargá la página y volvé a guardar.'
			};
		}
		if (e instanceof ObjectError) {
			const details = e.errors.map((x) => x.message).join(' ');
			return { ok: false, status: 400, message: details ? `${e.message} ${details}` : e.message };
		}
		throw e;
	} finally {
		// El sitio lee las páginas de la wiki con el árbol de etiquetas (recordado unos segundos).
		clearTagSourceCache();
	}
}
