/**
 * Recorrer el sitio por secciones desde el inicio del bot (docs/telegram.md, «Secciones»): 📚
 * Material, 📖 Kinkipedia, 👥 Amigues y 🔁 Series. Cada una es una lista de a 5 («‹ 2/7 ›»), con
 * «🏷 Filtrar por etiqueta» (las etiquetas que más se usan en esa sección) y, al tocar algo, la
 * tarjeta compacta de siteScreens.js con «‹ Volver» a esa página.
 *
 * Sin reglas propias de visibilidad: todo sale del índice público de la búsqueda (inlineSource.js,
 * lo mismo que ve une visitante sin cuenta), la misma fuente que Buscar y el modo inline. Lo único
 * que se saca de más es lo que el sitio no lista: un lugar no listado (que el índice tiene porque
 * se llega desde un evento) no va en Amigues, como en /amigues. Un botón armado a mano solo puede
 * abrir algo **de la lista de esa sección**.
 *
 * El orden, como el sitio: el material del más nuevo (como /material); la Kinkipedia, amigues y
 * las series por nombre (como /wiki y /amigues). Series, como la lista de /wiki, solo las que
 * tienen alguna edición (un evento del índice con su etiqueta): una serie sin ediciones no tiene
 * nada para mostrar. Funciones puras.
 */
import { truncate } from './keyboards.js';
import { encodeNav, shortHash } from './nav.js';
import { pagerRow, paginate } from './screens.js';
import { docHash, docLine, docScreen, homeButton, TYPE_EMOJI } from './siteScreens.js';
import { botText } from './texts.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @typedef {import('./inline.js').InlineSource} InlineSource */
/** @typedef {import('./nav.js').SectionId} SectionId */
/** @typedef {import('./screens.js').Screen} Screen */
/** @typedef {import('./screens.js').ScreenCtx} ScreenCtx */
/** @typedef {import('./screens.js').Button} Button */
/** @typedef {{ id: string, hash: string, name: string, count: number }} SectionTag */

/**
 * Cada sección: qué tipos del índice muestra, cómo se ordena y su título (de «Textos del bot»;
 * los botones del inicio, en screens.js).
 *
 * @type {Readonly<Record<SectionId, { types: readonly SearchDoc['c'][], order: 'recent' | 'name',
 *   title: () => string }>>}
 */
export const SECTIONS = Object.freeze({
	m: {
		types: ['material'],
		order: 'recent',
		title: () => botText('secciones.titulo_material')
	},
	w: {
		types: ['wiki'],
		order: 'name',
		title: () => botText('secciones.titulo_kinkipedia')
	},
	a: {
		types: ['amigues'],
		order: 'name',
		title: () => botText('secciones.titulo_amigues')
	},
	s: {
		types: ['serie'],
		order: 'name',
		title: () => botText('secciones.titulo_series')
	}
});

/** Cuántas etiquetas se ofrecen para filtrar. */
export const SECTION_TAGS_MAX = 8;

/** Una etiqueta se ofrece si la tienen al menos tantas cosas de la sección. */
export const SECTION_TAG_MIN = 2;

/**
 * Las etiquetas que tienen al menos un evento en el índice público (con fecha): las series con
 * ediciones, como `seriesEditions` del sitio (la etiqueta de la serie, tal cual, en el evento).
 *
 * @param {readonly SearchDoc[]} docs
 * @returns {Set<string>}
 */
export function tagsWithEvents(docs) {
	/** @type {Set<string>} */
	const out = new Set();
	for (const d of docs) if (d.c === 'calendario' && d.d) for (const g of d.g ?? []) out.add(g);
	return out;
}

/**
 * Lo de una sección, en el orden del sitio. Solo lo del índice público (en Amigues, sin los
 * perfiles no listados; en Series, sin las series sin ediciones).
 *
 * @param {InlineSource} source
 * @param {SectionId} section
 * @returns {SearchDoc[]}
 */
