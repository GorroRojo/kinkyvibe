/**
 * La semilla de contenido de las bases que arrancan vacías: la LOCAL (`npm run dev`, las pruebas
 * E2E) y, para los perfiles, la del preview («Recargar datos de prueba»). El contenido vive solo en
 * la base (docs/contenido.md); los .md del repo ya no existen (decisión 0032), así que una base
 * nueva se llena con estos datos.
 *
 * Los datos (los .json de esta carpeta) son una copia fija de contenido PÚBLICO del sitio, sacada
 * de los .md el día que se borraron: las etiquetas y la wiki, los perfiles de amigues, todo el
 * material y los eventos de 2026 (más los pocos de antes que usan las pruebas). No es una copia de
 * producción ni se actualiza sola: es solo para tener con qué probar.
 *
 * Se carga con la misma escritura que siempre (saveObject(), por los importadores de cada tipo),
 * así que es idempotente: lo que ya está no se toca y lo editado en la base no se pisa.
 *
 * Solo imports relativos (corre en Node, con scripts/semilla.js, y en el Worker del preview).
 */
import { runImport, summarizeImport } from '../contenido/importer.js';
import { importAmigues, summarizeImport as summarizeAmigues } from '../amigues/importer.js';
import { importTags, summarizeTagImport } from '../etiquetas/importer.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {{
 *   etiquetas?: Record<string, unknown>[],
 *   wiki?: { name: string, raw: string }[],
 *   amigues?: { legacySlug: string, raw: string }[],
 *   calendario?: import('../contenido/importer.js').SourceFile[],
 *   material?: import('../contenido/importer.js').SourceFile[]
 * }} Seed
 *   `etiquetas`: el árbol de etiquetas (la forma del viejo archivo de etiquetas); `wiki`: los
 *   textos de la Kinkipedia; `calendario`/`material`: cada publicación con su texto y su metadata.
 */

/**
 * @typedef {{
 *   etiquetas: { created: number, error: number } | null,
 *   amigues: { created: number, updated: number, error: number } | null,
 *   calendario: { created: number, updated: number, error: number } | null,
 *   material: { created: number, updated: number, error: number } | null,
 *   errors: string[]
 * }} SeedResult
 *   `null`: esa parte no estaba en la semilla (o, las etiquetas, la base ya tenía).
 */

const CONTENT = /** @type {const} */ (['calendario', 'material']);

/**
 * Carga la semilla en la base. Las etiquetas, solo si la base todavía no tiene ninguna (las de la
 * semilla son el punto de partida, no se mezclan con las que ya hay).
 *
 * @param {D1Database} db
 * @param {Seed} seed
 * @param {{ actor: string, now?: number }} opts
 * @returns {Promise<SeedResult>}
 */
export async function loadSeed(db, seed, { actor, now = Date.now() }) {
	/** @type {SeedResult} */
	const out = { etiquetas: null, amigues: null, calendario: null, material: null, errors: [] };

	if (seed.etiquetas) {
		const any = await db
			.prepare("SELECT 1 AS x FROM objects WHERE type = 'etiqueta' LIMIT 1")
			.first();
		if (!any) {
			const { results } = await importTags(
				db,
				{ rawTags: structuredClone(seed.etiquetas), wikiFiles: seed.wiki ?? [] },
				{ actor, now }
			);
			const s = summarizeTagImport(results);
			out.etiquetas = { created: s.created, error: s.error };
			for (const r of results.filter((x) => x.action === 'error')) {
				out.errors.push(`etiquetas/${r.key}: ${r.message ?? ''}`);
			}
		}
	}

	if (seed.amigues) {
		const results = await importAmigues(db, seed.amigues, { actor, now });
		const s = summarizeAmigues(results);
		out.amigues = { created: s.created, updated: s.updated, error: s.error };
		for (const r of results.filter((x) => x.action === 'error')) {
			out.errors.push(`amigues/${r.legacySlug}: ${r.message ?? ''}`);
		}
	}

	for (const category of CONTENT) {
		const files = seed[category];
		if (!files) continue;
		/** @type {import('../contenido/importer.js').ImportRow[]} */
		const all = [];
		for (;;) {
			const { results, remaining } = await runImport(db, category, files, {
				actor,
				now,
				limit: 200
			});
			all.push(...results);
			if (!remaining || !results.length) break;
		}
		const s = summarizeImport(all);
		out[category] = { created: s.created, updated: s.updated, error: s.error };
		for (const r of all.filter((x) => x.action === 'error')) {
			out.errors.push(`${category}/${r.legacySlug}: ${r.message ?? ''}`);
		}
	}
	return out;
}
