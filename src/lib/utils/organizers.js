/**
 * Pure helpers for the "Organizan" / "Autores" field of the admin editors.
 *
 * Posts list their organizers/authors in the frontmatter as `authors:`, one entry per person or
 * group. The site links an entry to a profile in src/lib/posts/amigues/ by turning spaces into
 * dashes (see processPost in $lib/utils): "DemonWeb" → amigues/DemonWeb.md. Entries without a
 * profile are allowed and are shown as plain text.
 */
import { normalizeText } from './adminTags.js';

/**
 * @typedef {object} Profile
 * @prop {string} slug file name in src/lib/posts/amigues, without .md (what gets written)
 * @prop {string} title e.g. "DemonWeb / Mel"
 * @prop {string} [thumb] image URL
 */

/**
 * @typedef {object} OrganizerOption
 * @prop {string} value what gets written in `authors:`
 * @prop {string} label
 * @prop {string} [detail] e.g. the profile's title, or "sin perfil"
 * @prop {string} [thumb]
 * @prop {boolean} hasProfile
 * @prop {number} count how many events list it
 */

/**
 * The profile slug the site looks up for an `authors:` entry.
 * @param {string} author
 */
export const profileSlugFor = (author) =>
	String(author ?? '')
		.trim()
		.replaceAll(' ', '-');

/** @param {string} s */
const key = (s) => normalizeText(s).replace(/[\s._@-]+/g, '');

/**
 * Finds the profile for an `authors:` entry: exact slug first (what the site does), then
 * ignoring case, accents, spaces, dots and dashes ("Mi Pieza Acción Gráfica" →
 * MiPiezaAccionGrafica), then by the first part of the profile title ("DemonWeb / Mel").
 * @param {Profile[]} profiles
 * @param {string} author
 * @returns {Profile|undefined}
 */
export function findProfile(profiles, author) {
	const slug = profileSlugFor(author);
	if (!slug) return undefined;
	const exact = profiles.find((p) => p.slug === slug);
	if (exact) return exact;
	const k = key(author);
	return (
		profiles.find((p) => key(p.slug) === k) ??
		profiles.find((p) => key(p.title.split('/')[0]) === k)
	);
}

/**
 * Everything the organizer field can suggest: the amigues profiles, plus names that past events
 * list without a profile (with how often they're used).
 * @param {Profile[]} profiles
 * @param {Record<string, number>} usage `authors:` entry → number of events
 * @returns {OrganizerOption[]}
 */
export function buildOrganizerOptions(profiles, usage = {}) {
	/** @type {Map<string, OrganizerOption>} */
	const out = new Map();
	for (const p of profiles) {
		out.set(p.slug, {
			value: p.slug,
			label: p.slug,
			detail: p.title && p.title !== p.slug ? p.title : undefined,
			thumb: p.thumb,
			hasProfile: true,
			count: 0
		});
	}
	for (const [name, n] of Object.entries(usage)) {
		const profile = findProfile(profiles, name);
		if (profile) {
			const o = /** @type {OrganizerOption} */ (out.get(profile.slug));
			o.count += n;
			continue;
		}
		const k = key(name);
		const existing = [...out.values()].find((o) => !o.hasProfile && key(o.value) === k);
		if (existing) {
			// Same person written two ways ("Flor Sandulli" / "@flor.sandulli"): keep the most used.
			if (n > existing.count) {
				out.delete(existing.value);
				out.set(name, { ...existing, value: name, label: name, count: existing.count + n });
			} else existing.count += n;
			continue;
		}
		out.set(name, { value: name, label: name, detail: 'sin perfil', hasProfile: false, count: n });
	}
	return [...out.values()];
}

/**
 * Ranks organizer options for what was typed. Profiles before names without profile, then by use.
 * @param {OrganizerOption[]} options
 * @param {string} query
 * @param {{selected?: string[], limit?: number}} [opts]
 * @returns {OrganizerOption[]}
 */
export function searchOrganizers(options, query, { selected = [], limit = 8 } = {}) {
	const taken = new Set(selected.map(key));
	const q = normalizeText(query);
	const qk = key(query);
	/** @type {Array<{o: OrganizerOption, score: number}>} */
	const hits = [];
	for (const o of options) {
		if (taken.has(key(o.value))) continue;
		if (!q) {
			if (o.hasProfile || o.count > 1) hits.push({ o, score: 0 });
			continue;
		}
		const fields = [o.value, o.detail ?? ''].map(normalizeText);
		let score = Infinity;
		if (key(o.value) === qk) score = 0;
		else if (fields.some((f) => f.startsWith(q))) score = 1;
		else if (fields.some((f) => f.split(/[\s/._@-]+/).some((w) => w.startsWith(q)))) score = 2;
		else if (fields.some((f) => f.includes(q)) || key(o.value).includes(qk)) score = 3;
		if (score < Infinity) hits.push({ o, score });
	}
	hits.sort(
		(a, b) =>
			a.score - b.score ||
			Number(b.o.hasProfile) - Number(a.o.hasProfile) ||
			b.o.count - a.o.count ||
			a.o.label.localeCompare(b.o.label, 'es')
	);
	return hits.slice(0, limit).map((h) => h.o);
}

/**
 * What to write for a typed name: the matching profile's slug if there is one, else the text.
 * @param {Profile[]} profiles
 * @param {string} text
 */
export function organizerValue(profiles, text) {
	const t = String(text ?? '')
		.replace(/[\n\r\t,]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!t) return '';
	return findProfile(profiles, t)?.slug ?? t;
}
