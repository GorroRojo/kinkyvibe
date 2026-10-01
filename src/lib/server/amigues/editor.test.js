/**
 * Editor de perfiles del panel: guarda en la base al toque, con control de versión (el conflicto
 * no guarda nada y dice qué cambió), cambiar de tipo saca lo que el tipo nuevo no tiene, y lo que
 * crea une admin nace aprobado. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	changedFields,
	createProfileFromPanel,
	emptyFormValues,
	formToData,
	loadEditableProfile,
	parseCoordinate,
	parseList,
	profileFormValues,
	saveProfileFromPanel
} from './editor.js';
import { importAmigues } from './importer.js';
import { isApproved } from './profiles.js';
import { makeProfile, readAmigueFiles } from './testing.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});
beforeEach(async () => {
	await resetDB(t.db);
});

describe('del formulario a los datos', () => {
	it('listas, coordenadas y campos que el editor no toca', () => {
		expect(parseList('tags', 'shibari, BDSM\narte')).toEqual(['shibari', 'BDSM', 'arte']);
		expect(parseList('links', 'https://a.example/x,y\nhttps://b.example')).toEqual([
			'https://a.example/x,y',
			'https://b.example'
		]);
		expect(parseCoordinate('-34,6037')).toBe(-34.6037);
		expect(parseCoordinate('')).toBeUndefined();
		expect(parseCoordinate('no')).toBe('no');
		const values = emptyFormValues('persona');
		values.title = 'X';
		values.text.bio = 'Hola';
		values.lists.tags = 'a, b';
		const data = formToData(values, { featured: '1', published_date: '2024-01-01Z-03:00' });
		expect(data).toEqual({
			kind: 'persona',
			featured: '1',
			published_date: '2024-01-01Z-03:00',
			bio: 'Hola',
			tags: ['a', 'b']
		});
	});

	it('cambiar de tipo saca los campos que el tipo nuevo no tiene', () => {
		const values = emptyFormValues('lugar');
		values.text.address = 'Calle Inventada 1';
		values.lat = '-34';
		values.lng = '-58';
		values.show_members = true;
		expect(formToData(values)).toMatchObject({
			kind: 'lugar',
			address: 'Calle Inventada 1',
			lat: -34
		});
		expect(formToData({ ...values, kind: 'persona' })).toEqual({ kind: 'persona' });
		expect(formToData({ ...values, kind: 'grupo' })).toEqual({ kind: 'grupo', show_members: true });
	});

	it('dice qué campos cambiaron', () => {
		const a = emptyFormValues();
		const b = structuredClone(a);
		b.title = 'Otro';
		b.text.bio = 'Distinta';
		b.lists.tags = 'x';
		expect(changedFields(a, b).sort()).toEqual(['bio', 'tags', 'title']);
	});
});

describe('guardar en la base', () => {
	it('publica al toque y sube la versión', async () => {
		const p = await makeProfile(t.db, { title: 'Perfil Inventado', data: { bio: 'Vieja' } });
		const values = profileFormValues(p);
		values.text.bio = 'Nueva presentación';
		const r = await saveProfileFromPanel(t.db, p, values, { actor: 'admin-de-prueba' });
		expect(r.ok).toBe(true);
		const fresh = await loadEditableProfile(t.db, p.slug);
		expect(fresh?.object).toMatchObject({ version: 2, data: { bio: 'Nueva presentación' } });
	});

	it('si alguien guardó en el medio: no guarda nada y muestra qué cambió', async () => {
		const p = await makeProfile(t.db, { title: 'Perfil Inventado', data: { bio: 'Original' } });
		const mine = profileFormValues(p);
		const theirs = profileFormValues(p);
		theirs.text.bio = 'Lo de otre admin';
		expect((await saveProfileFromPanel(t.db, p, theirs, { actor: 'otre' })).ok).toBe(true);
		mine.text.bio = 'Lo mío';
		mine.title = 'Mi título';
		const r = await saveProfileFromPanel(t.db, p, mine, { actor: 'yo' });
		expect(r).toMatchObject({ ok: false, status: 409 });
		const conflict = /** @type {any} */ (r).conflict;
		expect(conflict.version).toBe(2);
		expect(conflict.changes).toEqual(
			expect.arrayContaining([
				{ field: 'bio', label: 'Presentación', theirs: 'Lo de otre admin' },
				{ field: 'title', label: 'Nombre', theirs: 'Perfil Inventado' }
			])
		);
		const fresh = await loadEditableProfile(t.db, p.slug);
		expect(fresh?.object.data.bio).toBe('Lo de otre admin');
		expect(fresh?.object.title).toBe('Perfil Inventado');
		// Con la versión nueva (la del aviso), se guarda encima a propósito.
		const again = await saveProfileFromPanel(
			t.db,
			/** @type {any} */ (fresh).object,
			{ ...mine, version: conflict.version },
			{ actor: 'yo' }
		);
		expect(again.ok).toBe(true);
	});

	it('los errores del tipo vuelven por campo', async () => {
		const p = await makeProfile(t.db, { title: 'Perfil Inventado' });
		const values = profileFormValues(p);
		values.lists.links = 'javascript:alert(1)';
		const r = await saveProfileFromPanel(t.db, p, values, { actor: 'a' });
		expect(r).toMatchObject({ ok: false, status: 400 });
		expect(/** @type {any} */ (r).errors.links).toMatch(/Links/);
		const bad = { ...profileFormValues(p), kind: 'cualquiera' };
		expect(await saveProfileFromPanel(t.db, p, bad, { actor: 'a' })).toMatchObject({ ok: false });
	});

	it('lo que crea une admin (un lugar) nace aprobado', async () => {
		const values = emptyFormValues('lugar');
		values.title = 'Lugar Nuevo Inventado';
		values.venue_privacy = 'area';
		const r = await createProfileFromPanel(t.db, values, { actor: 'admin-de-prueba' });
		expect(r.ok).toBe(true);
		const profile = /** @type {any} */ (r).profile;
		expect(profile).toMatchObject({
			slug: 'lugar-nuevo-inventado',
			data: { kind: 'lugar', venue_privacy: 'area' }
		});
		expect(await isApproved(t.db, profile.id)).toBe(true);
		// Mismo nombre: otra dirección, sin pisar.
		const twin = await createProfileFromPanel(t.db, values, { actor: 'admin-de-prueba' });
		expect(/** @type {any} */ (twin).profile.slug).not.toBe('lugar-nuevo-inventado');
	});

	it('una ficha importada se abre por su dirección vieja y conserva sus imágenes al editar', async () => {
		await importAmigues(t.db, await readAmigueFiles(), { actor: 'admin-de-prueba' });
		const found = await loadEditableProfile(t.db, 'Gorro_Rojo');
		expect(found?.legacySlug).toBe('Gorro_Rojo');
		expect(found?.source).toMatchObject({ legacySlug: 'Gorro_Rojo', confirmedAt: null });
		const values = profileFormValues(/** @type {any} */ (found).object);
		values.text.bio = 'Presentación editada en el panel';
		const r = await saveProfileFromPanel(t.db, /** @type {any} */ (found).object, values, {
			actor: 'admin-de-prueba'
		});
		expect(r.ok).toBe(true);
		const after = await loadEditableProfile(t.db, 'Gorro_Rojo');
		expect(after?.object.data).toMatchObject({
			bio: 'Presentación editada en el panel',
			featured: '1',
			logo: '1',
			published_date: '2000-08-04Z-03:00'
		});
	});
});
