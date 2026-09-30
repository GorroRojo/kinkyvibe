import { describe, it, expect } from 'vitest';
import { findAssetUsers, ownImageTarget, readUploadedImage, sharedAssetCommit } from './images.js';

const DIR = 'src/lib/posts/calendario';
/** @param {string} slug @param {string} featured @param {string} start */
const md = (slug, featured, start) => ({
	path: `${DIR}/${slug}.md`,
	sha: 'sha-' + slug,
	text: `---\ntitle: T ${slug}\nfeatured: ${featured}\nstart: ${start}\n---\n`
});

/** @param {{files?: any[], existing?: string[], media?: string[]}} opts */
function fakeClient({ files = [], existing = [], media = [] } = {}) {
	return {
		/** @param {string} _t @param {string} dir */
		getDirTexts: async (_t, dir) => (dir === DIR ? files : []),
		/** @param {string} _t @param {string} path */
		pathExists: async (_t, path) => existing.includes(path),
		/** @param {string} _t @param {string} _dir */
		listDir: async (_t, _dir) => media.map((name) => ({ name, path: name, sha: 'x', type: 'file' }))
	};
}

const files = [
	md('pica-2024-01', 'pica.webp', '2024-01-10T20:00-03:00'),
	md('pica-2026-03', 'pica.webp', '2026-03-10T20:00-03:00'),
	md('otro-2026-03', 'otro.webp', '2026-03-12T20:00-03:00')
];

describe('sharedAssetCommit', () => {
	it('same extension: overwrites the shared file only', async () => {
		const client = fakeClient({ files, existing: ['src/lib/assets/pica.webp'] });
		const r = await sharedAssetCommit(/** @type {any} */ (client), 't', {
			oldName: 'pica.webp',
			ext: 'webp',
			base64: 'AAAA'
		});
		expect(r.commitFiles).toEqual([{ path: 'src/lib/assets/pica.webp', base64: 'AAAA' }]);
		expect(r.mustNotExist).toEqual([]);
		expect(r.affected.map((a) => a.slug)).toEqual(['pica-2026-03', 'pica-2024-01']);
	});

	it('new extension: writes the new file, deletes the old one and updates every event, in one list', async () => {
		const client = fakeClient({ files, existing: ['src/lib/assets/pica.webp'] });
		const r = await sharedAssetCommit(/** @type {any} */ (client), 't', {
			oldName: 'pica.webp',
			ext: 'png',
			base64: 'AAAA'
		});
		expect(r.commitFiles.map((f) => [f.path, Boolean(f.delete)])).toEqual([
			[`${DIR}/pica-2026-03.md`, false],
			[`${DIR}/pica-2024-01.md`, false],
			['src/lib/assets/pica.png', false],
			['src/lib/assets/pica.webp', true]
		]);
		expect(r.mustNotExist).toEqual(['src/lib/assets/pica.png']);
		expect(r.unchanged.map((u) => u.sha)).toEqual(['sha-pica-2026-03', 'sha-pica-2024-01']);
		expect(r.affected.map((a) => a.title)).toEqual(['T pica-2026-03', 'T pica-2024-01']);
	});

	it('does not try to delete an old file that is already gone', async () => {
		const client = fakeClient({ files, existing: [] });
		const r = await sharedAssetCommit(/** @type {any} */ (client), 't', {
			oldName: 'pica.webp',
			ext: 'jpg',
			base64: 'AAAA'
		});
		expect(r.commitFiles.some((f) => f.delete)).toBe(false);
	});
});

describe('findAssetUsers / ownImageTarget / readUploadedImage', () => {
	it('lists the events that use a shared image', async () => {
		const users = await findAssetUsers(
			/** @type {any} */ (fakeClient({ files })),
			't',
			'otro.webp'
		);
		expect(users).toEqual([
			{ slug: 'otro-2026-03', title: 'T otro-2026-03', start: '2026-03-12T20:00-03:00' }
		]);
	});
	it('"solo esta" in an existing event uses the next free number', async () => {
		const client = fakeClient({ media: ['1.webp', '2.jpg'] });
		expect(await ownImageTarget(/** @type {any} */ (client), 't', 'pica-2026-03', 'png')).toEqual({
			featured: 3,
			path: `${DIR}/media/pica-2026-03/3.png`
		});
	});
	it('checks the bytes, not the file name', async () => {
		const png = new File(
			[new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
			'x.jpg'
		);
		const r = await readUploadedImage(png);
		expect('ext' in r && r.ext).toBe('png');
		const bad = await readUploadedImage(new File([new Uint8Array([1, 2, 3])], 'x.png'));
		expect('error' in bad).toBe(true);
		expect('error' in (await readUploadedImage(null))).toBe(true);
	});
});
