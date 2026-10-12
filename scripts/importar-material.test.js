/**
 * scripts/importar-material.js y src/lib/server/contenido/importarMaterial.js: un paquete
 * inventado chiquito en una carpeta temporal, contra el D1 y el R2 de miniflare.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestDB } from '$lib/server/db/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import { solidPng } from '$lib/server/media/testing.js';
import { listRevisions } from '$lib/server/contenido/revisions.js';
import {
	dateFromNotes,
	importMaterialPackage,
	matchProfile,
	matchTag,
	packagePath
} from '$lib/server/contenido/importarMaterial.js';
import { formatSummary, parseArgs, readPackageDir } from './importar-material.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** Un WebP mínimo (cabecera VP8X de 4×3): lo que mira sniff.js. */
function tinyWebp() {
	const b = new Uint8Array(30);
	const enc = new TextEncoder();
	b.set(enc.encode('RIFF'), 0);
	new DataView(b.buffer).setUint32(4, 22, true);
	b.set(enc.encode('WEBPVP8X'), 8);
	new DataView(b.buffer).setUint32(16, 10, true);
	b.set([3, 0, 0], 24); // ancho - 1
	b.set([2, 0, 0], 27); // alto - 1
	return b;
}

const BODY_UNO =
	'**Un texto inventado.** Con un erorr de tipeo a propósito.\n\n- uno\n- dos\n\n> cita inventada';

describe('funciones puras', () => {
	it('packagePath: barras de Windows o normales; nada fuera del paquete', () => {
		expect(packagePath('imagenes\\guia-x\\01.webp')).toBe('imagenes/guia-x/01.webp');
		expect(packagePath('./imagenes/guia-x/01.webp')).toBe('imagenes/guia-x/01.webp');
		expect(packagePath('..\\fuera.webp')).toBeNull();
		expect(packagePath('C:\\x\\y.webp')).toBeNull();
		expect(packagePath('')).toBeNull();
	});

	it('dateFromNotes: la línea «Fuente», o la sección «Fuentes» (la más vieja)', () => {
		expect(
			dateFromNotes('# Notas\n\n- **Fuente:** https://ejemplo.test/p/abc/ (2023-04-05, 3 slides)\n')
		).toEqual({ date: '2023-04-05', sources: 1 });
		expect(
			dateFromNotes('- **Fuente:** https://ejemplo.test/p/abc/ (carrusel, 2021-01-02). Más.')
		).toEqual({ date: '2021-01-02', sources: 1 });
		expect(
			dateFromNotes(
				[
					'# Notas',
					'## Fuentes (2 posts)',
					'',
					'1. https://ejemplo.test/p/b/ (2025-06-01, 1 de 3): "algo".',
					'2. https://ejemplo.test/p/a/ (2024-02-03, 1 de 7): "otro".',
					'',
					'## Dudas (2026-10-11)',
					'- algo'
				].join('\n')
			)
		).toEqual({ date: '2024-02-03', sources: 2 });
		expect(dateFromNotes('# Notas\n\nSin fuentes (2026-10-11).')).toBeNull();
	});

	it('matchProfile y matchTag: por dirección, nombre o key, sin tildes ni mayúsculas', () => {
		const profiles = [
			{ slug: 'persona-inventada', title: 'Persona Inventada', visibility: 'public' },
			{ slug: 'otra-a', title: 'Repetide', visibility: 'public' },
			{ slug: 'otra-b', title: 'Repetide', visibility: 'public' }
		];
		expect(matchProfile('Persona_Inventada', profiles).profile?.slug).toBe('persona-inventada');
		expect(matchProfile('persona inventada', profiles).profile?.slug).toBe('persona-inventada');
		expect(matchProfile('Repetide', profiles)).toEqual({ profile: null, ambiguous: true });
		expect(matchProfile('Nadie', profiles)).toEqual({ profile: null, ambiguous: false });
		expect(matchTag('articulo', ['artículo', 'web'])).toBe('artículo');
		expect(matchTag('web', ['artículo', 'web'])).toBe('web');
		expect(matchTag('nada', ['artículo'])).toBeNull();
	});

	it('parseArgs: --fecha=original por defecto; errores de uso', () => {
		expect(parseArgs(['--paquete=x'])).toEqual({
			paquete: 'x',
			target: 'local',
			dryRun: false,
			yes: false,
			fecha: 'original'
		});
		expect(parseArgs(['--paquete=x', '--fecha=hoy', '--target=production', '--dry'])).toMatchObject(
			{ fecha: 'hoy', target: 'production', dryRun: true }
		);
		expect(() => parseArgs([])).toThrow(/--paquete/);
		expect(() => parseArgs(['--paquete=x', '--target=prod'])).toThrow(/--target/);
		expect(() => parseArgs(['--paquete=x', '--fecha=ayer'])).toThrow(/--fecha/);
	});
});

