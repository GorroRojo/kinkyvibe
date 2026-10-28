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
 * sentencia en Node y la manda entera, como un mensaje por un WebSocket abierto con un worker
 * chiquito que la corre contra el D1 de verdad (el mismo de miniflare, con su SQLite y sus errores).
 * Un mensaje cuesta ~2 ms; un pedido HTTP por consulta (`dispatchFetch`, lo de antes) costaba ~6.
 * Lo que no entra en un mensaje sigue yendo por `dispatchFetch`. El resto de los bindings
 * (`BACKUPS`…) siguen siendo los proxies de miniflare.
 *
 * Las migraciones se aplican una sola vez por corrida de vitest, en una plantilla
 * (`startTemplateDB`, desde `src/tests/globalSetup.js`): cada base nueva copia ese SQLite en vez de
 * migrar. Si no hay plantilla lista, migra como siempre.
 *
 * Aunque la base arranca vacía, miniflare guarda el SQLite de D1 (y lo de R2) en disco, y cada
 * consulta es una transacción que espera a que el disco confirme: eso eran ~3 ms por consulta.
 * Por eso cada base de prueba vive en una carpeta temporal en memoria (`/dev/shm`, si existe y
 * se puede escribir; si no, la carpeta temporal del sistema), que se borra en `dispose()` o al
 * salir del proceso. Mismo motor y mismas consultas: solo cambia dónde está el archivo.
 */
import { createHash } from 'node:crypto';
import { accessSync, constants as fsConstants, rmSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/**
 * wrangler, cargado solo si hace falta: importarlo cuesta más de un segundo de CPU por proceso (su
 * bundle tiene ~15 MB) y cada archivo de pruebas con base es un proceso nuevo. Con la plantilla y
 * las opciones del worker que arma el globalSetup (`startTemplateDB`), un archivo de pruebas no lo
 * carga nunca: solo lo usan las migraciones (partir los `.sql`) y leer `wrangler.toml`.
 * @type {Promise<typeof import('wrangler')> | undefined}
 */
let wranglerModule;
const loadWrangler = () => (wranglerModule ??= import('wrangler'));

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
	const sqls = await Promise.all(files.map((file) => readFile(path.join(dir, file), 'utf8')));
	// Huella de los archivos (nombre y contenido), para saber si la plantilla es de estas migraciones.
	const hash = createHash('sha256');
	files.forEach((file, i) => hash.update(`${file}\0${sqls[i]}\0`));
	/** @type {Promise<string[][]> | undefined} */
	let split;
	return {
		files,
		hash: hash.digest('hex'),
		/** Las sentencias de cada archivo (parte con wrangler, solo cuando se van a aplicar). */
		batches: () =>
			(split ??= loadWrangler().then(({ unstable_splitSqlQuery }) =>
				sqls.map((sql) => unstable_splitSqlQuery(sql).filter((s) => s.trim()))
			))
	};
}

/** Las migraciones del repo, leídas una sola vez por proceso (los tests no las cambian). */
/** @type {ReturnType<typeof readMigrations> | undefined} */
let repoMigrations;

function readRepoMigrations() {
	repoMigrations ??= readMigrations(MIGRATIONS_DIR).catch((error) => {
		repoMigrations = undefined;
		throw error;
	});
	return repoMigrations;
}

/**
 * Aplica cada archivo de migraciones en un `batch` (una transacción), en orden.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} [dir]
 */
export async function applyMigrations(db, dir = MIGRATIONS_DIR) {
	// Solo se cachea el directorio del repo: los tests que arman uno temporal lo pueden cambiar.
	const migrations =
		dir === MIGRATIONS_DIR ? await readRepoMigrations() : await readMigrations(dir);
	const batches = (await migrations.batches()).filter((statements) => statements.length);
	if (db instanceof TestD1Database) {
		// Lo mismo, pero en un solo pedido al worker: allá corre un `batch` por archivo, en orden, y
		// frena en el primero que falle (los anteriores quedan aplicados, como en el loop de abajo).
		await db[kBatches](batches);
	} else {
		for (const statements of batches) await db.batch(statements.map((s) => db.prepare(s)));
	}
	return migrations.files;
}

