/**
 * Capa de archivos del modo demo: los "commits" que el panel hace en un deploy de preview se
 * guardan en la tabla `demo_files` de la base de prueba en vez de ir a GitHub (ver docs/demo.md).
 *
 * La tabla NO es una migración numerada a propósito (producción no la tiene que tener): se crea
 * sola la primera vez que se usa (`CREATE TABLE IF NOT EXISTS`), o con el seed de datos de prueba.
 *
 * Cada fila es la última versión de un archivo del repo, con `path` relativo a la raíz
 * (`src/lib/posts/calendario/x.md`). `encoding`:
 * - 'utf-8': `content` es el texto;
 * - 'binary': una imagen subida; no se guarda el contenido (el panel muestra las imágenes del
 *   deploy, y una fila de D1 tiene un tope de ~2 MB);
 * - 'ref': copia de otro archivo sin cambios (`content` es la ruta de origen en el deploy).
 * `deleted = 1` marca un archivo borrado (tapa al del deploy).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {object} OverlayEntry
 * @prop {string} path
 * @prop {'utf-8'|'binary'|'ref'} encoding
 * @prop {boolean} deleted
 */

/**
 * @typedef {object} OverlayWrite
 * @prop {string} path
 * @prop {string|null} content
 * @prop {'utf-8'|'binary'|'ref'} encoding
 * @prop {boolean} [deleted]
 */

export const DEMO_FILES_SQL = `CREATE TABLE IF NOT EXISTS demo_files (
	path TEXT PRIMARY KEY,
	content TEXT,
	encoding TEXT NOT NULL DEFAULT 'utf-8' CHECK (encoding IN ('utf-8', 'binary', 'ref')),
	deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
	author TEXT NOT NULL,
	message TEXT,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
)`;

/** @type {WeakSet<object>} */
const ready = new WeakSet();

/**
 * Crea la tabla si falta (una vez por binding y por isolate).
 * @param {D1Database} db
 */
export async function ensureDemoTable(db) {
	if (ready.has(db)) return;
	await db.prepare(DEMO_FILES_SQL).run();
	ready.add(db);
}

/**
 * Qué archivos tiene la capa (sin el contenido): la capa es chica, así que se lee entera.
 * @param {D1Database} db
 * @returns {Promise<Map<string, OverlayEntry>>}
 */
export async function overlayIndex(db) {
	await ensureDemoTable(db);
	const { results } = await db.prepare('SELECT path, encoding, deleted FROM demo_files').all();
	/** @type {Map<string, OverlayEntry>} */
	const out = new Map();
	for (const r of /** @type {any[]} */ (results)) {
		out.set(String(r.path), {
			path: String(r.path),
			encoding: r.encoding,
			deleted: r.deleted === 1
		});
	}
	return out;
}

/**
 * Una fila de la capa, o null si el archivo no está en la capa.
 * @param {D1Database} db
 * @param {string} path
 * @returns {Promise<{content: string|null, encoding: 'utf-8'|'binary'|'ref', deleted: boolean} | null>}
 */
export async function overlayRow(db, path) {
	await ensureDemoTable(db);
	const row = /** @type {any} */ (
		await db
			.prepare('SELECT content, encoding, deleted FROM demo_files WHERE path = ?')
			.bind(path)
			.first()
	);
	if (!row) return null;
	return { content: row.content ?? null, encoding: row.encoding, deleted: row.deleted === 1 };
}

/**
 * Los archivos de texto de la capa cuyo path empieza con `prefix` (incluye los borrados, con
 * `text: null`, para que quien lee pueda taparlos).
 * @param {D1Database} db
 * @param {string} prefix
 * @returns {Promise<Array<{path: string, text: string|null}>>}
 */
export async function overlayTexts(db, prefix) {
	await ensureDemoTable(db);
	const { results } = await db
		.prepare(
			"SELECT path, content, deleted FROM demo_files WHERE substr(path, 1, length(?1)) = ?1 AND (encoding = 'utf-8' OR deleted = 1)"
		)
		.bind(prefix)
		.all();
	return /** @type {any[]} */ (results).map((r) => ({
		path: String(r.path),
		text: r.deleted === 1 ? null : String(r.content ?? '')
	}));
}

/**
 * Guarda un "commit": todas las filas en un solo batch (atómico en D1).
 * @param {D1Database} db
 * @param {OverlayWrite[]} files
 * @param {{author: string, message: string}} meta
 */
export async function writeOverlay(db, files, { author, message }) {
	await ensureDemoTable(db);
	if (!files.length) return;
	const stmt = db.prepare(
		`INSERT INTO demo_files (path, content, encoding, deleted, author, message, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
		 ON CONFLICT(path) DO UPDATE SET content = excluded.content, encoding = excluded.encoding,
		   deleted = excluded.deleted, author = excluded.author, message = excluded.message,
		   updated_at = excluded.updated_at`
	);
	await db.batch(
		files.map((f) =>
			stmt.bind(
				f.path,
				f.deleted ? null : f.content,
				f.encoding,
				f.deleted ? 1 : 0,
				author,
				message.slice(0, 500)
			)
		)
	);
}

/**
 * Resumen para /api/preview-status. No falla si la tabla todavía no existe.
 * @param {D1Database} db
 * @param {number} [limit] cuántos de los últimos cambios listar
 */
export async function overlaySummary(db, limit = 20) {
	try {
		const count = /** @type {any} */ (
			await db.prepare('SELECT COUNT(*) AS n FROM demo_files').first()
		);
		const { results } = await db
			.prepare(
				'SELECT path, deleted, author, message, updated_at FROM demo_files ORDER BY updated_at DESC LIMIT ?'
			)
			.bind(limit)
			.all();
		return {
			files: Number(count?.n ?? 0),
			recent: /** @type {any[]} */ (results).map((r) => ({
				path: r.path,
				deleted: r.deleted === 1,
				author: r.author,
				message: r.message,
				updated_at: r.updated_at
			}))
		};
	} catch {
		return { files: 0, recent: [] };
	}
}
