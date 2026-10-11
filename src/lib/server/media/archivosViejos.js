/**
 * Los PDF, el video y el documento que el material enlazaba desde su carpeta de medios del repo
 * (`import guia from './media/<carpeta>/1.pdf'` y `<a href={guia}>`). Cuando se borraron los .md
 * (decisión 0032) todavía no estaban en la biblioteca, así que quedaron en src/lib/archivos y el
 * sitio los sirve desde el build (src/lib/server/contenido/render.js, `contentMediaURL`).
 *
 * Esto es el paso que falta para sacarlos del repo, y lo corre gorrite (scripts/subir-archivos.js;
 * escribir en el R2 y la base de producción necesita su OK):
 *
 * 1. cada archivo va a R2 y a un objeto `archivo` de la biblioteca (`storeFile`, con
 *    `source_path` = su ruta vieja en src/lib/posts, así se sabe qué reemplaza);
 * 2. cada material cuyo texto todavía lo importa pasa a nombrarlo por su dirección de la
 *    biblioteca (`/media/file/<sha-256>.<ext>`): se reemplazan sus usos (`{guia}`) y se saca el
 *    import. Es una versión nueva del texto (con historial); el edge `adjunto` lo calcula el
 *    guardado (src/lib/server/objects/types/material.js).
 *
 * Idempotente: el mismo archivo es el mismo objeto, y un texto que ya no importa nada no se toca.
 * Con `dryRun` no escribe nada: solo dice qué haría.
 *
 * Solo imports relativos: corre en Node sin Vite.
 */
import { FILE_TYPE, storeFile } from './library.js';
import { fileKey, mediaPath, sha256Hex, sniffDocument } from './sniff.js';
import { saveObject } from '../objects/save.js';
import { revisionStatement } from '../contenido/revisions.js';
import { escapeRegExp } from '../../utils/text.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/** Dónde quedaron los archivos (por categoría y carpeta vieja). */
export const ARCHIVOS_DIR = 'src/lib/archivos';

const FILE_EXT = /\.(?:pdf|mp4|webm|odt)$/i;

/** `import <nombre> from '<ruta>'` (con `;` opcional), una línea. */
const IMPORT_LINE = /^[ \t]*import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?[ \t]*\r?\n?/gm;

/**
 * La ruta vieja en el repo de un archivo de src/lib/archivos.
 * @param {string} category
 * @param {string} folder
 * @param {string} file
 */
export const legacyFilePath = (category, folder, file) =>
	`src/lib/posts/${category}/media/${folder}/${file}`;

/**
 * Pura: los archivos (no imágenes) que un texto importa de una carpeta de medios vieja.
 *
 * @param {string} body
 * @returns {{ name: string, folder: string, file: string }[]}
 */
export function legacyFileImports(body) {
	/** @type {{ name: string, folder: string, file: string }[]} */
	const out = [];
	for (const m of String(body ?? '').matchAll(IMPORT_LINE)) {
		const at = /\/media\/([\w.-]+)\/([\w.-]+)$/.exec(m[2]);
		if (at && FILE_EXT.test(at[2])) out.push({ name: m[1], folder: at[1], file: at[2] });
	}
	return out;
}

/**
 * Pura: el texto con cada archivo importado nombrado por su dirección de la biblioteca: los usos
 * (`{guia}`, `href={guia}`) pasan a la dirección y el import se saca (y el `<script>` si queda
 * vacío). Lo que `urlOf` no conoce queda como estaba.
 *
 * @param {string} body
 * @param {(folder: string, file: string) => string | undefined} urlOf
 * @returns {{ body: string, replaced: string[], missing: string[] }}
 */
