/**
 * «Seguir» desde el bot (decisión 0034): qué etiquetas de un evento se ofrecen, la cuenta del
 * chat (mirada en cada mensaje) y que seguir usa el mismo camino que el sitio. Base de prueba,
 * cuentas inventadas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import tagsFactory from '$lib/utils/tags';
import { getFollow } from '$lib/server/sigo/follows.js';
import { FOLLOW_TARGETS_MAX, botFollows, chatAccount, followTargets } from './seguir.js';
import { shortHash } from './nav.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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

const tags = tagsFactory();

/**
 * @param {string} accountId
 * @param {string} chatId
 */
const linkChat = (accountId, chatId) =>
	t.db
		.prepare(
			`INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at)
			VALUES (?1, ?2, 1, 0, 1)`
		)
		.bind(accountId, chatId)
		.run();

describe('followTargets', () => {
	it('solo etiquetas que existen, por su nombre canónico, sin repetir y con su hash', () => {
		const out = followTargets(['Shibari', 'shibari', 'no-existe-esta-etiqueta'], tags);
		expect(out.map((x) => x.key)).toEqual(['shibari']);
		expect(out[0].hash).toBe(shortHash('shibari'));
	});

	it('primero las series y como mucho cinco', () => {
		const out = followTargets(['shibari', 'Rancheadita-Kinky'], tags);
		expect(out[0].key).toBe('Rancheadita Kinky');
		expect(out[0].series).toBe(true);
		const many = followTargets([...tags.tagIDs()].slice(0, 20), tags);
		expect(many.length).toBeLessThanOrEqual(FOLLOW_TARGETS_MAX);
		expect(followTargets(undefined, tags)).toEqual([]);
	});
});

describe('chatAccount', () => {
	it('la cuenta del chat vinculado; nada para otro chat ni para una cuenta borrada', async () => {
		const a = await makeAccount(t.db, 'tg-sigue');
		await linkChat(a.id, '4242');
		expect(await chatAccount(t.db, 4242)).toBe(a.id);
		expect(await chatAccount(t.db, '999')).toBeNull();
		await t.db
			.prepare(
				'UPDATE accounts SET deleted_at = 1, email = NULL, password_hash = NULL, email_verified_at = NULL WHERE id = ?1'
			)
			.bind(a.id)
			.run();
		expect(await chatAccount(t.db, 4242)).toBeNull();
	});
});

describe('botFollows', () => {
	it('sigue con el mismo camino que el sitio (opciones por defecto) y no repite', async () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const a = await makeAccount(t.db, 'tg-sigue-2');
		const f = botFollows(t.db, undefined);
		expect(await f.follow(a.id, 'Shibari')).toBe('created');
		expect((await getFollow(t.db, a.id, { kind: 'etiqueta', key: 'shibari' }))?.options).toEqual({
			calendario: true,
			mail_nuevo: true,
			recordatorio: false
		});
		expect(await f.follow(a.id, 'shibari')).toBe('already');
		expect([...(await f.following(a.id, ['shibari', 'otra']))]).toEqual(['shibari']);
		expect(await f.follow(a.id, 'no-existe-esta-etiqueta')).toBe('not_found');
		// El log no dice ni la cuenta ni la etiqueta (lo que sigue cada cuenta es privado).
		expect(JSON.stringify(spy.mock.calls)).not.toContain(a.id);
		expect(JSON.stringify(spy.mock.calls)).not.toContain('shibari');
		spy.mockRestore();
	});

	it('no escribe nada en el registro de actividad del panel', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const a = await makeAccount(t.db, 'tg-sigue-3');
		await botFollows(t.db, undefined).follow(a.id, 'shibari');
		const { results } = await t.db.prepare('SELECT * FROM admin_audit').all();
		expect(results).toEqual([]);
		vi.restoreAllMocks();
	});
});