export function sectionDocs(source, section) {
	const def = SECTIONS[section];
	const withEvents = section === 's' ? tagsWithEvents(source.docs) : null;
	const docs = source.docs.filter(
		(d) =>
			def.types.includes(d.c) &&
			!(d.c === 'amigues' && source.extras.get(d.h)?.unlisted) &&
			// La etiqueta de la serie es la primera (siteIndex.js).
			!(withEvents && d.c === 'serie' && !withEvents.has(d.g?.[0] ?? ''))
	);
	/** @param {SearchDoc} a @param {SearchDoc} b */
	const byName = (a, b) => a.t.localeCompare(b.t, 'es');
	if (def.order === 'name') return docs.sort(byName);
	/** @param {SearchDoc} d */
	const time = (d) => {
		const t = source.extras.get(d.h)?.time;
		return typeof t === 'number' && Number.isFinite(t) ? t : -Infinity;
	};
	return docs.sort((a, b) => time(b) - time(a) || byName(a, b));
}

/**
 * Las etiquetas de lo de una sección, con cuántas cosas la tienen (de la más usada; empate, por
 * nombre). El nombre, el del índice.
 *
 * @param {InlineSource} source
 * @param {readonly SearchDoc[]} docs lo de la sección
 * @returns {SectionTag[]}
 */
