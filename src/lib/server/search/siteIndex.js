/**
 * El índice de la búsqueda global (/api/search-index.json → SearchPalette.svelte): qué entra y
 * cómo, a partir de lo que ya leyó el endpoint. Sin lecturas propias, así se prueba con datos
 * inventados en los dos estados de cada interruptor.
 *
 * La regla (gorrite): si quien busca ya tiene una forma de llegar a algo navegando el sitio, lo
 * puede encontrar buscando; nunca más que eso (ni más cosas, ni más campos que los que muestra su
 * página). El índice es uno solo para todes (se recuerda y se sirve igual a cualquiera): por eso
 * es lo que alcanza une visitante sin cuenta. Lo «solo con cuenta» no entra aunque une miembre lo
 * pueda ver (haría falta un índice por persona).
 *
 * Qué entra:
 * - eventos y material listados y publicados (`sitePosts`: de la base o de los .md, interruptor
 *   `contenido_db`), con su cuerpo recortado;
 * - las fichas de amigues: con `perfiles_publicos` apagado, las .md; prendido, los perfiles que
 *   lista /amigues para el público (aprobados, ni ocultos, ni «solo con cuenta», ni no listados) más
 *   las .md que todavía no se importaron. El contacto de un perfil no entra;
 * - los lugares (perfiles de tipo `lugar`, con `perfiles_publicos` prendido): los listados en
 *   /amigues y los no listados a los que lleva el link de un evento que está en el índice
 *   (`linkedVenues` en src/lib/server/amigues/venues.js, que decide igual que la página del
 *   evento). De cada uno, lo que muestra su página: nombre, descripción, etiquetas y, según su
 *   nivel (`venuePageLevel`), barrio y ciudad. **Nunca la calle y número** ni «cómo llegar» o
 *   «accesibilidad»; tampoco en qué eventos está. El «Dónde» de los eventos tampoco entra;
 * - la Kinkipedia: las entradas de la wiki y las etiquetas con descripción u otros nombres, con
 *   sus alias (los de la base vienen como `{ id, aliasOf }`, no como `aka`);
 * - las series (interruptor `series`): cada etiqueta que es serie, con su ícono, aunque no tenga
 *   descripción («Picantearla: Deluxe»).
 */
import { canonicalTags } from '$lib/utils';
import { fold, stripMarkdown, truncate } from '$lib/utils/search';
import { seriesTagIds, tagPagePath } from '$lib/utils/series.js';
import { profileKindOf } from '$lib/server/objects/types/perfil.js';
import { venuePageLevel, venueView } from '$lib/utils/venues.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('$lib/utils/search').RawSearchIndex} RawSearchIndex */
/** @typedef {Pick<ProcessedPost, 'meta' | 'path'>} IndexPost */
/**
 * Un perfil de la base como lo devuelve `listPublicProfiles` (el objeto ya filtrado para el
 * público) con la dirección vieja de su ficha, si la tenía.
 * @typedef {{
 *   object: { slug: string, title: string, visibility?: string, data: Record<string, any> },
 *   legacySlug: string | null
 * }} IndexProfile
 */

/** Versión del formato del índice (la lee el cliente). */
export const INDEX_VERSION = 1;

/**
 * Máximo de caracteres de cuerpo (texto plano) por post en el índice. Los eventos se
 * repiten mucho entre ediciones (y ya tienen título/resumen/tags), así que se recortan más.
 * @type {Record<string, number>}
 */
export const BODY_MAX = { calendario: 400, material: 2500, amigues: 2500, wiki: 2500 };

/** @param {unknown} v */
const str = (v) => (v === undefined || v === null ? '' : String(v));

/** @param {unknown} v @returns {string[]} */
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/** @param {unknown} d */
function isoDate(d) {
	if (!d) return undefined;
	const t = new Date(/** @type {any} */ (d));
	return isNaN(t.getTime()) ? undefined : t.toISOString();
}

/**
 * Texto plano del cuerpo (markdown), recortado. Vacío para los «contenido secreto».
 * @param {string | undefined} markdown
 * @param {string} category
 */
export function plainBody(markdown, category) {
	if (!markdown) return '';
	const text = stripMarkdown(markdown);
	return /^contenido secreto$/i.test(text) ? '' : truncate(text, BODY_MAX[category] ?? 1000);
}

/**
 * Los otros nombres de cada etiqueta canónica: los `aka` del archivo y las entradas
 * `{ id, aliasOf }` (así vienen los alias de la base, sin `aka`).
 *
 * @param {TagManager} tags
 * @returns {Map<string, string[]>}
 */