export function inlineFileImports(body, urlOf) {
	let text = String(body ?? '');
	/** @type {string[]} */
	const replaced = [];
	/** @type {string[]} */
	const missing = [];
	for (const ref of legacyFileImports(text)) {
		const url = urlOf(ref.folder, ref.file);
		if (!url) {
			missing.push(`${ref.folder}/${ref.file}`);
			continue;
		}
		const name = escapeRegExp(ref.name);
		// Reemplazos con función: un `$` en la dirección no es un patrón de `replace`.
		text = text
			.replace(new RegExp(`=\\s*\\{\\s*${name}\\s*\\}`, 'g'), () => `="${url}"`)
			.replace(new RegExp(`\\{\\s*${name}\\s*\\}`, 'g'), () => url)
			.replace(IMPORT_LINE, (line, n) => (n === ref.name ? '' : line));
		replaced.push(`${ref.folder}/${ref.file}`);
	}
	// Un `<script>` que quedó sin nada adentro.
	text = text.replace(/<script>\s*<\/script>[ \t]*\r?\n?/g, '');
	return { body: text, replaced, missing };
}

/**
 * @typedef {{ category: string, folder: string, file: string, bytes: Uint8Array }} RepoFile
 * @typedef {{
 *   files: number,
 *   newFiles: number,
 *   knownFiles: number,
 *   texts: { slug: string, replaced: string[], missing: string[] }[],
 *   errors: { what: string, message: string }[]
 * }} UploadSummary
 */

/**
 * Sube los archivos y reescribe los textos que los importan (ver arriba).
 *
 * @param {D1Database} db
 * @param {R2Bucket | null | undefined} bucket
 * @param {{ files: RepoFile[], actor: string, dryRun?: boolean, now?: number }} opts
 * @returns {Promise<UploadSummary>}
 */
export async function uploadRepoFiles(
	db,
	bucket,
	{ files, actor, dryRun = false, now = Date.now() }
) {
	/** @type {UploadSummary} */
	const summary = { files: files.length, newFiles: 0, knownFiles: 0, texts: [], errors: [] };
	/** @type {Map<string, string>} */
	const urls = new Map();
	for (const f of files) {
		const where = `${f.category}/${f.folder}/${f.file}`;
		try {
			const sniffed = sniffDocument(f.bytes);
			if (!sniffed) throw new Error('no es un PDF, un video ni un documento que se guarde');
			const hash = await sha256Hex(f.bytes);
			const known = await db
				.prepare('SELECT 1 AS x FROM objects WHERE type = ?1 AND slug = ?2 AND deleted_at IS NULL')
				.bind(FILE_TYPE, hash)
				.first();
			if (known) summary.knownFiles++;
			else summary.newFiles++;
			if (!dryRun) {
				await storeFile(
					db,
					bucket,
					{
						bytes: f.bytes,
						name: f.file,
						sourcePath: legacyFilePath(f.category, f.folder, f.file)
					},
					{ actor, now }
				);
			}
			urls.set(where, mediaPath(fileKey(hash, sniffed.ext)));
		} catch (e) {
			summary.errors.push({ what: where, message: String(/** @type {Error} */ (e).message ?? e) });
		}
	}

	// Los materiales vivos cuyo texto importa alguno de estos archivos.
	const { results } = await db
		.prepare(
			`SELECT id, slug, version, data FROM objects
			WHERE type = 'material' AND deleted_at IS NULL AND data LIKE '%/media/%'`
		)
		.all();
	for (const row of results) {
		/** @type {Record<string, unknown>} */
		const data = JSON.parse(String(row.data ?? '{}'));
		const body = typeof data.body === 'string' ? data.body : '';
		if (!legacyFileImports(body).length) continue;
		const r = inlineFileImports(body, (folder, file) => urls.get(`material/${folder}/${file}`));
		summary.texts.push({ slug: String(row.slug), replaced: r.replaced, missing: r.missing });
		if (dryRun || !r.replaced.length) continue;
		try {
			await saveObject(
				db,
				{
					id: Number(row.id),
					type: 'material',
					version: Number(row.version),
					data: { ...data, body: r.body }
				},
				{ actor, now, also: (self) => [revisionStatement(db, self, 'migracion')] }
			);
		} catch (e) {
			summary.errors.push({
				what: `material/${row.slug}`,
				message: String(/** @type {Error} */ (e).message ?? e)
			});
		}
	}
	return summary;
}
