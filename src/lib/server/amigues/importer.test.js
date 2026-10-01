/**
 * Importación de las fichas de amigues: sobre las 31 fichas REALES del repo (públicas a
 * propósito), en una base de prueba (D1 de miniflare). Fidelidad campo por campo contra dos
 * fuentes independientes (lo que compila mdsvex para la página de hoy y el texto del archivo),
 * idempotencia, que no pisa ni revive lo que se tocó en el panel, y las direcciones viejas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	importAmigues,
	isImportable,
	mdToProfile,
	normalizeBody,
	splitMarkdown,
	summarizeImport
} from './importer.js';
import { classifyAmigue, mainPronouns } from './classify.js';
import { readAmigueFiles } from './testing.js';
import { resolveProfileSlug } from './profiles.js';
import { saveObject } from '../objects/save.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** Lo que compila mdsvex de cada ficha (la página de hoy muestra esto). */
const mdsvexMeta = /** @type {Record<string, Record<string, any>>} */ (
	import.meta.glob('/src/lib/posts/amigues/*.md', { import: 'metadata', eager: true })
);

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {{ legacySlug: string, raw: string }[]} */
let files;
beforeAll(async () => {
	t = await createTestDB();
	files = await readAmigueFiles();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

const ACTOR = 'admin-de-prueba';
const real = () => files.filter((f) => isImportable(f.legacySlug));

/**
 * El valor de una clave del frontmatter tal como está escrito en el archivo (línea sin comentar),
 * sin comillas: una lectura independiente del parser de YAML.
 * @param {string} raw
 * @param {string} key
 */
function rawValue(raw, key) {
	const { frontmatter } = splitMarkdown(raw);
	const m = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
	if (!m) return undefined;
	const v = m[1].trim();
	return v.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
}

/** @param {number} id */
async function objectRow(id) {
	return t.db.prepare('SELECT * FROM objects WHERE id = ?1').bind(id).first();
}

describe('las fichas del repo', () => {
	it('son 31 (más la plantilla, que no se importa)', () => {
		expect(files.length).toBe(32);
		expect(real().length).toBe(31);
		expect(files.some((f) => f.legacySlug === '_profile_template')).toBe(true);
		expect(isImportable('_profile_template')).toBe(false);
	});
});

describe('clasificación', () => {
	it('propone persona, grupo o lugar con razones legibles', () => {
		expect(
			classifyAmigue(
				{
					summary: 'Somos una cooperativa',
					authors: ['A', 'B'],
					pronoun: 'https://pronombr.es/elles'
				},
				'X'
			)
		).toMatchObject({ kind: 'grupo' });
		expect(
			classifyAmigue(
				{ summary: 'Soy ilustradora', authors: ['Yo'], gender_identity: 'mujer', pronoun: 'ella' },
				'Yo'
			)
		).toMatchObject({ kind: 'persona' });
		const venue = classifyAmigue(
			{ title: 'Centro cultural inventado', summary: 'Un espacio', tags: ['lugar'] },
			'Centro'
		);
		expect(venue.kind).toBe('lugar');
		expect(venue.reasons.join(' ')).toMatch(/lugar/);
		expect(classifyAmigue({ location: 'Calle Falsa 123' }, 'x').kind).toBe('lugar');
		expect(classifyAmigue({}, 'x').reasons.length).toBeGreaterThan(0);
	});

	it('lee los pronombres de pronombr.es', () => {
		expect(mainPronouns('https://pronombr.es/elle&ella')).toEqual(['elle', 'ella']);
		expect(mainPronouns('https://pronombr.es/elles,les,les,unes')).toEqual(['elles']);
		expect(mainPronouns('https://pronombr.es/evitar')).toEqual([]);
		expect(mainPronouns('')).toEqual([]);
	});

	it('la tabla de las fichas reales (lo que se le muestra a gorrite para confirmar)', () => {
		/** @type {Record<string, string[]>} */
		const byKind = { persona: [], grupo: [], lugar: [] };
		for (const f of real()) byKind[mdToProfile(f.legacySlug, f.raw).suggested].push(f.legacySlug);
		expect(byKind.grupo.sort()).toEqual(
			[
				'AUCH',
				'CanelaProducciones',
				'CarreradeReyes',
				'EroticasFluidas',
				'FugasCriticas',
				'KinkyBunny',
				'KinkyVibe',
				'MiPiezaAccionGrafica',
				'PsicoDisidentes',
				'la.colectiver',
				'silskinTOYS'
			].sort()
		);
		expect(byKind.lugar).toEqual([]);
		expect(byKind.persona.length).toBe(20);
	});
});

describe('importar las 31 fichas reales', () => {
	it('crea un perfil por ficha, aprobado, con su dirección vieja y "a confirmar"', async () => {
		const results = await importAmigues(t.db, files, { actor: ACTOR, now: 1000 });
		expect(summarizeImport(results)).toMatchObject({ created: 31, error: 0 });
		const n = await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'perfil'").first();
		expect(n?.n).toBe(31);
		const sources = await t.db.prepare('SELECT * FROM profile_sources').all();
		expect(sources.results.length).toBe(31);
		for (const s of sources.results) {
			expect(s.kind_confirmed_at).toBeNull();
			expect(String(s.kind_reason).length).toBeGreaterThan(0);
			expect(s.imported_version).toBe(1);
		}
		const approvals = await t.db
			.prepare("SELECT COUNT(*) AS n FROM profile_approvals WHERE approved_by = 'importacion'")
			.first();
		expect(approvals?.n).toBe(31);
		// Nada en "Para revisar": lo creó une admin, no una cuenta.
		const byAccount = await t.db
			.prepare("SELECT COUNT(*) AS n FROM objects WHERE created_by LIKE 'cuenta:%'")
			.first();
		expect(byAccount?.n).toBe(0);
	});

	it('fidelidad: cada campo de cada ficha queda igual (contra mdsvex y contra el texto)', async () => {
		const results = await importAmigues(t.db, files, { actor: ACTOR });
		for (const f of real()) {
			const r = results.find((x) => x.legacySlug === f.legacySlug);
			expect(r?.action, f.legacySlug).toBe('created');
			const row = await objectRow(/** @type {number} */ (r?.profileId));
			const data = JSON.parse(String(row?.data));
			const meta = mdsvexMeta[`/src/lib/posts/amigues/${f.legacySlug}.md`];
			const ctx = `ficha ${f.legacySlug}`;

			// Contra lo que compila mdsvex (lo que muestra hoy la página).
			expect(row?.title, ctx).toBe(String(meta.title));
			expect(data.bio ?? '', ctx).toBe(String(meta.summary ?? '').trim());
			const pronoun = String(meta.pronoun ?? '');
			if (pronoun.startsWith('http')) expect(data.pronouns_url, ctx).toBe(pronoun);
			else if (pronoun) expect(data.pronouns, ctx).toBe(pronoun);
			else expect(data.pronouns ?? data.pronouns_url, ctx).toBeUndefined();
			expect(data.links ?? [], ctx).toEqual(meta.link ? [String(meta.link)] : []);
			expect(data.link_text, ctx).toBe(meta.link_text ?? undefined);
			expect(data.tags ?? [], ctx).toEqual((meta.tags ?? []).map(String));
			expect(data.authors ?? [], ctx).toEqual((meta.authors ?? []).map(String));
			for (const key of ['email', 'gender_identity', 'job_title']) {
				expect(data[key], `${ctx}: ${key}`).toBe(meta[key] == null ? undefined : String(meta[key]));
			}
			expect(data.unlisted === true, ctx).toBe(Boolean(meta.force_unlisted));
			expect(row?.visibility, ctx).toBe(meta.force_unpublished ? 'hidden' : 'public');

			// Contra el texto del archivo (teléfonos, fechas e imágenes, exactamente como se escribieron).
			for (const key of [
				'tel',
				'bday',
				'published_date',
				'updated_date',
				'featured',
				'photo',
				'logo'
			]) {
				expect(data[key], `${ctx}: ${key}`).toBe(rawValue(f.raw, key) || undefined);
			}
			// El cuerpo, tal cual (sin las líneas vacías del principio ni el espacio del final).
			const body = normalizeBody(splitMarkdown(f.raw).body);
			expect(data.body ?? '', `${ctx}: cuerpo`).toBe(body);
			expect(['persona', 'grupo', 'lugar'], ctx).toContain(data.kind);
		}
	});

	it('las direcciones no cambian: /amigues/<ficha> lleva a su perfil', async () => {
		await importAmigues(t.db, files, { actor: ACTOR });
		for (const f of real()) {
			const ref = await resolveProfileSlug(t.db, f.legacySlug);
			expect(ref, f.legacySlug).not.toBeNull();
			expect(ref?.legacySlug).toBe(f.legacySlug);
			const row = await objectRow(/** @type {number} */ (ref?.id));
			const meta = mdsvexMeta[`/src/lib/posts/amigues/${f.legacySlug}.md`];
			expect(row?.title).toBe(String(meta.title));
		}
		// Las mayúsculas cuentan, como en los .md (/amigues/gorro_rojo da 404 hoy).
		expect(await resolveProfileSlug(t.db, 'gorro_rojo')).toBeNull();
		expect(await resolveProfileSlug(t.db, '_profile_template')).toBeNull();
	});

	it('es idempotente: la segunda vez no cambia nada', async () => {
		await importAmigues(t.db, files, { actor: ACTOR, now: 1 });
		const before = await t.db.prepare('SELECT id, version, data, updated_at FROM objects').all();
		const again = await importAmigues(t.db, files, { actor: ACTOR, now: 2 });
		expect(summarizeImport(again)).toMatchObject({ created: 0, updated: 0, unchanged: 31 });
		const after = await t.db.prepare('SELECT id, version, data, updated_at FROM objects').all();
		expect(after.results).toEqual(before.results);
		const sources = await t.db.prepare('SELECT COUNT(*) AS n FROM profile_sources').first();
		expect(sources?.n).toBe(31);
	});

	it('la vista previa (dryRun) no escribe nada', async () => {
		const preview = await importAmigues(t.db, files, { actor: ACTOR, dryRun: true });
		expect(summarizeImport(preview).created).toBe(31);
		const n = await t.db.prepare('SELECT COUNT(*) AS n FROM objects').first();
		expect(n?.n).toBe(0);
	});
});

describe('volver a importar después de cambios', () => {
	/** @param {string} legacySlug @param {(raw: string) => string} change */
	const withChange = (legacySlug, change) =>
		files.map((f) => (f.legacySlug === legacySlug ? { ...f, raw: change(f.raw) } : f));

	it('si el .md cambió y el perfil no se tocó, lo actualiza', async () => {
		await importAmigues(t.db, files, { actor: ACTOR });
		const changed = withChange('Yuyo', (raw) =>
			raw.replace('Soy tatuador', 'Soy tatuador inventado')
		);
		const r = await importAmigues(t.db, changed, { actor: ACTOR });
		expect(summarizeImport(r)).toMatchObject({ updated: 1, unchanged: 30 });
		const ref = await resolveProfileSlug(t.db, 'Yuyo');
		const row = await objectRow(/** @type {number} */ (ref?.id));
		expect(JSON.parse(String(row?.data)).bio).toMatch(/^Soy tatuador inventado/);
		expect(row?.version).toBe(2);
		// Y la vez siguiente, sin cambios.
		const third = await importAmigues(t.db, changed, { actor: ACTOR });
		expect(summarizeImport(third).unchanged).toBe(31);
	});

	it('si el perfil se editó en el panel, no lo pisa', async () => {
		await importAmigues(t.db, files, { actor: ACTOR });
		const ref = await resolveProfileSlug(t.db, 'Drux');
		const row = await objectRow(/** @type {number} */ (ref?.id));
		await saveObject(
			t.db,
			{
				id: Number(row?.id),
				type: 'perfil',
				version: Number(row?.version),
				title: 'Nombre editado'
			},
			{ actor: 'otre-admin' }
		);
		const changed = withChange('Drux', (raw) => raw.replace('michi sadico', 'michi inventado'));
		const r = await importAmigues(t.db, changed, { actor: ACTOR });
		expect(r.find((x) => x.legacySlug === 'Drux')?.action).toBe('skipped_edited');
		const after = await objectRow(Number(row?.id));
		expect(after?.title).toBe('Nombre editado');
		expect(JSON.parse(String(after?.data)).bio).not.toMatch(/inventado/);
	});

	it('si el perfil se borró en el panel, no lo revive', async () => {
		await importAmigues(t.db, files, { actor: ACTOR });
		const ref = await resolveProfileSlug(t.db, 'Luzi');
		const row = await objectRow(/** @type {number} */ (ref?.id));
		await saveObject(
			t.db,
			{ id: Number(row?.id), type: 'perfil', version: Number(row?.version), deleted: true },
			{ actor: 'otre-admin' }
		);
		const r = await importAmigues(t.db, files, { actor: ACTOR });
		expect(r.find((x) => x.legacySlug === 'Luzi')?.action).toBe('skipped_deleted');
		expect((await objectRow(Number(row?.id)))?.deleted_at).not.toBeNull();
		const n = await t.db.prepare("SELECT COUNT(*) AS n FROM objects WHERE type = 'perfil'").first();
		expect(n?.n).toBe(31);
	});

	it('si la dirección nueva ya la usa otro perfil, suma "-amigue" (sin duplicar nada)', async () => {
		await saveObject(
			t.db,
			{ type: 'perfil', title: 'Otra persona', slug: 'yuyo', data: { kind: 'persona' } },
			{ actor: 'cuenta:00000000-0000-4000-8000-000000000000' }
		);
		const r = await importAmigues(t.db, files, { actor: ACTOR });
		const yuyo = r.find((x) => x.legacySlug === 'Yuyo');
		expect(yuyo?.action).toBe('created');
		expect(yuyo?.slug).toBe('yuyo-amigue');
		expect((await resolveProfileSlug(t.db, 'Yuyo'))?.id).toBe(yuyo?.profileId);
		// La dirección nueva del otro perfil sigue llevando a ese perfil.
		expect((await resolveProfileSlug(t.db, 'yuyo'))?.id).not.toBe(yuyo?.profileId);
	});

	it('una ficha con problemas informa el error y no frena las demás', async () => {
		const broken = [...files, { legacySlug: 'Rota', raw: '---\ntitle: [sin cerrar\n---\n' }];
		const r = await importAmigues(t.db, broken, { actor: ACTOR });
		expect(r.find((x) => x.legacySlug === 'Rota')?.action).toBe('error');
		expect(summarizeImport(r).created).toBe(31);
	});
});
