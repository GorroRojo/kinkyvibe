/**
 * Volcado de una base D1 a SQL (esquema + filas), para los backups de R2 (ver ./index.js y
 * docs/workers-migracion.md).
 *
 * Por qué no `wrangler d1 export`: no está disponible desde un Worker y no soporta tablas
 * virtuales (FTS5). Esto es genérico: recorre `sqlite_master`, así que incluye tablas nuevas sin
 * tocar nada. El resultado se restaura en una base VACÍA con
 * `npx wrangler d1 execute <base> --file=<archivo>.sql` (ver scripts/d1-restore.js).
 *
 * Qué garantiza:
 * - Valores exactos: los INTEGER se leen como texto (`CAST`), porque D1 los devuelve como número
 *   de JavaScript y pierde precisión pasando 2^53; los REAL conservan el punto decimal; los BLOB
 *   van como `X'…'`; los textos con NUL van como `CAST(X'…' AS TEXT)`.
 * - Se conserva el `rowid` de las tablas que no tienen `INTEGER PRIMARY KEY` (lo pueden usar
 *   índices FTS con `content_rowid`).
 * - Tablas virtuales (FTS5/FTS4…): se recrea la tabla y se cargan sus filas (con `rowid`); sus
 *   tablas «sombra» (`x_data`, `x_idx`…) no se copian porque SQLite las regenera. Si la tabla
 *   virtual usa `content=otra_tabla`, en vez de filas se agrega un `'rebuild'` al final.
 * - Índices, vistas y triggers van después de las filas (los triggers no se disparan al
 *   restaurar).
 * - Incluye `d1_migrations`, así wrangler sabe qué migraciones tiene la base restaurada.
 * - No incluye tablas internas (`sqlite_*`, `_cf_*`). `sqlite_sequence` no se puede escribir en
 *   D1: los AUTOINCREMENT siguen desde el id más alto restaurado.
 *
 * No es una foto atómica (son varias consultas): corre de madrugada, cuando casi no hay
 * escrituras. Para volver a un minuto exacto de los últimos 30 días está D1 Time Travel.
 *
 * Solo usa imports relativos: lo importa también worker/index.js, que no pasa por Vite.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Prefijo del comentario final con las cantidades de filas (JSON en la misma línea). */
export const STATS_COMMENT = '-- kinkyvibe-backup-stats';

/** Filas por consulta al leer una tabla. */
export const PAGE_SIZE = 500;

/** Nombres que `sqlite_master` lista pero que no se copian. */
const INTERNAL_NAME = /^(sqlite_|_cf_)/i;

/** Sufijos de las tablas sombra de FTS3/4/5 y R*Tree (si no está `PRAGMA table_list`). */
const SHADOW_SUFFIXES = [
	'_data',
	'_idx',
	'_content',
	'_docsize',
	'_config',
	'_segments',
	'_segdir',
	'_stat',
	'_node',
	'_parent',
	'_rowid'
];

/**
 * Identificador SQL entre comillas dobles (duplicando las internas).
 *
 * @param {string} name
 */
export function quoteIdent(name) {
	return `"${String(name).replaceAll('"', '""')}"`;
}

/**
 * Texto como literal SQL entre comillas simples (duplicando las internas).
 *
 * @param {string} text
 */
export function quoteText(text) {
	return `'${text.replaceAll("'", "''")}'`;
}

/** @param {Uint8Array} bytes */
function hex(bytes) {
	let out = '';
	for (const b of bytes) out += b.toString(16).padStart(2, '0');
	return out.toUpperCase();
}

/**
 * Bytes de un BLOB tal como lo devuelve D1 (array de números) o como ArrayBuffer/TypedArray.
 *
 * @param {unknown} value
 * @returns {Uint8Array}
 */
function blobBytes(value) {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) {
		return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	}
	if (Array.isArray(value)) return Uint8Array.from(value);
	throw new TypeError(`BLOB con formato inesperado: ${typeof value}`);
}

/**
 * Un valor como literal SQL, según su tipo de almacenamiento en SQLite (`typeof(col)`).
 *
 * @param {string} type 'null' | 'integer' | 'real' | 'text' | 'blob'
 * @param {unknown} value lo que devolvió D1 (para 'integer', el número ya convertido a texto)
 * @returns {string}
 */
export function sqlLiteral(type, value) {
	switch (type) {
		case 'null':
			return 'NULL';
		case 'integer': {
			const text = String(value);
			if (!/^-?\d+$/.test(text)) throw new TypeError(`INTEGER inválido: ${text}`);
			return text;
		}
		case 'real': {
			const n = Number(value);
			if (Number.isNaN(n)) return 'NULL';
			if (n === Infinity) return '9e999';
			if (n === -Infinity) return '-9e999';
			// String() da la representación más corta que vuelve al mismo double; si parece un
			// entero se le agrega `.0` para que siga siendo REAL en columnas sin tipo.
			const text = Object.is(n, -0) ? '-0.0' : String(n);
			return /[.eE]/.test(text) ? text : `${text}.0`;
		}
		case 'text': {
			const text = String(value);
			if (text.includes('\0')) {
				return `CAST(X'${hex(new TextEncoder().encode(text))}' AS TEXT)`;
			}
			return quoteText(text);
		}
		case 'blob':
			return `X'${hex(blobBytes(value))}'`;
		default:
			throw new TypeError(`Tipo de SQLite desconocido: ${type}`);
	}
}

