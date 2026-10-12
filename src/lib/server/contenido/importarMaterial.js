/**
 * Cargar un paquete de borradores de material (fuera del repo: `manifest.json` con los artículos,
 * sus portadas y sus notas) como material NO LISTADO, por el mismo camino que guarda el panel un
 * material nuevo (scripts/importar-material.js, docs/contenido.md «Importar un paquete de
 * borradores»):
 *
 * - la metadata pasa por el mapa del panel (`mdToMaterial`, ./material.js) y se valida con el tipo
 *   (`validateData`); los perfiles y las etiquetas van como edges (`dehydrateContent`,
 *   ./relaciones.js) y se guarda con saveObject() y el historial en la misma tanda, como
 *   `writePost` de ./repo.js. Quien guarda es `script:importar-material`;
 * - siempre `force_unlisted: true` (no listado): nada queda en las listas hasta que gorrite lo
 *   revise y lo publique a mano;
 * - el texto va tal cual (el guardado solo saca líneas vacías del principio y espacios del final,
 *   como en el panel; si eso cambia algo, se avisa);
 * - les autores se buscan entre los perfiles vivos (por dirección o por nombre): el que aparece va
 *   como edge `persona` con el rol Autore (como elegirlo en el panel); el que no, queda como nombre
 *   y se avisa;
 * - las etiquetas se buscan por su `key` (también sin mayúsculas ni tildes): las que no existen se
 *   avisan y quedan como texto (como en el panel), nunca se crean;
 * - solo la portada va a la biblioteca (`storeImage`, ../media/library.js), con su texto
 *   alternativo, y se une con el edge `portada`;
 * - idempotente: si la dirección ya existe (también borrada), no se toca.
 *
 * Solo imports relativos (corre en Node sin Vite).
 */
import { mdToMaterial, MATERIAL_CATEGORY, MATERIAL_TYPE } from './material.js';
import { dehydrateContent } from './relaciones.js';
import { revisionStatement } from './revisions.js';
import { saveObject } from '../objects/save.js';
import { ObjectError } from '../objects/errors.js';
import { coreTypes, validateData } from '../objects/types/index.js';
import { storeImage } from '../media/library.js';
import { sniffImage } from '../media/sniff.js';
import { validateContentSlug } from '../../utils/contentPosts.js';
import { formatPostDate, isValidDate, todayInArgentina } from '../../utils/eventDraft.js';
import { AUTHOR_ROLE } from '../../utils/personasList.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').R2Bucket} R2Bucket */

/** Quién queda en el historial. */
export const IMPORT_ACTOR = 'script:importar-material';

/** De dónde sale la fecha de publicación. */
export const DATE_MODES = /** @type {const} */ (['original', 'hoy']);

/**
 * Un artículo del manifiesto (lo que se usa; el resto se ignora).
 * @typedef {{
 *   slug?: unknown, title?: unknown, summary?: unknown, tags?: unknown, authors?: unknown,
 *   body?: unknown, fecha?: unknown, notas?: unknown, importar?: unknown,
 *   portada?: { archivo?: unknown, alt?: unknown } | null
 * }} PackageArticle
 */

/**
 * @typedef {{
 *   articles: PackageArticle[],
 *   readFile: (relPath: string) => Promise<Uint8Array | null>
 * }} MaterialPackage
 *   `readFile`: los bytes de un archivo del paquete por su ruta del manifiesto, o `null`.
 */

/**
 * @typedef {{
 *   created: { slug: string, title: string, date: string, portada: boolean, notes: string[] }[],
 *   skipped: { slug: string, reason: string }[],
 *   problems: { slug: string, message: string }[]
 * }} ImportSummary
 *   `created`: lo creado (o, con `dryRun`, lo que se crearía) con sus avisos; `skipped`: lo que no
 *   se carga a propósito; `problems`: lo que no se pudo cargar.
 */

/**
 * Pura: una ruta del manifiesto con `/` (vienen con `\` de Windows o con `/`), sin `./` al
 * principio. Una ruta que sale del paquete (`..`, absoluta) da `null`.
 * @param {unknown} p
 */
