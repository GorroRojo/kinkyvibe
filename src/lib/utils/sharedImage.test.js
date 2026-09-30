import { describe, it, expect } from 'vitest';
import {
	eventsUsingAsset,
	featuredOf,
	isSafeAssetName,
	isSharedAsset,
	nextMediaNumber,
	planSharedAssetReplace,
	replacementAssetName,
	setFeatured,
	uploadScope
} from './sharedImage.js';

const DIR = 'src/lib/posts/calendario';
/**
 * @param {string} slug
 * @param {string} featured
 * @param {string} start
 * @param {string} [extra]
 */
const event = (slug, featured, start, extra = '') => ({
	path: `${DIR}/${slug}.md`,
	sha: 'sha-' + slug,
	text:
		`---\ntitle: ${slug}\ntags:\n  - español\n` +
		(featured ? `featured: ${featured}\n` : '') +
		`start: ${start}\n${extra}---\n\nTexto de ${slug}\n`
});

describe('shared vs own image', () => {
	it('a file name is shared, a number (or nothing) is not', () => {
		expect(isSharedAsset('picantearla-miniatura.webp')).toBe(true);
		expect(isSharedAsset('1')).toBe(false);
		expect(isSharedAsset(2)).toBe(false);
		expect(isSharedAsset('')).toBe(false);
		expect(isSharedAsset(undefined)).toBe(false);
	});
	it('only plain image names of src/lib/assets can be replaced', () => {
		expect(isSafeAssetName('picantearla-miniatura.webp')).toBe(true);
		expect(isSafeAssetName('Foto_1.JPG')).toBe(true);
		expect(isSafeAssetName('../posts/x.webp')).toBe(false);
		expect(isSafeAssetName('sub/x.webp')).toBe(false);
		expect(isSafeAssetName('x.svg')).toBe(false);
		expect(isSafeAssetName('..x.webp')).toBe(false);
	});
	it('asks only when the event uses a shared image', () => {
		expect(uploadScope('picantearla-miniatura.webp', 'todas')).toBe('todas');
		expect(uploadScope('picantearla-miniatura.webp', 'esta')).toBe('esta');
		// its own numbered image: always "solo esta", whatever was sent
		expect(uploadScope('1', 'todas')).toBe('esta');
		expect(uploadScope('', 'todas')).toBe('esta');
	});
	it('keeps the base name and takes the new extension', () => {
		expect(replacementAssetName('picantearla-miniatura.webp', 'webp')).toBe(
			'picantearla-miniatura.webp'
		);
		expect(replacementAssetName('picantearla-miniatura.webp', 'png')).toBe(
			'picantearla-miniatura.png'
		);
		expect(replacementAssetName('bdsm.inicial.jpg', 'webp')).toBe('bdsm.inicial.webp');
	});
	it('numbers new own images after the existing ones', () => {
		expect(nextMediaNumber([])).toBe(1);
		expect(nextMediaNumber(['1.webp', '2.png', 'logo.svg', '10.jpg'])).toBe(11);
	});
});

describe('setFeatured', () => {
	it('changes only the featured line, keeping comments and the rest of the file', () => {
		const raw =
			'---\ntitle: A\nfeatured: viejo.webp # la de siempre\n#logo: 2\nstatus: abierto # a | b #\n---\n\n## Hola\n';
		expect(setFeatured(raw, 'nuevo.png')).toBe(raw.replace('viejo.webp', 'nuevo.png'));
	});
	it('keeps the indentation of files written with indented properties', () => {
		const raw = '---\n  title: A\n  featured: viejo.webp\n  #logo: 2\n---\nTexto\n';
		expect(setFeatured(raw, 'viejo.jpg')).toBe(
			'---\n  title: A\n  featured: viejo.jpg\n  #logo: 2\n---\nTexto\n'
		);
	});
	it('handles quoted values and ignores commented-out featured lines', () => {
		const raw = "---\ntitle: A\n# featured: otro.webp\nfeatured: 'viejo.webp'\n---\n";
		expect(setFeatured(raw, 3)).toBe('---\ntitle: A\n# featured: otro.webp\nfeatured: 3\n---\n');
	});
	it('adds featured when the event had none (or only commented)', () => {
		const out = setFeatured('---\ntitle: A\n#featured: 1\n---\nTexto\n', 2);
		expect(featuredOf(out)).toBe('2');
		expect(out).toContain('Texto');
	});
	it('does not touch a "featured:" in the body', () => {
		const raw = '---\ntitle: A\nfeatured: a.webp\n---\nfeatured: no tocar\n';
		expect(setFeatured(raw, 'b.webp')).toBe(
			'---\ntitle: A\nfeatured: b.webp\n---\nfeatured: no tocar\n'
		);
	});
});

describe('eventsUsingAsset', () => {
	it('finds the events whose featured is the file, newest first, skipping templates', () => {
		const files = [
			event('pica-2024-01', 'pica.webp', '2024-01-10T20:00-03:00'),
			event('pica-2026-03', 'pica.webp', '2026-03-10T20:00-03:00'),
			event('otro-2026-03', 'otro.webp', '2026-03-12T20:00-03:00'),
			event('propia-2026-04', '1', '2026-04-12T20:00-03:00'),
			{
				...event('_event_template', 'pica.webp', '2023-01-01T20:00-03:00'),
				path: `${DIR}/_event_template.md`
			},
			{ path: `${DIR}/notas.txt`, sha: 'x', text: 'featured: pica.webp' }
		];
		expect(eventsUsingAsset(files, 'pica.webp').map((e) => e.slug)).toEqual([
			'pica-2026-03',
			'pica-2024-01'
		]);
	});
});

