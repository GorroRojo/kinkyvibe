/**
 * Tandas automáticas: dentro de un pedido de lectura (`GET`/`HEAD`), las lecturas (`SELECT` con
 * `.first()` o `.all()`) que salen mientras el código corre sin esperar a la red se juntan y van a
 * D1 en UNA ida (`db.batch`), en vez de una ida cada una. Va detrás de `getDB` (./index.js): el
 * código que consulta no cambia.
 *
 * Cuándo sale la tanda: con `setTimeout(0)`, o sea cuando el pedido ya no tiene nada que hacer
 * más que esperar (terminaron las microtareas). Todo lo que se pidió hasta ahí, por cualquier
 * camino (`Promise.all`, cargas a la par del layout y la página), va junto. Lo que depende de una
 * respuesta sale en la tanda siguiente: para bajar de idas hay que pedir antes (consultas por la
 * dirección en vez de por el id ya leído, o adelantar lo que se puede adivinar).
 *
 * Reglas:
 * - **Solo lecturas en pedidos de lectura.** Fuera de un pedido (crons, scripts, pruebas sin
 *   pedido) o en un `POST`, todo va directo, como siempre. `.run()`, `.raw()`, `exec` y lo que no
 *   empieza con `SELECT` van directo; antes de una escritura sale lo que estaba esperando (así
 *   nada leído antes de una escritura queda para después).
 * - **Una lectura igual, una vez por pedido**: la misma sentencia con los mismos parámetros
 *   devuelve la misma respuesta dentro del pedido (como `oncePerRequest`). Una escritura del pedido
 *   olvida todo lo leído. Quien recibe una respuesta repetida recibe una copia.
 * - **Errores**: una tanda de D1 es una transacción; si una sentencia falla, falla toda. Entonces
 *   cada consulta de la tanda se vuelve a correr sola, con su propio resultado o error, como si
 *   nunca se hubieran juntado (una ida más, solo cuando algo falla).
 * - Un `db.batch([...])` de la app con solo lecturas entra entero en la tanda (sus sentencias
 *   juntas, en orden, y su error es de todas, como antes); con escrituras va directo.
 * - Cada pedido tiene su propia tanda: el envoltorio es uno por binding (como el binding, lo
 *   guarda `setContentDB` para todo el isolate), pero lo que espera y lo leído son del pedido en
 *   curso (`scope()`), así una consulta nunca espera la I/O de otro pedido.
 *
 * Se apaga sin deploy con la variable `KV_D1_TANDAS = "off"` (./index.js).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('@cloudflare/workers-types').D1Result<Record<string, unknown>>} D1Result */

/**
 * Lo que espera salir: una consulta suelta (una sentencia) o un `db.batch` de la app (varias).
 * @typedef {{
 *   statements: D1PreparedStatement[],
 *   resolve: (results: D1Result[]) => void,
 *   reject: (error: unknown) => void
 * }} Unit
 */

/**
 * Lo de un pedido: lo que espera la próxima tanda y lo ya leído.
 * @typedef {{ pending: Unit[], timer: boolean, memo: Map<string, { promise: Promise<any> }> }} Scope
 */

/** A lo sumo esto por tanda (lo demás, en otra a la par). */
const MAX_PER_BATCH = 50;

/** ¿Es una lectura? Solo `SELECT` (un `WITH` puede terminar en una escritura). */
const isRead = (/** @type {string} */ sql) => /^\s*select\b/i.test(sql);

/** La sentencia de la app detrás de una nuestra. */
const INNER = Symbol('autoBatch.inner');
/** En un envoltorio: ¿junta las lecturas del pedido en curso? */
const BATCHING = Symbol('autoBatch.batching');

/**
 * ¿Esta base junta las lecturas del pedido en curso? Para quien adelanta consultas que solo
 * convienen si van en la misma ida y la de después recibe lo ya leído (sin tandas, adelantar es
 * consultar de más).
 * @param {unknown} db
 */
