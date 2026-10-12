/**
 * Búsquedas parecidas para cuando lo buscado no trae nada (Buscar en el chat, noResults.js, y el
 * modo inline, inline.js). Sobre el mismo índice público y el mismo buscador del sitio (`search`,
 * `editDistance`, `queryTerms` de $lib/utils/search): una sugerencia solo se ofrece si trae algo.
 *
 * - Primero, lo que pase quien llama: las madres, hijas y relacionadas de la etiqueta buscada
 *   ({@link tagRelatives}).
 * - Lo buscado con cada palabra cambiada por la más parecida del índice (de títulos y
 *   etiquetas), con más tolerancia que el buscador del sitio (que ya perdona un error).
 * - Con varias palabras, cada una sola: «cuerdas zzz» → «cuerdas».
 * - El nombre (o un alias) de una etiqueta usada que se parece a lo buscado.
 *
 * Funciones puras, sin base. No guarda ni loguea qué se buscó.
 */
import { editDistance, fold, queryTerms, search } from '$lib/utils/search';
import { clipQuery } from './nav.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('$lib/utils/search').PreparedIndex} PreparedIndex */
/** @typedef {{ docs: readonly SearchDoc[], prepared: PreparedIndex }} SuggestSource */
/** @typedef {{ query: string, count: number }} Suggestion `query`, ya recortada para su botón. */

/** Cuántas sugerencias, como mucho. */
export const SUGGESTIONS_MAX = 3;

/** Cuántas sugerencias se prueban (cada una es una búsqueda), como mucho. */
const CANDIDATES_MAX = 12;

/** Campos del índice que cuentan para una palabra sugerida: título y etiquetas (search.js). */
const TITLE_OR_TAGS = 1 | 2;

/**
 * Cuántas letras distintas se aceptan para sugerir una palabra: más que el buscador del sitio
 * (`matchQuality`: 1 desde 4 letras, 2 desde 8), porque acá ya no encontró nada.
 *
 * @param {number} length
 */
export function suggestDistance(length) {
	if (length < 3) return 0;
	if (length <= 4) return 1;
	if (length <= 7) return 2;
	return 3;
}

/**
 * ¿La palabra está en el título o en las etiquetas de algo? (para no sugerir una palabra suelta
 * del cuerpo de un texto).
 *
 * @param {PreparedIndex} prepared
 * @param {string} word
 */
function inTitleOrTags(prepared, word) {
	for (const mask of prepared.postings.get(word)?.values() ?? []) {
		if (mask & TITLE_OR_TAGS) return true;
	}
	return false;
}

/**
 * Las palabras del índice más parecidas a un término (de la más parecida), solo de títulos y
 * etiquetas.
 *
 * @param {PreparedIndex} prepared
 * @param {string} term normalizado (`fold`)
 * @param {number} [limit]
 * @returns {string[]}
 */
export function closestWords(prepared, term, limit = 2) {
	const max = suggestDistance(term.length);
	if (!max) return [];
	/** @type {{ word: string, d: number }[]} */
	const found = [];
	for (const word of prepared.vocab) {
		if (word === term || word.length < 3 || Math.abs(word.length - term.length) > max) continue;
		const d = editDistance(term, word, max);
		if (d <= max && inTitleOrTags(prepared, word)) found.push({ word, d });
	}
	return found
		.sort((a, b) => a.d - b.d || a.word.localeCompare(b.word))
		.slice(0, limit)
		.map((f) => f.word);
}

/**
 * Las etiquetas usadas en el índice cuyo id, nombre o alias se parece a lo buscado (de la más
 * parecida). Devuelve el id: el índice tiene cada id entre las etiquetas de lo que la usa.
 *
 * @param {SuggestSource} source
 * @param {string} query
 * @returns {string[]}
 */
export function closestTagNames(source, query) {
	const q = fold(query).trim();
	const max = suggestDistance(q.length);
	if (!max) return [];
	const names = source.prepared.tags ?? {};
	/** @type {{ id: string, d: number }[]} */
	const found = [];
	for (const id of usedTags(source)) {
		let best = max + 1;
		for (const name of [id, ...(names[id] ?? [])]) {
			const n = fold(name);
			if (n !== q) best = Math.min(best, editDistance(q, n, max));
		}
		if (best <= max) found.push({ id, d: best });
	}
	return found.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).map((f) => f.id);
}

/**
 * Las etiquetas que usa algo del índice.
 *
 * @param {SuggestSource} source
 * @returns {Set<string>}
 */
export const usedTags = (source) => new Set(source.docs.flatMap((d) => d.g ?? []));

/**
 * Las madres, hijas y relacionadas de una etiqueta del árbol (por su id canónico): primero las
 * hijas y relacionadas (más cerca de lo buscado), después las madres. Sin la raíz.
 *
 * @param {TagManager} manager
 * @param {string} id
 * @returns {string[]}
 */
export function tagRelatives(manager, id) {
	const tag = manager.get(id);
	/** @type {string[]} */
	const out = [];
	for (const raw of [...(tag.children ?? []), ...(tag.related ?? []), ...(tag.parents ?? [])]) {
		const other = manager.get(raw);
		if (!other?.id || other.orphan || other.id === 'root' || other.id === tag.id) continue;
		if (!out.includes(other.id)) out.push(other.id);
	}
	return out;
}

/**
 * Lo buscado con cada término cambiado por su palabra más parecida (o igual, si ese término solo
 * ya trae algo) y, con varias palabras, cada una sola (o corregida).
 *
 * @param {PreparedIndex} prepared
 * @param {string} query
 * @returns {string[]}
 */
function wordCandidates(prepared, query) {
	const terms = queryTerms(query);
	if (!terms.length) return [];
	const fixed = terms.map((t) =>
		search(prepared, t, { limit: 1 }).length ? [t] : closestWords(prepared, t)
	);
	/** @type {string[]} */
	const out = [];
	if (fixed.every((alts) => alts.length)) out.push(fixed.map((alts) => alts[0]).join(' '));
	if (terms.length > 1) for (const alts of fixed) out.push(...alts);
	else out.push(...fixed[0].slice(1));
	return out;
}

/**
 * Las búsquedas parecidas a `query` que traen algo (hasta {@link SUGGESTIONS_MAX}), con cuántas
 * cosas trae cada una, y lo que trae la primera (en el orden del buscador).
 *
 * @param {SuggestSource} source
 * @param {string} query
 * @param {readonly string[]} [first] búsquedas para probar antes que las demás (las parientes
 *   de la etiqueta buscada)
 * @returns {{ suggestions: Suggestion[], firstHits: SearchDoc[] }}
 */
export function suggestSearches(source, query, first = []) {
	const candidates = [
		...first,
		...wordCandidates(source.prepared, query),
		...closestTagNames(source, query)
	];
	/** @type {Suggestion[]} */
	const suggestions = [];
	/** @type {SearchDoc[]} */
	let firstHits = [];
	const seen = new Set([fold(query).trim()]);
	let tried = 0;
	for (const raw of candidates) {
		if (suggestions.length >= SUGGESTIONS_MAX || tried >= CANDIDATES_MAX) break;
		const q = clipQuery(raw);
		const key = fold(q).trim();
		if (!q || seen.has(key)) continue;
		seen.add(key);
		tried++;
		const hits = search(source.prepared, q);
		if (!hits.length) continue;
		if (!suggestions.length) firstHits = hits.map((h) => h.doc);
		suggestions.push({ query: q, count: hits.length });
	}
	return { suggestions, firstHits };
}
