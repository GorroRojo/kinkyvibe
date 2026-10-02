/**
 * Pure helpers for the tag fields of the admin editors (/admin/eventos/nuevo and /edit/...):
 * the searchable tag list for the picker, and the rules events follow for some tag groups.
 *
 * Everything is derived from the tag tree in use (./hardcodedTags.js, or the database with the
 * `etiquetas_db` switch: ./siteTags.js), so adding e.g. a new city under "lugar" there makes it
 * show up here with no other change.
 * No Svelte / SvelteKit imports: runs in the browser, on the server and in vitest.
 */
import { currentSiteTags } from './siteTags.js';
import { foldText as normalizeText } from './text.js';

/** Lowercases and strips diacritics: "Córdoba" → "cordoba" (see foldText in text.js). */
export { normalizeText };

/** @typedef {TagManager} Tags */

/** The site's tag tree in use (the file, or the database with the `etiquetas_db` switch). */
export function siteTags() {
	return currentSiteTags();
}

/**
 * Canonical id of a tag as written in a post (aliases resolve: "bdsm" → "BDSM", "queer" → "cuir").
 * @param {string} tag
 * @param {Tags} [tm]
 */
export function canonicalTag(tag, tm = siteTags()) {
	return tm.get(tag)?.id ?? tag;
}

/**
 * @param {Tags} tm
 * @param {string} id
 * @returns {string[]}
 */
function childrenOf(tm, id) {
	return tm.get(id)?.children ?? [];
}

/**
 * Leaf descendants of a tag, in tree order.
 * @param {Tags} tm
 * @param {string} id
 * @returns {string[]}
 */
function leavesOf(tm, id) {
	/** @type {string[]} */
	const out = [];
	for (const child of childrenOf(tm, id)) {
		const sub = childrenOf(tm, child);
		if (sub.length) out.push(...leavesOf(tm, child));
		else out.push(child);
	}
	return out;
}

/**
 * All descendants of a tag (not including itself).
 * @param {Tags} tm
 * @param {string} id
 */
function descendantsOf(tm, id) {
	const out = new Set();
	const queue = [...childrenOf(tm, id)];
	while (queue.length) {
		const t = /** @type {string} */ (queue.shift());
		if (out.has(t)) continue;
		out.add(t);
		queue.push(...childrenOf(tm, t));
	}
	return out;
}

/* ------------------------------------------------------------------------------------------ */
/*  Event tag rules                                                                            */
/* ------------------------------------------------------------------------------------------ */

/**
 * The tag groups events treat specially. Derived from the tree and from what the ~500 events in
 * src/lib/posts/calendario actually use:
 * - "KinkyVibe" (organized by KinkyVibe): on/off.
 * - idioma: exactly one spoken language (every event has one, all but one are "español").
 *   "LSA" is also under idioma, but in real events it always comes WITH "español" (sign language
 *   interpretation), so it is an extra on/off, not an alternative.
 * - lugar: exactly one place, a leaf of the "lugar" tree (Online, AMBA, Córdoba, Montevideo…).
 *   Events never use the intermediate nodes (Presencial, Argentina, Uruguay).
 * - precio: any of pago / a la gorra / gratis (some events are part free, part paid).
 *
 * @param {Tags} [tm]
 */
export function eventTagGroups(tm = siteTags()) {
	const signLanguage = childrenOf(tm, 'idioma').find((t) => t === 'LSA') ?? '';
	const languages = childrenOf(tm, 'idioma').filter((t) => t !== signLanguage);
	return {
		kinkyvibe: 'KinkyVibe',
		languages,
		defaultLanguage: languages.includes('español') ? 'español' : (languages[0] ?? ''),
		signLanguage,
		places: leavesOf(tm, 'lugar'),
		prices: childrenOf(tm, 'precio')
	};
}

/**
 * Extra spellings accepted for rule tags in events only. "online" (lowercase) used to be the
 * material tag now called "web" (still an alias of it); in an event it can only mean the place.
 * @type {Record<string, string>}
 */
const EVENT_ALIASES = { online: 'Online', virtual: 'Online' };

/**
 * @typedef {object} EventTagState
 * @prop {boolean} kinkyvibe
 * @prop {string} language one of groups.languages, or ''
 * @prop {boolean} sign LSA
 * @prop {string} place one of groups.places, or ''
 * @prop {string[]} prices
 * @prop {string[]} rest every other tag, as written
 * @prop {string[]} languages all spoken languages found (for validation)
 * @prop {string[]} places all places found (for validation)
 */

/**
 * Splits a tag list into the rule groups and the rest.
 * @param {string[]} tags
 * @param {Tags} [tm]
 * @returns {EventTagState}
 */
