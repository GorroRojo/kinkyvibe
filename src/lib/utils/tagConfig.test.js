import { describe, it, expect } from 'vitest';
import realSource from './hardcodedTags.js?raw';
import {
	analyzeTags,
	applyTagOps,
	describeOp,
	emitTagSource,
	lineDiff,
	parseTagSource,
	planTagChange,
	printEntry,
	readOps,
	renameWikiLinks,
	replaceTagInPost,
	validateTagName
} from './tagConfig.js';

const SRC = `export const hardcodedTags = [
	{ id: 'root', children: ['BDSM', 'prácticas', 'material'] },
	{
		id: 'BDSM',
		icon: '❤️',
		description: 'Una conjunción de [[bondage]] y [[disciplina : disciplinas]].',
		related: ['top'],
		children: ['seguridad']
	},
	{ id: 'prácticas', children: ['bondage', 'impacto'] },
	// cuerdas y demás
	{ id: 'bondage', aka: ['ataduras'], children: ['shibari'] },
	{ id: 'impacto', icon: '👋' },
	{ id: 'material', children: ['guía'] },
	{ id: 'suelta' },
	{ id: 'top', icon: '⬆️', related: ['fantasma'] },
	{ id: 'bdsm', aliasOf: 'BDSM' },
	{ id: 'Shibari', aliasOf: 'shibari' }
];
export default hardcodedTags;
`;

/** @param {string} src */
const entriesOf = (src) => parseTagSource(src).items.map((it) => ({ value: it.value, orig: it }));
/** @param {import('./tagConfig.js').TagOp[]} ops */
const run = (ops, src = SRC) => {
	const parsed = parseTagSource(src);
	return emitTagSource(parsed, applyTagOps(entriesOf(src), ops));
};
/** @param {string} out @param {string} id */
const entry = (out, id) =>
	parseTagSource(out).items.find((i) => i.value.id === id && !i.value.aliasOf)?.value;

describe('parseTagSource / emitTagSource', () => {
	it('reads the real file and writes it back byte for byte', () => {
		const parsed = parseTagSource(realSource);
		expect(parsed.items.length).toBeGreaterThan(100);
		expect(parsed.items.find((i) => i.value.id === 'BDSM')?.value.related).toContain('top');
		expect(
			emitTagSource(
				parsed,
				parsed.items.map((it) => ({ value: it.value, orig: it }))
			)
		).toBe(realSource);
	});
	it('prints almost every entry of the real file exactly as prettier left it', () => {
		const items = parseTagSource(realSource).items;
		const same = items.filter(
			(it) => printEntry(it.value, { multiline: it.multiline }) === it.text
		);
		expect(same.length / items.length).toBeGreaterThan(0.95);
	});
	it('reports where the file is broken', () => {
		expect(() => parseTagSource('export const hardcodedTags = [\n\t{ id: "x" \n];')).toThrow(
			/línea/
		);
		expect(() => parseTagSource('const x = 1;')).toThrow(/hardcodedTags/);
	});
	it('handles escapes and quotes', () => {
		const src = `export const hardcodedTags = [\n\t{ id: 'it\\'s', description: "dice \\"hola\\"" }\n];\n`;
		const e = parseTagSource(src).items[0].value;
		expect(e).toEqual({ id: "it's", description: 'dice "hola"' });
		expect(printEntry(e)).toBe(`{ id: "it's", description: 'dice "hola"' }`);
	});
});

describe('printEntry', () => {
	it('one line when it fits, one prop per line otherwise, long strings on their own line', () => {
		expect(printEntry({ id: 'a', icon: '🎉' })).toBe("{ id: 'a', icon: '🎉' }");
		const long = printEntry({
			id: 'x',
			description: 'palabra '.repeat(20).trim(),
			children: ['a']
		});
		expect(long).toBe(
			`{\n\t\tid: 'x',\n\t\tdescription:\n\t\t\t'${'palabra '.repeat(20).trim()}',\n\t\tchildren: ['a']\n\t}`
		);
		const kids = printEntry({
			id: 'x',
			children: Array.from({ length: 12 }, (_, i) => 'etiqueta ' + i)
		});
		expect(kids).toContain("children: [\n\t\t\t'etiqueta 0',\n");
	});
});

