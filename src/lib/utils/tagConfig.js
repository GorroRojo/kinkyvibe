/**
 * Editing the tag tree (src/lib/utils/hardcodedTags.js) and the posts that use the tags, for the
 * panel's /admin/etiquetas. Pure: no Svelte / SvelteKit imports, tested in tagConfig.test.js.
 *
 * - parseTagSource / emitTagSource: reads the JS file into a list of entries and writes it back
 *   touching only the entries that changed (their text is re-printed in the file's prettier
 *   style), so a commit shows a small, reviewable diff and keeps the comments.
 * - applyTagOps: create, update, move (reparent), rename, merge, add/remove alias.
 * - replaceTagInPost: the same rename/merge inside a post's frontmatter (`tags:` and `wiki:`).
 * - planTagChange: all of the above for a list of operations → the files that change.
 * - analyzeTags: the tree for the UI (parents, children, aliases, related, usage per content type,
 *   orphan / unused / undeclared tags, broken references).
 * - lineDiff: unified-diff hunks for the preview.
 */

/* ------------------------------------------------------------------------------------------ */
/*  Parser (the small subset of JS the file uses: an array of object literals)                */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {Record<string, any>} TagEntry  { id, icon?, visible_name?, aka?, aliasOf?, color?,
 *   description?, related?, children?, ... } in the file's key order
 */

/**
 * @typedef {object} SourceItem
 * @prop {string} leading whitespace and comments before the entry (after the previous comma)
 * @prop {string} text the entry's source text
 * @prop {TagEntry} value
 * @prop {boolean} multiline the object was written over several lines
 */

/**
 * @typedef {object} TagSource
 * @prop {string} prefix everything up to and including the array's `[`
 * @prop {SourceItem[]} items
 * @prop {string} trailing text between the last entry (and its comma) and `]`
 * @prop {boolean} trailingComma
 * @prop {string} suffix from `]` to the end
 */

class Parser {
	/** @param {string} src @param {number} pos */
	constructor(src, pos) {
		this.src = src;
		this.pos = pos;
	}
	/**
	 * @param {string} what
	 * @returns {never}
	 */
	fail(what) {
		const line = this.src.slice(0, this.pos).split('\n').length;
		throw new Error(`No se pudo leer hardcodedTags.js (línea ${line}): ${what}`);
	}
	/** Skips whitespace and comments; returns what was skipped. */
	skip() {
		const start = this.pos;
		const s = this.src;
		for (;;) {
			const c = s[this.pos];
			if (c === ' ' || c === '\t' || c === '\n' || c === '\r') this.pos++;
			else if (c === '/' && s[this.pos + 1] === '/') {
				const end = s.indexOf('\n', this.pos);
				this.pos = end === -1 ? s.length : end;
			} else if (c === '/' && s[this.pos + 1] === '*') {
				const end = s.indexOf('*/', this.pos + 2);
				if (end === -1) this.fail('comentario sin cerrar');
				this.pos = end + 2;
			} else break;
		}
		return s.slice(start, this.pos);
	}
	/** @param {string} ch */
	expect(ch) {
		this.skip();
		if (this.src[this.pos] !== ch) this.fail(`se esperaba «${ch}»`);
		this.pos++;
	}
	/** @returns {string} */
	string() {
		const q = this.src[this.pos];
		let out = '';
		this.pos++;
		for (;;) {
			const c = this.src[this.pos];
			if (c === undefined || c === '\n') this.fail('texto sin cerrar');
			if (c === q) {
				this.pos++;
				return out;
			}
			if (c === '\\') {
				const n = this.src[this.pos + 1];
				/** @type {Record<string, string>} */
				const esc = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
				if (n === 'u') {
					const hex = this.src.slice(this.pos + 2, this.pos + 6);
					out += String.fromCharCode(parseInt(hex, 16));
					this.pos += 6;
					continue;
				}
				out += esc[n] ?? n;
				this.pos += 2;
				continue;
			}
			out += c;
			this.pos++;
		}
	}
	/** @returns {any} */
	value() {
		this.skip();
		const c = this.src[this.pos];
		if (c === '{') return this.object();
		if (c === '[') return this.array();
		if (c === "'" || c === '"') return this.string();
		const m = /^(-?\d+(?:\.\d+)?|true|false|null)/.exec(this.src.slice(this.pos, this.pos + 30));
		if (!m) this.fail('valor no reconocido');
		this.pos += m[0].length;
		return JSON.parse(m[0]);
	}
	/** @returns {string} */
	key() {
		this.skip();
		const c = this.src[this.pos];
		if (c === "'" || c === '"') return this.string();
		const m = /^[A-Za-z_$][\w$]*/.exec(this.src.slice(this.pos, this.pos + 100));
		if (!m) this.fail('nombre de propiedad no reconocido');
		this.pos += m[0].length;
		return m[0];
	}
	/** @returns {Record<string, any>} */
	object() {
		this.expect('{');
		/** @type {Record<string, any>} */
		const out = {};
		for (;;) {
			this.skip();
			if (this.src[this.pos] === '}') {
				this.pos++;
				return out;
			}
			const k = this.key();
			this.expect(':');
			out[k] = this.value();
			this.skip();
			if (this.src[this.pos] === ',') this.pos++;
			else if (this.src[this.pos] !== '}') this.fail('se esperaba «,» o «}»');
		}
	}
	/** @returns {any[]} */
	array() {
		this.expect('[');
		const out = [];
		for (;;) {
			this.skip();
			if (this.src[this.pos] === ']') {
				this.pos++;
				return out;
			}
			out.push(this.value());
			this.skip();
			if (this.src[this.pos] === ',') this.pos++;
			else if (this.src[this.pos] !== ']') this.fail('se esperaba «,» o «]»');
		}
	}
}