describe('planSharedAssetReplace', () => {
	const files = [
		event('pica-2024-01', 'pica.webp', '2024-01-10T20:00-03:00'),
		event('pica-2025-06', 'pica.webp', '2025-06-10T20:00-03:00', 'status: cancelado # a | b #\n'),
		event('pica-2026-03', 'pica.webp', '2026-03-10T20:00-03:00'),
		event('otro-2026-03', 'otro.webp', '2026-03-12T20:00-03:00')
	];

	it('same extension: replaces the file in place, no event file changes', () => {
		const plan = planSharedAssetReplace({ oldName: 'pica.webp', ext: 'webp', files });
		expect(plan.renamed).toBe(false);
		expect(plan.newName).toBe('pica.webp');
		expect(plan.assetPath).toBe('src/lib/assets/pica.webp');
		expect(plan.files).toEqual([]);
		expect(plan.unchanged).toEqual([]);
		// ...but every edition shows the new image: listed for the review step
		expect(plan.affected).toEqual([
			{
				slug: 'pica-2026-03',
				title: 'pica-2026-03',
				start: '2026-03-10T20:00-03:00',
				fileChanges: false
			},
			{
				slug: 'pica-2025-06',
				title: 'pica-2025-06',
				start: '2025-06-10T20:00-03:00',
				fileChanges: false
			},
			{
				slug: 'pica-2024-01',
				title: 'pica-2024-01',
				start: '2024-01-10T20:00-03:00',
				fileChanges: false
			}
		]);
	});

	it('another extension: new name, and every event that used the old one (past ones too) is updated', () => {
		const plan = planSharedAssetReplace({ oldName: 'pica.webp', ext: 'png', files });
		expect(plan.renamed).toBe(true);
		expect(plan.newName).toBe('pica.png');
		expect(plan.assetPath).toBe('src/lib/assets/pica.png');
		expect(plan.oldAssetPath).toBe('src/lib/assets/pica.webp');
		expect(plan.affected.map((a) => [a.slug, a.fileChanges])).toEqual([
			['pica-2026-03', true],
			['pica-2025-06', true],
			['pica-2024-01', true]
		]);
		expect(plan.files.map((f) => f.path).sort()).toEqual([
			`${DIR}/pica-2024-01.md`,
			`${DIR}/pica-2025-06.md`,
			`${DIR}/pica-2026-03.md`
		]);
		for (const f of plan.files) {
			expect(featuredOf(f.content)).toBe('pica.png');
			const before = files.find((x) => x.path === f.path)?.text ?? '';
			// only the featured line changed
			expect(f.content).toBe(before.replace('featured: pica.webp', 'featured: pica.png'));
		}
		// each rewritten file must still be the version we read when the commit is made
		expect(plan.unchanged).toEqual([
			{ path: `${DIR}/pica-2026-03.md`, sha: 'sha-pica-2026-03' },
			{ path: `${DIR}/pica-2025-06.md`, sha: 'sha-pica-2025-06' },
			{ path: `${DIR}/pica-2024-01.md`, sha: 'sha-pica-2024-01' }
		]);
		expect(plan.files.some((f) => f.path.includes('otro'))).toBe(false);
	});

	it('/edit: the edited event comes from the form, not from GitHub', () => {
		const path = `${DIR}/pica-2026-03.md`;
		const edited = files[2].text.replace('title: pica-2026-03', 'title: Editado');
		const plan = planSharedAssetReplace({
			oldName: 'pica.webp',
			ext: 'jpg',
			files,
			override: { [path]: { text: edited, sha: 'form-sha' } }
		});
		expect(plan.affected.map((a) => a.slug)).toEqual(['pica-2025-06', 'pica-2024-01']);
		const mine = plan.files.find((f) => f.path === path);
		expect(mine?.content).toContain('title: Editado');
		expect(featuredOf(mine?.content ?? '')).toBe('pica.jpg');
		expect(plan.unchanged).toContainEqual({ path, sha: 'form-sha' });
	});

	it('/edit with the same extension still writes the edited event', () => {
		const path = `${DIR}/pica-2026-03.md`;
		const plan = planSharedAssetReplace({
			oldName: 'pica.webp',
			ext: 'webp',
			files,
			override: { [path]: { text: files[2].text, sha: 's' } }
		});
		expect(plan.files.map((f) => f.path)).toEqual([path]);
		expect(featuredOf(plan.files[0].content)).toBe('pica.webp');
	});
});

describe('setFeatured with Windows line endings', () => {
	it('keeps CRLF and changes only the featured line (many old events are CRLF)', () => {
		const raw = '---\r\ntitle: A\r\nfeatured: viejo.webp\r\n# logo: 2\r\n---\r\nTexto\r\n';
		expect(setFeatured(raw, 'viejo.jpg')).toBe(raw.replace('viejo.webp', 'viejo.jpg'));
	});
});