describe('applyTagOps', () => {
	it('create: under a parent, placed after it, with fields', () => {
		const out = run([
			{ type: 'create', id: 'spanking', parent: 'impacto', icon: '🍑', aka: ['nalgadas'] }
		]);
		expect(entry(out, 'impacto')?.children).toEqual(['spanking']);
		expect(out).toContain(
			"\t{ id: 'impacto', icon: '👋', children: ['spanking'] },\n\t{ id: 'spanking', icon: '🍑', aka: ['nalgadas'] },"
		);
		expect(() => run([{ type: 'create', id: 'ataduras' }])).toThrow(/Ya existe/);
		expect(() => run([{ type: 'create', id: 'x', parent: 'nada' }])).toThrow(/No existe/);
		expect(() => run([{ type: 'create', id: '  ' }])).toThrow(/Falta/);
	});
	it('create without parent goes before the aliases', () => {
		const out = run([{ type: 'create', id: 'nueva' }]);
		expect(out).toMatch(/\{ id: 'nueva' \},\n\t\{ id: 'bdsm', aliasOf: 'BDSM' \}/);
	});
	it('update: sets and removes fields keeping key order, declares child-only tags', () => {
		const out = run([
			{
				type: 'update',
				id: 'impacto',
				set: { icon: '', visible_name: 'Juegos de impacto', description: 'Golpes.' }
			},
			{ type: 'update', id: 'shibari', set: { icon: '🪢' } }
		]);
		expect(entry(out, 'impacto')).toEqual({
			id: 'impacto',
			visible_name: 'Juegos de impacto',
			description: 'Golpes.'
		});
		expect(entry(out, 'shibari')).toEqual({ id: 'shibari', icon: '🪢' });
		expect(() => run([{ type: 'update', id: 'impacto', set: { children: [] } }])).toThrow(
			/No se puede/
		);
		expect(() => run([{ type: 'update', id: 'bdsm', set: { icon: 'x' } }])).toThrow(/alias/);
		expect(() => run([{ type: 'update', id: 'impacto', set: { aka: ['ataduras'] } }])).toThrow(
			/otra/
		);
	});
	it('move: reparent, refuse cycles, detach', () => {
		const out = run([{ type: 'move', id: 'impacto', from: 'prácticas', to: 'BDSM' }]);
		expect(entry(out, 'prácticas')?.children).toEqual(['bondage']);
		expect(entry(out, 'BDSM')?.children).toEqual(['seguridad', 'impacto']);
		expect(() => run([{ type: 'move', id: 'prácticas', from: 'root', to: 'bondage' }])).toThrow(
			/sí misma/
		);
		expect(() => run([{ type: 'move', id: 'impacto', from: 'BDSM', to: 'root' }])).toThrow(
			/no está/
		);
		const detached = run([{ type: 'move', id: 'impacto', from: 'prácticas', to: null }]);
		expect(entry(detached, 'prácticas')?.children).toEqual(['bondage']);
		// an orphan gets a parent
		expect(
			entry(run([{ type: 'move', id: 'suelta', to: 'material' }]), 'material')?.children
		).toEqual(['guía', 'suelta']);
	});
	it('rename: id, references, aliases, wiki links, old name kept as alias', () => {
		const out = run([{ type: 'rename', from: 'bondage', to: 'ataduras y cuerdas' }]);
		expect(entry(out, 'ataduras y cuerdas')?.children).toEqual(['shibari']);
		expect(entry(out, 'prácticas')?.children).toEqual(['ataduras y cuerdas', 'impacto']);
		expect(entry(out, 'BDSM')?.description).toContain('[[ataduras y cuerdas]]');
		expect(out).toContain("{ id: 'bondage', aliasOf: 'ataduras y cuerdas' }");
		expect(out).toContain('// cuerdas y demás'); // comment kept
		const noAlias = run([{ type: 'rename', from: 'bondage', to: 'x', keepAlias: false }]);
		expect(noAlias).not.toContain("aliasOf: 'x'");
		expect(() => run([{ type: 'rename', from: 'bondage', to: 'impacto' }])).toThrow(/Fusionar/);
		// the new name was an alias of the same tag: it stops being one
		const swap = run([{ type: 'rename', from: 'bondage', to: 'ataduras' }]);
		expect(entry(swap, 'ataduras')?.aka).toBeUndefined();
		expect(swap).toContain("{ id: 'bondage', aliasOf: 'ataduras' }");
	});
	it('merge: children, aliases, parents, related go to the target', () => {
		const out = run([{ type: 'merge', from: 'bondage', into: 'impacto' }]);
		expect(entry(out, 'bondage')).toBeUndefined();
		expect(entry(out, 'impacto')).toMatchObject({ children: ['shibari'], aka: ['ataduras'] });
		expect(entry(out, 'prácticas')?.children).toEqual(['impacto']);
		expect(out).toContain("{ id: 'bondage', aliasOf: 'impacto' }");
		const rel = run([{ type: 'merge', from: 'top', into: 'impacto' }]);
		expect(entry(rel, 'BDSM')?.related).toEqual(['impacto']);
		expect(entry(rel, 'impacto')?.related).toEqual(['fantasma']);
		expect(() => run([{ type: 'merge', from: 'bondage', into: 'shibari' }])).toThrow(/adentro/);
		expect(() => run([{ type: 'merge', from: 'top', into: 'bdsm' }])).toThrow(/alias/);
	});
	it('aliases: add to aka, remove from aka or aliasOf entries', () => {
		const add = run([{ type: 'addAlias', id: 'impacto', alias: 'impact play' }]);
		expect(entry(add, 'impacto')?.aka).toEqual(['impact play']);
		expect(() => run([{ type: 'addAlias', id: 'impacto', alias: 'bdsm' }])).toThrow(
			/alias de «BDSM»/
		);
		expect(() => run([{ type: 'addAlias', id: 'impacto', alias: 'top' }])).toThrow(
			/ya es una etiqueta/
		);
		const rm = run([{ type: 'removeAlias', id: 'bondage', alias: 'ataduras' }]);
		expect(entry(rm, 'bondage')).toEqual({ id: 'bondage', children: ['shibari'] });
		const rm2 = run([{ type: 'removeAlias', id: 'BDSM', alias: 'bdsm' }]);
		expect(rm2).not.toContain("aliasOf: 'BDSM'");
		expect(() => run([{ type: 'removeAlias', id: 'BDSM', alias: 'nada' }])).toThrow(/no es alias/);
	});
	it('only the touched entries change in the text', () => {
		const out = run([{ type: 'update', id: 'impacto', set: { icon: '🖐️' } }]);
		const d = lineDiff(SRC, out);
		expect(d).toHaveLength(1);
		expect(d[0].lines.filter((l) => l.t !== ' ')).toEqual([
			{ t: '-', s: "\t{ id: 'impacto', icon: '👋' }," },
			{ t: '+', s: "\t{ id: 'impacto', icon: '🖐️' }," }
		]);
	});
});