/**
 * Qué hacer con las filas de una tabla virtual según su `CREATE VIRTUAL TABLE`.
 *
 * @param {string} sql
 * @returns {'rows' | 'rebuild' | 'skip'}
 */
export function virtualTableStrategy(sql) {
	const match = /\bcontent\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s,)]*))/i.exec(sql);
	if (!match) return 'rows';
	const content = match[1] ?? match[2] ?? match[3] ?? '';
	// content='' → sin contenido propio: no hay filas que leer ni de dónde reconstruirlas.
	return content === '' ? 'skip' : 'rebuild';
}

/**
 * @typedef {{
 *   type: string,
 *   name: string,
 *   tbl_name: string,
 *   sql: string | null
 * }} SchemaRow
 */

/**
 * @typedef {{
 *   name: string,
 *   kind: 'table' | 'virtual',
 *   sql: string,
 *   withoutRowid: boolean
 * }} TableInfo
 */

/**
 * Tablas a copiar, en el orden de `sqlite_master` (el de creación), sin internas ni sombras.
 *
 * @param {D1Database} db
 * @param {SchemaRow[]} schema
 * @returns {Promise<TableInfo[]>}
 */
async function listTables(db, schema) {
	/** @type {Map<string, { type: string, wr: number }> | null} */
	let tableList = null;
	try {
		const { results } = await db.prepare('PRAGMA table_list').all();
		tableList = new Map(
			results
				.filter((r) => r.schema === 'main')
				.map((r) => [String(r.name), { type: String(r.type), wr: Number(r.wr) }])
		);
	} catch {
		tableList = null; // SQLite viejo: se deduce del SQL
	}

	const tables = schema.filter((r) => r.type === 'table' && r.sql && !INTERNAL_NAME.test(r.name));
	const virtualNames = tables
		.filter((r) => /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(r.sql ?? ''))
		.map((r) => r.name);

	/** @param {string} name */
	const isShadow = (name) => {
		if (tableList) return tableList.get(name)?.type === 'shadow';
		return virtualNames.some(
			(v) => name.startsWith(`${v}_`) && SHADOW_SUFFIXES.includes(name.slice(v.length))
		);
	};

	return tables
		.filter((r) => !isShadow(r.name))
		.map((r) => {
			const sql = /** @type {string} */ (r.sql);
			const kind = virtualNames.includes(r.name) ? 'virtual' : 'table';
			const withoutRowid = tableList
				? tableList.get(r.name)?.wr === 1
				: /\bWITHOUT\s+ROWID\s*;?\s*$/i.test(sql);
			return { name: r.name, kind, sql, withoutRowid };
		});
}

/**
 * Columnas a copiar de una tabla y si hay que agregar el `rowid`.
 *
 * @param {D1Database} db
 * @param {TableInfo} table
 */
async function tableColumns(db, table) {
	const { results } = await db.prepare(`PRAGMA table_xinfo(${quoteIdent(table.name)})`).all();
	// hidden: 0 = normal, 1 = oculta de una tabla virtual, 2/3 = generada (no se inserta).
	const columns = results.filter((c) => Number(c.hidden) === 0).map((c) => String(c.name));
	const pk = results.filter((c) => Number(c.pk) > 0);
	const hasIntegerPk = pk.length === 1 && String(pk[0].type).toUpperCase() === 'INTEGER';
	const namesLower = results.map((c) => String(c.name).toLowerCase());
	const rowidFree = ['rowid', '_rowid_', 'oid'].find((n) => !namesLower.includes(n));
	const includeRowid = !table.withoutRowid && !hasIntegerPk && rowidFree !== undefined;
	return { columns, rowidName: includeRowid ? /** @type {string} */ (rowidFree) : null };
}

/**
 * Los INSERT de todas las filas de una tabla, de a PAGE_SIZE.
 *
 * @param {D1Database} db
 * @param {TableInfo} table
 * @param {(line: string) => void} emit
 * @returns {Promise<number>} cantidad de filas
 */