export function splitEventTags(tags, tm = siteTags()) {
	const g = eventTagGroups(tm);
	/** @type {EventTagState} */
	const state = {
		kinkyvibe: false,
		language: '',
		sign: false,
		place: '',
		prices: [],
		rest: [],
		languages: [],
		places: []
	};
	const seenRest = new Set();
	for (const raw of tags ?? []) {
		const tag = String(raw ?? '').trim();
		if (!tag) continue;
		const id = EVENT_ALIASES[tag] ?? canonicalTag(tag, tm);
		if (id === g.kinkyvibe) state.kinkyvibe = true;
		else if (id === g.signLanguage) state.sign = true;
		else if (g.languages.includes(id)) {
			if (!state.languages.includes(id)) state.languages.push(id);
		} else if (g.places.includes(id)) {
			if (!state.places.includes(id)) state.places.push(id);
		} else if (g.prices.includes(id)) {
			if (!state.prices.includes(id)) state.prices.push(id);
		} else if (!seenRest.has(id)) {
			seenRest.add(id);
			state.rest.push(tag);
		}
	}
	state.language = state.languages[0] ?? '';
	state.place = state.places[0] ?? '';
	state.prices = g.prices.filter((p) => state.prices.includes(p));
	return state;
}

/**
 * Tag list from the rule controls + the free picker, in the order recent events use
 * (see _event_template.md): idioma, KinkyVibe, precio, lugar, then the rest.
 * @param {{kinkyvibe: boolean, language: string, sign?: boolean, place: string, prices: string[], rest: string[]}} state
 * @param {Tags} [tm]
 * @returns {string[]}
 */
export function joinEventTags(state, tm = siteTags()) {
	const g = eventTagGroups(tm);
	const out = [
		state.language,
		state.sign ? g.signLanguage : '',
		state.kinkyvibe ? g.kinkyvibe : '',
		...g.prices.filter((p) => state.prices?.includes(p)),
		state.place
	].filter(Boolean);
	const seen = new Set(out.map((t) => canonicalTag(t, tm)));
	const ruled = new Set([
		g.kinkyvibe,
		g.signLanguage,
		...g.languages,
		...g.places,
		...g.prices,
		...Object.keys(EVENT_ALIASES)
	]);
	for (const raw of state.rest ?? []) {
		const tag = String(raw ?? '').trim();
		const id = canonicalTag(tag, tm);
		if (!tag || seen.has(id) || ruled.has(id) || ruled.has(tag)) continue;
		seen.add(id);
		out.push(tag);
	}
	return out;
}

/**
 * Checks an event's tags against the rules. Returns messages in Spanish (empty = OK).
 * Used by the form (live) and by the server before committing.
 * @param {string[]} tags
 * @param {Tags} [tm]
 * @returns {string[]}
 */
export function validateEventTags(tags, tm = siteTags()) {
	const g = eventTagGroups(tm);
	const s = splitEventTags(tags, tm);
	/** @type {string[]} */
	const errors = [];
	if (s.languages.length === 0)
		errors.push(`Falta el idioma del evento (${g.languages.join(', ')}).`);
	else if (s.languages.length > 1)
		errors.push(
			`Elegí un solo idioma (hay ${s.languages.join(' y ')}). La interpretación en ${
				g.signLanguage || 'LSA'
			} se marca aparte.`
		);
	if (s.places.length === 0)
		errors.push(`Falta dónde es el evento (${g.places.slice(0, 4).join(', ')}…).`);
	else if (s.places.length > 1) errors.push(`Elegí un solo lugar (hay ${s.places.join(' y ')}).`);
	return errors;
}

/**
 * Fills the rule groups that are missing, without touching the others: the default language,
 * and the place when a hint says it (e.g. the spreadsheet importer knows it's online).
 * @param {string[]} tags
 * @param {{place?: string}} [hints]
 * @param {Tags} [tm]
 */
export function withEventTagDefaults(tags, hints = {}, tm = siteTags()) {
	const g = eventTagGroups(tm);
	const s = splitEventTags(tags, tm);
	const hintPlace = hints.place
		? (EVENT_ALIASES[hints.place] ?? canonicalTag(hints.place, tm))
		: '';
	const language = s.language || g.defaultLanguage;
	const place = g.places.includes(hintPlace) ? hintPlace : s.place;
	if (
		language === s.language &&
		place === s.place &&
		s.languages.length <= 1 &&
		s.places.length <= 1
	)
		return [...tags];
	return joinEventTags({ ...s, language, place }, tm);
}

/* ------------------------------------------------------------------------------------------ */
/*  Picker options                                                                             */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} TagOption
 * @prop {string} id canonical id (what gets written)
 * @prop {string} name visible name
 * @prop {string} icon
 * @prop {string} [color]
 * @prop {string} group where it lives in the tree, e.g. "prácticas › impacto"
 * @prop {string[]} aliases other spellings (aka / aliasOf)
 * @prop {number} count posts of this kind that use it
 * @prop {boolean} inTree false for tags that only exist because some post uses them
 */

