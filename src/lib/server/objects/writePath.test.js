/**
 * Un solo camino de escritura: solo ./save.js escribe `objects`, `edges` y `object_types`. Este
 * test recorre el código de la app (no los tests) buscando INSERT/UPDATE/DELETE/REPLACE sobre
 * esas tablas. Si falla, no agregues tu archivo a la lista: escribí a través de saveObject().
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ALLOWED = new Set(['src/lib/server/objects/save.js']);
const ROOTS = ['src', 'worker', 'scripts'];
const WRITE =
	/\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+\w+)?|DELETE\s+FROM)\s+["`]?(objects|edges|object_types)["`]?\b/i;

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* walk(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
			yield* walk(full);
		} else if (/\.(js|ts|svelte)$/.test(entry.name) && !/\.(test|spec)\.js$/.test(entry.name)) {
			yield full;
		}
	}
}

describe('camino único de escritura', () => {
	it('la expresión reconoce las escrituras (y no las lecturas)', () => {
		expect(WRITE.test('INSERT INTO objects (a) VALUES (1)')).toBe(true);
		expect(WRITE.test('insert or replace into edges')).toBe(true);
		expect(WRITE.test('UPDATE "objects" SET x = 1')).toBe(true);
		expect(WRITE.test('DELETE FROM object_types')).toBe(true);
		expect(WRITE.test('SELECT * FROM objects')).toBe(false);
		expect(WRITE.test('INSERT INTO objects_fts (objects_fts) VALUES (1)')).toBe(false);
	});

	it('nadie más que save.js escribe objects, edges ni object_types', async () => {
		/** @type {string[]} */
		const offenders = [];
		for (const root of ROOTS) {
			for await (const file of walk(root)) {
				const rel = file.split(path.sep).join('/');
				if (ALLOWED.has(rel)) continue;
				const text = await readFile(file, 'utf8');
				const match = WRITE.exec(text);
				if (match) offenders.push(`${rel}: ${match[0]}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('save.js sí escribe (si esto falla, cambió el archivo y hay que actualizar ALLOWED)', async () => {
		const text = await readFile('src/lib/server/objects/save.js', 'utf8');
		expect(WRITE.test(text)).toBe(true);
	});
});