/**
 * Reads hardcodedTags.js.
 * @param {string} src
 * @returns {TagSource}
 */
export function parseTagSource(src) {
	const m = /export\s+const\s+hardcodedTags\s*=\s*\[/.exec(src);
	if (!m) throw new Error('No se encontró «export const hardcodedTags = [» en hardcodedTags.js');
	const p = new Parser(src, m.index + m[0].length);
	const prefix = src.slice(0, p.pos);
	/** @type {SourceItem[]} */
	const items = [];
	let trailingComma = false;
	for (;;) {
		const before = p.pos;
		const leading = p.skip();
		if (src[p.pos] === ']') {
			return {
				prefix,
				items,
				trailing: src.slice(before, p.pos),
				trailingComma,
				suffix: src.slice(p.pos)
			};
		}
		if (src[p.pos] !== '{') p.fail('se esperaba una etiqueta «{ id: … }»');
		const start = p.pos;
		const value = p.object();
		const text = src.slice(start, p.pos);
		items.push({ leading, text, value, multiline: /^\{[ \t]*\r?\n/.test(text) });
		const afterValue = p.pos;
		p.skip();
		if (src[p.pos] === ',') {
			p.pos++;
			trailingComma = true;
		} else {
			// No comma: must be the last entry. Rewind so the gap before `]` stays as written.
			p.pos = afterValue;
			const gap = p.skip();
			if (src[p.pos] !== ']') p.fail('se esperaba «,» o «]»');
			trailingComma = false;
			return { prefix, items, trailing: gap, trailingComma, suffix: src.slice(p.pos) };
		}
		trailingComma = true;
	}
}

/* ------------------------------------------------------------------------------------------ */
/*  Printer (the file's prettier style: tabs, single quotes, width 100, no trailing commas)   */
/* ------------------------------------------------------------------------------------------ */

const WIDTH = 100;
const TAB = 2; // prettier's default tabWidth, used to measure lines indented with tabs

/** Printed width of a string, like prettier's getStringWidth (emoji and CJK count as 2). */
export function textWidth(/** @type {string} */ s) {
	let w = 0;
	// eslint-disable-next-line no-undef
	const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null;
	const graphemes = seg ? Array.from(seg.segment(s), (x) => x.segment) : Array.from(s);
	for (const g of graphemes) {
		if (g === '\t') w += TAB;
		else if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g)) w += 2;
		else if (
			/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(
				g
			)
		)
			w += 2;
		else if (/^(?:[\u0300-\u036f]|\u200d|\ufe0e|\ufe0f)+$/.test(g)) w += 0;
		else w += 1;
	}
	return w;
}

