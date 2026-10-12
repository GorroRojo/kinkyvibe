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
 * El orden, como el sitio: el material del más nuevo (como /material); amigues y las series por
 * nombre (como /amigues y /wiki). La Kinkipedia se recorre **por las ramas del árbol de
 * etiquetas**, como /wiki y en su mismo orden (el del árbol, no por nombre): arriba, las ramas de
 * arriba de todo; tocar una rama («📂») muestra lo de adentro (su entrada, si tiene, y sus hijas),
 * con «‹ Volver» a la rama madre. Sin el árbol (`source.tree`), una lista por nombre. Series, como
 * la lista de /wiki, solo las que tienen alguna edición (un evento del índice con su etiqueta): una
 * serie sin ediciones no tiene nada para mostrar. Funciones puras.
 */
import { tagPagePath } from '$lib/utils/series.js';
import { escapeHtml } from './format.js';
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
/** @typedef {import('./inline.js').TreeTag} TreeTag */
/**
 * Una cosa de una rama de la Kinkipedia: una entrada (abre su tarjeta) o una rama (abre lo de
 * adentro; `count`: cuántas cosas tiene).
 *
 * @typedef {{ kind: 'doc', doc: SearchDoc }
 *   | { kind: 'branch', id: string, hash: string, name: string, count: number }} BranchItem
 */
/**
 * Una rama de la Kinkipedia: lo de adentro y a qué rama vuelve (`back`: el hash de la madre, o
 * `null` si vuelve a lo de arriba de todo).
 *
 * @typedef {{ items: BranchItem[], back: string | null }} Branch
 */

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

/** La raíz del árbol de etiquetas. */
const ROOT = 'root';

/**
 * La Kinkipedia como el árbol de /wiki (GlosarioTree): cada entrada cuelga de su etiqueta (la
 * primera de la entrada, `g[0]`, como la arma siteIndex.js) y cada etiqueta, de sus madres. Se ve
 * una rama si tiene una entrada o alguna hija (o nieta…) la tiene, como `wikiVisible`. Si dos
 * entradas son de la misma etiqueta, la de su página (`/wiki/<etiqueta>`) es la de la rama y la
 * otra va adentro. Una entrada sin etiqueta en el árbol va arriba de todo. Pura.
 *
 * @param {ReadonlyMap<string, TreeTag>} tree
 * @param {readonly SearchDoc[]} docs las de la sección (ya filtradas)
 */