async function dumpRows(db, table, emit) {
	const { columns, rowidName } = await tableColumns(db, table);
	/** @type {string[]} */
	const sources = rowidName ? [rowidName, ...columns.map(quoteIdent)] : columns.map(quoteIdent);
	if (!sources.length) return 0;
	const targets = rowidName ? [rowidName, ...columns.map(quoteIdent)] : columns.map(quoteIdent);
	const select = sources
		.map(
			(src, i) =>
				`typeof(${src}) AS t${i}, CASE WHEN typeof(${src}) = 'integer' THEN CAST(${src} AS TEXT) ELSE ${src} END AS v${i}`
		)
		.join(', ');
	const order = table.withoutRowid ? '' : ' ORDER BY rowid';
	const insert = `INSERT INTO ${quoteIdent(table.name)} (${targets.join(', ')}) VALUES (`;

	let count = 0;
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { results } = await db
			.prepare(
				`SELECT ${select} FROM ${quoteIdent(table.name)}${order} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
			)
			.all();
		for (const row of results) {
			const values = sources.map((_, i) => sqlLiteral(String(row[`t${i}`]), row[`v${i}`]));
			emit(`${insert}${values.join(', ')});`);
		}
		count += results.length;
		if (results.length < PAGE_SIZE) return count;
	}
}

/** @param {string} sql */
function statement(sql) {
	const trimmed = sql.trim();
	if (trimmed.endsWith(';')) return trimmed;
	// Si la última línea tiene un comentario `--`, el `;` en la misma línea quedaría comentado.
	const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1);
	return lastLine.includes('--') ? `${trimmed}\n;` : `${trimmed};`;
}

/**
 * @typedef {{
 *   tables: number,
 *   rows: number,
 *   perTable: Record<string, number>,
 *   rebuilt: string[],
 *   skipped: string[]
 * }} DumpStats
 */

/**
 * Vuelca toda la base a SQL.
 *
 * @param {D1Database} db
 * @param {{ now?: Date, label?: string }} [options]
 * @returns {Promise<{ sql: string, stats: DumpStats }>}
 */
export async function dumpDatabase(db, { now = new Date(), label = 'D1' } = {}) {
	const { results } = await db
		.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY rowid')
		.all();
	const schema = /** @type {SchemaRow[]} */ (/** @type {unknown} */ (results));
	const tables = await listTables(db, schema);

	/** @type {string[]} */
	const out = [];
	const emit = (/** @type {string} */ line) => out.push(line);
	/** @type {DumpStats} */
	const stats = { tables: tables.length, rows: 0, perTable: {}, rebuilt: [], skipped: [] };

	emit(`-- Backup de ${label.replace(/\n/g, ' ')} (kinkyvibe), ${now.toISOString()}`);
	emit('-- Restaurar en una base VACÍA: ver docs/workers-migracion.md («Restaurar un backup»).');
	emit('PRAGMA defer_foreign_keys = true;');

	// Primero todas las tablas: SQLite exige que exista la tabla referenciada por una foreign key
	// al insertar (aunque el control se difiera), y una FTS con contenido externo necesita la suya.
	emit('');
	emit('-- Tablas');
	for (const table of tables) emit(statement(table.sql));

	/** @type {string[]} */
	const rebuilds = [];
	for (const table of tables) {
		emit('');
		emit(`-- Filas de ${table.name}`);
		if (table.kind === 'virtual') {
			const strategy = virtualTableStrategy(table.sql);
			if (strategy === 'rebuild') {
				rebuilds.push(
					`INSERT INTO ${quoteIdent(table.name)} (${quoteIdent(table.name)}) VALUES ('rebuild');`
				);
				stats.rebuilt.push(table.name);
				continue;
			}
			if (strategy === 'skip') {
				emit(`-- (sin contenido propio: hay que volver a cargarla desde su origen)`);
				stats.skipped.push(table.name);
				continue;
			}
		}
		const n = await dumpRows(db, table, emit);
		stats.perTable[table.name] = n;
		stats.rows += n;
	}

	const tableNames = new Set(tables.map((t) => t.name));
	const extras = schema.filter(
		(r) =>
			r.sql &&
			!INTERNAL_NAME.test(r.name) &&
			(r.type === 'index' || r.type === 'view' || r.type === 'trigger') &&
			(r.type === 'view' || tableNames.has(r.tbl_name))
	);
	// Índices primero; vistas y triggers en su orden de creación (una vista puede usar otra).
	const ordered = [
		...extras.filter((r) => r.type === 'index'),
		...extras.filter((r) => r.type !== 'index')
	];
	if (ordered.length) {
		emit('');
		emit('-- Índices, vistas y triggers');
		for (const r of ordered) emit(statement(/** @type {string} */ (r.sql)));
	}
	if (rebuilds.length) {
		emit('');
		emit('-- Índices de texto completo con contenido externo');
		for (const r of rebuilds) emit(r);
	}
	emit('');
	// Para verificar una restauración (scripts/d1-restore.js compara estas cantidades).
	emit(`${STATS_COMMENT} ${JSON.stringify(stats)}`);
	emit('');
	return { sql: out.join('\n'), stats };
}