/** @param {string} s */
function quote(s) {
	const singles = (s.match(/'/g) ?? []).length;
	const doubles = (s.match(/"/g) ?? []).length;
	const q = singles > doubles ? '"' : "'";
	const body = s
		.replace(/\\/g, '\\\\')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')
		.replace(new RegExp(q, 'g'), '\\' + q);
	return q + body + q;
}

/** @param {string} k */
const printKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k));

/**
 * @param {any} v
 * @returns {string}
 */
function printInline(v) {
	if (typeof v === 'string') return quote(v);
	if (Array.isArray(v)) return v.length ? `[${v.map(printInline).join(', ')}]` : '[]';
	if (v && typeof v === 'object') {
		/** @type {string[]} */
		const props = Object.entries(v).map(([k, x]) => `${printKey(k)}: ${printInline(x)}`);
		return props.length ? `{ ${props.join(', ')} }` : '{}';
	}
	return JSON.stringify(v);
}

/** @param {number} level */
const tabs = (level) => '\t'.repeat(level);

/**
 * One `key: value` line (or block) of a multi-line object, at `level`.
 * @param {string} k
 * @param {any} v
 * @param {number} level
 */
function printProp(k, v, level) {
	const head = `${tabs(level)}${printKey(k)}: `;
	const inline = printInline(v);
	// +1 for the comma that most props get; prettier measures with it.
	if (textWidth(head + inline) + 1 <= WIDTH) return head + inline;
	if (Array.isArray(v)) {
		const inner = v.map((x) => `${tabs(level + 1)}${printInline(x)}`).join(',\n');
		return `${head}[\n${inner}\n${tabs(level)}]`;
	}
	if (typeof v === 'string') return `${tabs(level)}${printKey(k)}:\n${tabs(level + 1)}${inline}`;
	return head + inline;
}

/**
 * Prints an entry as prettier would at `level` (1 = directly inside the array). Objects that were
 * written over several lines stay that way (prettier keeps them expanded too).
 * @param {TagEntry} entry
 * @param {{level?: number, multiline?: boolean}} [opts]
 */
export function printEntry(entry, { level = 1, multiline = false } = {}) {
	const inline = printInline(entry);
	if (!multiline && textWidth(tabs(level) + inline) + 1 <= WIDTH) return inline;
	const props = Object.entries(entry).map(([k, v]) => printProp(k, v, level + 1));
	return `{\n${props.join(',\n')}\n${tabs(level)}}`;
}

/** Key order for keys an entry didn't have before. */
const KEY_ORDER = [
	'id',
	'icon',
	'visible_name',
	'aka',
	'aliasOf',
	'color',
	'description',
	'related',
	'children'
];

/**
 * @param {TagEntry} a
 * @param {TagEntry} b
 */
function sameEntry(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Writes the file back. Entries whose value is unchanged keep their original text (and the
 * comments before them); changed ones are re-printed; removed ones disappear with their
 * comments; new ones (no `text`) are printed on their own line.
 * @param {TagSource} source
 * @param {Array<{value: TagEntry, orig?: SourceItem}>} entries
 */
export function emitTagSource(source, entries) {
	const parts = entries.map((e, i) => {
		const leading = e.orig ? e.orig.leading : '\n\t';
		const text =
			e.orig && sameEntry(e.orig.value, e.value)
				? e.orig.text
				: printEntry(e.value, { multiline: e.orig?.multiline ?? false });
		const comma = i < entries.length - 1 || source.trailingComma ? ',' : '';
		return leading + text + comma;
	});
	const trailing = entries.length ? source.trailing : '\n';
	return source.prefix + parts.join('') + trailing + source.suffix;
}

/* ------------------------------------------------------------------------------------------ */
/*  Operations                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {(
 *   {type: 'create', id: string, parent?: string, icon?: string, visible_name?: string, description?: string, aka?: string[]} |
 *   {type: 'update', id: string, set: Record<string, any>} |
 *   {type: 'move', id: string, from?: string | null, to?: string | null} |
 *   {type: 'rename', from: string, to: string, keepAlias?: boolean} |
 *   {type: 'merge', from: string, into: string} |
 *   {type: 'addAlias', id: string, alias: string} |
 *   {type: 'removeAlias', id: string, alias: string}
 * )} TagOp
 */

/** Fields `update` may change. */
export const EDITABLE_FIELDS = Object.freeze([
	'icon',
	'visible_name',
	'color',
	'description',
	'aka',
	'related'
]);

/** @param {unknown} s */
const clean = (s) =>
	String(s ?? '')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Error message for a new tag name, or null.
 * @param {string} name
 */
export function validateTagName(name) {
	const n = clean(name);
	if (!n) return 'Falta el nombre de la etiqueta.';
	if (n.length > 60) return 'El nombre es demasiado largo (máximo 60 caracteres).';
	if (/[[\]{}#,<>`]/.test(n)) return 'El nombre no puede tener [ ] { } # , < > ni `.';
	if (/^(root|__proto__|constructor|prototype)$/i.test(n)) return 'Ese nombre está reservado.';
	return null;
}

/** Working copy of the entries with helpers. */
class Model {
	/** @param {Array<{value: TagEntry, orig?: SourceItem}>} entries */
	constructor(entries) {
		this.entries = entries.map((e) => ({ ...e, value: structuredClone(e.value) }));
	}
	/** @param {string} id declared tag (not an alias entry) */
	find(id) {
		return this.entries.find((e) => e.value.id === id && e.value.aliasOf === undefined)?.value;
	}
	/** @param {string} id */
	aliasTarget(id) {
		const a = this.entries.find((e) => e.value.id === id && e.value.aliasOf !== undefined);
		if (a) return a.value.aliasOf;
		for (const e of this.entries)
			if ((e.value.aka ?? []).includes(id) && e.value.id !== id) return e.value.id;
		return undefined;
	}
	/** Every name in use: declared ids, children references, aliases. */
	nameTaken(/** @type {string} */ name) {
		return (
			Boolean(this.find(name)) || this.aliasTarget(name) !== undefined || this.isChildRef(name)
		);
	}
	/** @param {string} id */
	isChildRef(id) {
		return this.entries.some((e) => (e.value.children ?? []).includes(id));
	}
	/** @param {string} id */
	parentsOf(id) {
		return this.entries.filter((e) => (e.value.children ?? []).includes(id)).map((e) => e.value.id);
	}
	/** @param {string} id */
	descendants(id) {
		/** @type {Set<string>} */
		const out = new Set();
		const stack = [id];
		while (stack.length) {
			const cur = /** @type {string} */ (stack.pop());
			for (const c of this.find(cur)?.children ?? []) {
				if (!out.has(c)) {
					out.add(c);
					stack.push(c);
				}
			}
		}
		return out;
	}
	/**
	 * The entry of `id`, declaring it (`{ id }`) if it's only a children reference or a tag posts use.
	 * @param {string} id
	 * @param {string} [after] insert after this tag's entry
	 */
	ensure(id, after) {
		const found = this.find(id);
		if (found) return found;
		/** @type {TagEntry} */
		const value = { id };
		this.insert(value, after);
		return value;
	}
	/**
	 * Inserts a new entry after `after`'s entry, or before the block of `aliasOf` entries.
	 * @param {TagEntry} value
	 * @param {string} [after]
	 */
	insert(value, after) {
		let i = after ? this.entries.findIndex((e) => e.value.id === after && !e.value.aliasOf) : -1;
		if (i >= 0) {
			// After the parent's last child that has its own entry right below it, if any.
			const kids = new Set(this.find(/** @type {string} */ (after))?.children ?? []);
			while (i + 1 < this.entries.length && kids.has(this.entries[i + 1].value.id)) i++;
			this.entries.splice(i + 1, 0, { value });
			return;
		}
		const firstAlias = this.entries.findIndex((e) => e.value.aliasOf !== undefined);
		if (firstAlias === -1) this.entries.push({ value });
		else this.entries.splice(firstAlias, 0, { value });
	}
	/** @param {string} alias @param {string} target */
	addAliasEntry(alias, target) {
		if (this.entries.some((e) => e.value.id === alias && e.value.aliasOf === target)) return;
		this.entries.push({ value: { id: alias, aliasOf: target } });
	}
	/** @param {(e: TagEntry) => boolean} pred */
	remove(pred) {
		this.entries = this.entries.filter((e) => !pred(e.value));
	}
}

/**
 * Sets a key keeping the entry's key order (new keys go where KEY_ORDER says).
 * @param {TagEntry} entry
 * @param {string} key
 * @param {any} value undefined/null/''/[] = delete the key
 */
function setKey(entry, key, value) {
	const empty =
		value === undefined ||
		value === null ||
		value === '' ||
		(Array.isArray(value) && !value.length);
	if (empty) {
		delete entry[key];
		return;
	}
	if (key in entry) {
		entry[key] = value;
		return;
	}
	const order = KEY_ORDER.indexOf(key);
	const keys = Object.keys(entry);
	const at = keys.findIndex((k) => {
		const o = KEY_ORDER.indexOf(k);
		return o > order || (o === -1 && order !== -1 && k !== 'id');
	});
	if (at === -1 || order === -1) {
		entry[key] = value;
		return;
	}
	const copy = { ...entry };
	for (const k of keys) delete entry[k];
	keys.forEach((k, i) => {
		if (i === at) entry[key] = value;
		entry[k] = copy[k];
	});
}

/**
 * @param {string[]|undefined} list
 * @param {string} from
 * @param {string} to
 */
function replaceInList(list, from, to) {
	if (!list?.includes(from)) return list;
	/** @type {string[]} */
	const out = [];
	for (const x of list) {
		const y = x === from ? to : x;
		if (!out.includes(y)) out.push(y);
	}
	return out;
}

/**
 * `[[from]]` / `[[from : texto]]` → `[[to…]]` in a description.
 * @param {string} text
 * @param {string} from
 * @param {string} to
 */
export function renameWikiLinks(text, from, to) {
	return text.replace(/\[\[([^\]:]+?)(\s*:[^\]]*)?\]\]/g, (all, term, rest) =>
		term.trim() === from ? `[[${to}${rest ?? ''}]]` : all
	);
}

/**
 * Applies operations to the entries. Throws an Error with a message for the person when an
 * operation doesn't make sense (name taken, cycle, missing tag…).
 * @param {Array<{value: TagEntry, orig?: SourceItem}>} entries
 * @param {TagOp[]} ops
 * @returns {Array<{value: TagEntry, orig?: SourceItem}>}
 */
export function applyTagOps(entries, ops) {
	const m = new Model(entries);
	for (const op of ops) applyOne(m, op);
	return m.entries;
}

/**
 * @param {Model} m
 * @param {TagOp} op
 */
function applyOne(m, op) {
	switch (op.type) {
		case 'create': {
			const id = clean(op.id);
			const err = validateTagName(id);
			if (err) throw new Error(err);
			if (m.find(id) || m.aliasTarget(id) !== undefined)
				throw new Error(`Ya existe una etiqueta (o un alias) «${id}».`);
			const parent = op.parent ? clean(op.parent) : '';
			if (parent && !m.find(parent) && !m.isChildRef(parent))
				throw new Error(`No existe la etiqueta madre «${parent}».`);
			/** @type {TagEntry} */
			const value = { id };
			if (clean(op.icon)) value.icon = clean(op.icon);
			if (clean(op.visible_name) && clean(op.visible_name) !== id)
				value.visible_name = clean(op.visible_name);
			const aka = (op.aka ?? []).map(clean).filter(Boolean);
			if (aka.length) value.aka = aka;
			if (clean(op.description)) value.description = clean(op.description);
			if (parent) {
				const p = m.ensure(parent);
				if (!(p.children ?? []).includes(id)) setKey(p, 'children', [...(p.children ?? []), id]);
			}
			// An id that was only referenced as someone's child gets its entry right after the parent.
			m.insert(value, parent || undefined);
			return;
		}
		case 'update': {
			const id = op.id;
			if (!m.find(id) && !m.isChildRef(id) && m.aliasTarget(id) !== undefined)
				throw new Error(`«${id}» es un alias: editá la etiqueta a la que apunta.`);
			const entry = m.ensure(id);
			for (const [k, raw] of Object.entries(op.set ?? {})) {
				if (!EDITABLE_FIELDS.includes(k)) throw new Error(`No se puede cambiar «${k}» desde acá.`);
				let v = raw;
				if (k === 'aka' || k === 'related') {
					v = [...new Set((Array.isArray(raw) ? raw : []).map(clean).filter((x) => x && x !== id))];
				} else if (typeof raw === 'string') v = k === 'description' ? raw.trim() : clean(raw);
				if (k === 'visible_name' && v === id) v = '';
				if (k === 'aka') {
					for (const a of v) {
						const t = m.aliasTarget(a);
						if ((t !== undefined && t !== id) || (m.find(a) && a !== id))
							throw new Error(`«${a}» ya es otra etiqueta o alias de otra.`);
					}
				}
				setKey(entry, k, v);
			}
			return;
		}
		case 'move': {
			const { id } = op;
			const from = op.from || null;
			const to = op.to || null;
			if (from === to) return;
			if (to) {
				if (to === id || m.descendants(id).has(to))
					throw new Error(`No se puede mover «${id}» adentro de sí misma o de una de sus hijas.`);
				if (!m.find(to) && !m.isChildRef(to)) throw new Error(`No existe la etiqueta «${to}».`);
			}
			if (m.aliasTarget(id) !== undefined && !m.find(id)) throw new Error(`«${id}» es un alias.`);
			if (from) {
				const p = m.find(from);
				if (!p || !(p.children ?? []).includes(id))
					throw new Error(`«${id}» no está adentro de «${from}».`);
				setKey(
					p,
					'children',
					p.children.filter((/** @type {string} */ c) => c !== id)
				);
			}
			if (to) {
				const p = m.ensure(to);
				if (!(p.children ?? []).includes(id)) setKey(p, 'children', [...(p.children ?? []), id]);
			}
			return;
		}
		case 'rename': {
			const from = op.from;
			const to = clean(op.to);
			const err = validateTagName(to);
			if (err) throw new Error(err);
			if (from === to) return;
			const target = m.aliasTarget(to);
			if ((m.find(to) || m.isChildRef(to) || target !== undefined) && target !== from)
				throw new Error(`Ya existe «${to}». Para juntar dos etiquetas usá «Fusionar».`);
			if (target === from) {
				// The new name was an alias of this tag: it stops being one.
				m.remove((e) => e.id === to && e.aliasOf === from);
				const self = m.find(from);
				if (self?.aka)
					setKey(
						self,
						'aka',
						self.aka.filter((/** @type {string} */ a) => a !== to)
					);
			}
			for (const { value: e } of m.entries) {
				if (e.id === from && e.aliasOf === undefined) e.id = to;
				if (e.aliasOf === from) e.aliasOf = to;
				if (e.children) e.children = replaceInList(e.children, from, to);
				if (e.related) e.related = replaceInList(e.related, from, to);
				if (typeof e.description === 'string')
					e.description = renameWikiLinks(e.description, from, to);
			}
			if (op.keepAlias !== false) m.addAliasEntry(from, to);
			return;
		}
		case 'merge': {
			const { from, into } = op;
			if (from === into) throw new Error('Elegí dos etiquetas distintas.');
			if (m.aliasTarget(into) !== undefined && !m.find(into))
				throw new Error(`«${into}» es un alias: elegí la etiqueta a la que apunta.`);
			if (m.descendants(from).has(into))
				throw new Error(`«${into}» está adentro de «${from}»: movela antes de fusionar.`);
			const src = m.find(from);
			const dst = m.ensure(into);
			if (src) {
				const kids = (src.children ?? []).filter((/** @type {string} */ c) => c !== into);
				if (kids.length) setKey(dst, 'children', [...new Set([...(dst.children ?? []), ...kids])]);
				const aka = [...(dst.aka ?? []), ...(src.aka ?? [])].filter(
					(a) => a !== into && a !== from
				);
				if (aka.length) setKey(dst, 'aka', [...new Set(aka)]);
				for (const k of ['icon', 'visible_name', 'description', 'color']) {
					if (dst[k] === undefined && src[k] !== undefined) setKey(dst, k, src[k]);
				}
				const rel = [...(dst.related ?? []), ...(src.related ?? [])].filter(
					(r) => r !== into && r !== from
				);
				if (rel.length || dst.related) setKey(dst, 'related', [...new Set(rel)]);
			}
			m.remove((e) => e.id === from && e.aliasOf === undefined);
			for (const { value: e } of m.entries) {
				if (e.aliasOf === from) e.aliasOf = into;
				if (e.children) {
					e.children = replaceInList(e.children, from, into)?.filter(
						(/** @type {string} */ c) => c !== e.id
					);
					if (!e.children?.length) delete e.children;
				}
				if (e.related) {
					e.related = replaceInList(e.related, from, into)?.filter(
						(/** @type {string} */ r) => r !== e.id
					);
					if (!e.related?.length) delete e.related;
				}
			}
			m.addAliasEntry(from, into);
			return;
		}
		case 'addAlias': {
			const alias = clean(op.alias);
			const err = validateTagName(alias);
			if (err) throw new Error(err);
			if (m.find(alias) || m.isChildRef(alias)) throw new Error(`«${alias}» ya es una etiqueta.`);
			const t = m.aliasTarget(alias);
			if (t === op.id) return;
			if (t !== undefined) throw new Error(`«${alias}» ya es alias de «${t}».`);
			if (m.aliasTarget(op.id) !== undefined && !m.find(op.id))
				throw new Error(`«${op.id}» es un alias.`);
			const entry = m.ensure(op.id);
			setKey(entry, 'aka', [...(entry.aka ?? []), alias]);
			return;
		}
		case 'removeAlias': {
			const entry = m.find(op.id);
			if (entry?.aka?.includes(op.alias)) {
				setKey(
					entry,
					'aka',
					entry.aka.filter((/** @type {string} */ a) => a !== op.alias)
				);
				return;
			}
			const before = m.entries.length;
			m.remove((e) => e.id === op.alias && e.aliasOf === op.id);
			if (m.entries.length === before) throw new Error(`«${op.alias}» no es alias de «${op.id}».`);
			return;
		}
		default:
			throw new Error('Operación desconocida.');
	}
}

/* ------------------------------------------------------------------------------------------ */
/*  Posts                                                                                      */
/* ------------------------------------------------------------------------------------------ */

/** @param {string} v */
function yamlScalar(v, preferQuote = '') {
	const needs =
		/^[\s'"&*!|>%@`#,[\]{}?:-]|: |\s#|^(true|false|null|yes|no|~)$|^[\d.+-]+$|\s$/i.test(v);
	if (!needs && !preferQuote) return v;
	const q = preferQuote || "'";
	return q === "'" ? `'${v.replace(/'/g, "''")}'` : JSON.stringify(v);
}

/**
 * Renames tag `from` to `to` in a post's frontmatter (`tags:` items and `wiki:`), touching only
 * those lines (inline comments kept). If the post already has `to`, the `from` line is removed.
 * Comments and commented-out items are left alone. Returns the text unchanged when there is
 * nothing to do.
 * @param {string} raw
 * @param {string} from
 * @param {string} to
 */
export function replaceTagInPost(raw, from, to) {
	const lines = raw.split(/(?<=\n)/);
	if (!/^---[ \t]*\r?\n$/.test(lines[0] ?? '')) return raw;
	let end = lines.findIndex((l, i) => i > 0 && /^---[ \t]*(\r?\n)?$/.test(l));
	if (end === -1) return raw;
	const item =
		/^([ \t]*-[ \t]+)(?:'((?:[^']|'')*)'|"((?:[^"\\]|\\.)*)"|([^#\r\n]*?))([ \t]+#[^\r\n]*)?[ \t]*(\r?\n)?$/;
	/** @param {RegExpExecArray} mm */
	const itemValue = (mm) =>
		mm[2] !== undefined
			? mm[2].replace(/''/g, "'")
			: mm[3] !== undefined
				? JSON.parse(`"${mm[3]}"`)
				: mm[4];
	let changed = false;
	for (let i = 1; i < end; i++) {
		const line = lines[i];
		const flow = /^tags:[ \t]*\[(.*)\][ \t]*(#.*)?(\r?\n)?$/.exec(line);
		if (flow) {
			const vals = flow[1]
				.split(',')
				.map((s) => s.trim().replace(/^(['"])(.*)\1$/, '$2'))
				.filter(Boolean);
			if (vals.includes(from)) {
				const next = replaceInList(vals, from, to) ?? vals;
				lines[i] =
					`tags: [${next.map((v) => yamlScalar(v)).join(', ')}]${flow[2] ? ' ' + flow[2] : ''}${flow[3] ?? ''}`;
				changed = true;
			}
			continue;
		}
		if (/^tags:[ \t]*(#.*)?\r?\n?$/.test(line)) {
			// The block list: collect its item lines.
			/** @type {Array<{i: number, value: string, m: RegExpExecArray}>} */
			const found = [];
			let j = i + 1;
			for (; j < end; j++) {
				const l = lines[j];
				if (/^[ \t]*#/.test(l) || /^[ \t]*\r?\n?$/.test(l)) continue;
				const mm = item.exec(l);
				if (!mm) break;
				found.push({ i: j, value: String(itemValue(mm)).trim(), m: mm });
			}
			const hasTo = found.some((f) => f.value === to);
			for (const f of found) {
				if (f.value !== from) continue;
				changed = true;
				if (hasTo) {
					lines[f.i] = '';
				} else {
					const q = f.m[2] !== undefined ? "'" : f.m[3] !== undefined ? '"' : '';
					lines[f.i] = `${f.m[1]}${yamlScalar(to, q)}${f.m[5] ?? ''}${f.m[6] ?? ''}`;
				}
			}
			i = j - 1;
			continue;
		}
		const wiki =
			/^wiki:([ \t]*)(?:'([^']*)'|"([^"]*)"|([^#\r\n]*?))([ \t]+#[^\r\n]*)?[ \t]*(\r?\n)?$/.exec(
				line
			);
		if (wiki) {
			const v = (wiki[2] ?? wiki[3] ?? wiki[4] ?? '').trim();
			if (v === from) {
				lines[i] = `wiki:${wiki[1] || ' '}${yamlScalar(to)}${wiki[5] ?? ''}${wiki[6] ?? ''}`;
				changed = true;
			}
		}
	}
	return changed ? lines.join('') : raw;
}

/* ------------------------------------------------------------------------------------------ */
/*  Plan                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {object} PlannedFile
 * @prop {string} path
 * @prop {string} before
 * @prop {string} after
 * @prop {string} [sha] blob sha it was read at
 */

/**
 * Everything a list of operations changes: the tag file and, for rename/merge, every post whose
 * `tags:` (or `wiki:`) uses the old name exactly as written. Posts that use an alias of it keep
 * working through the alias and are not touched.
 * @param {{source: string, sourceSha?: string, sourcePath: string, posts: Array<{path: string, text: string, sha?: string}>, ops: TagOp[]}} input
 * @returns {{files: PlannedFile[], summary: string[]}}
 */
export function planTagChange({ source, sourceSha, sourcePath, posts, ops }) {
	if (!ops.length) throw new Error('No hay cambios.');
	const parsed = parseTagSource(source);
	const entries = applyTagOps(
		parsed.items.map((it) => ({ value: it.value, orig: it })),
		ops
	);
	const after = emitTagSource(parsed, entries);
	/** @type {PlannedFile[]} */
	const files = [];
	if (after !== source) files.push({ path: sourcePath, before: source, after, sha: sourceSha });
	/** @type {Map<string, {path: string, before: string, after: string, sha?: string}>} */
	const touched = new Map();
	for (const op of ops) {
		const pair =
			op.type === 'rename'
				? [op.from, clean(op.to)]
				: op.type === 'merge'
					? [op.from, op.into]
					: null;
		if (!pair) continue;
		for (const p of posts) {
			const cur = touched.get(p.path)?.after ?? p.text;
			const next = replaceTagInPost(cur, pair[0], pair[1]);
			if (next !== cur)
				touched.set(p.path, { path: p.path, before: p.text, after: next, sha: p.sha });
		}
	}
	files.push(...[...touched.values()].sort((a, b) => a.path.localeCompare(b.path)));
	return { files, summary: ops.map(describeOp) };
}

/**
 * One line in Spanish for an operation (commit message, audit, preview).
 * @param {TagOp} op
 */
export function describeOp(op) {
	switch (op.type) {
		case 'create':
			return `Crear «${op.id}»${op.parent ? ` dentro de «${op.parent}»` : ''}`;
		case 'update':
			return `Editar «${op.id}» (${Object.keys(op.set ?? {}).join(', ')})`;
		case 'move':
			return op.to
				? `Mover «${op.id}» ${op.from ? `de «${op.from}» ` : ''}a «${op.to}»`
				: `Sacar «${op.id}» de «${op.from}»`;
		case 'rename':
			return `Renombrar «${op.from}» a «${op.to}»${op.keepAlias === false ? '' : ' (el nombre viejo queda como alias)'}`;
		case 'merge':
			return `Fusionar «${op.from}» en «${op.into}»`;
		case 'addAlias':
			return `Agregar el alias «${op.alias}» a «${op.id}»`;
		case 'removeAlias':
			return `Quitar el alias «${op.alias}» de «${op.id}»`;
		default:
			return 'Cambio';
	}
}

/**
 * Validates operations coming from a form (JSON). Returns the ops or throws.
 * @param {unknown} input
 * @returns {TagOp[]}
 */
export function readOps(input) {
	if (!Array.isArray(input) || !input.length) throw new Error('No hay cambios.');
	if (input.length > 30) throw new Error('Demasiados cambios juntos (máximo 30).');
	const str = (/** @type {any} */ v) =>
		typeof v === 'string' ? v : v == null ? undefined : String(v);
	return input.map((raw) => {
		if (!raw || typeof raw !== 'object') throw new Error('Cambio inválido.');
		const o = /** @type {any} */ (raw);
		switch (o.type) {
			case 'create':
				return {
					type: 'create',
					id: str(o.id) ?? '',
					parent: str(o.parent),
					icon: str(o.icon),
					visible_name: str(o.visible_name),
					description: str(o.description),
					aka: Array.isArray(o.aka) ? o.aka.map(String) : undefined
				};
			case 'update':
				if (!o.set || typeof o.set !== 'object') throw new Error('Cambio inválido.');
				return { type: 'update', id: str(o.id) ?? '', set: o.set };
			case 'move':
				return {
					type: 'move',
					id: str(o.id) ?? '',
					from: str(o.from) ?? null,
					to: str(o.to) ?? null
				};
			case 'rename':
				return {
					type: 'rename',
					from: str(o.from) ?? '',
					to: str(o.to) ?? '',
					keepAlias: o.keepAlias !== false
				};
			case 'merge':
				return { type: 'merge', from: str(o.from) ?? '', into: str(o.into) ?? '' };
			case 'addAlias':
			case 'removeAlias':
				return { type: o.type, id: str(o.id) ?? '', alias: str(o.alias) ?? '' };
			default:
				throw new Error('Operación desconocida.');
		}
	});
}

/* ------------------------------------------------------------------------------------------ */
/*  Diff                                                                                       */
/* ------------------------------------------------------------------------------------------ */

/**
 * @typedef {{t: ' '|'-'|'+', s: string}} DiffLine
 * @typedef {{oldStart: number, newStart: number, lines: DiffLine[]}} DiffHunk
 */

/**
 * Line diff with `context` lines around changes (LCS on the part between the common prefix and
 * suffix, which is small for these edits).
 * @param {string} before
 * @param {string} after
 * @param {number} [context]
 * @returns {DiffHunk[]}
 */
export function lineDiff(before, after, context = 3) {
	const a = before.split('\n');
	const b = after.split('\n');
	let pre = 0;
	while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
	let suf = 0;
	while (
		suf < a.length - pre &&
		suf < b.length - pre &&
		a[a.length - 1 - suf] === b[b.length - 1 - suf]
	)
		suf++;
	const am = a.slice(pre, a.length - suf);
	const bm = b.slice(pre, b.length - suf);
	/** @type {DiffLine[]} */
	let ops = [];
	if (am.length * bm.length > 4_000_000) {
		ops = [
			...am.map((s) => ({ t: /** @type {'-'} */ ('-'), s })),
			...bm.map((s) => ({ t: /** @type {'+'} */ ('+'), s }))
		];
	} else {
		const n = am.length;
		const mm = bm.length;
		const dp = Array.from({ length: n + 1 }, () => new Uint32Array(mm + 1));
		for (let i = n - 1; i >= 0; i--)
			for (let j = mm - 1; j >= 0; j--)
				dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		let i = 0;
		let j = 0;
		while (i < n || j < mm) {
			if (i < n && j < mm && am[i] === bm[j]) {
				ops.push({ t: ' ', s: am[i] });
				i++;
				j++;
			} else if (i < n && (j === mm || dp[i + 1][j] >= dp[i][j + 1])) {
				ops.push({ t: '-', s: am[i++] });
			} else {
				ops.push({ t: '+', s: bm[j++] });
			}
		}
	}
	/** @type {DiffLine[]} */
	const all = [
		...a.slice(0, pre).map((s) => ({ t: /** @type {' '} */ (' '), s })),
		...ops,
		...a.slice(a.length - suf).map((s) => ({ t: /** @type {' '} */ (' '), s }))
	];
	// Old/new line numbers of every line, then group changes closer than 2×context.
	/** @type {Array<{o: number, n: number}>} */
	const at = [];
	let o = 1;
	let nn = 1;
	for (const l of all) {
		at.push({ o, n: nn });
		if (l.t !== '+') o++;
		if (l.t !== '-') nn++;
	}
	const changes = all.map((l, k) => (l.t === ' ' ? -1 : k)).filter((k) => k >= 0);
	/** @type {DiffHunk[]} */
	const hunks = [];
	let g = 0;
	while (g < changes.length) {
		let last = g;
		while (last + 1 < changes.length && changes[last + 1] - changes[last] <= context * 2 + 1)
			last++;
		const from = Math.max(0, changes[g] - context);
		const to = Math.min(all.length - 1, changes[last] + context);
		hunks.push({ oldStart: at[from].o, newStart: at[from].n, lines: all.slice(from, to + 1) });
		g = last + 1;
	}
	return hunks;
}

/* ------------------------------------------------------------------------------------------ */
/*  Analysis for the UI                                                                        */
/* ------------------------------------------------------------------------------------------ */

/** Content types counted separately. */
export const USAGE_CATEGORIES = Object.freeze(['calendario', 'material', 'amigues', 'wiki']);

/**
 * @typedef {object} TagNode
 * @prop {string} id
 * @prop {string} name visible name
 * @prop {string} icon
 * @prop {string} [color] own or inherited
 * @prop {boolean} declared has its own entry (else: only a child reference)
 * @prop {string[]} children
 * @prop {string[]} parents
 * @prop {string[]} aka other names (aka)
 * @prop {string[]} variants spellings that point here (aliasOf entries)
 * @prop {string[]} related both directions, like the site
 * @prop {string} description
 * @prop {string} [wiki] slug of the Kinkipedia post about it
 * @prop {Record<string, number>} counts posts per content type (as canonical)
 * @prop {number} total
 * @prop {number} subtotal total including descendants (a post counted once per tag)
 */

/**
 * @param {TagEntry[]} entries the file's entries (parseTagSource(...).items.map(i => i.value))
 * @param {Record<string, Record<string, number>>} usage category → raw tag → posts
 * @param {Record<string, string>} [wikiPosts] tag id → wiki post slug
 */
export function analyzeTags(entries, usage, wikiPosts = {}) {
	/** @type {Map<string, string>} */
	const alias = new Map();
	for (const e of entries) if (e.aliasOf !== undefined) alias.set(e.id, e.aliasOf);
	for (const e of entries)
		for (const a of e.aka ?? []) if (a !== e.id && !alias.has(a)) alias.set(a, e.id);
	/** @param {string} t */
	const canon = (t) => alias.get(t) ?? t;

	/** @type {Map<string, TagNode>} */
	const nodes = new Map();
	/** @param {string} id @param {TagEntry} [e] */
	const node = (id, e) => {
		let n = nodes.get(id);
		if (!n) {
			n = {
				id,
				name: id,
				icon: '',
				declared: false,
				children: [],
				parents: [],
				aka: [],
				variants: [],
				related: [],
				description: '',
				counts: {},
				total: 0,
				subtotal: 0
			};
			nodes.set(id, n);
		}
		if (e) {
			n.declared = true;
			n.name = e.visible_name ?? id;
			n.icon = String(e.icon ?? '').trim();
			if (e.color) n.color = e.color;
			n.children = [...(e.children ?? [])];
			n.aka = [...(e.aka ?? [])];
			n.description = e.description ?? '';
			n.related = [...(e.related ?? [])];
		}
		return n;
	};
	for (const e of entries) if (e.aliasOf === undefined && e.id !== '') node(e.id, e);
	/** @type {Array<{from: string, to: string, kind: 'related'|'alias'}>} */
	const broken = [];
	for (const n of [...nodes.values()]) for (const c of n.children) node(c).parents.push(n.id);
	for (const e of entries) {
		if (e.aliasOf === undefined) continue;
		if (nodes.has(e.aliasOf)) nodes.get(e.aliasOf)?.variants.push(e.id);
		else broken.push({ from: e.id, to: e.aliasOf, kind: 'alias' });
	}
	for (const n of nodes.values()) {
		for (const r of n.related) {
			const other = nodes.get(r);
			if (!other) broken.push({ from: n.id, to: r, kind: 'related' });
			else if (!other.related.includes(n.id)) other.related.push(n.id);
		}
	}
	// usage
	/** @type {Map<string, {counts: Record<string, number>, total: number}>} */
	const used = new Map();
	for (const [cat, tags] of Object.entries(usage)) {
		for (const [raw, count] of Object.entries(tags)) {
			const id = canon(raw);
			const u = used.get(id) ?? { counts: {}, total: 0 };
			u.counts[cat] = (u.counts[cat] ?? 0) + count;
			u.total += count;
			used.set(id, u);
		}
	}
	for (const [id, u] of used) {
		const n = nodes.get(id);
		if (n) {
			n.counts = u.counts;
			n.total = u.total;
		}
	}
	// colors (own, else the first ancestor's), wiki
	for (const n of nodes.values()) {
		if (wikiPosts[n.id]) n.wiki = wikiPosts[n.id];
		if (n.color) continue;
		/** @type {Set<string>} */
		const seen = new Set();
		let p = n.parents[0];
		while (p && !seen.has(p)) {
			seen.add(p);
			const pn = nodes.get(p);
			if (pn?.color && entries.some((e) => e.id === p && e.color)) {
				n.color = pn.color;
				break;
			}
			p = pn?.parents[0] ?? '';
		}
	}
	// subtotals
	for (const n of nodes.values()) {
		/** @type {Set<string>} */
		const seen = new Set([n.id]);
		const stack = [...n.children];
		let sum = n.total;
		while (stack.length) {
			const c = /** @type {string} */ (stack.pop());
			if (seen.has(c)) continue;
			seen.add(c);
			const cn = nodes.get(c);
			if (!cn) continue;
			sum += cn.total;
			stack.push(...cn.children);
		}
		n.subtotal = sum;
	}
	const reachable = new Set();
	const stack = ['root'];
	while (stack.length) {
		const id = /** @type {string} */ (stack.pop());
		if (reachable.has(id)) continue;
		reachable.add(id);
		stack.push(...(nodes.get(id)?.children ?? []));
	}
	const all = [...nodes.values()];
	return {
		nodes: all,
		/** Declared tags outside the tree (no parent), except root. */
		orphans: all.filter((n) => n.id !== 'root' && !n.parents.length).map((n) => n.id),
		/** In the tree, reachable from root? */
		unreachable: all
			.filter((n) => n.id !== 'root' && n.parents.length && !reachable.has(n.id))
			.map((n) => n.id),
		/** Leaves no post uses. */
		unused: all
			.filter((n) => n.id !== 'root' && !n.children.length && n.total === 0)
			.map((n) => n.id),
		/** Tags posts use that aren't in the tree (not declared, not a child, not an alias). */
		undeclared: [...used]
			.filter(([id]) => !nodes.has(id))
			.map(([id, u]) => ({ id, counts: u.counts, total: u.total }))
			.sort((x, y) => y.total - x.total || x.id.localeCompare(y.id, 'es')),
		broken,
		aliases: Object.fromEntries(alias)
	};
}