describe('replaceTagInPost', () => {
	const post = `---
title: Algo
wiki: bondage # para la wiki #
tags:
  - español # español | inglés #
  - bondage
  #  - bondage
  - 'a la gorra'
layout: material
---
Texto con bondage.
`;
	it('renames list items and wiki keeping comments', () => {
		const out = replaceTagInPost(post, 'bondage', 'cuerdas');
		expect(out).toContain('wiki: cuerdas # para la wiki #');
		expect(out).toContain('  - cuerdas\n');
		expect(out).toContain('  #  - bondage'); // comments untouched
		expect(out).toContain('Texto con bondage.'); // body untouched
		expect(replaceTagInPost(post, 'a la gorra', 'gorra')).toContain("  - 'gorra'");
	});
	it('drops the line when the post already has the target', () => {
		const out = replaceTagInPost(post, 'bondage', 'español');
		expect(out).not.toMatch(/^ {2}- bondage$/m);
		expect(out.match(/- español/g)).toHaveLength(1);
	});
	it('quotes values YAML would misread, handles flow lists, leaves others alone', () => {
		expect(replaceTagInPost(post, 'bondage', '24/7: sí')).toContain("  - '24/7: sí'");
		expect(replaceTagInPost('---\ntags: [a, bondage]\n---\n', 'bondage', 'b')).toBe(
			'---\ntags: [a, b]\n---\n'
		);
		expect(replaceTagInPost(post, 'nada', 'x')).toBe(post);
		expect(replaceTagInPost('sin frontmatter', 'a', 'b')).toBe('sin frontmatter');
	});
	it('keeps CRLF line endings', () => {
		const crlf = '---\r\ntags:\r\n  - bondage\r\n---\r\n';
		expect(replaceTagInPost(crlf, 'bondage', 'cuerdas')).toBe(
			'---\r\ntags:\r\n  - cuerdas\r\n---\r\n'
		);
	});
});

describe('planTagChange', () => {
	const posts = [
		{ path: 'src/lib/posts/material/a.md', text: '---\ntags:\n  - bondage\n---\n', sha: 's1' },
		{ path: 'src/lib/posts/material/b.md', text: '---\ntags:\n  - Shibari\n---\n', sha: 's2' },
		{ path: 'src/lib/posts/wiki/bondage.md', text: '---\nwiki: bondage\n---\n', sha: 's3' }
	];
	it('rename: the tag file plus every post that writes the old name', () => {
		const plan = planTagChange({
			source: SRC,
			sourceSha: 'cfg',
			sourcePath: 'src/lib/utils/hardcodedTags.js',
			posts,
			ops: [{ type: 'rename', from: 'bondage', to: 'cuerdas' }]
		});
		expect(plan.files.map((f) => f.path)).toEqual([
			'src/lib/utils/hardcodedTags.js',
			'src/lib/posts/material/a.md',
			'src/lib/posts/wiki/bondage.md'
		]);
		expect(plan.files[0].sha).toBe('cfg');
		expect(plan.files[1]).toMatchObject({ sha: 's1', after: '---\ntags:\n  - cuerdas\n---\n' });
		expect(plan.summary[0]).toMatch(/Renombrar «bondage» a «cuerdas»/);
	});
	it('chained operations see each other', () => {
		const plan = planTagChange({
			source: SRC,
			sourcePath: 'x',
			posts,
			ops: [
				{ type: 'rename', from: 'bondage', to: 'cuerdas' },
				{ type: 'merge', from: 'cuerdas', into: 'impacto' }
			]
		});
		expect(plan.files.find((f) => f.path.endsWith('a.md'))?.after).toContain('- impacto');
	});
	it('no changes → error', () => {
		expect(() => planTagChange({ source: SRC, sourcePath: 'x', posts, ops: [] })).toThrow(/No hay/);
	});
});

