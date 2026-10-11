/**
 * El paso que saca del repo los PDF, video y documentos del material (./archivosViejos.js,
 * scripts/subir-archivos.js): contra el D1 y el R2 de miniflare, con un material y un PDF
 * inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { fakePdf } from './testing.js';
import { sha256Hex } from './sniff.js';
import { inlineFileImports, legacyFileImports, uploadRepoFiles } from './archivosViejos.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BODY = [
	'<script>',
	"  import foto from './media/guia-inventada/1.webp'",
	"  import guia from '$lib/posts/material/media/guia-inventada/1.pdf'",
	'</script>',
	'',
	'![una foto]({foto})',
	'',
	'<a class="cta" href={guia}>Ir al pdf</a>'
].join('\n');

describe('legacyFileImports / inlineFileImports', () => {
	it('encuentra solo los archivos que no son imágenes', () => {
		expect(legacyFileImports(BODY)).toEqual([
			{ name: 'guia', folder: 'guia-inventada', file: '1.pdf' }
		]);
	});

	it('nombra el archivo por su dirección y saca su import; la imagen queda como estaba', () => {
		const r = inlineFileImports(BODY, (folder, file) =>
			folder === 'guia-inventada' && file === '1.pdf' ? '/media/file/abc.pdf' : undefined
		);
		expect(r.replaced).toEqual(['guia-inventada/1.pdf']);
		expect(r.missing).toEqual([]);
		expect(r.body).toContain('href="/media/file/abc.pdf"');
		expect(r.body).not.toContain('1.pdf');
		expect(r.body).toContain("import foto from './media/guia-inventada/1.webp'");
		expect(r.body).toContain('{foto}');
	});

	it('sin dirección conocida no toca nada y lo dice; un `<script>` vacío se saca', () => {
		expect(inlineFileImports(BODY, () => undefined)).toMatchObject({
			body: BODY,
			missing: ['guia-inventada/1.pdf']
		});
		const solo = "<script>\n  import g from './media/x/1.odt'\n</script>\n<a href={g}>Bajar</a>";
		expect(inlineFileImports(solo, () => '/media/file/x.odt').body).toBe(
			'<a href="/media/file/x.odt">Bajar</a>'
		);
	});
});

describe('uploadRepoFiles', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	const pdf = fakePdf(500);
	const files = [{ category: 'material', folder: 'guia-inventada', file: '1.pdf', bytes: pdf }];
	const bucket = () => /** @type {import('@cloudflare/workers-types').R2Bucket} */ (t.env.MEDIA);

	beforeAll(async () => {
		t = await createTestDB();
		await seedPosts(t.db, [
			{
				meta: { postID: 'guia-inventada', category: 'material', title: 'Guía inventada' },
				body: BODY
			}
		]);
	});
	afterAll(async () => {
		await t?.dispose();
	});

	/** @returns {Promise<{ body: string, version: number }>} */
	async function material() {
		const row = await t.db
			.prepare(
				"SELECT data, version FROM objects WHERE type = 'material' AND slug = 'guia-inventada'"
			)
			.first();
		return { body: JSON.parse(String(row?.data)).body, version: Number(row?.version) };
	}

	it('con dryRun dice qué haría y no escribe nada', async () => {
		const before = await material();
		const s = await uploadRepoFiles(t.db, bucket(), { files, actor: 'prueba', dryRun: true });
		expect(s).toMatchObject({ files: 1, newFiles: 1, knownFiles: 0, errors: [] });
		expect(s.texts).toEqual([
			{ slug: 'guia-inventada', replaced: ['guia-inventada/1.pdf'], missing: [] }
		]);
		expect(await material()).toEqual(before);
		const n = await t.db
			.prepare("SELECT count(*) AS n FROM objects WHERE type = 'archivo'")
			.first();
		expect(n?.n).toBe(0);
	});

	it('sube el archivo (con su ruta vieja) y reescribe el texto, con historial y edge `adjunto`', async () => {
		const before = await material();
		const s = await uploadRepoFiles(t.db, bucket(), { files, actor: 'prueba' });
		expect(s.errors).toEqual([]);
		const hash = await sha256Hex(pdf);
		const key = `file/${hash}.pdf`;
		expect(await bucket().head(key)).toBeTruthy();
		const archivo = await t.db
			.prepare("SELECT id, data FROM objects WHERE type = 'archivo' AND slug = ?1")
			.bind(hash)
			.first();
		expect(JSON.parse(String(archivo?.data)).source_path).toBe(
			'src/lib/posts/material/media/guia-inventada/1.pdf'
		);
		const after = await material();
		expect(after.version).toBe(before.version + 1);
		expect(after.body).toContain(`href="/media/${key}"`);
		expect(after.body).not.toContain('1.pdf');
		const edge = await t.db
			.prepare(
				`SELECT 1 AS x FROM edges e JOIN objects o ON o.id = e.from_id
				WHERE o.slug = 'guia-inventada' AND e.kind = 'adjunto' AND e.to_id = ?1`
			)
			.bind(Number(archivo?.id))
			.first();
		expect(edge).toBeTruthy();
		const rev = await t.db
			.prepare(
				`SELECT source FROM object_revisions r JOIN objects o ON o.id = r.object_id
				WHERE o.slug = 'guia-inventada' AND r.version = ?1`
			)
			.bind(after.version)
			.first();
		expect(rev?.source).toBe('migracion');
	});

	it('otra vez no cambia nada', async () => {
		const before = await material();
		const s = await uploadRepoFiles(t.db, bucket(), { files, actor: 'prueba' });
		expect(s).toMatchObject({ newFiles: 0, knownFiles: 1, texts: [], errors: [] });
		expect(await material()).toEqual(before);
	});
});