describe('importMaterialPackage (paquete inventado)', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	/** @type {string} */
	let dir;
	const NOW = Date.UTC(2030, 4, 20, 15);
	const bucket = () => /** @type {import('@cloudflare/workers-types').R2Bucket} */ (t.env.MEDIA);

	beforeAll(async () => {
		t = await createTestDB();
		await makeProfile(t.db, { title: 'Persona Inventada', slug: 'persona-inventada' });
		for (const key of ['español', 'artículo', 'BDSM Inventado']) {
			await saveObject(
				t.db,
				{
					type: 'etiqueta',
					title: key,
					slug: key
						.normalize('NFD')
						.replace(/[\u0300-\u036f]/g, '')
						.toLowerCase()
						.replace(/\s+/g, '-'),
					data: { key }
				},
				{ actor: 'admin-inventade' }
			);
		}

		dir = await mkdtemp(path.join(tmpdir(), 'kv-paquete-inventado-'));
		const manifest = {
			version: 1,
			generado: '2030-05-01T00:00:00.000Z',
			articulos: [
				{
					slug: 'guia-inventada-uno',
					title: 'Guía inventada uno',
					summary: 'Un resumen inventado',
					tags: ['español', 'articulo', 'Etiqueta Que No Existe'],
					authors: ['Persona_Inventada', 'Alguien Sin Perfil'],
					body: BODY_UNO,
					portada: { archivo: 'imagenes\\guia-inventada-uno\\01.webp', alt: 'Un cuadrado violeta' },
					notas: 'borradores\\guia-inventada-uno.notas.md',
					importar: true
				},
				{
					slug: 'guia-inventada-dos',
					title: 'Guía inventada dos',
					summary: '',
					tags: ['BDSM Inventado'],
					authors: ['Persona Inventada'],
					body: 'Texto dos.\n',
					fecha: '2022-08-09',
					portada: { archivo: 'imagenes/guia-inventada-dos/01.png', alt: 'Un cuadrado' },
					notas: 'borradores/guia-inventada-dos.notas.md',
					importar: true
				},
				{
					slug: 'guia-inventada-sin-fecha',
					title: 'Guía inventada sin fecha',
					tags: ['español'],
					authors: ['Persona Inventada'],
					body: 'Texto tres.',
					portada: { archivo: 'imagenes/no-esta.webp', alt: 'x' },
					importar: true
				},
				{
					slug: 'guia-inventada-sin-permiso',
					title: 'Guía inventada sin permiso',
					tags: ['español'],
					authors: ['Persona Inventada'],
					body: 'No se carga.',
					importar: false
				}
			]
		};
		await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
		// Como deja un zip de Windows descomprimido en Linux: las barras en el nombre del archivo.
		await writeFile(path.join(dir, 'imagenes\\guia-inventada-uno\\01.webp'), tinyWebp());
		await writeFile(
			path.join(dir, 'borradores\\guia-inventada-uno.notas.md'),
			'# Notas inventadas\n\n- **Fuente:** https://ejemplo.test/p/inventado/ (2024-03-15, 1 de 2)\n'
		);
		// Y con carpetas de verdad.
		await mkdir(path.join(dir, 'imagenes', 'guia-inventada-dos'), { recursive: true });
		await writeFile(path.join(dir, 'imagenes', 'guia-inventada-dos', '01.png'), solidPng(4, 4));
	});
	afterAll(async () => {
		await t?.dispose();
		if (dir) await rm(dir, { recursive: true, force: true });
	});

	/** @param {string} slug */
	const stored = async (slug) =>
		/** @type {any} */ (
			await t.db
				.prepare(
					`SELECT id, title, data, visibility, deleted_at FROM objects WHERE type = 'material' AND slug = ?1`
				)
				.bind(slug)
				.first()
		);
	/** @param {number} id @param {string} kind */
	const edgesOf = async (id, kind) =>
		(
			await t.db
				.prepare(
					`SELECT o.slug, o.type, o.data AS odata, e.data FROM edges e JOIN objects o ON o.id = e.to_id
					WHERE e.from_id = ?1 AND e.kind = ?2 ORDER BY e.position`
				)
				.bind(id, kind)
				.all()
		).results.map((/** @type {any} */ r) => r);

	it('con --dry no escribe nada, y dice qué haría', async () => {
		const pkg = await readPackageDir(dir);
		const s = await importMaterialPackage(t.db, bucket(), pkg, { dryRun: true, now: NOW });
		expect(s.created.map((c) => c.slug)).toEqual([
			'guia-inventada-uno',
			'guia-inventada-dos',
			'guia-inventada-sin-fecha'
		]);
		expect(await stored('guia-inventada-uno')).toBeNull();
		const images = await t.db
			.prepare(`SELECT COUNT(*) AS n FROM objects WHERE type = 'imagen'`)
			.first();
		expect(images?.n).toBe(0);
	});

	it('crea el material no listado, con el texto exacto, autores, etiquetas y portada', async () => {
		const pkg = await readPackageDir(dir);
		const s = await importMaterialPackage(t.db, bucket(), pkg, { now: NOW });
		expect(s.problems).toEqual([]);
		expect(s.created.map((c) => c.slug)).toEqual([
			'guia-inventada-uno',
			'guia-inventada-dos',
			'guia-inventada-sin-fecha'
		]);
		expect(s.skipped).toEqual([
			{ slug: 'guia-inventada-sin-permiso', reason: expect.stringMatching(/importar/) }
		]);
		expect(await stored('guia-inventada-sin-permiso')).toBeNull();

		const uno = await stored('guia-inventada-uno');
		const data = JSON.parse(uno.data);
		expect(uno.title).toBe('Guía inventada uno');
		expect(uno.visibility).toBe('public');
		expect(data.unlisted).toBe(true);
		expect(data.body).toBe(BODY_UNO);
		expect(data.body_html).toBe('corta');
		// Fecha de las notas (la del post original).
		expect(data.published_date).toBe('2024-03-15Z-03:00');
		// El nombre sin perfil queda en `data.personas`; el perfil, como edge.
		expect(data.personas).toEqual([{ name: 'Alguien Sin Perfil', role: 'Autore' }]);
		const personas = await edgesOf(uno.id, 'persona');
		expect(personas.map((e) => [e.slug, JSON.parse(e.data)])).toEqual([
			['persona-inventada', { roles: ['Autore'], at: [0] }]
		]);
		// Las etiquetas que existen, como edges (con su key); la que no, como texto (no se crea).
		const tags = await edgesOf(uno.id, 'etiqueta');
		expect(tags.map((e) => JSON.parse(e.odata).key)).toEqual(['español', 'artículo']);
		expect(data.tags).toEqual(['Etiqueta Que No Existe']);
		const noTag = await t.db
			.prepare(
				`SELECT 1 AS x FROM objects WHERE type = 'etiqueta' AND json_extract(data, '$.key') = ?1`
			)
			.bind('Etiqueta Que No Existe')
			.first();
		expect(noTag).toBeNull();
		// La portada (WebP) en la biblioteca con su alt, unida con `portada`.
		const portada = await edgesOf(uno.id, 'portada');
		expect(portada).toHaveLength(1);
		expect(portada[0].type).toBe('imagen');
		const img = JSON.parse(portada[0].odata);
		expect(img).toMatchObject({ mime: 'image/webp', alt: 'Un cuadrado violeta' });
		expect(await bucket().head(img.key)).not.toBeNull();
		// El historial dice quién lo cargó.
		const revs = await listRevisions(t.db, uno.id);
		expect(revs[0]).toMatchObject({ savedBy: 'script:importar-material', source: 'import' });

		const notes = s.created[0].notes.join('\n');
		expect(notes).toMatch(/Etiqueta Que No Existe/);
		expect(notes).toMatch(/Alguien Sin Perfil/);

		// Fecha del manifiesto.
		const dos = JSON.parse((await stored('guia-inventada-dos')).data);
		expect(dos.published_date).toBe('2022-08-09Z-03:00');
		expect(dos.personas).toBeUndefined();
		// El salto de línea del final no es un cambio que haya que avisar.
		expect(dos.body).toBe('Texto dos.');
		expect(s.created[1].notes.join('\n')).not.toMatch(/líneas vacías/);

		// Sin fecha ni notas: hoy, y lo avisa. Sin el archivo de la portada: se crea sin portada.
		const tres = await stored('guia-inventada-sin-fecha');
		expect(JSON.parse(tres.data).published_date).toBe('2030-05-20Z-03:00');
		expect(await edgesOf(tres.id, 'portada')).toEqual([]);
		const tresNotes = s.created[2].notes.join('\n');
		expect(tresNotes).toMatch(/se usó la de hoy/);
		expect(tresNotes).toMatch(/no está la portada/);

		expect(formatSummary(s, { target: 'local', dryRun: false })).toMatch(
			/creados 3, salteados 1, con problemas 0/
		);
	});

	it('es idempotente: la segunda vez saltea todo y no toca nada', async () => {
		const before = await stored('guia-inventada-uno');
		const pkg = await readPackageDir(dir);
		const s = await importMaterialPackage(t.db, bucket(), pkg, { now: NOW + 1000 });
		expect(s.created).toEqual([]);
		expect(s.problems).toEqual([]);
		expect(s.skipped.map((k) => k.slug).sort()).toEqual([
			'guia-inventada-dos',
			'guia-inventada-sin-fecha',
			'guia-inventada-sin-permiso',
			'guia-inventada-uno'
		]);
		expect(await stored('guia-inventada-uno')).toEqual(before);
		const n = await t.db
			.prepare(`SELECT COUNT(*) AS n FROM objects WHERE type = 'material'`)
			.first();
		expect(n?.n).toBe(3);
	});

	it('--fecha=hoy usa la fecha de hoy aunque haya original', async () => {
		const pkg = {
			articles: [
				{
					slug: 'guia-inventada-hoy',
					title: 'Guía inventada hoy',
					tags: ['español'],
					authors: ['Persona Inventada'],
					body: '\n\nHoy.  ',
					fecha: '2020-01-01',
					importar: true
				}
			],
			readFile: async () => null
		};
		const s = await importMaterialPackage(t.db, bucket(), pkg, { fecha: 'hoy', now: NOW });
		expect(s.problems).toEqual([]);
		const d = JSON.parse((await stored('guia-inventada-hoy')).data);
		expect(d.published_date).toBe('2030-05-20Z-03:00');
		// Lo que el guardado del panel recorta, se avisa.
		expect(d.body).toBe('Hoy.');
		expect(s.created[0].notes.join('\n')).toMatch(/líneas vacías/);
	});

	it('lo que no se puede cargar queda en problemas, y sigue con lo demás', async () => {
		const pkg = {
			articles: [
				{
					slug: 'Dirección Mala',
					title: 'x',
					tags: ['español'],
					authors: ['x'],
					body: 'x',
					importar: true
				},
				{
					slug: 'guia-inventada-sin-autores',
					title: 'x',
					tags: ['español'],
					body: 'x',
					importar: true
				},
				{
					slug: 'guia-inventada-ok',
					title: 'Ok',
					tags: ['español'],
					authors: ['Persona Inventada'],
					body: 'Ok.',
					importar: true
				}
			],
			readFile: async () => null
		};
		const s = await importMaterialPackage(t.db, bucket(), pkg, { now: NOW });
		expect(s.problems.map((p) => p.slug)).toEqual(['Dirección Mala', 'guia-inventada-sin-autores']);
		expect(s.created.map((c) => c.slug)).toEqual(['guia-inventada-ok']);
	});
});