/** Structural nodes: they organize the tree but are not tags anyone writes. */
const STRUCTURAL = ['root', '', 'lugar', 'idioma', 'precio', 'Presencial', 'Argentina', 'Uruguay'];
const CATEGORY_ROOTS = ['calendario', 'material', 'amigues'];

/**
 * Tags a post of `category` can pick in the free picker.
 * - Other categories' subtrees are left out ("tipo de material > online" is not for events).
 * - Category roots and their grouping nodes ("tipo de evento") are left out.
 * - For events, the rule groups (KinkyVibe, idioma, lugar, precio) are left out: they have their
 *   own controls.
 * @param {string} category calendario | material | amigues | wiki
 * @param {Tags} [tm]
 * @returns {Set<string>} canonical ids to exclude
 */
export function excludedFromPicker(category, tm = siteTags()) {
	const out = new Set([...STRUCTURAL, ...CATEGORY_ROOTS]);
	for (const root of CATEGORY_ROOTS) {
		for (const child of childrenOf(tm, root)) if (childrenOf(tm, child).length) out.add(child);
		if (root !== category) for (const d of descendantsOf(tm, root)) out.add(d);
	}
	if (category === 'calendario') {
		const g = eventTagGroups(tm);
		for (const t of [g.kinkyvibe, g.signLanguage, ...g.languages, ...g.places, ...g.prices])
			out.add(t);
		for (const t of descendantsOf(tm, 'lugar')) out.add(t);
	}
	return out;
}

/**
 * @param {Tags} tm
 * @param {string} id
 */
function groupLabel(tm, id) {
	const parents = (tm.get(id)?.parents ?? []).filter((/** @type {string} */ p) => p !== 'root');
	if (!parents.length) return '';
	const p = parents[0];
	const grand = (tm.get(p)?.parents ?? []).filter((/** @type {string} */ x) => x !== 'root');
	return grand.length && !CATEGORY_ROOTS.includes(grand[0]) ? `${grand[0]} › ${p}` : p;
}

/**
 * Everything the picker can suggest for a kind of post: the tree's tags plus tags that only
 * exist because posts use them ("inicial", "historia"…), with how many posts of that kind use
 * each one.
 * @param {{category: string, usage?: Record<string, number>, tm?: Tags}} opts usage: raw tag → count
 * @returns {TagOption[]}
 */
export function buildTagOptions({ category, usage = {}, tm = siteTags() }) {
	const excluded = excludedFromPicker(category, tm);
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const [raw, n] of Object.entries(usage)) {
		const id = canonicalTag(raw, tm);
		counts.set(id, (counts.get(id) ?? 0) + n);
	}
	/** @type {Map<string, string[]>} */
	const aliases = new Map();
	/** @param {string} id @param {string} alias */
	const addAlias = (id, alias) => {
		if (!alias || alias === id) return;
		const list = aliases.get(id) ?? [];
		if (!list.includes(alias)) list.push(alias);
		aliases.set(id, list);
	};
	for (const [id, tag] of tm.entries()) {
		if (tag?.aliasOf) addAlias(tag.aliasOf, id);
		for (const a of tag?.aka ?? []) addAlias(id, a);
		if (tag?.visible_name && tag.visible_name !== id) addAlias(id, id);
	}

	/** @type {Map<string, TagOption>} */
	const out = new Map();
	/** @param {string} id @param {boolean} inTree */
	const add = (id, inTree) => {
		if (out.has(id) || excluded.has(id)) return;
		const tag = tm.get(id);
		out.set(id, {
			id,
			name: tag?.visible_name ?? id,
			icon: tag?.icon ?? '',
			color: tag?.getColor?.(),
			group: groupLabel(tm, id),
			aliases: aliases.get(id) ?? [],
			count: counts.get(id) ?? 0,
			inTree
		});
	};
	for (const [id, tag] of tm.entries()) {
		if (tag?.aliasOf) continue;
		if (tag?.orphan && !counts.has(id)) continue;
		add(id, !tag?.orphan);
	}
	for (const id of counts.keys()) add(id, false);
	return [...out.values()];
}

/**
 * @typedef {TagOption & {matched?: string}} TagSuggestion matched: the alias that matched
 */

/**
 * Ranks options for what the person typed. Empty query → the most used ones.
 * @param {TagOption[]} options
 * @param {string} query
 * @param {{selected?: string[], limit?: number, tm?: Tags}} [opts] selected: tags already picked (as written)
 * @returns {TagSuggestion[]}
 */
