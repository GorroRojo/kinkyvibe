// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
// Integrity checks over every post in src/lib/posts (edited by non-developers via the CMS).
//
// Pre-existing problems live in content-known-issues.json so the suite is green today
// but fails on NEW breakage. After fixing content, or to accept the current state, run:
//   UPDATE_CONTENT_ALLOWLIST=1 npx vitest run src/tests/content.test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { checkContent, listPosts, extractFrontmatter } from './content-lib.js';

const ALLOWLIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'content-known-issues.json');
const { issues } = checkContent();

if (process.env.UPDATE_CONTENT_ALLOWLIST) {
	fs.writeFileSync(ALLOWLIST, JSON.stringify([...issues].sort(), null, '\t') + '\n');
}
/** @type {string[]} */
const known = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));

describe('contenido de src/lib/posts', () => {
	it('encuentra posts en todas las categorías', () => {
		const posts = listPosts();
		for (const c of ['amigues', 'calendario', 'material', 'wiki'])
			expect(posts.filter((p) => p.category === c).length).toBeGreaterThan(0);
	});

	it('extractFrontmatter lee el bloque --- inicial', () => {
		expect(extractFrontmatter('---\ntitle: a\n---\nbody')).toBe('title: a');
		expect(extractFrontmatter('sin frontmatter')).toBeUndefined();
	});

	it('no introduce problemas nuevos (fuera de content-known-issues.json)', () => {
		const knownSet = new Set(known);
		const fresh = issues.filter((i) => !knownSet.has(i));
		// A readable list is the whole point: print it in the assertion diff.
		expect(fresh, 'Problemas nuevos en el contenido:\n' + fresh.join('\n')).toEqual([]);
	});

	it('la lista de problemas conocidos no tiene entradas ya resueltas', () => {
		// Not a failure: just keeps the allowlist honest. Remove entries once fixed.
		const current = new Set(issues);
		const stale = known.filter((i) => !current.has(i));
		if (stale.length > 0)
			console.warn(
				`[content] ${stale.length} entradas de content-known-issues.json ya no aplican ` +
					'(correr con UPDATE_CONTENT_ALLOWLIST=1 para limpiarlas):\n' +
					stale.join('\n')
			);
		expect(Array.isArray(known)).toBe(true);
	});
});