export function wikiTree(tree, docs) {
	/** @type {Map<string, SearchDoc>} */
	const own = new Map();
	/** @type {Map<string, SearchDoc[]>} */
	const extra = new Map();
	/** @type {SearchDoc[]} */
	const loose = [];
	/** @type {SearchDoc[]} */
	const later = [];
	for (const d of docs) {
		const tag = d.g?.[0];
		if (!tag || tag === ROOT || !tree.has(tag)) loose.push(d);
		else if (!own.has(tag) && tagPagePath(tag) === d.h) own.set(tag, d);
		else later.push(d);
	}
	for (const d of later) {
		const tag = /** @type {string} */ (d.g?.[0]);
		if (!own.has(tag)) own.set(tag, d);
		else extra.set(tag, [...(extra.get(tag) ?? []), d]);
	}
	// Las ramas que se ven: las que tienen entrada y todas sus madres (sin dar vueltas).
	/** @type {Set<string>} */
	const visible = new Set();
	const queue = [...own.keys()];
	while (queue.length) {
		const id = /** @type {string} */ (queue.pop());
		if (id === ROOT || visible.has(id) || !tree.has(id)) continue;
		visible.add(id);
		queue.push(...(tree.get(id)?.parents ?? []));
	}
	/** @param {string} id las madres que se ven (o la raíz) */
	const parentsOf = (id) => {
		const list = (tree.get(id)?.parents ?? []).filter((p) => p === ROOT || visible.has(p));
		return list.length ? list : [ROOT];
	};
	/** @type {Map<string, string[]>} */
	const children = new Map();
	for (const id of visible) {
		for (const p of new Set(parentsOf(id))) children.set(p, [...(children.get(p) ?? []), id]);
	}
	/** @param {string} id */
	const nameOf = (id) => tree.get(id)?.name ?? id;
	/** @param {SearchDoc} a @param {SearchDoc} b */
	const byName = (a, b) => a.t.localeCompare(b.t, 'es');
	/**
	 * Las hijas de una rama en el orden del árbol, el mismo de /wiki (GlosarioTree recorre
	 * `children` tal cual); una que no esté ahí (no pasa), al final por nombre.
	 *
	 * @param {string} id
	 */
	function childrenInOrder(id) {
		const order = tree.get(id)?.children ?? [];
		/** @param {string} c */
		const at = (c) => {
			const i = order.indexOf(c);
			return i === -1 ? Infinity : i;
		};
		return [...(children.get(id) ?? [])].sort(
			(a, b) => at(a) - at(b) || nameOf(a).localeCompare(nameOf(b), 'es')
		);
	}

	/**
	 * Lo de adentro de una rama (la raíz: lo de arriba de todo): la entrada de la rama primero,
	 * después las hijas en el orden del árbol de /wiki y al final, por nombre, las otras entradas
	 * de esa etiqueta (y, arriba de todo, las sueltas).
	 *
	 * @param {string} id
	 * @returns {BranchItem[]}
	 */
	function items(id) {
		/** @type {BranchItem[]} */
		const inside = [
			...childrenInOrder(id).map((c) => {
				const n = size(c);
				const doc = own.get(c);
				return n === 0 && doc
					? /** @type {BranchItem} */ ({ kind: 'doc', doc })
					: /** @type {BranchItem} */ ({
							kind: 'branch',
							id: c,
							hash: shortHash(c),
							name: nameOf(c),
							count: n + (doc ? 1 : 0)
						});
			}),
			...[...(extra.get(id) ?? []), ...(id === ROOT ? loose : [])]
				.sort(byName)
				.map((doc) => /** @type {BranchItem} */ ({ kind: 'doc', doc }))
		];
		const head = id === ROOT ? undefined : own.get(id);
		return head ? [{ kind: 'doc', doc: head }, ...inside] : inside;
	}
	/** @param {string} id cuántas cosas tiene adentro (sin su entrada) */
	function size(id) {
		return (children.get(id)?.length ?? 0) + (extra.get(id)?.length ?? 0);
	}

	return {
		items,
		/**
		 * Una rama por el hash del botón (solo las que tienen algo adentro), o `null`.
		 *
		 * @param {string} hash
		 * @returns {SectionTag | null}
		 */
		branch(hash) {
			for (const id of visible) {
				if (shortHash(id) !== hash || size(id) === 0) continue;
				return { id, hash, name: nameOf(id), count: size(id) + (own.has(id) ? 1 : 0) };
			}
			return null;
		},
		/**
		 * A qué rama vuelve «‹ Volver» desde una rama: su primera madre que se ve (`null`: arriba).
		 *
		 * @param {string} id
		 */
		back(id) {
			const p = parentsOf(id)[0];
			return p === ROOT ? null : shortHash(p);
		}
	};
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
 * la sección. En la Kinkipedia con el árbol, el hash es el de una **rama** (sin hash: lo de arriba
 * de todo), `branch` trae lo de adentro y no hay etiquetas para filtrar.
 *
 * @param {InlineSource} source
 * @param {SectionId} section
 * @param {string | undefined} tagHash
 * @returns {{ docs: SearchDoc[], all: SearchDoc[], tags: SectionTag[],
 *   tag: SectionTag | null, branch?: Branch } | null}
 */
export function sectionView(source, section, tagHash) {
	const all = sectionDocs(source, section);
	if (section === 'w' && source.tree) {
		const tree = wikiTree(source.tree, all);
		const tag = tagHash ? tree.branch(tagHash) : null;
		if (tagHash && !tag) return null;
		const items = tree.items(tag?.id ?? ROOT);
		return {
			docs: items.flatMap((i) => (i.kind === 'doc' ? [i.doc] : [])),
			all,
			tags: [],
			tag,
			branch: { items, back: tag ? tree.back(tag.id) : null }
		};
	}
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
 * @param {boolean} [branch] `tag` es una rama de la Kinkipedia
 */
function head(section, tag, p, branch = false) {
	const parts = [SECTIONS[section].title()];
	if (tag && branch) parts.push(botText('secciones.rama', { rama: tag.name }));
	else if (tag) parts.push(botText('secciones.con_etiqueta', { etiqueta: tag.name }));
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
	if (view.branch) return branchScreen(section, view, view.branch, page, ctx, extras);
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
 * Una rama de la Kinkipedia (o lo de arriba de todo), de a 5: un botón por cosa (una entrada abre
 * su tarjeta; una rama, «📂», lo de adentro), «‹ 2/7 ›», «‹ Volver» a la rama madre (si no es lo
 * de arriba de todo) e «🏠 Inicio».
 *
 * @param {SectionId} section
 * @param {NonNullable<ReturnType<typeof sectionView>>} view
 * @param {Branch} branch
 * @param {number} page
 * @param {ScreenCtx} ctx
 * @param {InlineSource['extras']} extras
 * @returns {Screen}
 */
function branchScreen(section, view, branch, page, ctx, extras) {
	const tag = view.tag?.hash;
	/** @type {Button[]} */
	const last = [];
	if (view.tag) {
		last.push({
			text: botText('inicio.boton_volver'),
			callback_data: encodeNav({
				screen: 'section',
				section,
				page: 0,
				...(branch.back ? { tag: branch.back } : {})
			})
		});
	}
	last.push(homeButton());
	if (branch.items.length === 0) {
		return {
			text: `${head(section, view.tag, null, true)}\n\n${botText('secciones.vacio')}`,
			keyboard: [last]
		};
	}
	const p = paginate(branch.items.length, page);
	const shown = branch.items.slice(p.from, p.to);
	const lines = shown.map((i) =>
		i.kind === 'doc'
			? docLine(i.doc, extras.get(i.doc.h), ctx)
			: `📂 <b>${escapeHtml(i.name)}</b>\n${botText('secciones.rama_cantidad', { cantidad: i.count })}`
	);
	/** @type {Button[][]} */
	const rows = shown.map((i) => [
		i.kind === 'doc'
			? {
					text: `${TYPE_EMOJI[i.doc.c] ?? '•'} ${truncate(i.doc.t, 32)}`,
					callback_data: encodeNav({
						screen: 'section_doc',
						section,
						hash: docHash(i.doc),
						page: p.page,
						...(tag ? { tag } : {})
					})
				}
			: {
					text: botText('secciones.boton_rama', { rama: truncate(i.name, 32) }),
					callback_data: encodeNav({ screen: 'section', section, page: 0, tag: i.hash })
				}
	]);
	const pager = pagerRow(p.page, p.pages, (n) =>
		encodeNav({ screen: 'section', section, page: n, ...(tag ? { tag } : {}) })
	);
	if (pager) rows.push(pager);
	rows.push(last);
	return { text: `${head(section, view.tag, p, true)}\n\n${lines.join('\n\n')}`, keyboard: rows };
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
