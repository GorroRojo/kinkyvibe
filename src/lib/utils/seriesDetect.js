/**
 * Detectar series entre los eventos: eventos que se repiten (mismo nombre en el título o mismo
 * comienzo de slug) y todavía no tienen etiqueta de serie. Lo usan el script que propuso las
 * series de src/lib/utils/hardcodedTags.js y el panel (el nombre sugerido al duplicar un evento).
 *
 * Funciones puras, sin imports de SvelteKit: andan en el navegador, en el servidor y en vitest.
 */
import { foldText } from './text.js';

const MONTHS = new Set([
	'enero',
	'ene',
	'febrero',
	'feb',
	'marzo',
	'mar',
	'abril',
	'abr',
	'mayo',
	'junio',
	'jun',
	'julio',
	'jul',
	'agosto',
	'ago',
	'septiembre',
	'setiembre',
	'sep',
	'sept',
	'set',
	'octubre',
	'oct',
	'noviembre',
	'nov',
	'diciembre',
	'dic'
]);

/**
 * El comienzo del slug hasta la fecha: todo lo que está antes del primer año (`-2024`) o nombre
 * de mes (`-octubre`, `-sep`). `picantearla-2026-10` → `picantearla`,
 * `cine-para-sucixs-2024-01-montevideo` → `cine-para-sucixs`. Un slug sin fecha queda entero.
 *
 * @param {string} slug
 */
export function slugStem(slug) {
	const parts = foldText(slug)
		.replace(/[^a-z0-9]+/g, '-')
		.split('-')
		.filter(Boolean);
	const at = parts.findIndex((p, i) => i > 0 && (/^(19|20)\d{2}$/.test(p) || MONTHS.has(p)));
	return (at > 0 ? parts.slice(0, at) : parts).join('-');
}

/**
 * El nombre de la serie a partir del título de un evento: sin número de edición («(9° Edición)»,
 * «#3», «10ª»), sin partes («(parte 1 de 2)»), sin la ciudad entre signos («¡Córdoba!»,
 * «¡Edición Montevideo!»), sin lo que viene después de «:», « - », « | » o « + », sin fechas
 * ni emojis. `''` si no queda nada.
 *
 * «Cine Para Sucixs (8ª Edición)» → «Cine Para Sucixs»; «¡Córdoba! Someter: cómo dominar…» →
 * «Someter»; «Rancheadita Kinky + Jam de Cuerdas» → «Rancheadita Kinky».
 *
 * @param {unknown} title
 */
