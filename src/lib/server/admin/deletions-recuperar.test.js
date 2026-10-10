/**
 * «Recuperar» (Actividad) para etiquetas, series y el texto propio de un mail de un evento
 * (decisión 0030): borrar deja la fila en `panel_deletions` en la misma tanda, y «Recuperar» lo
 * vuelve a poner. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { deletionLabel } from '$lib/admin/deleteText.js';
import { saveObject } from '$lib/server/objects/save.js';
import { TAG_TYPE } from '$lib/server/objects/types/etiqueta.js';
import { importTags } from '$lib/server/etiquetas/importer.js';
import { loadTagRecords } from '$lib/server/etiquetas/read.js';
import { saveTagOpsToDb, seriesIdsOf } from '$lib/server/etiquetas/panel.js';
import {
	deleteEventTemplateOverride,
	getEventTemplateOverride,
	listEventTemplateOverrides,
	saveEventTemplateOverride
} from '$lib/server/tickets/templates.js';
import { listAudit } from './audit.js';
import {
	UndoError,
	getDeletion,
	listRecoverable,
	tagDeletionStatement,
	tagIdOf,
	templateOf,
	undoDeletion
} from './deletions.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ACTOR = 'admin-de-prueba';
const ADMIN = /** @type {const} */ ({ role: 'admin', id: ACTOR });
const actor = { login: ACTOR, name: 'Admin de Prueba', token: 'tok', locals: {} };
const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: { id: 1, login: ACTOR } })
);

/** Un cliente del repo que no se tiene que usar nunca (todo esto vive en la base). */
const noRepo = /** @type {any} */ (
	new Proxy(
		{},
		{
			get(_target, key) {
				return () => {
					throw new Error(`no debería tocar el repo (${String(key)})`);
				};
			}
		}
	)
);

/** Un árbol chico e inventado. */
const RAW = [
	{ id: 'root', children: ['evento recurrente', 'prácticas'] },
	{ id: 'evento recurrente', children: ['Serie Inventada'] },
	{ id: 'Serie Inventada', icon: '🎬', aka: ['La Inventada'] },
	{ id: 'prácticas', children: ['ataduras'] },
	{ id: 'ataduras', aka: ['atar'], description: 'Atar con cuerdas.' }
];

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
	await importTags(t.db, { rawTags: structuredClone(RAW), wikiFiles: [] }, { actor: ACTOR });
});

const stored = () => loadTagRecords(t.db, ADMIN);

/** @param {string} key */
const byKey = async (key) => (await stored()).find((r) => r.key === key);

describe('etiquetas: sacar un alias deja «Recuperar»', () => {
	it('se borra (suave) con su fila en la misma tanda, y «Recuperar» la vuelve a poner', async () => {
		const atar = await byKey('atar');
		expect(atar?.aliasOf).toBe('ataduras');
		const res = await saveTagOpsToDb(
			{ db: t.db, records: await stored() },
			[{ type: 'removeAlias', id: 'ataduras', alias: 'atar' }],
			{ locals, login: ACTOR }
		);
		expect(res.ok).toBe(true);
		expect(await byKey('atar')).toBeUndefined();

		const [row] = await listRecoverable(t.db);
		expect(row).toMatchObject({ title: 'atar', status: 'borrado', deletedBy: ACTOR });
		expect(tagIdOf(row.path)).toBe(atar?.id);
		expect(deletionLabel(row)).toEqual({ label: 'Etiqueta', library: false });

		const r = await undoDeletion(noRepo, t.db, actor, row.id);
		expect(r).toMatchObject({ mode: 'restored', immediate: true });
		// Vuelve igual: alias de «ataduras» (su relación nunca se fue).
		expect((await byKey('atar'))?.aliasOf).toBe('ataduras');
		expect((await getDeletion(t.db, row.id))?.status).toBe('recuperado');
		expect(await listRecoverable(t.db)).toEqual([]);
		expect((await listAudit(t.db))[0]).toMatchObject({
			action: 'tags.restore',
			summary: 'Recuperó la etiqueta «atar»'
		});
		// Dos veces no.
		await expect(undoDeletion(noRepo, t.db, actor, row.id)).rejects.toThrow(UndoError);
	});

	it('no la recupera si mientras tanto se creó otra con el mismo nombre', async () => {
		await saveTagOpsToDb(
			{ db: t.db, records: await stored() },
			[{ type: 'removeAlias', id: 'ataduras', alias: 'atar' }],
			{ locals, login: ACTOR }
		);
		const [row] = await listRecoverable(t.db);
		await saveTagOpsToDb(
			{ db: t.db, records: await stored() },
			[{ type: 'create', id: 'atar', parent: 'prácticas' }],
			{ locals, login: ACTOR }
		);
		await expect(undoDeletion(noRepo, t.db, actor, row.id)).rejects.toThrow(/Ya hay otra etiqueta/);
		expect((await getDeletion(t.db, row.id))?.status).toBe('borrado');
	});
});

