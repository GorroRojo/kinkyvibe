/**
 * Los stores de $lib/utils/stores.js son de módulo: en el servidor los comparten todos los pedidos
 * del mismo isolate. Un componente que los escribe al armarse (arriba de todo en su <script>, o en
 * un `$:`) los escribe también en el render del servidor, y lo que deja ahí lo puede leer el pedido
 * de otra persona. Así eran las migas de pan con `currentPostData` (ya borrado): ahora salen de la
 * ruta (`sectionFromRouteId`, ./navigation.js).
 *
 * Esta prueba lee los componentes (sin compilarlos) y falla si aparece una escritura nueva de ese
 * tipo. Las que ya estaban quedan anotadas abajo: escriben siempre lo mismo o algo que sale solo de
 * los datos de la página, no de la persona. Para leer algo por pedido en un layout, mejor `$page`
 * (la ruta, los datos) o el contexto de Svelte. Las escrituras dentro de funciones, eventos,
 * `onMount` o `$effect` no corren en el servidor y no cuentan.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');

/** Las que ya estaban (archivo → stores), revisadas: no dependen de quién pide la página. */
const KNOWN = {
	// Vacía los filtros y fija la función de los chips: siempre lo mismo.
	'src/routes/+layout.svelte': ['filteredTags', 'togglePositiveTagFilterFn'],
	'src/routes/(authed)/+layout.svelte': ['filteredTags'],
	'src/routes/(content)/+layout.svelte': ['togglePositiveTagFilterFn'],
	// Vacía la búsqueda del glosario.
	'src/routes/(content)/wiki/+page.svelte': ['query'],
	// Las etiquetas de la lista que se ve (de los datos públicos de la página).
	'src/lib/components/PostList.svelte': ['allTags', 'visibleTags'],
	'src/lib/components/TagSearch.svelte': ['searchText']
};

/** @param {string} dir @returns {string[]} */
function svelteFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const path = join(dir, e.name);
		if (e.isDirectory()) return svelteFiles(path);
		return e.name.endsWith('.svelte') ? [path] : [];
	});
}

/** @param {string} source */
const isStoresModule = (source) => /(^|\/)utils\/stores(\.js)?$/.test(source);

/**
 * `X.set(…)` / `X.update(…)` con X un store de stores.js.
 * @param {any} node
 * @param {Set<string>} stores
 */
function storeWrite(node, stores) {
	if (node?.type !== 'ExpressionStatement') return null;
	const call = node.expression;
	if (call?.type !== 'CallExpression' || call.callee?.type !== 'MemberExpression') return null;
	const { object, property } = call.callee;
	if (object?.type !== 'Identifier' || !stores.has(object.name)) return null;
	return property?.name === 'set' || property?.name === 'update' ? object.name : null;
}

/**
 * Los stores que el componente escribe al armarse (arriba de todo o en un `$:`).
 * @param {string} code
 */
function topLevelStoreWrites(code) {
	// Sin los estilos (algunos son SCSS, que el parser de Svelte no lee).
	const ast = /** @type {any} */ (parse(code.replace(/^<style[\s\S]*?^<\/style>/gm, '')));
	const body = ast.instance?.content?.body ?? [];
	/** @type {Set<string>} */
	const stores = new Set();
	for (const node of body) {
		if (node.type !== 'ImportDeclaration' || !isStoresModule(String(node.source.value))) continue;
		for (const s of node.specifiers) stores.add(s.local.name);
	}
	if (!stores.size) return [];
	/** @type {Set<string>} */
	const written = new Set();
	for (const node of body) {
		const inner =
			node.type === 'LabeledStatement' && node.label.name === '$'
				? node.body.type === 'BlockStatement'
					? node.body.body
					: [node.body]
				: [node];
		for (const n of inner) {
			const name = storeWrite(n, stores);
			if (name) written.add(name);
		}
	}
	return [...written].sort();
}

describe('stores de módulo en el render del servidor', () => {
	it('la detección ve las escrituras de arriba y de `$:`, no las de funciones', () => {
		const code = `<script>
	import { query, searchOpen, tagManager } from '$lib/utils/stores.js';
	query.set('');
	$: tagManager.update((t) => t);
	function open() { searchOpen.set(true); }
</script>`;
		expect(topLevelStoreWrites(code)).toEqual(['query', 'tagManager']);
	});

	it('ningún componente escribe un store de módulo al armarse, salvo los ya revisados', () => {
		/** @type {Record<string, string[]>} */
		const found = {};
		for (const file of svelteFiles(join(ROOT, 'src'))) {
			const name = relative(ROOT, file);
			/** @type {string[]} */
			let writes;
			try {
				writes = topLevelStoreWrites(readFileSync(file, 'utf8'));
			} catch (e) {
				throw new Error(`${name}: ${e}`);
			}
			if (writes.length) found[name.split('\\').join('/')] = writes;
		}
		/** @type {string[]} */
		const unexpected = [];
		for (const [file, writes] of Object.entries(found)) {
			const known = /** @type {Record<string, string[]>} */ (KNOWN)[file] ?? [];
			for (const w of writes) if (!known.includes(w)) unexpected.push(`${file}: ${w}`);
		}
		expect(unexpected).toEqual([]);
		// Y la lista no queda vieja: si una de esas escrituras se va, se borra de KNOWN (y la prueba
		// sigue viendo las que quedan).
		expect(found).toEqual(KNOWN);
	});
});
