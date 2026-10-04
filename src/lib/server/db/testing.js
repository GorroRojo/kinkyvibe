/**
 * Utilidades para tests (solo Node/vitest, nunca se importa desde la app).
 *
 * `createTestDB()` levanta un D1 real de miniflare/workerd con los mismos bindings de
 * wrangler.toml que usa `npm run dev`, pero en memoria: cada llamada arranca con una base vacía y
 * no toca `.wrangler/state`. Después aplica todos los archivos de `migrations/` en orden, igual
 * que `wrangler d1 migrations apply`.
 *
 * Antes usábamos `getPlatformProxy` de wrangler, pero su `env.DB` es un proxy genérico: cada
 * consulta (`prepare` → `bind` → `first`) hacía unas cinco idas y vueltas a workerd, cuatro de ellas
 * sincrónicas (bloquean el event loop con `Atomics.wait`). Con la máquina cargada eso eran decenas
 * de milisegundos por consulta. Ahora `db` es un D1 de prueba (`TestD1Database`) que arma la
 * sentencia en Node y la manda entera en un solo pedido a un worker chiquito que la corre contra el
 * D1 de verdad (el mismo de miniflare, con su SQLite y sus errores). El resto de los bindings
 * (`BACKUPS`…) siguen siendo los proxies de miniflare.
 *
 * Aunque la base arranca vacía, miniflare guarda el SQLite de D1 (y lo de R2) en disco, y cada
 * consulta es una transacción que espera a que el disco confirme: eso eran ~3 ms por consulta.
 * Por eso cada base de prueba vive en una carpeta temporal en memoria (`/dev/shm`, si existe y
 * se puede escribir; si no, la carpeta temporal del sistema), que se borra en `dispose()` o al
 * salir del proceso. Mismo motor y mismas consultas: solo cambia dónde está el archivo.
 */
