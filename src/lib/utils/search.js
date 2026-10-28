/**
 * Búsqueda global: normalización de texto, limpieza de markdown, armado y consulta
 * de un índice invertido chico (sin dependencias).
 *
 * El índice "crudo" lo genera /api/search-index.json (en el servidor, con lo que entra decidido
 * en $lib/server/search/siteIndex.js; se recuerda por árbol de etiquetas mientras la base no
 * cambie) y el cliente lo descarga recién al abrir el buscador (ver SearchPalette.svelte).
 */
import { allowedTypes, arDay, dayInWhen, parseSearch } from './searchSyntax.js';

/**
 * @typedef {Object} SearchDoc
 * @prop {'calendario'|'material'|'amigues'|'wiki'|'serie'} c - categoría (`serie`: la página de
 *   una serie de eventos, en la Kinkipedia)
 * @prop {string} h - href
 * @prop {string} t - título
 * @prop {string} [s] - resumen
 * @prop {string[]} [g] - tags canónicos (ids)
 * @prop {string[]} [a] - autores
 * @prop {string} [d] - fecha de inicio (eventos) o publicación
 * @prop {string} [e] - fecha de fin (eventos)
 * @prop {string} [b] - cuerpo en texto plano (truncado)
 * @prop {string[]} [k] - otros nombres (aka) para entradas de la Kinkipedia
 * @prop {string} [i] - ícono (emoji) de la etiqueta, para entradas de la Kinkipedia y series
 * @prop {string} [l] - lugar de un evento: nombre, barrio y ciudad, lo que muestra su página
 *   (nunca la calle)
 */

/**
 * @typedef {Object} RawSearchIndex
 * @prop {number} v - versión del formato
 * @prop {SearchDoc[]} docs
 * @prop {Record<string, string[]>} tags - tag id -> [nombre visible, ...alias]
 * @prop {Record<string, string[]>} [p] - tag id -> sus madres (sin `root`), para buscar una
 *   etiqueta con su árbol (`#cuerdas` trae lo de sus hijas)
 */

/* ------------------------------------------------------------------ */
/* Normalización                                                        */
/* ------------------------------------------------------------------ */

/** @type {Map<string, string>} */
const foldCache = new Map();

/** @param {string} c */
function foldChar(c) {
	let r = foldCache.get(c);
	if (r === undefined) {
		const lower = c.toLowerCase();
		r = lower.normalize('NFD').replace(/\p{M}/gu, '');
		if (r.length !== c.length) r = lower.length === c.length ? lower : c;
		foldCache.set(c, r);
	}
	return r;
}

/**
 * Pasa a minúsculas y saca tildes/diacríticos (á→a, ñ→n, ü→u).
 * Conserva la longitud del texto (índice a índice) para poder resaltar el
 * texto original a partir de posiciones encontradas en el texto normalizado.
 * @param {string} s
 * @returns {string}
 */
export function fold(s) {
	// eslint-disable-next-line no-control-regex -- matches everything outside ASCII
	return (s ?? '').toString().replace(/[A-Z]|[^\x00-\x7F]/gu, foldChar);
}

const WORD_RE = /[\p{L}\p{N}]+/gu;

/**
 * Parte un texto en palabras normalizadas.
 * @param {string} s
 * @returns {string[]}
 */
export function tokenize(s) {
	return fold(s).match(WORD_RE) ?? [];
}

/** Palabras vacías en español que se ignoran en la consulta (si hay otras). */
export const STOPWORDS = new Set(
	'a al como con de del el en es la las lo los mas o para por que se sin su sus un una uno unos unas y'.split(
		' '
	)
);

/* ------------------------------------------------------------------ */
/* Limpieza de markdown/mdsvex (build time)                             */
/* ------------------------------------------------------------------ */

/** @type {Record<string, string>} */
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…' };

/**
 * Convierte el markdown crudo de un post (con frontmatter, HTML y Svelte) en texto plano.
 * @param {string} md
 * @returns {string}
 */
