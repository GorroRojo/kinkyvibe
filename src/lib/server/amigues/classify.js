/**
 * Clasificación automática de las fichas de amigues al importarlas: persona, grupo
 * (organizaciones, colectivos, productoras, emprendimientos de varias personas) o lugar.
 *
 * Es una heurística con puntajes, a propósito simple y explicable: cada señal suma puntos y deja
 * una razón en castellano, que se muestra en la lista de revisión del panel. Todo lo que propone
 * queda "a confirmar" (`profile_sources.kind_confirmed_at` vacío) hasta que une admin lo mira.
 *
 * Pura (sin base ni Vite): la usan el importador, el script de Node y los tests.
 */

import { asText as str, asTextList as list } from '../../utils/text.js';

/** @typedef {'persona' | 'grupo' | 'lugar'} SuggestedKind */

/**
 * @typedef {{
 *   title?: unknown, summary?: unknown, pronoun?: unknown, authors?: unknown, tags?: unknown,
 *   logo?: unknown, photo?: unknown, gender_identity?: unknown, location?: unknown
 * }} ClassifyInput lo que importa del frontmatter (como texto, ver importer.js)
 */

/** Primera persona del plural en la presentación: "somos", "brindamos", "nuestros"… */
const PLURAL_VERBS =
	/\b(somos|brindamos|damos|ofrecemos|hacemos|trabajamos|contamos|fabricamos|publicamos|dise[ñn]amos|producimos|nuestr[ao]s?)\b/i;
/** Primera persona del singular: "soy", "me llamo"… */
const SINGULAR = /\b(soy|me llamo|mi nombre|me dicen|me auto|practico|me dedico|trabajo desde)\b/i;
/** Palabras de organización en el nombre o el resumen. */
const ORG_WORDS =
	/\b(producciones|productora|cooperativa|colectiv[oa]s?|red de|comunidad|fiesta|concurso|emprendimiento|proyecto|grupo|tienda)\b/i;
/** Palabras de lugar (un espacio físico donde pasan cosas). */
const VENUE_WORDS =
	/\b(bar|centro cultural|espacio cultural|casa cultural|sala|club|boliche|galp[oó]n|dungeon|mazmorra|venue)\b/i;
/** Etiquetas de lugar. */
const VENUE_TAGS = [
	'lugar',
	'lugares',
	'espacio',
	'bar',
	'centro cultural',
	'sala',
	'club',
	'venue'
];
/**
 * Algo que parece una dirección: una calle con número. Las palabras y los espacios van en grupos
 * que no se pisan (`(?:\s+palabra)+`): con `\s+[\p{L} .]+\s` un texto largo de espacios hacía
 * que la expresión tardara tiempo cuadrático (ReDoS).
 */
export const ADDRESS =
	/\b(?:calle|av\.?|avenida|pasaje|ruta)(?:\s+[\p{L}.]+)+\s+\d{1,5}\b|\b\p{Lu}\p{L}+\s\d{2,5}\b,/u;
/** Pronombres en plural (el primer juego del link de pronombr.es, o el texto). */
const PLURAL_PRONOUNS = new Set(['elles', 'ellos', 'ellas', 'ellxs', 'elloas', 'ellos/ellas']);

/**
 * Los pronombres principales de una ficha ("https://pronombr.es/elle&ella" → ["elle", "ella"]),
 * o [] si no hay o dice "evitar".
 *
 * @param {unknown} pronoun
 * @returns {string[]}
 */
export function mainPronouns(pronoun) {
	const raw = str(pronoun);
	if (!raw) return [];
	const last = raw.startsWith('http') ? (raw.split('/').pop() ?? '') : raw;
	if (!last || last === 'evitar') return [];
	return last
		.split(',')[0]
		.split(/[&/]/)
		.map((p) => p.trim().toLowerCase())
		.filter(Boolean);
}

/**
 * Propone el tipo de perfil de una ficha.
 *
 * @param {ClassifyInput} meta
 * @param {string} slug la dirección vieja (para saber si la ficha la firma la misma persona)
 * @returns {{ kind: SuggestedKind, reasons: string[], scores: Record<SuggestedKind, number> }}
 */
export function classifyAmigue(meta, slug) {
	const scores = { persona: 0, grupo: 0, lugar: 0 };
	/** @type {Record<SuggestedKind, string[]>} */
	const why = { persona: [], grupo: [], lugar: [] };
	/** @param {SuggestedKind} kind @param {number} points @param {string} reason */
	const add = (kind, points, reason) => {
		scores[kind] += points;
		why[kind].push(reason);
	};

	const title = str(meta.title);
	const summary = str(meta.summary);
	const text = `${title}\n${summary}`;
	const authors = list(meta.authors);
	const tags = list(meta.tags).map((t) => t.toLowerCase());
	const pronouns = mainPronouns(meta.pronoun);
	const hasGender = Boolean(str(meta.gender_identity));

	// Lugar
	if (str(meta.location)) add('lugar', 3, 'tiene dirección (location)');
	else if (ADDRESS.test(summary)) add('lugar', 3, 'el resumen parece una dirección');
	const venueTag = tags.find((t) => VENUE_TAGS.includes(t));
	if (venueTag) add('lugar', 3, `etiqueta de lugar («${venueTag}»)`);
	const venueWord = text.match(VENUE_WORDS)?.[0];
	if (venueWord) add('lugar', 2, `habla de un espacio («${venueWord}»)`);

	// Grupo
	const others = authors.filter((a) => a.replaceAll(' ', '-') !== slug);
	if (authors.length > 1) add('grupo', 2, `la firman ${authors.length} personas (authors)`);
	if (pronouns.some((p) => PLURAL_PRONOUNS.has(p))) add('grupo', 2, 'pronombres en plural');
	const plural = summary.match(PLURAL_VERBS)?.[0];
	if (plural) add('grupo', 3, `habla en plural («${plural}»)`);
	const org = text.match(ORG_WORDS)?.[0];
	if (org) add('grupo', 1, `palabra de organización («${org}»)`);
	if (str(meta.logo) && !str(meta.photo) && !hasGender) {
		add('grupo', 1, 'tiene logo y no foto ni identidad de género');
	}
	if (!pronouns.length && !hasGender) {
		add('grupo', 1, 'sin pronombres personales ni identidad de género');
	}

	// Persona
	const singular = summary.match(SINGULAR)?.[0];
	if (singular) add('persona', 2, `habla en primera persona («${singular}»)`);
	if (hasGender) add('persona', 1, 'tiene identidad de género');
	if (str(meta.photo)) add('persona', 1, 'tiene foto');
	if (authors.length === 1 && others.length === 0) add('persona', 1, 'la firma la misma persona');
	if (pronouns.length && !pronouns.some((p) => PLURAL_PRONOUNS.has(p))) {
		add('persona', 1, `pronombres en singular (${pronouns.join('/')})`);
	}

	/** @type {SuggestedKind} */
	let kind = 'persona';
	if (scores.lugar >= 3 && scores.lugar >= scores.grupo && scores.lugar >= scores.persona) {
		kind = 'lugar';
	} else if (scores.grupo > scores.persona) {
		kind = 'grupo';
	}
	const reasons = why[kind].length ? why[kind] : ['sin señales claras: queda como persona'];
	return { kind, reasons, scores };
}