import { accessSync, constants as fsConstants, rmSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { unstable_getMiniflareWorkerOptions, unstable_splitSqlQuery } from 'wrangler';

const MIGRATIONS_DIR = path.resolve('migrations');

/**
 * Lee los `.sql` de `dir` en orden y los parte en sentencias.
 *
 * @param {string} dir
 */
async function readMigrations(dir) {
	const entries = await readdir(dir).catch((error) => {
		if (error?.code === 'ENOENT') return [];
		throw error;
	});
	const files = entries.filter((f) => f.endsWith('.sql')).sort();
	const batches = await Promise.all(
		files.map(async (file) => {
			const sql = await readFile(path.join(dir, file), 'utf8');
			return unstable_splitSqlQuery(sql).filter((s) => s.trim());
		})
	);
	return { files, batches };
}

/** Las migraciones del repo, leídas una sola vez por proceso (los tests no las cambian). */
/** @type {ReturnType<typeof readMigrations> | undefined} */
let repoMigrations;

/**
 * Aplica cada archivo de migraciones en un `batch` (una transacción), en orden.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} [dir]
 */
export async function applyMigrations(db, dir = MIGRATIONS_DIR) {
	// Solo se cachea el directorio del repo: los tests que arman uno temporal lo pueden cambiar.
	let migrations;
	if (dir === MIGRATIONS_DIR) {
		repoMigrations ??= readMigrations(dir).catch((error) => {
			repoMigrations = undefined;
			throw error;
		});
		migrations = await repoMigrations;
	} else {
		migrations = await readMigrations(dir);
	}
	const batches = migrations.batches.filter((statements) => statements.length);
	if (db instanceof TestD1Database) {
		// Lo mismo, pero en un solo pedido al worker: allá corre un `batch` por archivo, en orden, y
		// frena en el primero que falle (los anteriores quedan aplicados, como en el loop de abajo).
		await db[kBatches](batches);
	} else {
		for (const statements of batches) await db.batch(statements.map((s) => db.prepare(s)));
	}
	return migrations.files;
}

/** Las dos consultas de catálogo de `resetDB` (van juntas en un batch). */
const RESET_CATALOG = [
	"SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
	"SELECT name, type FROM pragma_table_list WHERE schema = 'main'"
];

/**
 * Worker que recibe una sentencia (o un batch) serializada y la corre contra el D1 real. Los
 * valores que JSON no representa viajan marcados: bytes (`$b`) y números no finitos o -0 (`$n`).
 * Los errores vuelven con su nombre, mensaje y `cause` para rearmarlos del lado de Node.
 */
const D1_WORKER = /* js */ `
const revive = (v) =>
	v && typeof v === 'object' && !Array.isArray(v)
		? '$b' in v ? new Uint8Array(v.$b) : Number(v.$n)
		: v;
const statement = (db, [sql, params]) =>
	params.length ? db.prepare(sql).bind(...params.map(revive)) : db.prepare(sql);
const errorJSON = (e) =>
	e instanceof Error
		? { name: e.name, message: e.message, cause: e.cause === undefined ? undefined : errorJSON(e.cause) }
		: { name: 'Error', message: String(e) };
const RESET_CATALOG = ${JSON.stringify(RESET_CATALOG)};
const planReset = ${planReset.toString()};
export default {
	async fetch(request, env) {
		const db = env.DB;
		try {
			const body = await request.json();
			let value;
			if (body.op === 'batch') value = await db.batch(body.statements.map((s) => statement(db, s)));
			else if (body.op === 'reset') {
				const [{ results }, { results: tableList }] = await db.batch(RESET_CATALOG.map((sql) => db.prepare(sql)));
				const statements = planReset(results, tableList);
				if (statements.length) await db.batch(statements.map((sql) => db.prepare(sql)));
			} else if (body.op === 'batches') {
				value = [];
				for (const sqls of body.batches) value.push(await db.batch(sqls.map((sql) => db.prepare(sql))));
			}
			else if (body.op === 'exec') value = await db.exec(body.sql);
			else value = await statement(db, body.statement)[body.op](...body.args);
			return Response.json({ value: value === undefined ? null : value });
		} catch (e) {
			return Response.json({ error: errorJSON(e) });
		}
	}
};
`;

/**
 * @typedef {{ name: string, message: string, cause?: SerializedError }} SerializedError
 * @typedef {(body: Record<string, unknown>) => Promise<any>} Send
 */

/**
 * @param {SerializedError} e
 * @returns {Error}
 */
function reviveError(e) {
	/** @type {{ cause: Error } | undefined} */
	const cause = e.cause ? { cause: reviveError(e.cause) } : undefined;
	const Ctor = /** @type {ErrorConstructor | undefined} */ (
		/** @type {Record<string, unknown>} */ (globalThis)[e.name]
	);
	/** @type {Error} */
	const error =
		typeof Ctor === 'function' && Ctor.prototype instanceof Error
			? new Ctor(e.message, cause)
			: new Error(e.message, cause);
	if (error.name !== e.name) error.name = e.name;
	return error;
}

/**
 * Lo mismo que hace `bind` en el D1 de workerd: los tipos que no acepta tiran `D1_TYPE_ERROR` en el
 * momento (sincrónico), con el mismo mensaje. Los válidos se preparan para viajar en JSON; la
 * conversión final (booleanos, bytes…) la hace el `bind` real del lado del worker.
 *
 * @param {unknown} value
 */
function encodeParam(value) {
	switch (typeof value) {
		case 'string':
		case 'boolean':
			return value;
		case 'number':
			return Number.isFinite(value) && !Object.is(value, -0) ? value : { $n: String(value) };
		case 'object':
			if (value === null) return null;
			if (Array.isArray(value) && value.every((b) => typeof b === 'number' && b >= 0 && b < 256))
				return value;
			if (value instanceof ArrayBuffer) return { $b: Array.from(new Uint8Array(value)) };
			if (ArrayBuffer.isView(value))
				return { $b: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
	}
	throw new Error(`D1_TYPE_ERROR: Type '${typeof value}' not supported for value '${value}'`);
}

/** Acceso a la sentencia serializada (para `batch`), sin exponerla como propiedad pública. */
const kSerialize = Symbol('serialize');
/** Varios `batch` seguidos en un solo pedido (para `applyMigrations`), sin exponerlo. */
const kBatches = Symbol('batches');
/** `resetDB` en un solo pedido, sin exponerlo. */
const kReset = Symbol('reset');

/** Sentencia preparada de `TestD1Database`: inmutable, como la de D1 (`bind` devuelve otra). */
class TestD1PreparedStatement {
	/** @type {Send} */
	#send;
	/** @type {string} */
	#sql;
	/** @type {unknown[]} */
	#params;

	/**
	 * @param {Send} send
	 * @param {string} sql
	 * @param {unknown[]} [params] ya codificados con `encodeParam`
	 */
	constructor(send, sql, params = []) {
		this.#send = send;
		this.#sql = sql;
		this.#params = params;
	}

	/** @param {...unknown} values */
	bind(...values) {
		return new TestD1PreparedStatement(this.#send, this.#sql, values.map(encodeParam));
	}

	/** @param {string} op @param {unknown[]} args */
	#run(op, args) {
		return this.#send({ op, statement: this[kSerialize](), args });
	}

	/** @param {string} [column] */
	first(column) {
		return this.#run('first', column === undefined ? [] : [column]);
	}

	all() {
		return this.#run('all', []);
	}

	run() {
		return this.#run('run', []);
	}

	/** @param {{ columnNames?: boolean }} [options] */
	raw(options) {
		return this.#run('raw', options === undefined ? [] : [options]);
	}

	[kSerialize]() {
		return [this.#sql, this.#params];
	}
}

/**
 * D1 de prueba con la API que usa la app (`prepare`/`bind`/`first`/`all`/`run`/`raw`, `batch`,
 * `exec`). Cada consulta es un solo pedido asincrónico al worker de miniflare.
 */
class TestD1Database {
	/** @type {Send} */
	#send;

	/** @param {Send} send */
	constructor(send) {
		this.#send = send;
	}

	/** @param {string} sql */
	prepare(sql) {
		return new TestD1PreparedStatement(this.#send, sql);
	}

	/** @param {TestD1PreparedStatement[]} statements */
	batch(statements) {
		return this.#send({ op: 'batch', statements: statements.map((s) => s[kSerialize]()) });
	}

	/** @param {string} sql */
	exec(sql) {
		return this.#send({ op: 'exec', sql });
	}

	/**
	 * Un `batch` por cada lista de SQL (sin parámetros), en orden, en un solo pedido.
	 *
	 * @param {string[][]} batches
	 */
	[kBatches](batches) {
		return this.#send({ op: 'batches', batches });
	}

	[kReset]() {
		return this.#send({ op: 'reset' });
	}
}

/** `Miniflare` de la misma copia que usa wrangler (no es dependencia directa del proyecto). */
function loadMiniflare() {
	const require = createRequire(import.meta.url);
	const fromWrangler = createRequire(require.resolve('wrangler'));
	return /** @type {typeof import('miniflare')} */ (fromWrangler('miniflare'));
}

/** Carpetas de las bases de prueba que siguen abiertas en este proceso. */
/** @type {Set<string>} */
const liveDirs = new Set();
let exitHookInstalled = false;

/** Dónde crear las carpetas: `/dev/shm` (en memoria) si se puede escribir; si no, la temporal. */
function storageRoot() {
	try {
		accessSync('/dev/shm', fsConstants.W_OK);
		return '/dev/shm';
	} catch {
		return os.tmpdir();
	}
}

/** Carpeta nueva para los datos de una base de prueba; se borra sí o sí al salir del proceso. */
async function makeStorageDir() {
	const dir = await mkdtemp(path.join(storageRoot(), 'kinkyvibe-test-db-'));
	liveDirs.add(dir);
	if (!exitHookInstalled) {
		exitHookInstalled = true;
		process.once('exit', () => {
			for (const d of liveDirs) rmSync(d, { recursive: true, force: true });
		});
	}
	return dir;
}

/**
 * @param {{ migrate?: boolean }} [options]
 */
export async function createTestDB({ migrate = true } = {}) {
	const { Miniflare, convertV4MiniflareOptions } = loadMiniflare();
	// `envFiles: []`: sin leer `.dev.vars`/`.env` (como antes con getPlatformProxy). wrangler lo
	// acepta en tiempo de ejecución aunque sus tipos todavía no lo declaren.
	const options = /** @type {Parameters<typeof unstable_getMiniflareWorkerOptions>[2]} */ (
		/** @type {unknown} */ ({ envFiles: [] })
	);
	const { workerOptions } = unstable_getMiniflareWorkerOptions('wrangler.toml', undefined, options);
	const d1 = /** @type {Record<string, unknown> | string[] | undefined} */ (
		workerOptions.d1Databases
	);
	if (!d1 || !(Array.isArray(d1) ? d1.includes('DB') : 'DB' in d1))
		throw new Error('wrangler.toml no define el binding D1 `DB`');
	// Los bindings de wrangler.toml, sin lo que solo tiene sentido con el código del worker de verdad
	// (acá el script es el de arriba).
	/** @type {Record<string, unknown>} */
	const bindings = { ...workerOptions };
	for (const key of ['modulesRules', 'cronTriggers', 'queueConsumers', 'tails', 'streamingTails'])
		delete bindings[key];
	const dir = await makeStorageDir();
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			resourcePersistencePath: dir,
			workers: [{ ...bindings, name: 'kinkyvibe-test-db', modules: true, script: D1_WORKER }]
		})
	);
	const dispose = async () => {
		try {
			await mf.dispose();
		} finally {
			liveDirs.delete(dir);
			await rm(dir, { recursive: true, force: true });
		}
	};
	/** @type {Send} */
	const send = async (body) => {
		const res = await mf.dispatchFetch('http://test-db.local/', {
			method: 'POST',
			body: JSON.stringify(body)
		});
		const out = /** @type {{ value?: unknown, error?: SerializedError }} */ (await res.json());
		if (out.error) throw reviveError(out.error);
		return out.value;
	};
	const db = /** @type {import('@cloudflare/workers-types').D1Database} */ (
		/** @type {unknown} */ (new TestD1Database(send))
	);
	const proxied = /** @type {App.Platform['env']} */ (await mf.getBindings());
	const env = /** @type {App.Platform['env']} */ ({ ...proxied, DB: db });
	if (migrate) await applyMigrations(db);
	return {
		db,
		env,
		/** Plataforma con la forma de `event.platform` en SvelteKit. */
		platform: /** @type {App.Platform} */ ({ env }),
		dispose
	};
}

/**
 * Las sentencias que vacían la base, a partir de lo que devolvieron las consultas de
 * `RESET_CATALOG`. Sin nada de afuera (ni imports ni variables del módulo): también se copia tal
 * cual dentro del worker de prueba (`D1_WORKER`), para hacer `resetDB` en un solo pedido.
 *
 * @param {Record<string, unknown>[]} results tablas (`name`, `sql`) de sqlite_master
 * @param {Record<string, unknown>[]} tableList `name`, `type` de pragma_table_list
 * @returns {string[]} vacío si no hay tablas
 */
function planReset(results, tableList) {
	if (!results.length) return [];
	// Tablas sombra de FTS5 (`x_data`, `x_idx`…): no se tocan, las maneja SQLite; vaciarlas a mano
	// rompe el índice. Las FTS con contenido externo (`content=otra`) se vacían solas por sus
	// triggers al borrar la tabla de contenido, y al final se reconstruyen por las dudas.
	const shadows = new Set(tableList.filter((r) => r.type === 'shadow').map((r) => String(r.name)));
	/** @param {unknown} name */
	const q = (name) => `"${String(name).replaceAll('"', '""')}"`;
	const isVirtual = (/** @type {unknown} */ sql) =>
		/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(String(sql));
	const external = (/** @type {unknown} */ sql) =>
		isVirtual(sql) && /\bcontent\s*=\s*'[^']+'/i.test(String(sql));
	const tables = results.filter((r) => !shadows.has(String(r.name)) && !external(r.sql));
	const rebuild = results.filter((r) => external(r.sql));
	// Los nombres vienen de sqlite_master, no del usuario; igual los citamos. D1 aplica las
	// foreign keys: diferirlas al final del batch permite borrar en cualquier orden.
	return [
		'PRAGMA defer_foreign_keys = on',
		...tables.map((r) => `DELETE FROM ${q(r.name)}`),
		...rebuild.map((r) => `INSERT INTO ${q(r.name)} (${q(r.name)}) VALUES ('rebuild')`)
	];
}