export function searchTagOptions(
	options,
	query,
	{ selected = [], limit = 8, tm = siteTags() } = {}
) {
	const taken = new Set(selected.map((t) => canonicalTag(t, tm)));
	const q = normalizeText(query);
	/** @type {Array<{o: TagSuggestion, score: number}>} */
	const hits = [];
	for (const o of options) {
		if (taken.has(o.id)) continue;
		if (!q) {
			if (o.count > 0) hits.push({ o, score: 0 });
			continue;
		}
		const name = normalizeText(o.name);
		const id = normalizeText(o.id);
		let score = Infinity;
		/** @type {string|undefined} */
		let matched;
		if (name === q || id === q) score = 0;
		else if (name.startsWith(q) || id.startsWith(q)) score = 2;
		else if (name.split(/[\s/-]+/).some((w) => w.startsWith(q))) score = 4;
		else if (name.includes(q) || id.includes(q)) score = 6;
		for (const a of o.aliases) {
			const na = normalizeText(a);
			const s = na === q ? 1 : na.startsWith(q) ? 3 : na.includes(q) ? 7 : Infinity;
			if (s < score) {
				score = s;
				matched = a;
			}
		}
		if (score < Infinity) hits.push({ o: matched ? { ...o, matched } : o, score });
	}
	hits.sort(
		(a, b) =>
			a.score - b.score ||
			Number(b.o.inTree) - Number(a.o.inTree) ||
			b.o.count - a.o.count ||
			a.o.name.localeCompare(b.o.name, 'es')
	);
	return hits.slice(0, limit).map((h) => h.o);
}

/**
 * The option whose name, id or alias is exactly what was typed (ignoring case and accents).
 * @param {TagOption[]} options
 * @param {string} text
 */
export function exactTagOption(options, text) {
	const q = normalizeText(text);
	if (!q) return undefined;
	return (
		options.find((o) => normalizeText(o.id) === q || normalizeText(o.name) === q) ??
		options.find((o) => o.aliases.some((a) => normalizeText(a) === q))
	);
}

/**
 * Cleans a new tag typed by hand. Returns '' if it can't be a tag.
 * @param {string} text
 */
export function cleanNewTag(text) {
	const t = String(text ?? '')
		.replace(/[\n\r\t,#]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return t.length > 0 && t.length <= 40 ? t : '';
}

/* ------------------------------------------------------------------------------------------ */
/*  Parent / child tags in the picker                                                          */
/* ------------------------------------------------------------------------------------------ */

/**
 * Every ancestor of a tag in the tree (parents, grandparents…), without "root" or itself.
 * Tags can have more than one parent ("cuerdas" is under "implementos" and "bondage").
 * @param {string} id canonical id
 * @param {Tags} [tm]
 * @returns {Set<string>}
 */
export function ancestorsOf(id, tm = siteTags()) {
	const out = new Set();
	const queue = [...(tm.get(id)?.parents ?? [])];
	while (queue.length) {
		const t = /** @type {string} */ (queue.shift());
		if (t === 'root' || t === id || out.has(t)) continue;
		out.add(t);
		queue.push(...(tm.get(t)?.parents ?? []));
	}
	return out;
}

/**
 * The picked tag (as written) that makes `tag` redundant because it is more specific (a
 * descendant of it), or undefined. `('cuerdas', ['shibari'])` → 'shibari'.
 * @param {string} tag
 * @param {string[]} picked tags as written
 * @param {Tags} [tm]
 */
export function moreSpecificPicked(tag, picked, tm = siteTags()) {
	const id = canonicalTag(tag, tm);
	return picked.find((p) => ancestorsOf(canonicalTag(p, tm), tm).has(id));
}

/**
 * Adds `tag` keeping only the most specific tags: a tag implies its ancestors (an event tagged
 * "shibari" is already about "cuerdas"), so
 * - picking a descendant of a picked tag replaces that ancestor (`replaced`);
 * - picking an ancestor of a picked tag adds nothing (`impliedBy` is the more specific one).
 * @param {string[]} picked tags as written
 * @param {string} tag
 * @param {Tags} [tm]
 * @returns {{tags: string[], added: boolean, replaced: string[], impliedBy?: string}}
 */
export function addSpecificTag(picked, tag, tm = siteTags()) {
	const id = canonicalTag(tag, tm);
	if (picked.some((p) => canonicalTag(p, tm) === id))
		return { tags: picked, added: false, replaced: [] };
	const impliedBy = moreSpecificPicked(tag, picked, tm);
	if (impliedBy) return { tags: picked, added: false, replaced: [], impliedBy };
	const ancestors = ancestorsOf(id, tm);
	const replaced = picked.filter((p) => ancestors.has(canonicalTag(p, tm)));
	return { tags: [...picked.filter((p) => !replaced.includes(p)), tag], added: true, replaced };
}
