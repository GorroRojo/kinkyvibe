/**
 * Renombrar en las publicaciones con la base (decisión de gorrite): sin alias se reescriben los
 * posts que usan el nombre viejo; con alias no se toca ninguno. Cliente del repo de mentira y
 * posts inventados.
 */
import { describe, expect, it } from 'vitest';
import { postRenamePairs } from '$lib/utils/tagConfig.js';
import { planTagRenameInPosts, renamesPosts } from './rename.js';

/** @param {string[]} tags */
const md = (tags) =>
	[
		'---',
		'title: Post de prueba',
		'tags:',
		...tags.map((t) => `  - ${t}`),
		'---',
		'Texto.',
		''
	].join('\n');

const POSTS = {
	'src/lib/posts/calendario': [
		{ path: 'src/lib/posts/calendario/uno.md', text: md(['Serie Vieja', 'fiesta']), sha: 'a' },
		{ path: 'src/lib/posts/calendario/dos.md', text: md(['fiesta']), sha: 'b' },
		{ path: 'src/lib/posts/calendario/_plantilla.md', text: md(['Serie Vieja']), sha: 'c' }
	],
	'src/lib/posts/wiki': [
		{ path: 'src/lib/posts/wiki/tres.md', text: md(['Serie Vieja']), sha: 'd' }
	]
};

const client = {
	/** @param {string} _token @param {string} dir */
	getDirTexts: async (_token, dir) => /** @type {any} */ (POSTS)[dir] ?? []
};

describe('postRenamePairs', () => {
	it('con el archivo: renombres y fusiones; con la base: solo los renombres sin alias', () => {
		/** @type {import('$lib/utils/tagConfig.js').TagOp[]} */
		const ops = [
			{ type: 'rename', from: 'a', to: ' b ', keepAlias: false },
			{ type: 'rename', from: 'c', to: 'd', keepAlias: true },
			{ type: 'rename', from: 'e', to: 'e', keepAlias: false },
			{ type: 'merge', from: 'f', into: 'g' },
			{ type: 'update', id: 'h', set: { icon: '🎭' } }
		];
		expect(postRenamePairs(ops)).toEqual([
			['a', 'b'],
			['c', 'd'],
			['f', 'g']
		]);
		expect(postRenamePairs(ops, { onlyWithoutAlias: true })).toEqual([['a', 'b']]);
		expect(renamesPosts(ops)).toBe(true);
		expect(renamesPosts([ops[1], ops[3]])).toBe(false);
	});
});

describe('planTagRenameInPosts', () => {
	it('sin alias: los posts que usan el nombre (no las plantillas), uno por archivo', async () => {
		const plan = await planTagRenameInPosts(client, 'token-de-prueba', [
			{ type: 'rename', from: 'Serie Vieja', to: 'Serie Nueva', keepAlias: false }
		]);
		expect(plan.files.map((f) => f.path)).toEqual([
			'src/lib/posts/calendario/uno.md',
			'src/lib/posts/wiki/tres.md'
		]);
		expect(plan.files[0]).toMatchObject({
			after: md(['Serie Nueva', 'fiesta']),
			sha: 'a'
		});
		expect(plan.summary).toEqual(['Renombrar «Serie Vieja» a «Serie Nueva» en las publicaciones']);
	});

	it('con alias: no lee nada ni cambia nada', async () => {
		const plan = await planTagRenameInPosts(
			{
				getDirTexts: async () => {
					throw new Error('no tenía que leer');
				}
			},
			'token-de-prueba',
			[{ type: 'rename', from: 'Serie Vieja', to: 'Serie Nueva', keepAlias: true }]
		);
		expect(plan).toEqual({ pairs: [], files: [], summary: [] });
	});
});