export function batchesReads(db) {
	return Boolean(db && /** @type {any} */ (db)[BATCHING]);
}

/**
 * La clave de una lectura para no repetirla en el pedido, o `null` si sus parámetros no se pueden
 * comparar (bytes, objetos raros): entonces no se recuerda.
 * @param {string} sql
 * @param {unknown[]} params
 */
function memoKey(sql, params) {
	if (!params.every((p) => p === null || ['string', 'number', 'boolean'].includes(typeof p)))
		return null;
	return `${sql}\u0000${JSON.stringify(params)}`;
}

/**
 * Devuelve la función que envuelve un binding D1 con tandas automáticas. `scope()` da el objeto del
 * pedido de lectura en curso (cualquier objeto propio del pedido), o `null` (entonces no junta).
 * Un envoltorio por binding.
 *
 * @param {() => object | null} scope
 * @returns {<T>(db: T) => T}
 */
export function autoBatcher(scope) {
	/** @type {WeakMap<object, Scope>} */
	const scopes = new WeakMap();
	/** @type {WeakMap<object, any>} */
	const wrappers = new WeakMap();

	/** @returns {Scope | null} */
	const current = () => {
		const key = scope();
		if (!key) return null;
		let s = scopes.get(key);
		if (!s) scopes.set(key, (s = { pending: [], timer: false, memo: new Map() }));
		return s;
	};

	/**
	 * Manda todo lo que espera en `s`.
	 * @param {D1Database} db
	 * @param {Scope} s
	 */
	const flush = (db, s) => {
		s.timer = false;
		const units = s.pending.splice(0);
		for (let i = 0; i < units.length;) {
			/** @type {Unit[]} */
			const group = [];
			let n = 0;
			while (i < units.length && (n === 0 || n + units[i].statements.length <= MAX_PER_BATCH)) {
				n += units[i].statements.length;
				group.push(units[i++]);
			}
			send(db, group);
		}
	};

	/**
	 * Una ida con estas consultas. Si falla, cada una sola.
	 * @param {D1Database} db
	 * @param {Unit[]} units
	 */
	const send = async (db, units) => {
		if (units.length === 1) return runAlone(db, units[0]);
		const flat = units.flatMap((u) => u.statements);
		let results;
		try {
			results = /** @type {D1Result[]} */ (await db.batch(flat));
		} catch {
			// Una tanda es una transacción: la falla de una se llevó a todas. Cada una sola.
			for (const u of units) runAlone(db, u);
			return;
		}
		let at = 0;
		for (const u of units) u.resolve(results.slice(at, (at += u.statements.length)));
	};

	/**
	 * @param {D1Database} db
	 * @param {Unit} u
	 */
	const runAlone = async (db, u) => {
		try {
			u.resolve(
				u.statements.length === 1
					? [/** @type {D1Result} */ (await u.statements[0].all())]
					: /** @type {D1Result[]} */ (await db.batch(u.statements))
			);
		} catch (error) {
			u.reject(error);
		}
	};

	/**
	 * Pone una consulta en la tanda del pedido.
	 * @param {D1Database} db
	 * @param {Scope} s
	 * @param {D1PreparedStatement[]} statements
	 * @returns {Promise<D1Result[]>}
	 */
	const enqueue = (db, s, statements) =>
		new Promise((resolve, reject) => {
			s.pending.push({ statements, resolve, reject });
			if (!s.timer) {
				s.timer = true;
				setTimeout(() => flush(db, s), 0);
			}
		});

	/**
	 * Antes de una escritura: sale lo que esperaba y se olvida lo leído.
	 * @param {D1Database} db
	 */
	const beforeWrite = (db) => {
		const s = current();
		if (!s) return;
		if (s.pending.length) flush(db, s);
		s.memo.clear();
	};

	/**
	 * Lo leído en el pedido con esta clave, o lo que da `ask()` (y queda recordado). Sin clave, sin
	 * recordar. Quien recibe una respuesta ya entregada recibe una copia.
	 * @template T
	 * @param {Scope} s
	 * @param {string | null} key
	 * @param {() => Promise<T>} ask
	 * @returns {Promise<T>}
	 */
	const remember = (s, key, ask) => {
		const known = key === null ? undefined : s.memo.get(key);
		// Una copia: quien preguntó primero puede cambiar lo que recibió.
		if (known) return known.promise.then((r) => structuredClone(r));
		const promise = ask();
		if (key !== null) {
			const entry = { promise };
			s.memo.set(key, entry);
			// Un error no se recuerda: la próxima vez se vuelve a preguntar.
			promise.catch(() => {
				if (s.memo.get(key) === entry) s.memo.delete(key);
			});
		}
		return promise;
	};

	/**
	 * Una lectura del pedido (`all()`): de lo ya leído, o a la tanda.
	 * @param {D1Database} db
	 * @param {Scope} s
	 * @param {D1PreparedStatement} inner
	 * @param {string} sql
	 * @param {unknown[]} params
	 * @returns {Promise<D1Result>}
	 */
	const read = (db, s, inner, sql, params) =>
		remember(s, memoKey(sql, params), () => enqueue(db, s, [inner]).then((results) => results[0]));

	/**
	 * @param {D1Database} db
	 * @param {D1PreparedStatement} inner
	 * @param {string} sql
	 * @param {unknown[]} params
	 * @returns {any}
	 */
	const statement = (db, inner, sql, params) => ({
		[INNER]: inner,
		sql,
		params,
		bind: (/** @type {unknown[]} */ ...args) => statement(db, inner.bind(...args), sql, args),
		all: () => {
			const s = isRead(sql) ? current() : null;
			if (!s) {
				if (!isRead(sql)) beforeWrite(db);
				return inner.all();
			}
			return read(db, s, inner, sql, params);
		},
		first: async (/** @type {string | undefined} */ column) => {
			const s = isRead(sql) ? current() : null;
			if (!s) {
				if (!isRead(sql)) beforeWrite(db);
				return column === undefined ? inner.first() : inner.first(column);
			}
			const row = (await read(db, s, inner, sql, params)).results?.[0];
			if (!row) return null;
			return column === undefined ? row : (row[column] ?? null);
		},
		run: () => {
			beforeWrite(db);
			return inner.run();
		},
		raw: (/** @type {any} */ ...args) => {
			if (!isRead(sql)) beforeWrite(db);
			return /** @type {any} */ (inner).raw(...args);
		}
	});

	return (db) => {
		if (!db || typeof db !== 'object' || typeof (/** @type {any} */ (db).prepare) !== 'function')
			return db;
		const known = wrappers.get(db);
		if (known) return known;
		const target = /** @type {D1Database} */ (/** @type {unknown} */ (db));
		const wrapper = new Proxy(/** @type {any} */ (db), {
			get(t, prop) {
				if (prop === BATCHING) return current() !== null;
				if (prop === 'prepare') {
					return (/** @type {string} */ sql) => statement(target, t.prepare(sql), sql, []);
				}
				if (prop === 'batch') {
					return (/** @type {any[]} */ statements) => {
						const inner = statements.map((st) => st?.[INNER] ?? st);
						const s = current();
						const reads = statements.every((st) => st?.[INNER] && isRead(st.sql));
						if (!s || !reads) {
							beforeWrite(target);
							return t.batch(inner);
						}
						const keys = statements.map((st) => memoKey(st.sql, st.params));
						const key = keys.includes(null) ? null : `batch\u0001${keys.join('\u0001')}`;
						return remember(s, key, () => enqueue(target, s, inner));
					};
				}
				if (prop === 'exec') {
					return (/** @type {string} */ sql) => {
						beforeWrite(target);
						return t.exec(sql);
					};
				}
				const value = t[prop];
				return typeof value === 'function' ? value.bind(t) : value;
			}
		});
		wrappers.set(db, wrapper);
		return wrapper;
	};
}