export function packagePath(p) {
	const parts = String(p ?? '')
		.replaceAll('\\', '/')
		.split('/')
		.filter((s) => s && s !== '.');
	if (!parts.length || parts.includes('..') || /^[A-Za-z]:$/.test(parts[0])) return null;
	return parts.join('/');
}

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

/**
 * Pura: la fecha del post original según las notas de un artículo: la línea
 * `**Fuente:** <url> (YYYY-MM-DD, …)` (o `**Fuentes:**`), o, si no está, los ítems de la sección
 * `## Fuentes` (`1. <url> (YYYY-MM-DD, …)`). De cada fuente, la primera fecha que sigue a su
 * dirección; con varias, la más vieja.
 *
 * @param {string} text
 * @returns {{ date: string, sources: number } | null}
 */
export function dateFromNotes(text) {
	const lines = String(text ?? '').split(/\r?\n/);
	/** @type {string[]} */
	let candidates = lines.filter((l) => /\*\*Fuentes?:\*\*/i.test(l));
	if (!candidates.length) {
		const start = lines.findIndex((l) => /^#{1,6}\s*Fuentes?\b/i.test(l));
		if (start >= 0) {
			candidates = [];
			for (const l of lines.slice(start + 1)) {
				if (/^#{1,6}\s/.test(l)) break;
				if (/^\s*(?:\d+[.)]|[-*])\s/.test(l)) candidates.push(l);
			}
		}
	}
	/** @type {string[]} */
	const dates = [];
	for (const l of candidates) {
		const at = l.search(/https?:\/\//);
		if (at < 0) continue;
		const m = ISO_DATE.exec(l.slice(at));
		if (m && isValidDate(m[1])) dates.push(m[1]);
	}
	if (!dates.length) return null;
	return { date: [...dates].sort()[0], sources: dates.length };
}

/** Para comparar nombres: sin tildes, sin mayúsculas, solo letras y números. @param {unknown} s */
const loose = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');

/** @param {unknown} v @returns {string[]} */
const textList = (v) =>
	(Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v])
		.map((x) => String(x ?? '').trim())
		.filter(Boolean);

/**
 * Los perfiles vivos que pueden ser autores (no los lugares): dirección y nombre.
 * Lectura interna del script (como el panel ve todo): no filtra por visibilidad.
 * @param {D1Database} db
 */
async function liveProfiles(db) {
	const { results } = await db
		.prepare(
			`SELECT slug, title, visibility FROM objects WHERE type = 'perfil' AND deleted_at IS NULL
			AND COALESCE(json_extract(data, '$.kind'), '') <> 'lugar'`
		)
		.all();
	return results.map((r) => ({
		slug: String(r.slug),
		title: String(r.title),
		visibility: String(r.visibility)
	}));
}

/**
 * Las `key` de las etiquetas vivas.
 * @param {D1Database} db
 */
async function liveTagKeys(db) {
	const { results } = await db
		.prepare(
			`SELECT json_extract(data, '$.key') AS key FROM objects
			WHERE type = 'etiqueta' AND deleted_at IS NULL`
		)
		.all();
	return results.flatMap((r) => (typeof r.key === 'string' ? [r.key] : []));
}

/**
 * Pura: une autore del paquete → el perfil que nombra (por dirección exacta, o por dirección o
 * nombre sin tildes ni mayúsculas ni signos). Con más de un perfil posible, ninguno.
 *
 * @param {string} author
 * @param {{ slug: string, title: string, visibility: string }[]} profiles
 * @returns {{ profile: { slug: string, title: string, visibility: string } | null, ambiguous: boolean }}
 */
export function matchProfile(author, profiles) {
	const exact = profiles.find((p) => p.slug === author);
	if (exact) return { profile: exact, ambiguous: false };
	const key = loose(author);
	if (!key) return { profile: null, ambiguous: false };
	const found = profiles.filter((p) => loose(p.slug) === key || loose(p.title) === key);
	const unique = [...new Map(found.map((p) => [p.slug, p])).values()];
	if (unique.length === 1) return { profile: unique[0], ambiguous: false };
	return { profile: null, ambiguous: unique.length > 1 };
}

/**
 * Pura: una etiqueta del paquete → la `key` de una etiqueta viva (exacta, o sin tildes ni
 * mayúsculas si hay una sola así), o `null`.
 * @param {string} tag
 * @param {readonly string[]} keys
 */
export function matchTag(tag, keys) {
	if (keys.includes(tag)) return tag;
	const found = keys.filter((k) => loose(k) === loose(tag));
	return found.length === 1 ? found[0] : null;
}

/** @param {unknown} e */
const describe = (e) => {
	if (e instanceof ObjectError) {
		const details = e.errors.map((x) => x.message).join(' ');
		return details ? `${e.message} ${details}` : e.message;
	}
	return e instanceof Error ? e.message : String(e);
};

/**
 * Carga los artículos del paquete (ver arriba). Nunca corta por un artículo: cada uno queda en
 * el resumen. Con `dryRun` no escribe nada (ni la base ni el bucket): lee lo mismo y dice qué
 * haría.
 *
 * @param {D1Database} db
 * @param {R2Bucket | null | undefined} bucket
 * @param {MaterialPackage} pkg
 * @param {{ fecha?: (typeof DATE_MODES)[number], actor?: string, dryRun?: boolean, now?: number }} [opts]
 * @returns {Promise<ImportSummary>}
 */
export async function importMaterialPackage(
	db,
	bucket,
	pkg,
	{ fecha = 'original', actor = IMPORT_ACTOR, dryRun = false, now = Date.now() } = {}
) {
	if (!DATE_MODES.includes(fecha)) throw new Error(`--fecha tiene que ser original u hoy.`);
	/** @type {ImportSummary} */
	const summary = { created: [], skipped: [], problems: [] };
	const def = /** @type {import('../objects/types/index.js').CoreType} */ (
		coreTypes.get(MATERIAL_TYPE)
	);
	const [profiles, tagKeys] = await Promise.all([liveProfiles(db), liveTagKeys(db)]);
	const today = todayInArgentina(new Date(now));
	/** @type {Set<string>} */
	const seen = new Set();

	for (const [i, a] of pkg.articles.entries()) {
		const slug = String(a?.slug ?? '').trim();
		const label = slug || `artículo ${i + 1}`;
		if (a?.importar !== true) {
			summary.skipped.push({ slug: label, reason: 'importar no es true (no se carga)' });
			continue;
		}
		const slugProblem = validateContentSlug(slug, MATERIAL_CATEGORY, seen);
		if (slugProblem) {
			summary.problems.push({ slug: label, message: slugProblem });
			continue;
		}
		seen.add(slug);
		try {
			const existing = await db
				.prepare(`SELECT deleted_at FROM objects WHERE type = ?1 AND slug = ?2`)
				.bind(MATERIAL_TYPE, slug)
				.first();
			if (existing) {
				summary.skipped.push({
					slug,
					reason:
						existing.deleted_at == null
							? 'ya existe un material con esa dirección (no se toca)'
							: 'ya existe un material borrado con esa dirección (se puede recuperar desde el panel; no se toca)'
				});
				continue;
			}

			/** @type {string[]} */
			const notes = [];
			const title = String(a.title ?? '').trim();
			const body = typeof a.body === 'string' ? a.body : '';
			if (!title) throw new Error('Falta el título.');
			if (!body.trim()) throw new Error('Falta el texto.');

			// La fecha de publicación (el panel la pide).
			let date = today;
			if (fecha === 'original') {
				const own = String(a.fecha ?? '').slice(0, 10);
				if (isValidDate(own)) date = own;
				else {
					const notesPath = a.notas ? packagePath(a.notas) : null;
					const bytes = notesPath ? await pkg.readFile(notesPath) : null;
					const found = bytes ? dateFromNotes(new TextDecoder().decode(bytes)) : null;
					if (found) {
						date = found.date;
						if (found.sources > 1)
							notes.push(`${found.sources} fuentes en las notas: se usó la fecha más vieja`);
					} else {
						notes.push(
							a.fecha
								? `la fecha «${String(a.fecha)}» no se entiende: se usó la de hoy`
								: 'no hay fecha original (ni en el manifiesto ni en las notas): se usó la de hoy'
						);
					}
				}
			}

			// Etiquetas: solo las que existen pasan a edges; las otras se avisan (no se crean).
			/** @type {string[]} */
			const tags = [];
			for (const tag of textList(a.tags)) {
				const key = matchTag(tag, tagKeys);
				if (!key) notes.push(`etiqueta que no existe: «${tag}» (queda como texto, sin crearla)`);
				if (!tags.includes(key ?? tag)) tags.push(key ?? tag);
			}
			if (!tags.length) throw new Error('No tiene etiquetas.');

			// Autores, en su orden: un perfil vivo → edge `persona` (Autore); si no, su nombre.
			/** @type {({ perfil: string, rol: string } | { nombre: string, rol: string })[]} */
			const people = [];
			for (const author of textList(a.authors)) {
				const { profile, ambiguous } = matchProfile(author, profiles);
				if (profile) {
					if (!people.some((p) => 'perfil' in p && p.perfil === profile.slug))
						people.push({ perfil: profile.slug, rol: AUTHOR_ROLE });
					if (profile.visibility !== 'public')
						notes.push(`autore «${author}»: su perfil no es público (no se muestra)`);
				} else {
					people.push({ nombre: author, rol: AUTHOR_ROLE });
					notes.push(
						ambiguous
							? `autore «${author}»: hay más de un perfil con ese nombre (queda como nombre, sin vínculo)`
							: `autore «${author}»: no hay un perfil así (queda como nombre, sin vínculo)`
					);
				}
			}
			if (!people.length) throw new Error('No tiene autores.');

			// La misma metadata que guardaría el panel (la forma del .md).
			/** @type {Record<string, unknown>} */
			const meta = {
				published_date: formatPostDate(date),
				title,
				...(a.summary ? { summary: String(a.summary) } : {}),
				tags,
				personas: people,
				force_unlisted: true
			};
			const mapped = mdToMaterial(slug, meta, body);
			if (mapped.error) throw new Error(mapped.error);
			notes.push(...mapped.warnings);
			// El salto de línea del final no cuenta (un archivo de texto siempre lo tiene).
			if (mapped.data.body !== body.replace(/\r?\n$/, ''))
				notes.push(
					'el texto se guarda sin las líneas vacías del principio ni los espacios del final (como en el panel)'
				);
			// Lo escribe un script, no une superadmin: la lista corta de HTML (decisión 0004).
			const valid = validateData(def, { ...mapped.data, body_html: 'corta' });
			if (!valid.ok) throw new Error(valid.errors.map((e) => e.message).join('; '));

			// La portada: a la biblioteca, con su texto alternativo.
			const coverPath = a.portada?.archivo ? packagePath(a.portada.archivo) : null;
			const alt = String(a.portada?.alt ?? '').trim();
			const cover = coverPath ? await pkg.readFile(coverPath) : null;
			if (!a.portada?.archivo) notes.push('sin portada');
			else if (!cover) notes.push(`no está la portada «${String(a.portada.archivo)}»`);
			else if (!sniffImage(cover)) {
				notes.push(`la portada no es una imagen JPG, PNG, WEBP, GIF o AVIF`);
			} else if (!alt) notes.push('la portada no tiene texto alternativo');
			const withCover = Boolean(cover && sniffImage(cover));

			if (!dryRun) {
				/** @type {number | null} */
				let imageId = null;
				if (withCover) {
					const name = /** @type {string} */ (coverPath).split('/').pop();
					const { image } = await storeImage(
						db,
						bucket,
						{ bytes: /** @type {Uint8Array} */ (cover), name, alt },
						{ actor, now }
					);
					imageId = image.id;
				}
				const { data, edges } = await dehydrateContent(
					db,
					MATERIAL_CATEGORY,
					/** @type {Record<string, unknown>} */ (valid.data)
				);
				await saveObject(
					db,
					{
						type: MATERIAL_TYPE,
						slug,
						title: mapped.title,
						data,
						edges: { ...edges, ...(imageId ? { portada: [imageId] } : {}) },
						visibility: mapped.visibility
					},
					{ actor, now, also: (self) => [revisionStatement(db, self, 'import')] }
				);
			}
			summary.created.push({ slug, title: mapped.title, date, portada: withCover, notes });
		} catch (e) {
			summary.problems.push({ slug, message: describe(e) });
		}
	}
	return summary;
}