describe('series: borrar y recuperar', () => {
	it('las series son las hijas (o nietas) de «evento recurrente», sin los alias', async () => {
		const records = await stored();
		const serie = records.find((r) => r.key === 'Serie Inventada');
		expect([...seriesIdsOf(records)]).toEqual([serie?.id]);
	});

	it('una serie borrada queda como «Serie» y vuelve con su ícono y su lugar en el árbol', async () => {
		const serie = /** @type {NonNullable<Awaited<ReturnType<typeof byKey>>>} */ (
			await byKey('Serie Inventada')
		);
		const now = Date.now();
		const keep = await tagDeletionStatement(t.db, serie, { login: ACTOR, now, series: true });
		await saveObject(
			t.db,
			{ id: serie.id, type: TAG_TYPE, version: serie.version, deleted: true },
			{ actor: ACTOR, now, also: () => [keep] }
		);
		expect(await byKey('Serie Inventada')).toBeUndefined();
		const [row] = await listRecoverable(t.db);
		expect(deletionLabel(row)).toEqual({ label: 'Serie', library: false });

		await undoDeletion(noRepo, t.db, actor, row.id);
		const back = await byKey('Serie Inventada');
		expect(back?.data).toMatchObject({ icon: '🎬' });
		expect(back?.parents.map((p) => p.key)).toEqual(['evento recurrente']);
		expect((await listAudit(t.db))[0].summary).toBe('Recuperó la serie «Serie Inventada»');
	});
});

describe('el texto propio de un mail de un evento', () => {
	const SLUG = 'fiesta-inventada';
	const TITLE = 'Mail «Entradas» de Fiesta Inventada';
	const text = { subject: 'Tus entradas para la fiesta inventada', body: 'Te esperamos.' };

	it('«Volver a la plantilla general» guarda una copia y «Recuperar» la vuelve a poner', async () => {
		await saveEventTemplateOverride(t.db, SLUG, 'tickets', text, { by: ACTOR });
		expect(
			await deleteEventTemplateOverride(t.db, SLUG, 'tickets', { by: ACTOR, title: TITLE })
		).toBe(true);
		expect(await getEventTemplateOverride(t.db, SLUG, 'tickets')).toBeNull();

		const [row] = await listRecoverable(t.db);
		expect(row).toMatchObject({ kind: 'calendario', slug: SLUG, title: TITLE, deletedBy: ACTOR });
		expect(templateOf(row.path)).toEqual({ eventSlug: SLUG, id: 'tickets' });
		expect(deletionLabel(row)).toEqual({ label: 'Mail del evento', library: false });

		const r = await undoDeletion(noRepo, t.db, actor, row.id);
		expect(r).toMatchObject({ mode: 'restored', immediate: true });
		expect(await getEventTemplateOverride(t.db, SLUG, 'tickets')).toEqual(text);
		expect((await getDeletion(t.db, row.id))?.status).toBe('recuperado');
		expect((await listAudit(t.db))[0]).toMatchObject({
			action: 'template.event_restore',
			targetId: `${SLUG}/tickets`
		});
	});

	it('guardar todo vacío también deja la copia', async () => {
		await saveEventTemplateOverride(t.db, SLUG, 'reminder', text, { by: ACTOR });
		const kept = await saveEventTemplateOverride(t.db, SLUG, 'reminder', {}, { by: ACTOR });
		expect(kept).toBe(false);
		const [row] = await listRecoverable(t.db);
		expect(templateOf(row.path)).toEqual({ eventSlug: SLUG, id: 'reminder' });
		await undoDeletion(noRepo, t.db, actor, row.id);
		expect(await getEventTemplateOverride(t.db, SLUG, 'reminder')).toEqual(text);
	});

	it('no pisa un texto guardado después: avisa y el borrado sigue para recuperar', async () => {
		await saveEventTemplateOverride(t.db, SLUG, 'tickets', text, { by: ACTOR });
		await deleteEventTemplateOverride(t.db, SLUG, 'tickets', { by: ACTOR, title: TITLE });
		const newer = { subject: 'Otro asunto inventado' };
		await saveEventTemplateOverride(t.db, SLUG, 'tickets', newer, { by: ACTOR });
		const [row] = await listRecoverable(t.db);
		await expect(undoDeletion(noRepo, t.db, actor, row.id)).rejects.toThrow(/otro texto propio/);
		expect(await getEventTemplateOverride(t.db, SLUG, 'tickets')).toEqual(newer);
		expect((await getDeletion(t.db, row.id))?.status).toBe('borrado');
		expect((await listEventTemplateOverrides(t.db, SLUG)).size).toBe(1);
	});

	it('sin nada guardado, no deja nada para recuperar', async () => {
		expect(await deleteEventTemplateOverride(t.db, SLUG, 'tickets', { by: ACTOR })).toBe(false);
		expect(await listRecoverable(t.db)).toEqual([]);
	});
});
