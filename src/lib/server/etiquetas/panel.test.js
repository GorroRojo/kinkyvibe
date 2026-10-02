/**
 * Guardar desde el panel en la base (interruptor `etiquetas_db`): escribe, queda en Actividad y
 * olvida lo recordado; una operación imposible no escribe nada.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { listAudit } from '$lib/server/admin/audit.js';
import { importTags } from './importer.js';
import { loadTagRecords } from './read.js';
import { saveTagOpsToDb } from './panel.js';
import { clearTagSourceCache, tagSourceFrom } from './source.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const LOGIN = 'admin-de-prueba';
const locals = /** @type {any} */ ({ user: { login: LOGIN } });
const RAW = [
	{ id: 'root', children: ['evento recurrente'] },
	{ id: 'evento recurrente', children: ['Serie Inventada'] },
	{ id: 'Serie Inventada' }
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
	clearTagSourceCache();
	await importTags(t.db, { rawTags: structuredClone(RAW) }, { actor: LOGIN });
});

const from = async () => ({
	db: t.db,
	records: await loadTagRecords(t.db, { role: 'admin', id: LOGIN })
});

describe('saveTagOpsToDb', () => {
	it('guarda, lo anota en Actividad y el sitio lo ve sin esperar', async () => {
		const before = await tagSourceFrom(t.db, { flagOn: true, now: 1 });
		const res = await saveTagOpsToDb(
			await from(),
			[{ type: 'update', id: 'Serie Inventada', set: { icon: '🎭' } }],
			{ locals, login: LOGIN, label: 'Series', targetId: 'Serie Inventada' }
		);
		expect(res).toMatchObject({ ok: true, written: 1 });
		const after = await tagSourceFrom(t.db, { flagOn: true, now: 2 });
		expect(after).not.toBe(before);
		expect(after.rawTags.find((e) => e.id === 'Serie Inventada')?.icon).toBe('🎭');
		const audit = await listAudit(t.db, { targetType: 'tags' });
		expect(audit[0]).toMatchObject({ action: 'tags.edit', targetId: 'Serie Inventada' });
		expect(audit[0].summary).toMatch(/^Series \(base\): /);
	});

	it('una operación imposible: error para la persona, nada escrito', async () => {
		const res = await saveTagOpsToDb(
			await from(),
			[{ type: 'create', id: 'Serie Inventada', parent: 'evento recurrente' }],
			{ locals, login: LOGIN }
		);
		expect(res).toMatchObject({ ok: false, status: 400 });
		expect(await listAudit(t.db, { targetType: 'tags' })).toEqual([]);
	});
});