export function tagAliases(tags) {
	/** @type {Map<string, Set<string>>} */
	const out = new Map();
	/** @param {string} id @param {string} name */
	const add = (id, name) => {
		if (!name || name === id) return;
		let set = out.get(id);
		if (!set) out.set(id, (set = new Set()));
		set.add(name);
	};
	for (const tag of tags.tagsData()) {
		if (tag.aliasOf) {
			const target = tags.get(tag.id);
			if (target && !target.aliasOf && target.id !== tag.id) add(target.id, tag.id);
		} else {
			for (const name of tag.aka ?? []) add(tag.id, name);
		}
	}
	return new Map([...out].map(([id, set]) => [id, [...set]]));
}

/**
 * ¿Un perfil de la base puede estar en el índice? Lo mismo que lista /amigues para el público
 * (lo decide la consulta; esto es la segunda llave): público y listado. Vale también para los
 * lugares listados.
 *
 * @param {IndexProfile} p
 */
export function indexableProfile(p) {
	const o = p.object;
	if (!o) return false;
	if (o.visibility && o.visibility !== 'public') return false;
	return !o.data?.unlisted;
}

/**
 * ¿Un lugar al que lleva el link de un evento visible puede estar en el índice? Lo decide
 * `linkedVenues` (esto es la segunda llave): un lugar público para ANON (puede ser no listado).
 *
 * @param {IndexProfile} p
 */
export function indexableLinkedVenue(p) {
	const o = p.object;
	if (!o || profileKindOf(o.data ?? {}) !== 'lugar') return false;
	return !o.visibility || o.visibility === 'public';
}

/**
 * Barrio y ciudad de un lugar si su página los muestra (según `venuePageLevel`; nunca la calle).
 *
 * @param {IndexProfile['object']} o
 * @returns {string}
 */
export function venueAreaText(o) {
	const view = venueView(o, venuePageLevel(o.data?.venue_privacy), '');
	return [view.area, view.city].filter(Boolean).join(', ');
}

/**
 * @typedef {{
 *   posts: readonly IndexPost[],
 *   wikiPosts: readonly IndexPost[],
 *   tags: TagManager,
 *   body: (post: IndexPost) => Promise<string | undefined> | string | undefined,
 *   profiles?: {
 *     list: readonly IndexProfile[],
 *     imported: ReadonlySet<string>,
 *     linkedVenues?: readonly IndexProfile[]
 *   } | null,
 *   series?: boolean
 * }} IndexInput
 * `posts`: lo listado del sitio (`sitePosts`: eventos, material y fichas .md); `wikiPosts`: las
 * entradas de la wiki; `body`: el markdown de un post (de la base o del .md); `profiles`: los
 * perfiles de la base si `perfiles_publicos` está prendido (`null`: las fichas .md), con los lugares
 * no listados a los que lleva el link de un evento del índice (`linkedVenues`); `series`: si
 * el interruptor `series` está prendido.
 */

/**
 * Arma el índice.
 *
 * @param {IndexInput} input
 * @returns {Promise<RawSearchIndex>}
 */