export function seriesNameFromTitle(title) {
	let t = String(title ?? '')
		.trim()
		.replace(/^(['"])(.*)\1$/, '$2')
		.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
		.replace(/\([^)]*\)/g, ' ');
	// «¡Córdoba! Taller…», «… ¡Edición Montevideo!»: fuera, salvo que sea todo el nombre
	// («¡Hablame sucio!»).
	const withoutBangs = t.replace(/¡[^!]*!/g, ' ');
	t = /\p{L}/u.test(withoutBangs) ? withoutBangs : t.replace(/[¡!]/g, ' ');
	t = t.replace(/\bvol\.?\s*[ivx\d]+\b.*$/i, ' ');
	t = t.split(/\s*:\s|\s+[-–—|+]\s+|\.\s/)[0];
	t = t
		.replace(/\bedici[oó]n\b.*$/i, ' ')
		.replace(/#\s*\d+/g, ' ')
		.replace(/\b\d+\s*[°ºª]/g, ' ');
	const words = t
		.split(/\s+/)
		.filter(Boolean)
		.filter((w) => !/^(19|20)\d{2}$/.test(w) && !MONTHS.has(foldText(w)));
	// «Taller de Bondage Online» → «Taller de Bondage».
	while (words.length > 1 && /^online$/i.test(words[words.length - 1])) words.pop();
	return words
		.join(' ')
		.replace(/[\s*.,;:|\-–—]+$/g, '')
		.replace(/^[\s*.,;:|\-–—]+/g, '')
		.trim();
}

/**
 * Clave para comparar nombres de serie: «Cine Para Súcixs» → «cine para sucixs».
 * @param {unknown} name
 */
export function seriesKey(name) {
	return foldText(name)
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** «fugas-criticas-charla-debate» → «Fugas criticas charla debate». */
function labelFromStem(/** @type {string} */ stem) {
	const t = stem.replaceAll('-', ' ');
	return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * @typedef {{ slug: string, title?: unknown, tags?: readonly string[], start?: unknown }} DetectEvent
 * @typedef {{
 *   name: string,
 *   events: string[],
 *   skip: null | { reason: 'partes' | 'mismo-mes' | 'ya-es-serie' | 'nombre-tomado', detail: string }
 * }} SeriesCandidate
 */

/**
 * «2024-11» de un comienzo ISO (o `''`).
 * @param {unknown} start
 */
function monthOf(start) {
	// La fecha como está escrita (hora de Argentina), no en UTC.
	const m = /^(\d{4}-\d{2})/.exec(String(start ?? ''));
	if (m) return m[1];
	const d = new Date(/** @type {any} */ (start));
	return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 7) : '';
}

/**
 * Las series que faltan: grupos de 2 o más eventos con el mismo nombre (seriesNameFromTitle) o
 * el mismo comienzo de slug (slugStem). El nombre propuesto es el nombre más repetido del grupo
 * (o el comienzo del slug, si todos los títulos son distintos). Se descartan, con el motivo:
 * - `ya-es-serie`: todos los eventos del grupo ya tienen una misma etiqueta de serie;
 * - `partes`: son las partes de un mismo evento (`taller-2024-11` y `taller-2024-11-parte-2`);
 * - `mismo-mes`: todos son del mismo mes (un mismo taller en varios días, no una serie);
 * - `nombre-tomado`: ya hay una etiqueta (o alias) con ese nombre que no es serie.
 *
 * @param {readonly DetectEvent[]} events
 * @param {{ seriesIds: readonly string[], tagExists?: (name: string) => boolean }} opts
 * @returns {SeriesCandidate[]} ordenadas por nombre
 */
export function detectSeries(events, { seriesIds, tagExists = () => false }) {
	const list = events.filter((e) => e.slug && !e.slug.startsWith('_'));
	/** @type {number[]} */
	const parent = list.map((_, i) => i);
	/** @param {number} i @returns {number} */
	const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	const union = (/** @type {number} */ a, /** @type {number} */ b) => {
		parent[find(a)] = find(b);
	};
	/** @type {Map<string, number>} */
	const firstByKey = new Map();
	list.forEach((e, i) => {
		const keys = [`t:${seriesKey(seriesNameFromTitle(e.title))}`, `s:${slugStem(e.slug)}`];
		for (const k of keys) {
			if (k === 't:' || k === 's:') continue;
			const j = firstByKey.get(k);
			if (j === undefined) firstByKey.set(k, i);
			else union(i, j);
		}
	});
	/** @type {Map<number, number[]>} */
	const groups = new Map();
	list.forEach((_, i) => {
		const r = find(i);
		groups.set(r, [...(groups.get(r) ?? []), i]);
	});
	const series = new Set(seriesIds);
	/** @type {SeriesCandidate[]} */
	const out = [];
	for (const idx of groups.values()) {
		if (idx.length < 2) continue;
		const evs = idx.map((i) => list[i]);
		/** @type {Map<string, { name: string, n: number }>} */
		const names = new Map();
		for (const e of evs) {
			const name = seriesNameFromTitle(e.title);
			const k = seriesKey(name);
			if (!k) continue;
			const cur = names.get(k) ?? { name, n: 0 };
			cur.n++;
			names.set(k, cur);
		}
		const best = [...names.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))[0];
		const stems = evs.map((e) => slugStem(e.slug)).sort();
		const name = best && best.n > 1 ? best.name : labelFromStem(stems[0]);
		const slugs = evs.map((e) => e.slug).sort();
		const shared = [...series].find((id) => evs.every((e) => (e.tags ?? []).includes(id)));
		const months = new Set(evs.map((e) => monthOf(e.start)));
		/** @type {SeriesCandidate['skip']} */
		let skip = null;
		const bases = new Set(slugs.map((x) => x.replace(/-parte-\d+$/, '')));
		if (shared) skip = { reason: 'ya-es-serie', detail: shared };
		else if (bases.size === 1) skip = { reason: 'partes', detail: [...bases][0] };
		else if (months.size === 1 && !months.has(''))
			skip = { reason: 'mismo-mes', detail: [...months][0] };
		else if (tagExists(name)) skip = { reason: 'nombre-tomado', detail: name };
		out.push({ name, events: slugs, skip });
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}