export function sectionTags(source, docs) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const d of docs)
		for (const id of new Set(d.g ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
	const names = source.prepared.tags ?? {};
	return [...counts]
		.map(([id, count]) => ({ id, hash: shortHash(id), name: names[id]?.[0] ?? id, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/**
 * Las que se ofrecen para filtrar: las más usadas (al menos {@link SECTION_TAG_MIN} cosas), hasta
 * {@link SECTION_TAGS_MAX}.
 *
 * @param {readonly SectionTag[]} tags
 */
export const topSectionTags = (tags) =>
	tags.filter((t) => t.count >= SECTION_TAG_MIN).slice(0, SECTION_TAGS_MAX);

/**
 * Lo de una sección con una etiqueta (por el hash del botón), o `null` si esa etiqueta no está en
 * la sección.
 *
 * @param {InlineSource} source
 * @param {SectionId} section
 * @param {string | undefined} tagHash
 * @returns {{ docs: SearchDoc[], all: SearchDoc[], tags: SectionTag[],
 *   tag: SectionTag | null } | null}
 */
export function sectionView(source, section, tagHash) {
	const all = sectionDocs(source, section);
	const tags = sectionTags(source, all);
	if (!tagHash) return { docs: all, all, tags, tag: null };
	const tag = tags.find((t) => t.hash === tagHash);
	if (!tag) return null;
	return { docs: all.filter((d) => d.g?.includes(tag.id)), all, tags, tag };
}

/**
 * El encabezado de una lista: el título, la etiqueta elegida y la página.
 *
 * @param {SectionId} section
 * @param {SectionTag | null} tag
 * @param {{ page: number, pages: number } | null} p
 */
function head(section, tag, p) {
	const parts = [SECTIONS[section].title()];
	if (tag) parts.push(botText('secciones.con_etiqueta', { etiqueta: tag.name }));
	if (p && p.pages > 1) parts.push(`${p.page + 1}/${p.pages}`);
	return parts.join(' · ');
}

/**
 * La lista de una sección, de a 5: un botón por cosa (abre su tarjeta), «‹ 2/7 ›», «🏷 Filtrar
 * por etiqueta» (si hay etiquetas para ofrecer), «✖ Sin filtro» (si hay una elegida) e «🏠 Inicio».
 *
 * @param {SectionId} section
 * @param {NonNullable<ReturnType<typeof sectionView>>} view
 * @param {number} page
 * @param {ScreenCtx} ctx
 * @param {InlineSource['extras']} extras
 * @returns {Screen}
 */
export function sectionScreen(section, view, page, ctx, extras) {
	const tag = view.tag?.hash;
	const clear = {
		text: botText('secciones.boton_sin_filtro'),
		callback_data: encodeNav({ screen: 'section', section, page: 0 })
	};
	/** @type {Button[]} */
	const filterRow = [];
	if (topSectionTags(view.tags).length) {
		filterRow.push({
			text: botText('secciones.boton_filtrar'),
			callback_data: encodeNav({ screen: 'section_tags', section, ...(tag ? { tag } : {}) })
		});
	}
	if (view.tag) filterRow.push(clear);
	if (view.docs.length === 0) {
		const text = view.tag
			? botText('secciones.vacio_etiqueta', { etiqueta: view.tag.name })
			: botText('secciones.vacio');
		return {
			text: `${head(section, view.tag, null)}\n\n${text}`,
			keyboard: [...(filterRow.length ? [filterRow] : []), [homeButton()]]
		};
	}
	const p = paginate(view.docs.length, page);
	const shown = view.docs.slice(p.from, p.to);
	const text = `${head(section, view.tag, p)}\n\n${shown.map((d) => docLine(d, extras.get(d.h), ctx)).join('\n\n')}`;
	/** @type {Button[][]} */
	const rows = shown.map((d) => [
		{
			text: `${TYPE_EMOJI[d.c] ?? '•'} ${truncate(d.t, 32)}`,
			callback_data: encodeNav({
				screen: 'section_doc',
				section,
				hash: docHash(d),
				page: p.page,
				...(tag ? { tag } : {})
			})
		}
	]);
	const pager = pagerRow(p.page, p.pages, (n) =>
		encodeNav({ screen: 'section', section, page: n, ...(tag ? { tag } : {}) })
	);
	if (pager) rows.push(pager);
	if (filterRow.length) rows.push(filterRow);
	rows.push([homeButton()]);
	return { text, keyboard: rows };
}

/**
 * Elegir una etiqueta: las más usadas de la sección (dos por fila, con cuántas cosas la tienen),
 * «✖ Sin filtro» si ya había una elegida, «‹ Volver» a la lista e «🏠 Inicio».
 *
 * @param {SectionId} section
 * @param {NonNullable<ReturnType<typeof sectionView>>} view
 * @returns {Screen}
 */
export function sectionTagsScreen(section, view) {
	const top = topSectionTags(view.tags);
	const current = view.tag?.hash;
	const intro = top.length
		? botText('secciones.elegir_etiqueta')
		: botText('secciones.sin_etiquetas');
	/** @type {Button[][]} */
	const rows = [];
	for (let i = 0; i < top.length; i += 2) {
		rows.push(
			top.slice(i, i + 2).map((t) => ({
				text: `${t.hash === current ? '✓ ' : ''}${botText('secciones.boton_etiqueta', {
					etiqueta: truncate(t.name, 24),
					cantidad: t.count
				})}`,
				callback_data: encodeNav({ screen: 'section', section, page: 0, tag: t.hash })
			}))
		);
	}
	if (current) {
		rows.push([
			{
				text: botText('secciones.boton_sin_filtro'),
				callback_data: encodeNav({ screen: 'section', section, page: 0 })
			}
		]);
	}
	rows.push([
		{
			text: botText('inicio.boton_volver'),
			callback_data: encodeNav({
				screen: 'section',
				section,
				page: 0,
				...(current ? { tag: current } : {})
			})
		},
		homeButton()
	]);
	return { text: `${head(section, view.tag, null)}\n\n${intro}`, keyboard: rows };
}

/**
 * La tarjeta compacta de algo de una sección, con «‹ Volver» a la página de la lista de la que
 * vino (con su etiqueta). `null` si no está **en esa sección** (botón viejo o armado a mano).
 *
 * @param {SectionId} section
 * @param {NonNullable<ReturnType<typeof sectionView>>} view
 * @param {{ hash: string, page: number }} at
 * @param {ScreenCtx} ctx
 * @param {InlineSource['extras']} extras
 * @returns {Screen | null}
 */
export function sectionDocScreen(section, view, { hash, page }, ctx, extras) {
	const doc = view.all.find((d) => docHash(d) === hash);
	if (!doc) return null;
	const tag = view.tag?.hash;
	const back = {
		text: botText('inicio.boton_volver'),
		callback_data: encodeNav({ screen: 'section', section, page, ...(tag ? { tag } : {}) })
	};
	return docScreen(doc, extras.get(doc.h), ctx, { back });
}