export function stripMarkdown(md) {
	return (
		(md ?? '')
			.replace(/\r\n?/g, '\n')
			// frontmatter
			.replace(/^\uFEFF?---\n[\s\S]*?\n---[^\n]*(\n|$)/, '')
			// bloques que no son texto
			.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
			.replace(/<!--[\s\S]*?-->/g, ' ')
			// bloques y expresiones de Svelte: {#if ...} {/each} {@html ...} {variable}
			.replace(/\{[#:/@][^}]*\}/g, ' ')
			.replace(/\{[^{}\n]*\}/g, ' ')
			// cercas de código
			.replace(/^\s*(```|~~~).*$/gm, ' ')
			// imágenes, links y wikilinks
			.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
			.replace(/\[\[([^\]]*)\]\]/g, (_, inner) => {
				const i = inner.indexOf(':');
				return i >= 0 ? inner.slice(i + 1) : inner;
			})
			.replace(/\[\^[^\]]*\]:?/g, ' ')
			.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ')
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
			// etiquetas HTML (el texto de adentro se conserva)
			.replace(/<\/?[A-Za-z][^>]*>/g, ' ')
			// URLs sueltas
			.replace(/\bhttps?:\/\/[^\s)>\]]+/g, ' ')
			// sintaxis de bloque: títulos, citas, listas, reglas, tablas
			.replace(/^\s{0,3}#{1,6}\s+(.*?)(\s+#+)?\s*$/gm, '$1')
			.replace(/^\s*>+\s?/gm, '')
			.replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
			.replace(/^\s*([-*_]\s*){3,}$/gm, ' ')
			.replace(/^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*$/gm, ' ')
			.replace(/\|/g, ' ')
			// énfasis y código en línea
			.replace(/\*+|~~|`+/g, '')
			.replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '')
			.replace(/\\(.)/g, '$1')
			.replace(/\\/g, '')
			// entidades HTML
			.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
				if (e[0] === '#') {
					const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1));
					return Number.isFinite(n) ? String.fromCodePoint(n) : ' ';
				}
				return ENTITIES[e.toLowerCase()] ?? m;
			})
			.replace(/\s+/g, ' ')
			.trim()
			.normalize('NFC')
	);
}

/**
 * Corta un texto en el último espacio antes de `max` caracteres.
 * @param {string} s
 * @param {number} max
 */
export function truncate(s, max) {
	if (!s || s.length <= max) return s ?? '';
	const cut = s.lastIndexOf(' ', max);
	return s.slice(0, cut > max * 0.8 ? cut : max) + '…';
}

/* ------------------------------------------------------------------ */
/* Índice y consulta (cliente)                                          */
/* ------------------------------------------------------------------ */

/** Campos indexados (máscara de bits) y su peso: título > tags > autores > resumen > cuerpo. */
const TITLE = 1,
	TAGS = 2,
	AUTHORS = 4,
	SUMMARY = 8,
	BODY = 16;
/** @type {Record<number, number>} */
const FIELD_WEIGHT = { [TITLE]: 10, [TAGS]: 6, [AUTHORS]: 5, [SUMMARY]: 3, [BODY]: 1 };

/**
 * Peso de una coincidencia según los campos donde aparece: el campo más importante
 * cuenta entero y los demás suman un poco (aparecer en título y cuerpo > sólo título).
 * @param {number} mask
 */
function fieldsWeight(mask) {
	let best = 0,
		sum = 0;
	for (const f of [TITLE, TAGS, AUTHORS, SUMMARY, BODY]) {
		if (!(mask & f)) continue;
		best = Math.max(best, FIELD_WEIGHT[f]);
		sum += FIELD_WEIGHT[f];
	}
	return best + 0.2 * (sum - best);
}

/**
 * @typedef {Object} PreparedIndex
 * @prop {SearchDoc[]} docs
 * @prop {Map<string, Map<number, number>>} postings - palabra -> (doc -> máscara de campos)
 * @prop {string[]} vocab
 * @prop {Record<string, string[]>} tags
 * @prop {Record<string, string[]>} parents - tag id -> sus madres
 * @prop {string[]} [texts] - el texto entero de cada doc, armado al usarlo (frases y exclusiones)
 */

/**
 * Arma el índice invertido a partir del JSON descargado.
 * @param {RawSearchIndex} raw
 * @returns {PreparedIndex}
 */