describe('lineDiff', () => {
	it('groups nearby changes and keeps context', () => {
		const a = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n');
		const b = a.replace('l5', 'L5').replace('l7', 'L7').replace('l25', 'L25');
		const h = lineDiff(a, b, 2);
		expect(h).toHaveLength(2);
		expect(h[0].oldStart).toBe(4);
		expect(h[0].lines.map((l) => l.t + l.s)).toEqual([
			' l3',
			' l4',
			'-l5',
			'+L5',
			' l6',
			'-l7',
			'+L7',
			' l8',
			' l9'
		]);
		expect(lineDiff('igual', 'igual')).toEqual([]);
	});
});

describe('analyzeTags', () => {
	const parsed = parseTagSource(SRC).items.map((i) => i.value);
	const a = analyzeTags(
		parsed,
		{ material: { bondage: 2, bdsm: 1, 'juegos de mesa': 3 }, calendario: { Shibari: 1 } },
		{ bondage: 'bondage' }
	);
	/** @param {string} id */
	const n = (id) => a.nodes.find((x) => x.id === id);
	it('builds parents, children, aliases and bidirectional related', () => {
		expect(n('shibari')).toMatchObject({ declared: false, parents: ['bondage'] });
		expect(n('BDSM')?.variants).toEqual(['bdsm']);
		expect(n('top')?.related).toContain('BDSM');
		expect(n('bondage')?.wiki).toBe('bondage');
		expect(a.aliases.ataduras).toBe('bondage');
	});
	it('counts usage by canonical id per content type, with subtotals', () => {
		expect(n('BDSM')?.counts).toEqual({ material: 1 });
		expect(n('shibari')?.counts).toEqual({ calendario: 1 });
		expect(n('bondage')?.subtotal).toBe(3);
	});
	it('finds orphans, unused, undeclared and broken references', () => {
		expect(a.orphans).toEqual(['suelta', 'top']);
		expect(a.unused).toEqual(expect.arrayContaining(['impacto', 'guía', 'suelta', 'seguridad']));
		expect(a.unused).not.toContain('shibari');
		expect(a.undeclared).toEqual([{ id: 'juegos de mesa', counts: { material: 3 }, total: 3 }]);
		expect(a.broken).toEqual([{ from: 'top', to: 'fantasma', kind: 'related' }]);
	});
	it('inherits colors from ancestors', () => {
		const b = analyzeTags(
			parseTagSource(realSource).items.map((i) => i.value),
			{}
		);
		expect(b.nodes.find((x) => x.id === 'cabaret')?.color).toBe('var(--3-dark)');
	});
});

describe('helpers', () => {
	it('validateTagName', () => {
		expect(validateTagName('juegos de mesa')).toBeNull();
		expect(validateTagName('a#b')).toMatch(/no puede/);
		expect(validateTagName('root')).toMatch(/reservado/);
	});
	it('renameWikiLinks', () => {
		expect(renameWikiLinks('[[a]] y [[a : texto]] y [[ab]]', 'a', 'b')).toBe(
			'[[b]] y [[b : texto]] y [[ab]]'
		);
	});
	it('readOps validates the JSON from the form', () => {
		expect(readOps([{ type: 'rename', from: 'a', to: 'b' }])).toEqual([
			{ type: 'rename', from: 'a', to: 'b', keepAlias: true }
		]);
		expect(() => readOps([])).toThrow(/No hay/);
		expect(() => readOps([{ type: 'delete' }])).toThrow(/desconocida/);
		expect(() => readOps(Array(31).fill({ type: 'merge', from: 'a', into: 'b' }))).toThrow(
			/Demasiados/
		);
	});
	it('describeOp', () => {
		expect(describeOp({ type: 'move', id: 'a', from: 'b', to: 'c' })).toBe(
			'Mover «a» de «b» a «c»'
		);
	});
});
