/**
 * Lo que queda del «cliente del repo» del panel: el panel todavía habla en rutas de archivos
 * (`src/lib/posts/<categoría>/<dirección>.md`) cuando lee y guarda una publicación, y
 * ./repo.js (`withContentDb`) las lleva a la base. Desde la decisión 0032 no hay nada más: ni los
 * .md ni sus carpetas de medios están en el repo, y el panel nunca escribe en GitHub (antes lo
 * hacía con PRs `contenido/*` que se mergeaban solos).
 *
 * {@link sinRepo} es lo que `withContentDb` envuelve: un repo vacío. Lo que no es una publicación
 * de la base no existe, y guardarlo es un error ({@link NotInRepoError}).
 *
 * Solo imports relativos (lo usan pruebas sin Vite).
 */

/**
 * Un archivo de un guardado.
 * @typedef {object} CommitFile
 * @prop {string} path
 * @prop {string} [content] utf-8 text
 * @prop {string} [base64] contenido binario (ya no se guarda: no hay repo)
 * @prop {string} [sha] sha de un archivo que ya existía (ya no se usa: no hay repo)
 * @prop {boolean} [delete] borrar este archivo en el guardado
 */

/**
 * Lo que acompañaba un guardado cuando iba a GitHub (título del PR, quién guardó…). Se sigue
 * aceptando para no cambiar a quien llama; la base no lo usa.
 * @typedef {object} PublishOptions
 * @prop {string} [action]
 * @prop {string} [title]
 * @prop {string} [who]
 * @prop {string} [kind]
 * @prop {string} [slug]
 * @prop {boolean} [stack]
 */

/**
 * Lo que devuelve un guardado: en la base, `db` con lo que se guardó (`<categoría>/<dirección>`).
 * @typedef {object} PublishResult
 * @prop {string} [sha]
 * @prop {string} url
 * @prop {string[]} [db]
 * @prop {number} [number] (de cuando el guardado era un PR; ya no viene)
 * @prop {string} [branch]
 * @prop {boolean} [stacked]
 * @prop {'auto'|'merged'|'open'} [state]
 * @prop {string} [problem]
 */

/** Guardar algo que tenía que no existir (`mustNotExist`) y ya existe. */
export class PathExistsError extends Error {
	/** @param {string} path */
	constructor(path) {
		super(`Ya existe ${path}`);
		this.path = path;
	}
}

/** Guardar algo que cambió desde que se leyó (`unchanged`). */
export class FileChangedError extends Error {
	/** @param {string} path */
	constructor(path) {
		super(`${path} cambió mientras tanto`);
		this.path = path;
	}
}

/** Guardar algo que no es una publicación de la base (ya no hay repo donde ponerlo). */
export class NotInRepoError extends Error {
	/** @param {string} path */
	constructor(path) {
		super(
			`${path} no se puede guardar: el panel solo guarda eventos, material, perfiles y la wiki (en la base).`
		);
		this.name = 'NotInRepoError';
		this.path = path;
	}
}

/**
 * Un repo vacío, con la forma del viejo cliente de GitHub, para envolver con `withContentDb`.
 */
export const sinRepo = Object.freeze({
	/** @param {string} _token @param {string} _path @returns {Promise<string | null>} */
	getFile: async (_token, _path) => null,
	/**
	 * @param {string} _token @param {string} _path
	 * @returns {Promise<{ raw: string, sha: string, ref: string } | null>}
	 */
	readFile: async (_token, _path) => null,
	/** @param {string} _token @param {string} _path @param {...any} _rest */
	pathExists: async (_token, _path, ..._rest) => false,
	/**
	 * @param {string} _token @param {string[]} _paths @param {...any} _rest
	 * @returns {Promise<string[]>}
	 */
	existingPaths: async (_token, _paths, ..._rest) => [],
	/**
	 * @param {string} _token @param {string} _path @param {any} [_opts]
	 * @returns {Promise<Array<{ path: string, sha: string, type: string }>>}
	 */
	listTree: async (_token, _path, _opts) => [],
	/**
	 * @param {string} _token @param {string} _path
	 * @returns {Promise<Array<{ name: string, path: string, sha: string, type: string }>>}
	 */
	listDir: async (_token, _path) => [],
	/**
	 * @param {string} _token @param {string} _dir
	 * @returns {Promise<Array<{ path: string, sha: string, text: string }>>}
	 */
	getDirTexts: async (_token, _dir) => [],
	/**
	 * @param {string} _token
	 * @param {{ files: CommitFile[], message: string } & Record<string, any>} opts
	 * @returns {Promise<PublishResult>}
	 */
	async commitFiles(_token, opts) {
		const first = opts.files[0];
		throw new NotInRepoError(first ? first.path : '(nada)');
	}
});
