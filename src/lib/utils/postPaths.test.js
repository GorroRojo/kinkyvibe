import { describe, expect, it } from 'vitest';
import { CATEGORIES, isCategory, isPostID, postFilePath } from './postPaths.js';

describe('postFilePath', () => {
	it('builds the path of a post file', () => {
		expect(postFilePath('calendario', 'fiesta-2026-10')).toBe(
			'src/lib/posts/calendario/fiesta-2026-10.md'
		);
		expect(postFilePath('amigues', 'Gorro_Rojo')).toBe('src/lib/posts/amigues/Gorro_Rojo.md');
		expect(postFilePath('amigues', 'demon.web')).toBe('src/lib/posts/amigues/demon.web.md');
		expect(postFilePath('material', '_post_template')).toBe(
			'src/lib/posts/material/_post_template.md'
		);
	});

	it('only accepts known categories', () => {
		expect(CATEGORIES).toEqual(['amigues', 'calendario', 'material', 'wiki']);
		for (const bad of ['', 'media', 'calendario/media', '..', 'Calendario', null, undefined, 1]) {
			expect(isCategory(bad)).toBe(false);
			expect(postFilePath(bad, 'x')).toBeNull();
		}
	});

	it('rejects post ids that are not plain file names', () => {
		for (const bad of [
			'',
			'.',
			'..',
			'../x',
			'a/../b',
			'a/b',
			'a\\b',
			'..%2Fx',
			'a%2Fb',
			'x?y',
			'x#y',
			'x y',
			'.hidden',
			'-x',
			'a..b',
			'x\n',
			'ñ',
			'a'.repeat(201),
			null,
			undefined,
			['x']
		]) {
			expect(isPostID(bad), String(bad)).toBe(false);
			expect(postFilePath('calendario', bad)).toBeNull();
		}
	});

	it('accepts every existing post file name', async () => {
		const files = Object.keys(import.meta.glob('/src/lib/posts/*/*.md'));
		expect(files.length).toBeGreaterThan(100);
		for (const file of files) {
			const [, , , , category, name] = file.split('/');
			if (!isCategory(category)) continue;
			expect(postFilePath(category, name.replace(/\.md$/, '')), file).toBe(file.slice(1));
		}
	});
});
