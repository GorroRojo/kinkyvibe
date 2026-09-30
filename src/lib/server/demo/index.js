/**
 * Modo demo de los deploys de preview (ver docs/demo.md). Este módulo solo se importa de forma
 * dinámica dentro de `if (PREVIEW_BUILD)`, así que no existe en el bundle de producción.
 *
 * hooks.server.js registra en cada request el binding D1 del preview (`setDemoDB`): el binding
 * es el mismo para todo el isolate, y así el cliente sirve para quien llame a getRepoClient()
 * sin tener que pasarle `platform`.
 */
import { parse } from 'yaml';
import { splitMarkdown } from '$lib/utils/eventDraft.js';
import { bundle } from './bundle.js';
import { createDemoClient } from './client.js';
import { overlayTexts } from './overlay.js';

/** @type {import('@cloudflare/workers-types').D1Database | null} */
let current = null;

/** @param {import('@cloudflare/workers-types').D1Database | null | undefined} db */
export function setDemoDB(db) {
	current = db ?? null;
}

export const client = createDemoClient({ getDB: () => current, bundle });

/**
 * Los posts que la capa demo agregó, cambió o borró en `src/lib/posts/<category>/`, con su
 * frontmatter ya leído (`meta: null` = borrado, o que no se pudo leer).
 * @param {string} [category] sin categoría, todas
 * @returns {Promise<Array<{category: string, slug: string, meta: Record<string, any> | null}>>}
 */
export async function overlayPostMetas(category) {
	if (!current) return [];
	const prefix = `src/lib/posts/${category ? category + '/' : ''}`;
	/** @type {Array<{category: string, slug: string, meta: Record<string, any> | null}>} */
	const out = [];
	let rows;
	try {
		rows = await overlayTexts(current, prefix);
	} catch (e) {
		console.log('[demo] no se pudo leer demo_files: ' + e);
		return [];
	}
	for (const { path, text } of rows) {
		const m = path.match(/^src\/lib\/posts\/([^/]+)\/([^/]+)\.md$/);
		if (!m || m[2].startsWith('_')) continue;
		/** @type {Record<string, any> | null} */
		let meta = null;
		if (text !== null) {
			try {
				meta = parse(splitMarkdown(text).frontmatter) ?? null;
			} catch (e) {
				meta = null;
			}
		}
		out.push({ category: m[1], slug: m[2], meta });
	}
	return out;
}