export function prepareIndex(raw) {
	const tags = raw.tags ?? {};
	/** @type {Map<string, Map<number, number>>} */
	const postings = new Map();
	/**
	 * @param {number} doc
	 * @param {string} text
	 * @param {number} field
	 */
	const add = (doc, text, field) => {
		for (const w of tokenize(text)) {
			let p = postings.get(w);
			if (!p) postings.set(w, (p = new Map()));
			p.set(doc, (p.get(doc) ?? 0) | field);
		}
	};
	raw.docs.forEach((d, i) => {
		// los otros nombres (aka) de una entrada de la Kinkipedia cuentan como título
		add(i, d.t + ' ' + (d.k ?? []).join(' '), TITLE);
		add(i, (d.g ?? []).map((id) => [id, ...(tags[id] ?? [])].join(' ')).join(' '), TAGS);
		add(i, (d.a ?? []).join(' '), AUTHORS);
		add(i, d.s ?? '', SUMMARY);
		// el lugar de un evento pesa como el resumen
		add(i, d.l ?? '', SUMMARY);
		add(i, d.b ?? '', BODY);
	});
	return { docs: raw.docs, postings, vocab: [...postings.keys()], tags, parents: raw.p ?? {} };
}

/**
 * Distancia de edición (Damerau-Levenshtein restringida) con corte temprano.
 * Devuelve max+1 si la distancia supera `max`.
 * @param {string} a
 * @param {string} b
 * @param {number} max
 */
export function editDistance(a, b, max) {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	if (a === b) return 0;
	const n = b.length;
	let prev2 = new Array(n + 1).fill(0);
	let prev = Array.from({ length: n + 1 }, (_, j) => j);
	let cur = new Array(n + 1).fill(0);
	for (let i = 1; i <= a.length; i++) {
		cur[0] = i;
		let rowMin = cur[0];
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, prev2[j - 2] + 1);
			}
			cur[j] = v;
			if (v < rowMin) rowMin = v;
		}
		if (rowMin > max) return max + 1;
		[prev2, prev, cur] = [prev, cur, prev2];
	}
	return prev[n];
}

/**
 * Qué tan bien una palabra del índice coincide con un término de la consulta (0 = nada).
 * Exacta 1 · prefijo 0.8 · con error de tipeo 0.5 (o 0.4 si además es prefijo).
 * @param {string} term - término normalizado de la consulta
 * @param {string} word - palabra normalizada del índice
 */
export function matchQuality(term, word) {
	if (word === term) return 1;
	if (term.length < 2) return 0;
	if (word.startsWith(term)) return 0.8 - Math.min(0.2, (word.length - term.length) * 0.02);
	if (term.length < 4) return 0;
	const max = term.length >= 8 ? 2 : 1;
	if (editDistance(term, word, max) <= max) return 0.5;
	if (term.length >= 5 && word.length > term.length) {
		if (editDistance(term, word.slice(0, term.length), 1) <= 1) return 0.4;
	}
	return 0;
}

/**
 * Normaliza la consulta y la parte en términos (sin palabras vacías, salvo que no quede nada).
 * @param {string} q
 */
export function queryTerms(q) {
	const all = [...new Set(tokenize(q))];
	const terms = all.filter((t) => !STOPWORDS.has(t));
	return terms.length > 0 ? terms : all;
}

/**
 * @typedef {Object} SearchHit
 * @prop {number} i - índice del doc
 * @prop {SearchDoc} doc
 * @prop {number} score
 * @prop {Set<string>} words - palabras del índice que coincidieron (para resaltar)
 */

/**
 * Puntaje de cada doc que tiene todos los términos (en cualquier campo), y las palabras del índice
 * que coincidieron. `allowed`: solo esos docs (por los filtros). `null` si alguno no está.
 * @param {PreparedIndex} index
 * @param {string[]} terms
 * @param {((i: number) => boolean) | null} [allowed]
 */
function scoreTerms(index, terms, allowed = null) {
	/** @type {Map<number, number>} */
	let scores = new Map();
	/** @type {Map<number, Set<string>>} */
	const matched = new Map();
	for (let ti = 0; ti < terms.length; ti++) {
		const term = terms[ti];
		/** @type {Map<number, number>} */
		const termScores = new Map();
		for (const word of index.vocab) {
			const quality = matchQuality(term, word);
			if (quality === 0) continue;
			// @ts-expect-error toda palabra de vocab está en postings
			for (const [doc, mask] of index.postings.get(word)) {
				if (ti > 0 && !scores.has(doc)) continue;
				if (ti === 0 && allowed && !allowed(doc)) continue;
				const s = quality * fieldsWeight(mask);
				if (s > (termScores.get(doc) ?? 0)) termScores.set(doc, s);
				let m = matched.get(doc);
				if (!m) matched.set(doc, (m = new Set()));
				m.add(word);
			}
		}
		/** @type {Map<number, number>} */
		const next = new Map();
		for (const [doc, s] of termScores) next.set(doc, (ti > 0 ? (scores.get(doc) ?? 0) : 0) + s);
		scores = next;
		if (scores.size === 0) break;
	}
	return { scores, matched };
}

