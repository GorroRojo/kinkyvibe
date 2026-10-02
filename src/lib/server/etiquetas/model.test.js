/**
 * El viaje archivo → registros → lista para tagsFactory da el mismo árbol que el archivo de hoy,
 * etiqueta por etiqueta (nombre, ícono, color heredado, madres, hijas en orden, relacionadas,
 * alias). Sobre el archivo REAL (src/lib/utils/hardcodedTags.js) y los textos reales de la wiki.
 */
import { describe, expect, it } from 'vitest';
import hardcodedTags from '$lib/utils/hardcodedTags.js';
import tagsFactory from '$lib/utils/tags.js';
import { parseWikiFile, recordsToRawTags, tagsToRecords } from './model.js';

const wikiRaw = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/wiki/*.md', { query: '?raw', import: 'default', eager: true })
);
const wikiFiles = Object.entries(wikiRaw).map(([p, raw]) => ({
	name: p.slice(p.lastIndexOf('/') + 1, -3),
	raw
}));

/** Copia profunda sin funciones (tagsFactory modifica lo que recibe). */
const fresh = () => JSON.parse(JSON.stringify(hardcodedTags));

/** @param {TagManager} tm @param {string} id */
function view(tm, id) {
	const t = tm.get(id);
	return {
		id: t.id,
		visible_name: t.visible_name,
		icon: t.icon?.trim(), // (la base guarda «⚫︎ » sin el espacio del final)
		description: t.description,
		image: t.image,
		color: t.getColor?.(),
		parents: [...(t.parents ?? [])].sort(),
		children: t.children ?? [],
		related: [...new Set(t.related ?? [])].sort(),
		allParents: [...new Set(t.getAllParents?.() ?? [])].sort()
	};
}

describe('tagsToRecords / recordsToRawTags', () => {
	const { records, warnings } = tagsToRecords(fresh(), wikiFiles);

	it('da el mismo árbol que el archivo de hoy, etiqueta por etiqueta', () => {
		const before = tagsFactory(fresh());
		const after = tagsFactory(/** @type {any} */ (recordsToRawTags(records)));
		// Única diferencia buscada: una relacionada con una etiqueta que no existe (hoy queda como
		// texto en la lista, sin página) no se puede guardar como relación. Se avisa al importar.
		const known = new Set(before.tagIDs());
		/** @param {string} r */
		const missing = { has: (/** @type {string} */ r) => !known.has(r) };
		const ids = new Set([...before.tagIDs(), ...after.tagIDs()].filter(Boolean));
		for (const id of ids) {
			const expected = view(before, id);
			// Y una mejora: hoy, si A declara «relacionada con B» y B es una hija no declarada que
			// aparece después en el archivo (como «sumise»), B no muestra a A. Ahora sí.
			const declaredBy = hardcodedTags
				.filter((t) => (t.related ?? []).includes(id))
				.map((t) => t.id);
			expected.related = [...new Set([...expected.related, ...declaredBy])]
				.filter((r) => !missing.has(r))
				.sort();
			expect(view(after, id), id).toEqual(expected);
		}
		// Las mismas etiquetas; las que no son alias, en el mismo orden (las listas de etiquetas y
		// resolveTagSlug dependen de eso). Los alias van al final: su orden no se ve en ningún lado.
		// (Un alias de una etiqueta que no existe, como «Dominatrix», hoy ya no lleva a ningún
		// lado: no se importa.)
		/** @param {TagManager} tm */
		const live = (tm) => new Set(tm.tagIDs().filter((id) => id && !tm.get(id).orphan));
		expect(live(after)).toEqual(live(before));
		/** @param {TagManager} tm */
		const canonical = (tm) =>
			tm.tagIDs().filter((id) => id && !tm.entries().find(([k]) => k === id)?.[1].aliasOf);
		expect(canonical(after)).toEqual(canonical(before));
	});

	it('las series siguen siendo hijas de «evento recurrente», en orden y con su imagen', () => {
		const before = tagsFactory(fresh()).get('evento recurrente').children;
		const raw = recordsToRawTags(records);
		const tm = tagsFactory(/** @type {any} */ (raw));
		expect(tm.get('evento recurrente').children).toEqual(before);
		const picantearla = records.find((r) => r.key === 'Picantearla');
		expect(picantearla?.data.image).toBe('picantearla-miniatura.webp');
		expect(picantearla?.parents).toEqual([{ key: 'evento recurrente', orden: 0 }]);
	});

	it('los alias son registros con solo su nombre y a quién apuntan', () => {
		const espanol = records.find((r) => r.key === 'espanol');
		expect(espanol).toEqual({
			key: 'espanol',
			title: 'espanol',
			data: {},
			parents: [],
			related: [],
			aliasOf: 'español'
		});
		const aftercare = records.find((r) => r.key === 'aftercare');
		expect(aftercare?.aliasOf).toBe('cuidados posteriores');
	});

	it('cada texto de la wiki queda como cuerpo de su etiqueta', () => {
		expect(wikiFiles.length).toBe(12);
		for (const file of wikiFiles) {
			const w = parseWikiFile(file.raw);
			const r = records.find((x) => x.key === w.wiki);
			expect(r, file.name).toBeDefined();
			// (intercambio-de-poder.md no tiene cuerpo todavía: queda sin `body`, con su título)
			expect(r?.data.body ?? '').toBe(w.body);
			expect(r?.data.wiki_title).toBe(w.title);
		}
		const edad = records.find((r) => r.key === 'edad');
		expect(edad?.data.wiki_title).toBe('Juegos con la edad');
		expect(String(edad?.data.body)).toMatch(/^Los juegos con la edad/);
	});

	it('avisa lo que no puede importar (relacionadas que no existen, la etiqueta sin nombre)', () => {
		expect(warnings).toContain('hay una etiqueta sin nombre: no se importa');
		expect(warnings.some((w) => w.includes('«cosquillas», que no existe'))).toBe(true);
		expect(records.some((r) => r.key === '')).toBe(false);
	});

	it('casos chicos: hija no declarada, alias como hija, aka que pisa una etiqueta', () => {
		const { records: rs, warnings: ws } = tagsToRecords([
			{ id: 'a', children: ['b', 'alias-de-c', 'nueva'], color: 'red' },
			{ id: 'b', aka: ['bb', 'b'] },
			{ id: 'c', related: ['b', 'falta'] },
			{ id: 'alias-de-c', aliasOf: 'c' },
			{ id: 'bb', icon: 'x' }
		]);
		expect(rs.map((r) => [r.key, r.aliasOf])).toEqual([
			['a', null],
			['b', null],
			['c', null],
			['nueva', null],
			['alias-de-c', 'c'],
			['bb', 'b']
		]);
		expect(rs.find((r) => r.key === 'c')?.parents).toEqual([{ key: 'a', orden: 1 }]);
		expect(rs.find((r) => r.key === 'nueva')?.parents).toEqual([{ key: 'a', orden: 2 }]);
		expect(ws.some((w) => w.includes('«bb» es una etiqueta y también un alias'))).toBe(true);
		expect(ws.some((w) => w.includes('«falta», que no existe'))).toBe(true);
	});
});