/**
 * Borra todas las filas de las tablas de la app (para aislar tests dentro de un archivo).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function resetDB(db) {
	// Con el D1 de prueba, todo (catálogo y borrado) en un solo pedido al worker.
	if (db instanceof TestD1Database) return void (await db[kReset]());
	/** @type {import('@cloudflare/workers-types').D1Result<Record<string, unknown>>[]} */
	const [{ results }, { results: tableList }] = await db.batch(
		RESET_CATALOG.map((sql) => db.prepare(sql))
	);
	const statements = planReset(results, tableList);
	if (statements.length) await db.batch(statements.map((sql) => db.prepare(sql)));
}

/**
 * Una vista de `db` que cuenta las consultas, para las pruebas de rendimiento: cada `first`,
 * `all`, `run` o `raw` es una, y cada `batch` también es una (una sola vuelta a la base). Guarda
 * el SQL y lo que devolvió cada una, para ver cuánto viaja desde la base.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export function countingDB(db) {
	/** @type {{ sql: string, result: unknown }[]} */
	const log = [];
	const RAW = Symbol('statement');
	/** @type {WeakMap<object, string>} */
	const sqlOf = new WeakMap();
	/**
	 * @param {any} statement
	 * @param {string} sql
	 * @returns {any}
	 */
	const wrap = (statement, sql) => {
		const proxy = new Proxy(statement, {
			get(target, prop) {
				if (prop === RAW) return target;
				if (prop === 'bind') {
					return (/** @type {unknown[]} */ ...args) => wrap(target.bind(...args), sql);
				}
				if (prop === 'first' || prop === 'all' || prop === 'run' || prop === 'raw') {
					return async (/** @type {unknown[]} */ ...args) => {
						const result = await target[prop](...args);
						log.push({ sql, result });
						return result;
					};
				}
				const value = target[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		});
		sqlOf.set(proxy, sql);
		return proxy;
	};
	const counted = /** @type {import('@cloudflare/workers-types').D1Database} */ (
		new Proxy(db, {
			get(target, prop) {
				if (prop === 'prepare') {
					return (/** @type {string} */ sql) => wrap(target.prepare(sql), sql);
				}
				if (prop === 'batch') {
					return async (/** @type {any[]} */ statements) => {
						const result = await target.batch(statements.map((s) => s[RAW] ?? s));
						log.push({ sql: statements.map((s) => sqlOf.get(s) ?? '?').join(';\n'), result });
						return result;
					};
				}
				const value = /** @type {any} */ (target)[prop];
				return typeof value === 'function' ? value.bind(target) : value;
			}
		})
	);
	return {
		db: counted,
		log,
		/** Cuántas consultas desde el último `reset`. */
		get queries() {
			return log.length;
		},
		/** Cuánto devolvieron (largo del JSON de los resultados). */
		bytes: () => log.reduce((n, q) => n + JSON.stringify(q.result ?? null).length, 0),
		reset: () => {
			log.length = 0;
		}
	};
}