export async function buildSearchIndex({ posts, wikiPosts, tags, body, profiles, series }) {
	/** @type {SearchDoc[]} */
	const docs = [];
	/** @type {Set<string>} */
	const usedTags = new Set();
	const aliases = tagAliases(tags);
	/** @param {string} id */
	const aliasesOf = (id) => aliases.get(id) ?? [];
	/** @param {unknown} icon */
	const iconOf = (icon) => (typeof icon === 'string' ? icon.trim() : '') || undefined;

	for (const post of posts) {
		const { meta, path } = post;
		if (meta.force_unpublished || meta.force_unlisted) continue;
		if (meta.category === 'amigues' && profiles && profiles.imported.has(String(meta.postID))) {
			// Importada: la base decide (si está oculta o no listada, no aparece).
			continue;
		}
		const tagIds = [...new Set(meta.tags ?? [])];
		tagIds.forEach((t) => usedTags.add(t));
		const event = meta.category === 'calendario';
		docs.push({
			c: /** @type {SearchDoc['c']} */ (meta.category),
			h: path,
			t: str(meta.title) || str(meta.postID),
			s: stripMarkdown(str(meta.summary)),
			g: tagIds,
			a: (meta.authors ?? []).map(str),
			d: event ? isoDate(meta.start) : undefined,
			e: event ? isoDate(meta.end) : undefined,
			b: plainBody(await body(post), String(meta.category))
		});
	}

	/** @type {Set<string>} */
	const profileHrefs = new Set();
	const profileDocs = [
		...(profiles?.list ?? []).filter(indexableProfile),
		...(profiles?.linkedVenues ?? []).filter(indexableLinkedVenue)
	];
	for (const p of profileDocs) {
		const href = `/amigues/${p.legacySlug || p.object.slug}`;
		if (profileHrefs.has(href)) continue;
		profileHrefs.add(href);
		const d = p.object.data ?? {};
		const tagIds = [...new Set(canonicalTags(strings(d.tags), tags))];
		tagIds.forEach((t) => usedTags.add(t));
		const body = plainBody(typeof d.body === 'string' ? d.body : '', 'amigues');
		// Un lugar: barrio y ciudad solo si su página los muestra.
		const area = profileKindOf(d) === 'lugar' ? venueAreaText(p.object) : '';
		docs.push({
			c: 'amigues',
			h: href,
			t: str(p.object.title),
			s: stripMarkdown(str(d.bio)),
			g: tagIds,
			a: strings(d.authors),
			b: [area, body].filter(Boolean).join(' · ')
		});
	}

	// Kinkipedia: entradas de la wiki + tags con descripción u otros nombres.
	/** @type {Map<string, SearchDoc>} */
	const wikiByTerm = new Map();
	for (const post of wikiPosts) {
		const { meta, path } = post;
		if (meta.force_unpublished) continue;
		const term = str(meta.wiki || meta.postID).replaceAll('-', ' ');
		const tag = tags.get(term);
		/** @type {SearchDoc} */
		const doc = {
			c: 'wiki',
			h: path,
			t: str(meta.title) || term,
			s: stripMarkdown(str(meta.summary || tag.description)),
			g: [...new Set([...(tag.orphan ? [] : [tag.id]), ...(meta.tags ?? [])])],
			k: tag.orphan ? [] : aliasesOf(tag.id),
			a: (meta.authors ?? []).map(str),
			i: tag.orphan ? undefined : iconOf(tag.icon),
			b: plainBody(await body(post), 'wiki')
		};
		doc.g?.forEach((t) => usedTags.add(t));
		wikiByTerm.set(fold(tag.orphan ? term : tag.id), doc);
		docs.push(doc);
	}

	// Series: cada una con su página, aunque no tenga descripción ni otros nombres.
	if (series) {
		for (const id of seriesTagIds(tags)) {
			const tag = tags.get(id);
			if (!tag || tag.aliasOf) continue;
			const existing = wikiByTerm.get(fold(tag.id));
			if (existing) {
				existing.c = 'serie';
				continue;
			}
			/** @type {SearchDoc} */
			const doc = {
				c: 'serie',
				h: tagPagePath(tag.id),
				t: tag.visible_name ?? tag.id,
				s: typeof tag.description === 'string' ? stripMarkdown(tag.description) : '',
				g: [tag.id],
				k: aliasesOf(tag.id),
				i: iconOf(tag.icon)
			};
			wikiByTerm.set(fold(tag.id), doc);
			docs.push(doc);
			usedTags.add(tag.id);
		}
	}

	for (const tag of tags.tagsData()) {
		if (tag.aliasOf || tag.id === 'root') continue;
		const description = typeof tag.description === 'string' ? stripMarkdown(tag.description) : '';
		const aka = aliasesOf(tag.id);
		const existing = wikiByTerm.get(fold(tag.id));
		if (existing) {
			if (description && existing.s !== description) {
				existing.b = (description + ' ' + (existing.b ?? '')).trim();
			}
			continue;
		}
		if (!description && aka.length === 0) continue;
		docs.push({
			c: 'wiki',
			h: tagPagePath(tag.id),
			t: tag.visible_name ?? tag.id,
			s: description,
			g: [tag.id],
			k: aka,
			i: iconOf(tag.icon)
		});
		usedTags.add(tag.id);
	}

	/** @type {Record<string, string[]>} tag id -> [nombre visible (si difiere), ...alias] */
	const tagNames = {};
	for (const id of usedTags) {
		const tag = tags.get(id);
		const canonical = tag.id ?? id;
		const names = [...new Set([tag.visible_name ?? id, ...aliasesOf(canonical)])].filter(
			(n) => n !== id
		);
		if (names.length > 0) tagNames[id] = names;
	}

	// Sacar campos vacíos para achicar el JSON.
	for (const doc of docs) {
		for (const k of /** @type {(keyof typeof doc)[]} */ (Object.keys(doc))) {
			const v = doc[k];
			if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete doc[k];
		}
	}
	return { v: INDEX_VERSION, docs, tags: tagNames };
}