/**
 * Lo más largo (en caracteres de JSON) que viaja en un mensaje del WebSocket. workerd corta mensajes
 * bastante más grandes (probado: 20 MB pasan, 120 MB cierran el canal); lo que se pasa de esto va
 * por un pedido HTTP suelto, como antes.
 */
const WS_MAX_CHARS = 4 * 1024 * 1024;

/** Las dos consultas de catálogo de `resetDB` (van juntas en un batch). */
const RESET_CATALOG = [
	"SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'",
	"SELECT name, type, wr FROM pragma_table_list WHERE schema = 'main'"
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
const planSnapshot = ${planSnapshot.toString()};
const q = (name) => '"' + String(name).replaceAll('"', '""') + '"';
// Lo que JSON no representa, marcado como en encodeParam (bytes y números no finitos o -0).
const encode = (v) =>
	v instanceof ArrayBuffer
		? { $b: Array.from(new Uint8Array(v)) }
		: ArrayBuffer.isView(v)
			? { $b: Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) }
			: typeof v === 'number' && (!Number.isFinite(v) || Object.is(v, -0))
				? { $n: String(v) }
				: v;
// Lo que no entra en un mensaje del canal (ver WS_MAX_CHARS) queda acá hasta que Node lo pide con
// un fetch (op 'take'). Un solo isolate: todos los pedidos lo ven.
const stash = new Map();
let stashId = 0;
async function run(db, body) {
	let value;
	if (body.op === 'batch') value = await db.batch(body.statements.map((s) => statement(db, s)));
	else if (body.op === 'reset') {
		const [{ results }, { results: tableList }] = await db.batch(RESET_CATALOG.map((sql) => db.prepare(sql)));
		const statements = planReset(results, tableList);
		if (statements.length) await db.batch(statements.map((sql) => db.prepare(sql)));
	} else if (body.op === 'snapshot') {
		const [{ results }, { results: tableList }] = await db.batch(RESET_CATALOG.map((sql) => db.prepare(sql)));
		const plan = planSnapshot(results, tableList);
		const xinfo = 'SELECT name FROM pragma_table_xinfo(?1) WHERE hidden = 0 ORDER BY cid';
		const cols = plan.length ? await db.batch(plan.map((p) => db.prepare(xinfo).bind(p.name))) : [];
		const tables = plan.map((p, i) => ({
			table: p.name,
			columns: [...(p.virtual ? ['rowid'] : []), ...cols[i].results.map((r) => String(r.name))]
		}));
		const data = tables.length
			? await db.batch(tables.map((t, i) => db.prepare(
				'SELECT ' + t.columns.map(q).join(', ') + ' FROM ' + q(t.table) +
				(plan[i].ordered ? ' ORDER BY rowid' : '')
			)))
			: [];
		value = tables.map((t, i) => ({
			...t,
			rows: data[i].results.map((row) => t.columns.map((c) => encode(row[c])))
		}));
	} else if (body.op === 'restore') {
		const [{ results }, { results: tableList }] = await db.batch(RESET_CATALOG.map((sql) => db.prepare(sql)));
		const statements = planReset(results, tableList).map((sql) => db.prepare(sql));
		for (const t of body.tables) {
			if (!t.rows.length) continue;
			const insert = db.prepare(
				'INSERT INTO ' + q(t.table) + ' (' + t.columns.map(q).join(', ') + ') VALUES (' +
				t.columns.map((_, i) => '?' + (i + 1)).join(', ') + ')'
			);
			for (const row of t.rows) statements.push(insert.bind(...row.map(revive)));
		}
		if (statements.length) await db.batch(statements);
	} else if (body.op === 'batches') {
		value = [];
		for (const sqls of body.batches) value.push(await db.batch(sqls.map((sql) => db.prepare(sql))));
	}
	else if (body.op === 'exec') value = await db.exec(body.sql);
	else value = await statement(db, body.statement)[body.op](...body.args);
	return value === undefined ? null : value;
}
export default {
	async fetch(request, env) {
		// Canal persistente: un WebSocket por base, con un id por mensaje (las respuestas pueden
		// llegar en otro orden, como con pedidos sueltos).
		if (request.headers.get('upgrade') === 'websocket') {
			const [client, server] = Object.values(new WebSocketPair());
			server.accept();
			server.addEventListener('message', async (event) => {
				let id;
				let out;
				try {
					const message = JSON.parse(event.data);
					id = message.id;
					out = JSON.stringify({ id, value: await run(env.DB, message.body) });
				} catch (e) {
					out = JSON.stringify({ id, error: errorJSON(e) });
				}
				if (out.length > ${WS_MAX_CHARS}) {
					const key = ++stashId;
					stash.set(key, out);
					out = JSON.stringify({ id, stashed: key });
				}
				server.send(out);
			});
			server.addEventListener('close', () => server.close());
			return new Response(null, { status: 101, webSocket: client });
		}
		try {
			const body = await request.json();
			if (body.op === 'take') {
				const out = stash.get(body.key);
				stash.delete(body.key);
				return new Response(out, { headers: { 'content-type': 'application/json' } });
			}
			return Response.json({ value: await run(env.DB, body) });
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
/** `snapshotDB` y `restoreDB`, cada uno en un solo pedido, sin exponerlos. */
const kSnapshot = Symbol('snapshot');
const kRestore = Symbol('restore');

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

	[kSnapshot]() {
		return this.#send({ op: 'snapshot' });
	}

	/** @param {unknown} tables */
	[kRestore](tables) {
		return this.#send({ op: 'restore', tables });
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
 * Variable de entorno con la carpeta de la plantilla: una base ya migrada que arma
 * `startTemplateDB()` (globalSetup de vitest, `src/tests/globalSetup.js`) una vez por corrida.
 */
export const TEMPLATE_ENV = 'KINKYVIBE_TEST_DB_TEMPLATE';
/** Dentro de la carpeta de la plantilla: los datos de miniflare y la huella de las migraciones. */
const TEMPLATE_DATA = 'data';
const TEMPLATE_HASH = 'migrations.sha256';

/**
 * Variable de entorno con las opciones de miniflare que salen de `wrangler.toml` (en JSON): las
 * lee una vez por corrida el globalSetup (`startTemplateDB`), así los procesos de las pruebas no
 * cargan wrangler para leer el mismo archivo cada uno.
 */
export const WORKER_OPTIONS_ENV = 'KINKYVIBE_TEST_DB_WORKER_OPTIONS';

/** Los bindings de `wrangler.toml` como opciones de miniflare, leídos con wrangler. */
async function readWorkerOptions() {
	const { unstable_getMiniflareWorkerOptions } = await loadWrangler();
	// `envFiles: []`: sin leer `.dev.vars`/`.env` (como antes con getPlatformProxy). wrangler lo
	// acepta en tiempo de ejecución aunque sus tipos todavía no lo declaren.
	const options = /** @type {Parameters<typeof unstable_getMiniflareWorkerOptions>[2]} */ (
		/** @type {unknown} */ ({ envFiles: [] })
	);
	return unstable_getMiniflareWorkerOptions('wrangler.toml', undefined, options).workerOptions;
}

/**
 * Las opciones del worker: las que dejó el globalSetup en `WORKER_OPTIONS_ENV` o, si no hay (o no
 * se pueden leer), las de `wrangler.toml` leídas acá.
 * @returns {Promise<Record<string, unknown>>}
 */
async function testWorkerOptions() {
	const json = process.env[WORKER_OPTIONS_ENV];
	if (json) {
		try {
			return JSON.parse(json);
		} catch {
			// se leen de nuevo abajo
		}
	}
	return /** @type {Record<string, unknown>} */ (await readWorkerOptions());
}

/**
 * Levanta miniflare con el worker de prueba sobre `dir` (lo que ya haya ahí, se usa).
 *
 * @param {string} dir
 */
async function openTestDB(dir) {
	const { Miniflare, convertV4MiniflareOptions } = loadMiniflare();
	const workerOptions = await testWorkerOptions();
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
	const mf = new Miniflare(
		convertV4MiniflareOptions({
			resourcePersistencePath: dir,
			workers: [{ ...bindings, name: 'kinkyvibe-test-db', modules: true, script: D1_WORKER }]
		})
	);
	/** @param {string} json */
	const viaFetch = async (json) => {
		const res = await mf.dispatchFetch('http://test-db.local/', { method: 'POST', body: json });
		return /** @type {WireResult} */ (await res.json());
	};
	// El canal persistente; si no se pudo abrir (o se cayó), cada consulta va en su propio pedido.
	const channel = await openChannel(mf).catch(() => null);
	/** @type {Send} */
	const send = async (body) => {
		const json = JSON.stringify(body);
		let out =
			channel?.open && json.length <= WS_MAX_CHARS
				? await channel.call(json)
				: await viaFetch(json);
		if (out.stashed !== undefined)
			out = await viaFetch(JSON.stringify({ op: 'take', key: out.stashed }));
		if (out.error) throw reviveError(out.error);
		return out.value;
	};
	const db = /** @type {import('@cloudflare/workers-types').D1Database} */ (
		/** @type {unknown} */ (new TestD1Database(send))
	);
	const dispose = async () => {
		channel?.close();
		await mf.dispose();
	};
	return { mf, db, dispose };
}

/**
 * @typedef {{ value?: unknown, error?: SerializedError, stashed?: number }} WireResult
 *   Lo que contesta el worker: el valor, el error, o (por el canal) que lo pida con un fetch.
 */

/**
 * Abre el WebSocket con el worker de prueba: cada consulta es un mensaje con un id, y la respuesta
 * vuelve con el mismo id. Mismo worker, mismo D1 y mismas respuestas que con `dispatchFetch`, pero
 * sin armar un pedido HTTP por consulta (~1,7 ms por consulta en vez de ~6, medido).
 *
 * Si el canal se cierra con consultas en vuelo, esas fallan (no se reintentan: podrían haberse
 * aplicado) y las siguientes van por `dispatchFetch`.
 *
 * @param {import('miniflare').Miniflare} mf
 */
async function openChannel(mf) {
	const res = await mf.dispatchFetch('http://test-db.local/', {
		headers: { upgrade: 'websocket' }
	});
	const ws = res.webSocket;
	if (!ws) return null;
	ws.accept();
	/** @type {Map<number, { resolve: (out: WireResult) => void, reject: (e: Error) => void }>} */
	const pending = new Map();
	let next = 0;
	let open = true;
	/** @param {Error} error */
	const fail = (error) => {
		open = false;
		for (const p of pending.values()) p.reject(error);
		pending.clear();
	};
	ws.addEventListener('message', (event) => {
		const out = /** @type {WireResult & { id: number }} */ (JSON.parse(String(event.data)));
		const p = pending.get(out.id);
		pending.delete(out.id);
		p?.resolve(out);
	});
	ws.addEventListener('close', (event) =>
		fail(new Error(`testing.js: se cerró el canal con la base de prueba (${event.code})`))
	);
	ws.addEventListener('error', () =>
		fail(new Error('testing.js: falló el canal con la base de prueba'))
	);
	return {
		get open() {
			return open;
		},
		/**
		 * @param {string} json el cuerpo, ya en JSON
		 * @returns {Promise<WireResult>}
		 */
		call(json) {
			return new Promise((resolve, reject) => {
				const id = ++next;
				pending.set(id, { resolve, reject });
				ws.send(`{"id":${id},"body":${json}}`);
			});
		},
		close() {
			if (!open) return;
			open = false;
			ws.close();
		}
	};
}

/**
 * La carpeta de la plantilla, si la hay, ya terminó de armarse y es de estas mismas migraciones.
 * Si no, `null` (y se migra como siempre).
 */
async function readyTemplate() {
	const dir = process.env[TEMPLATE_ENV];
	if (!dir) return null;
	const hash = await readFile(path.join(dir, TEMPLATE_HASH), 'utf8').catch(() => null);
	if (!hash) return null;
	return hash === (await readRepoMigrations()).hash ? path.join(dir, TEMPLATE_DATA) : null;
}

/**
 * Una base de prueba nueva, aislada (su propio miniflare y su propia carpeta).
 *
 * Con `migrate` (lo normal), la base arranca con todas las migraciones de `migrations/`. Si hay
 * plantilla lista (`startTemplateDB`, una vez por corrida de vitest), en vez de aplicarlas se copia
 * el SQLite de la plantilla, que es una base migrada igual (lo comprueba `template.test.js`). Si no
 * hay plantilla, no terminó de armarse, es de otras migraciones o falla la copia, se migra como
 * siempre. `template: false` fuerza el camino de siempre.
 *
 * @param {{ migrate?: boolean, template?: boolean }} [options]
 */
export async function createTestDB({ migrate = true, template = true } = {}) {
	const dir = await makeStorageDir();
	let fromTemplate = false;
	if (migrate && template) {
		const source = await readyTemplate().catch(() => null);
		if (source) {
			fromTemplate = await cp(source, dir, { recursive: true }).then(
				() => true,
				async () => {
					// Copia a medias: se vacía y se migra como siempre.
					await rm(dir, { recursive: true, force: true });
					await mkdir(dir, { recursive: true });
					return false;
				}
			);
		}
	}
	/** @type {Awaited<ReturnType<typeof openTestDB>>} */
	let opened;
	try {
		opened = await openTestDB(dir);
	} catch (error) {
		liveDirs.delete(dir);
		await rm(dir, { recursive: true, force: true });
		throw error;
	}
	const { mf, db } = opened;
	const dispose = async () => {
		try {
			await opened.dispose();
		} finally {
			liveDirs.delete(dir);
			await rm(dir, { recursive: true, force: true });
		}
	};
	const proxied = /** @type {App.Platform['env']} */ (await mf.getBindings());
	const env = /** @type {App.Platform['env']} */ ({ ...proxied, DB: db });
	if (migrate && !fromTemplate) await applyMigrations(db);
	return {
		db,
		env,
		/** Plataforma con la forma de `event.platform` en SvelteKit. */
		platform: /** @type {App.Platform} */ ({ env }),
		/** Si arrancó de la plantilla (para `template.test.js`). */
		fromTemplate,
		dispose
	};
}

/**
 * Arma la plantilla en `target`: migra una base nueva, apaga miniflare (el SQLite queda cerrado y
 * completo en disco) y recién al final escribe la huella de las migraciones, que es lo que marca
 * que la plantilla está lista. Si algo falla, no queda huella y nadie la usa.
 *
 * @param {string} target carpeta (vacía) de la plantilla
 */
export async function buildTemplateDB(target) {
	const data = path.join(target, TEMPLATE_DATA);
	await mkdir(data, { recursive: true });
	const { db, dispose } = await openTestDB(data);
	let hash;
	try {
		await applyMigrations(db);
		hash = (await readRepoMigrations()).hash;
	} finally {
		await dispose();
	}
	const tmp = path.join(target, `${TEMPLATE_HASH}.tmp`);
	await writeFile(tmp, hash);
	await rename(tmp, path.join(target, TEMPLATE_HASH));
}

/**
 * Para el globalSetup de vitest: elige la carpeta de la plantilla, la anuncia en `TEMPLATE_ENV`
 * (los procesos de las pruebas la heredan) y la arma en segundo plano, sin frenar el arranque: los
 * archivos que piden una base antes de que esté lista migran como siempre. Devuelve el teardown,
 * que espera a que termine y la borra.
 */
export async function startTemplateDB() {
	const target = await mkdtemp(path.join(storageRoot(), 'kinkyvibe-test-db-template-'));
	process.env[TEMPLATE_ENV] = target;
	// Las opciones del worker también se leen una vez acá (ver WORKER_OPTIONS_ENV). Si falla, cada
	// proceso las lee solo, como antes.
	const workerOptions = await readWorkerOptions().catch(() => null);
	if (workerOptions) process.env[WORKER_OPTIONS_ENV] = JSON.stringify(workerOptions);
	const building = buildTemplateDB(target).catch((error) => {
		console.warn(
			`testing.js: no se pudo armar la plantilla de la base (se migra en cada archivo): ${error}`
		);
	});
	return async () => {
		await building;
		delete process.env[TEMPLATE_ENV];
		delete process.env[WORKER_OPTIONS_ENV];
		await rm(target, { recursive: true, force: true });
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
 * Qué tablas guarda `snapshotDB`: las mismas que vacía `planReset` (sin las sombra de FTS5 ni las
 * FTS con contenido externo, que se llenan solas por sus triggers al insertar en su tabla de
 * contenido). También se copia tal cual dentro del worker de prueba: sin nada de afuera.
 *
 * @param {Record<string, unknown>[]} results tablas (`name`, `sql`) de sqlite_master
 * @param {Record<string, unknown>[]} tableList `name`, `type`, `wr` de pragma_table_list
 * @returns {{ name: string, virtual: boolean, ordered: boolean }[]}
 *   `virtual`: guarda también el `rowid`; `ordered`: se lee por `rowid` (orden de inserción)
 */
function planSnapshot(results, tableList) {
	const info = new Map(tableList.map((r) => [String(r.name), r]));
	const isVirtual = (/** @type {unknown} */ sql) =>
		/^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(String(sql));
	const external = (/** @type {unknown} */ sql) =>
		isVirtual(sql) && /\bcontent\s*=\s*'[^']+'/i.test(String(sql));
	return results
		.filter((r) => info.get(String(r.name))?.type !== 'shadow' && !external(r.sql))
		.map((r) => {
			const virtual = isVirtual(r.sql);
			return {
				name: String(r.name),
				virtual,
				ordered: virtual || !info.get(String(r.name))?.wr
			};
		});
}

/**
 * @typedef {{ table: string, columns: string[], rows: unknown[][] }[]} DBSnapshot
 *   Las filas de cada tabla de la app (sin las columnas generadas), listas para `restoreDB`.
 */

/**
 * Una copia de todas las filas de la base de prueba, en un solo pedido. Para cuando cada prueba
 * de un archivo arranca con los mismos datos y armarlos es caro (por ejemplo, importar todas las
 * etiquetas de la semilla: ~10 s con la máquina cargada): se arman una vez, se guarda la copia y
 * cada prueba la vuelve a poner con `restoreDB` (un solo pedido), en vez de importarlos de nuevo.
 * Solo con el D1 de `createTestDB()`.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @returns {Promise<DBSnapshot>}
 */
export async function snapshotDB(db) {
	if (!(db instanceof TestD1Database)) throw new Error('snapshotDB: solo con createTestDB()');
	return db[kSnapshot]();
}

/**
 * Deja la base exactamente con las filas de `snapshot` (de `snapshotDB`): la vacía como
 * `resetDB` e inserta cada fila con sus mismos ids, todo en una sola tanda (un pedido). Las
 * columnas generadas y los índices FTS con contenido externo se recalculan solos. Como con
 * `resetDB`, los AUTOINCREMENT no vuelven atrás: los ids nuevos siguen siendo únicos.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {DBSnapshot} snapshot
 */
export async function restoreDB(db, snapshot) {
	if (!(db instanceof TestD1Database)) throw new Error('restoreDB: solo con createTestDB()');
	await db[kRestore](snapshot);
}

/**
 * Una vista de `db` que cuenta las consultas, para las pruebas de rendimiento: cada `first`,
 * `all`, `run` o `raw` es una, y cada `batch` también es una (una sola vuelta a la base). Guarda
 * el SQL y lo que devolvió cada una, para ver cuánto viaja desde la base.
 *
 * `waves`: cuántas tandas en fila (cada consulta que sale después de que terminó otra está una
 * tanda más atrás; las que salen a la par, en la misma). En D1 lejos, cada tanda es una ida y
 * vuelta que se espera. Con `delayMs`, cada consulta tarda eso de más, para que lo que sale a la
 * par no se cuente como en fila por el ruido del D1 local.
 *
 * `trace`: cada consulta guarda en `from` las funciones de la app que la pidieron (`describe()`).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ delayMs?: number, trace?: boolean }} [opts]
 */
export function countingDB(db, { delayMs = 0, trace = false } = {}) {
	/** @type {{ sql: string, result: unknown, wave: number, from?: string }[]} */
	const log = [];
	// Las sentencias (una tanda, `batch`, lleva varias en una ida).
	let statements = 0;
	// La tanda más honda de las consultas que ya terminaron, y la más honda de todas.
	let doneWave = 0;
	let maxWave = 0;
	/**
	 * @template T
	 * @param {string} sql
	 * @param {() => Promise<T>} run
	 * @returns {Promise<T>}
	 */
	const timed = async (sql, run) => {
		const wave = doneWave + 1;
		maxWave = Math.max(maxWave, wave);
		const from = trace ? callers(new Error().stack) : undefined;
		if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
		try {
			const result = await run();
			log.push({ sql, result, wave, ...(from ? { from } : {}) });
			return result;
		} finally {
			doneWave = Math.max(doneWave, wave);
		}
	};
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
					return (/** @type {unknown[]} */ ...args) => {
						statements++;
						return timed(sql, () => target[prop](...args));
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
					return (/** @type {any[]} */ list) => {
						statements += list.length;
						return timed(list.map((s) => sqlOf.get(s) ?? '?').join(';\n'), () =>
							target.batch(list.map((s) => s[RAW] ?? s))
						);
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
		/** Cuántas consultas desde el último `reset` (una tanda, `batch`, es una: una ida). */
		get queries() {
			return log.length;
		},
		/** Cuántas sentencias (las de una tanda, cada una). */
		get statements() {
			return statements;
		},
		/** Cuánto devolvieron (largo del JSON de los resultados). */
		bytes: () => log.reduce((n, q) => n + JSON.stringify(q.result ?? null).length, 0),
		/** Cuántas tandas en fila desde el último `reset` (ver arriba). */
		get waves() {
			return maxWave;
		},
		reset: () => {
			log.length = 0;
			statements = 0;
			doneWave = 0;
			maxWave = 0;
		},
		/** Las consultas por tanda, una línea cada una (con `trace`, quién la pidió). */
		describe: () =>
			log
				.slice()
				.sort((a, b) => a.wave - b.wave)
				.map(
					(q) =>
						`  ${q.wave}. ${q.sql.replace(/\s+/g, ' ').slice(0, 90)}${q.from ? `\n       ← ${q.from}` : ''}`
				)
				.join('\n')
	};
}

/**
 * Las funciones de la app que pidieron una consulta (de la pila), sin las de este archivo ni las
 * de node_modules: «quién la pidió», para {@link countingDB} con `trace`.
 * @param {string | undefined} stack
 */
function callers(stack) {
	return (stack ?? '')
		.split('\n')
		.slice(1)
		.map((line) => line.match(/at (?:async )?(\S+) \((?:.*?\/)?(src\/.+?):\d+:\d+\)$/))
		.filter((m) => m && !m[2].endsWith('db/testing.js'))
		.slice(0, 4)
		.map((m) => `${m?.[1]} (${m?.[2]?.split('/').pop()})`)
		.join(' ← ');
}