/**
 * Lo que suma el título: qué parte de él coincide ("Bondage" le gana a "Edición Bondage de ...") y
 * si es lo buscado entero.
 * @param {SearchDoc} doc
 * @param {Set<string>} words
 * @param {string} phrase lo buscado, sin tildes
 */
function titleBonus(doc, words, phrase) {
	let bonus = 0;
	const title = fold(doc.t);
	const titleWords = tokenize(doc.t);
	if (titleWords.length > 0) {
		bonus += (3 * titleWords.filter((w) => words.has(w)).length) / titleWords.length;
	}
	if (!phrase) return bonus;
	if (title === phrase) bonus += 8;
	else if (title.startsWith(phrase)) bonus += 4;
	else if (phrase.length > 2 && title.includes(phrase)) bonus += 2;
	return bonus;
}

/** @param {SearchHit} a @param {SearchHit} b */
const byScore = (a, b) => b.score - a.score || a.doc.t.localeCompare(b.doc.t);

/**
 * Busca `q` en el índice como texto: todos los términos tienen que aparecer (en cualquier campo).
 * Sin operadores (para eso, {@link find}).
 * @param {PreparedIndex} index
 * @param {string} q
 * @param {{limit?: number}} [opts]
 * @returns {SearchHit[]}
 */
export function search(index, q, { limit = 1000 } = {}) {
	const terms = queryTerms(q);
	if (terms.length === 0) return [];
	const { scores, matched } = scoreTerms(index, terms);
	const phrase = fold(q).trim();
	/** @type {SearchHit[]} */
	const hits = [];
	for (const [i, score] of scores) {
		const doc = index.docs[i];
		const words = matched.get(i) ?? new Set();
		hits.push({ i, doc, score: score + titleBonus(doc, words, phrase), words });
	}
	hits.sort(byScore);
	return hits.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Búsqueda con la sintaxis (docs/buscar.md)                            */
/* ------------------------------------------------------------------ */

/** Cuánto suben los docs del tipo que nombra una palabra suelta (`evento cuerdas`). */
const HINT_BONUS = 6;

/**
 * Todo el texto de un doc, sin tildes, con espacios simples (para frases y exclusiones): título,
 * otros nombres, etiquetas (con sus nombres), autores, resumen, lugar y cuerpo.
 * @param {PreparedIndex} index
 * @param {number} i
 */
function docText(index, i) {
	index.texts ??= [];
	let t = index.texts[i];
	if (t === undefined) {
		const d = index.docs[i];
		const tags = (d.g ?? []).map((id) => [id, ...(index.tags[id] ?? [])].join(' '));
		t = ` ${tokenize([d.t, ...(d.k ?? []), ...tags, ...(d.a ?? []), d.s, d.l, d.b].join(' ')).join(' ')} `;
		index.texts[i] = t;
	}
	return t;
}

/** ¿Una palabra o frase (sin tildes) está en el texto, como palabras enteras? @param {string} text @param {string} f */
const hasWords = (text, f) => {
	const w = tokenize(f).join(' ');
	return Boolean(w) && text.includes(` ${w} `);
};

/**
 * Las etiquetas (ids) que se llaman así, por su id, su nombre visible o sus otros nombres.
 * @param {PreparedIndex} index
 * @param {string} name sin tildes
 * @returns {string[]}
 */
export function tagsNamed(index, name) {
	const n = tokenize(name).join(' ');
	if (!n) return [];
	const ids = new Set([...Object.keys(index.parents), ...Object.keys(index.tags)]);
	for (const d of index.docs) for (const g of d.g ?? []) ids.add(g);
	/** @param {string} s */
	const same = (s) => tokenize(s).join(' ') === n;
	return [...ids].filter((id) => same(id) || (index.tags[id] ?? []).some(same));
}

/**
 * ¿El doc tiene alguna de esas etiquetas, o una hija de alguna?
 * @param {PreparedIndex} index
 * @param {SearchDoc} doc
 * @param {Set<string>} ids
 */
function hasTagIn(index, doc, ids) {
	/** @type {Set<string>} */
	const seen = new Set();
	const stack = [...(doc.g ?? [])];
	while (stack.length) {
		const id = /** @type {string} */ (stack.pop());
		if (ids.has(id)) return true;
		if (seen.has(id)) continue;
		seen.add(id);
		stack.push(...(index.parents[id] ?? []));
	}
	return false;
}

/**
 * ¿Es la ficha de esa persona, o lo firma u organiza ella? Por su nombre como autore, o por el
 * nombre o la dirección de su ficha de amigues (el comienzo alcanza).
 * @param {PreparedIndex} index
 * @param {string} who sin tildes
 * @returns {(doc: SearchDoc) => boolean}
 */
function byPerson(index, who) {
	const w = fold(who);
	/** @type {Set<string>} */
	const names = new Set();
	for (const d of index.docs) {
		if (d.c !== 'amigues') continue;
		const slug = fold(decodeURIComponent(d.h.split('/').pop() ?? ''));
		if (slug.startsWith(w) || fold(d.t).startsWith(w)) names.add(fold(d.t));
	}
	return (doc) =>
		(doc.c === 'amigues' && names.has(fold(doc.t))) ||
		(doc.a ?? []).some((a) => {
			const f = fold(a);
			return names.has(f) || f.startsWith(w) || f.replace(/\s+/g, '-').startsWith(w);
		});
}

/**
 * El día (Argentina) de una fecha ISO del índice, o ''.
 * @param {string | undefined} iso
 */
function docDay(iso) {
	const t = iso ? Date.parse(iso) : NaN;
	return Number.isFinite(t) ? arDay(t) : '';
}

/**
 * Busca con la sintaxis de búsqueda (docs/buscar.md): palabras, `"frases"`, `-exclusiones`,
 * `#etiquetas`, `@personas`, tipos (`evento:`…), `lugar:` y fechas. Lo usan el buscador del sitio
 * y el bot, así lo mismo escrito da lo mismo. Sin operadores, lo mismo que {@link search}, salvo
 * las palabras que nombran un tipo (suben ese tipo sin ser obligatorias) y las de fecha (`finde`,
 * `noviembre`), que filtran eventos y, si no dejan nada, vuelven a ser texto.
 * @param {PreparedIndex} index
 * @param {string} q
 * @param {{ limit?: number, now?: number, types?: readonly SearchDoc['c'][] | null }} [opts]
 * `types`: los tipos de un operador de tipo que se sacó antes de lo escrito (el bot,
 * `parseInlineQuery`), como si siguiera ahí (así también vale la regla de respaldo).
 * @returns {SearchHit[]}
 */
export function find(index, q, { limit = 1000, now = Date.now(), types = null } = {}) {
	/** @param {import('./searchSyntax.js').ParsedSearch} pq */
	const typed = (pq) => {
		if (types?.length) pq.types = [...new Set([...(pq.types ?? []), ...types])];
		return pq;
	};
	const pq = typed(parseSearch(q, 'sitio'));
	let hits = findParsed(index, pq, now);
	if (hits.length === 0 && pq.dates.some((d) => d.soft)) {
		hits = findParsed(index, typed(parseSearch(q, 'sitio', { datesAsText: true })), now);
	}
	return hits.slice(0, limit);
}

/**
 * @param {PreparedIndex} index
 * @param {import('./searchSyntax.js').ParsedSearch} pq
 * @param {number} now
 * @returns {SearchHit[]}
 */
export function findParsed(index, pq, now = Date.now()) {
	// Las palabras como las parte el índice (`20:30` → `20`, `30`).
	const words = pq.words.flatMap((w) => tokenize(w));
	/** @type {((doc: SearchDoc, i: number) => boolean)[]} */
	const checks = [];

	const types = allowedTypes(pq);
	if (types) checks.push((d) => types.includes(d.c));
	// Un `-evento:` solo saca: no cuenta como pedir algo (ver `asks`).
	const typesOnlyExclude = Boolean(types) && !pq.types && !pq.implied;

	// Etiquetas: una que no existe se busca como texto.
	for (const name of pq.tags) {
		const ids = new Set(tagsNamed(index, name));
		if (ids.size) checks.push((d) => hasTagIn(index, d, ids));
		else words.push(...tokenize(name));
	}
	for (const who of pq.people) checks.push(byPerson(index, who));
	for (const place of pq.places) checks.push((d) => fold(d.l ?? '').includes(place));
	for (const { when } of pq.dates) {
		checks.push((d) => {
			const start = docDay(d.d);
			return Boolean(start) && dayInWhen(start, docDay(d.e) || start, when, now);
		});
	}
	for (const phrase of pq.phrases) checks.push((_, i) => hasWords(docText(index, i), phrase));
	// Hasta acá, lo que pide algo; las exclusiones solo sacan. Las palabras vacías (`de`, `el`…)
	// no piden nada: «el taller» es como «taller» (docs/buscar.md, «Palabras vacías»).
	const meaningfulWords = words.filter((w) => !STOPWORDS.has(w));
	const asks = meaningfulWords.length > 0 || checks.length > (typesOnlyExclude ? 1 : 0);
	for (const x of pq.exclude) checks.push((_, i) => !hasWords(docText(index, i), x));
	for (const name of pq.excludeTags) {
		const ids = new Set(tagsNamed(index, name));
		if (ids.size) checks.push((d) => !hasTagIn(index, d, ids));
	}
	for (const who of pq.excludePeople) {
		const is = byPerson(index, who);
		checks.push((d) => !is(d));
	}
	for (const place of pq.excludePlaces) checks.push((d) => !fold(d.l ?? '').includes(place));

	// Las palabras que nombran un tipo son obligatorias solo si no se pide nada más.
	const onlyHints = !asks;
	// Sin nada más pedido, todo lo escrito es obligatorio, como en `search` (las palabras vacías se
	// sacan abajo, salvo que sean todo).
	const required = onlyHints ? [...pq.hints, ...words] : meaningfulWords;
	let terms = [...new Set(required)];
	const meaningful = terms.filter((t) => !STOPWORDS.has(t));
	if (meaningful.length) terms = meaningful;
	// Las palabras de las frases también cuentan para el puntaje y el resaltado.
	const phraseTerms = pq.phrases.flatMap((p) => tokenize(p));
	terms = [...new Set([...terms, ...phraseTerms])];
	if (terms.length === 0 && checks.length === 0) return [];

	/** @param {number} i */
	const passes = (i) => checks.every((c) => c(index.docs[i], i));
	/** @type {Map<number, number>} */
	let scores;
	/** @type {Map<number, Set<string>>} */
	let matched;
	if (terms.length) {
		({ scores, matched } = scoreTerms(index, terms, passes));
	} else {
		scores = new Map();
		matched = new Map();
		index.docs.forEach((_, i) => passes(i) && scores.set(i, 0));
	}

	// Las palabras de tipo que no son obligatorias: suman si están y suben ese tipo.
	const hints = onlyHints ? [] : pq.hints;
	const textPhrase = onlyHints ? fold(pq.text) : words.join(' ');
	/** @type {SearchHit[]} */
	const hits = [];
	for (const [i, score] of scores) {
		const doc = index.docs[i];
		const found = matched.get(i) ?? new Set();
		let bonus = titleBonus(doc, found, textPhrase);
		if (hints.length && pq.hintTypes.includes(doc.c)) bonus += HINT_BONUS;
		hits.push({ i, doc, score: score + bonus, words: found });
	}
	if (hints.length) {
		const hintWords = index.vocab.filter((w) => hints.some((t) => matchQuality(t, w) >= 0.8));
		for (const h of hits) {
			for (const word of hintWords) {
				const mask = index.postings.get(word)?.get(h.i);
				if (!mask) continue;
				h.score += fieldsWeight(mask) * 0.5;
				h.words.add(word);
			}
		}
	}
	hits.sort(byScore);
	return hits;
}

/* ------------------------------------------------------------------ */
/* Agrupado y fragmentos                                                */
/* ------------------------------------------------------------------ */

export const GROUPS = /** @type {const} */ ([
	['proximos', 'Eventos próximos'],
	['serie', 'Series'],
	['material', 'Material'],
	['amigues', 'Amigues'],
	['wiki', 'Kinkipedia'],
	['pasados', 'Eventos pasados']
]);

/**
 * @param {SearchDoc} doc
 * @param {number} now
 */
export function groupOf(doc, now = Date.now()) {
	if (doc.c !== 'calendario') return doc.c;
	const end = new Date(doc.e ?? doc.d ?? 0).getTime();
	return end >= now ? 'proximos' : 'pasados';
}

/**
 * Agrupa resultados en el orden de GROUPS. Los próximos eventos se ordenan por
 * puntaje y luego por fecha más cercana; los pasados, por puntaje y luego más recientes.
 * @param {SearchHit[]} hits
 * @param {number} [now]
 * @returns {{key: string, label: string, hits: SearchHit[]}[]}
 */
export function groupHits(hits, now = Date.now()) {
	/** @type {Record<string, SearchHit[]>} */
	const byGroup = {};
	for (const h of hits) (byGroup[groupOf(h.doc, now)] ??= []).push(h);
	/** @param {SearchHit} h */
	const time = (h) => new Date(h.doc.d ?? 0).getTime();
	byGroup.proximos?.sort((a, b) => b.score - a.score || time(a) - time(b));
	byGroup.pasados?.sort((a, b) => b.score - a.score || time(b) - time(a));
	return GROUPS.filter(([key]) => byGroup[key]?.length).map(([key, label]) => ({
		key,
		label,
		hits: byGroup[key]
	}));
}

/**
 * @typedef {{text: string, hit: boolean}} Part
 */

/**
 * Parte un texto marcando las palabras que coincidieron.
 * @param {string} text
 * @param {Set<string>} words
 * @returns {Part[]}
 */
export function highlight(text, words) {
	/** @type {Part[]} */
	const parts = [];
	const folded = fold(text);
	let last = 0;
	for (const m of folded.matchAll(WORD_RE)) {
		if (!words.has(m[0])) continue;
		const start = /** @type {number} */ (m.index);
		if (start > last) parts.push({ text: text.slice(last, start), hit: false });
		parts.push({ text: text.slice(start, start + m[0].length), hit: true });
		last = start + m[0].length;
	}
	if (last < text.length) parts.push({ text: text.slice(last), hit: false });
	return parts;
}

/**
 * Nombres (tags del doc u otros nombres de la entrada) que coincidieron, para explicar
 * resultados que no tienen la palabra en el texto. P. ej. "aftercare" → "cuidados posteriores (aftercare)".
 * @param {PreparedIndex} index
 * @param {SearchDoc} doc
 * @param {Set<string>} words
 * @returns {string[]}
 */
export function matchedNames(index, doc, words) {
	/** @param {string} s */
	const hits = (s) => tokenize(s).some((w) => words.has(w));
	/** @type {string[]} */
	const out = [];
	for (const name of doc.k ?? []) if (hits(name)) out.push(name);
	for (const id of doc.g ?? []) {
		// en la Kinkipedia, el tag de la propia entrada ya está en el título / otros nombres
		if (out.length > 0 && fold(id) === fold(doc.t)) continue;
		const names = index.tags[id] ?? [];
		const alias = names.find(hits);
		if (alias) out.push(`${id} (${alias})`);
		else if (hits(id)) out.push(id);
	}
	return [...new Set(out)];
}

/**
 * Fragmento de ~`size` caracteres alrededor de la primera coincidencia, con resaltado.
 * Busca primero en el resumen y después en el cuerpo; si no hay coincidencias en
 * ninguno, devuelve el comienzo del resumen (o del cuerpo).
 * @param {SearchDoc} doc
 * @param {Set<string>} words
 * @param {number} [size]
 * @returns {Part[]}
 */
export function snippet(doc, words, size = 160) {
	for (const text of [doc.s ?? '', doc.b ?? '']) {
		if (!text) continue;
		const folded = fold(text);
		for (const m of folded.matchAll(WORD_RE)) {
			if (!words.has(m[0])) continue;
			const pos = /** @type {number} */ (m.index);
			let start = Math.max(0, pos - Math.floor(size / 3));
			if (start > 0) {
				const sp = text.indexOf(' ', start);
				start = sp >= 0 && sp < pos ? sp + 1 : start;
			}
			let end = Math.min(text.length, start + size);
			if (end < text.length) {
				const sp = text.lastIndexOf(' ', end);
				end = sp > pos ? sp : end;
			}
			const parts = highlight(text.slice(start, end), words);
			if (start > 0) parts.unshift({ text: '…', hit: false });
			if (end < text.length) parts.push({ text: '…', hit: false });
			return parts;
		}
	}
	const fallback = doc.s || doc.b || '';
	return fallback ? [{ text: truncate(fallback, size), hit: false }] : [];
}
