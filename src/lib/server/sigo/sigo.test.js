/**
 * «Lo que sigo» con D1 de miniflare: seguir, dejar de seguir, opciones, el tope y el límite, la
 * privacidad (una cuenta nunca ve lo de otra), qué se puede seguir (etiquetas por nombre, alias o
 * URL; perfiles visibles y aprobados) y que borrar la cuenta borre lo seguido. Datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { deleteAccount } from '$lib/server/cuentas/accounts.js';
import { makeAccount, makeProfile, addManager } from '$lib/server/amigues/testing.js';
import tagsFactory from '$lib/utils/tags';
import { MAX_FOLLOWS } from '$lib/utils/sigo.js';
import {
	FOLLOW_RATE_LIMIT,
	follow,
	getCalendarPrefs,
	getFollow,
	listFollows,
	setCalendarPrefs,
	setFollowOptions,
	stopAllMail,
	unfollow
} from './follows.js';
import { describeFollows, resolveProfile, resolveTag } from './targets.js';

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

const NOW = Date.parse('2026-06-01T12:00:00-03:00');
const tags = tagsFactory();
/** @type {import('$lib/utils/sigo.js').FollowTarget} */
const SHIBARI = { kind: 'etiqueta', key: 'shibari' };

describe('seguir y dejar de seguir', () => {
	it('sigue con las opciones por defecto, sin repetir, y deja de seguir', async () => {
		const a = await makeAccount(t.db, 'sigue-a');
		expect(await follow(t.db, a.id, SHIBARI, { now: NOW })).toEqual({ ok: true, created: true });
		// La segunda vez no cambia las opciones que ya tenía.
		await setFollowOptions(t.db, a.id, SHIBARI, {
			calendario: false,
			mail_nuevo: false,
			recordatorio: true
		});
		expect(await follow(t.db, a.id, SHIBARI, { now: NOW })).toEqual({ ok: true, created: false });
		expect((await getFollow(t.db, a.id, SHIBARI))?.options).toEqual({
			calendario: false,
			mail_nuevo: false,
			recordatorio: true
		});
		expect(await unfollow(t.db, a.id, SHIBARI)).toEqual({ ok: true });
		expect(await getFollow(t.db, a.id, SHIBARI)).toBeNull();
		expect(await listFollows(t.db, a.id)).toEqual([]);
	});

	it('las opciones de algo que no sigue dan 404', async () => {
		const a = await makeAccount(t.db, 'sigue-b');
		const r = await setFollowOptions(t.db, a.id, SHIBARI, {
			calendario: true,
			mail_nuevo: true,
			recordatorio: true
		});
		expect(r).toMatchObject({ ok: false, status: 404 });
	});

	it('es privado: cada cuenta ve y toca solo lo suyo', async () => {
		const a = await makeAccount(t.db, 'privada-a');
		const b = await makeAccount(t.db, 'privada-b');
		await follow(t.db, a.id, SHIBARI, { now: NOW });
		expect(await listFollows(t.db, b.id)).toEqual([]);
		expect(await getFollow(t.db, b.id, SHIBARI)).toBeNull();
		await unfollow(t.db, b.id, SHIBARI);
		await stopAllMail(t.db, b.id);
		expect((await getFollow(t.db, a.id, SHIBARI))?.options.mail_nuevo).toBe(true);
	});

	it('tiene un tope de cosas seguidas', async () => {
		const a = await makeAccount(t.db, 'tope');
		const stmts = [];
		for (let i = 0; i < MAX_FOLLOWS; i++) {
			stmts.push(
				t.db
					.prepare(
						`INSERT INTO follows (account_id, target_kind, target_key, created_at, updated_at)
						VALUES (?1, 'etiqueta', ?2, ?3, ?3)`
					)
					.bind(a.id, `etiqueta-${i}`, NOW)
			);
		}
		await t.db.batch(stmts);
		const r = await follow(t.db, a.id, SHIBARI, { now: NOW });
		expect(r).toMatchObject({ ok: false, status: 400 });
		// Lo que ya seguía responde bien igual.
		expect(await follow(t.db, a.id, { kind: 'etiqueta', key: 'etiqueta-3' }, { now: NOW })).toEqual(
			{ ok: true, created: false }
		);
	});

	it('topea los cambios por hora', async () => {
		const a = await makeAccount(t.db, 'limite');
		const s = Math.floor(NOW / 1000);
		await t.db
			.prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, ?3)')
			.bind(`sigo:a:${a.id}`, s - (s % FOLLOW_RATE_LIMIT.windowSeconds), FOLLOW_RATE_LIMIT.limit)
			.run();
		expect(await follow(t.db, a.id, SHIBARI, { now: NOW })).toMatchObject({
			ok: false,
			status: 429
		});
		expect(await getFollow(t.db, a.id, SHIBARI)).toBeNull();
	});

	it('«no quiero más mails» apaga los mails y deja lo demás', async () => {
		const a = await makeAccount(t.db, 'baja-mails');
		await follow(t.db, a.id, SHIBARI, { now: NOW });
		await follow(t.db, a.id, { kind: 'etiqueta', key: 'Picantearla' }, { now: NOW });
		expect(await stopAllMail(t.db, a.id, { now: NOW })).toBe(2);
		for (const f of await listFollows(t.db, a.id)) {
			expect(f.options).toEqual({ calendario: true, mail_nuevo: false, recordatorio: false });
		}
	});

	it('borrar la cuenta borra lo seguido', async () => {
		const a = await makeAccount(t.db, 'se-borra');
		await follow(t.db, a.id, SHIBARI, { now: NOW });
		await deleteAccount(t.db, a.id, { now: NOW });
		const { results } = await t.db.prepare('SELECT * FROM follows').all();
		expect(results).toEqual([]);
	});
});

describe('calendario: entradas y donde participo', () => {
	it('por defecto prendidos; se apagan y se vuelven a prender sin dejar claves', async () => {
		const a = await makeAccount(t.db, 'prefs');
		expect(await getCalendarPrefs(t.db, a.id)).toEqual({ entradas: true, participo: true });
		await setCalendarPrefs(t.db, a.id, { entradas: false, participo: true });
		expect(await getCalendarPrefs(t.db, a.id)).toEqual({ entradas: false, participo: true });
		await setCalendarPrefs(t.db, a.id, { entradas: true, participo: true });
		const row = await t.db
			.prepare('SELECT preferences FROM accounts WHERE id = ?1')
			.bind(a.id)
			.first();
		expect(row?.preferences).toBe('{}');
	});
});

describe('qué se puede seguir', () => {
	it('etiquetas por nombre, alias o forma de la URL, guardadas por su nombre canónico', () => {
		expect(resolveTag(tags, 'shibari')?.target).toEqual(SHIBARI);
		expect(resolveTag(tags, 'Shibari')?.target).toEqual(SHIBARI);
		expect(resolveTag(tags, 'Rancheadita-Kinky')?.target).toEqual({
			kind: 'etiqueta',
			key: 'Rancheadita Kinky'
		});
		expect(resolveTag(tags, 'shibari')?.href).toBe('/wiki/shibari');
		expect(resolveTag(tags, 'no-existe-esta-etiqueta')).toBeNull();
	});

	it('perfiles visibles y aprobados (o propios); ocultos, sin aprobar y borrados no', async () => {
		const a = await makeAccount(t.db, 'mira');
		const visible = await makeProfile(t.db, { title: 'Lugar Inventado', kind: 'lugar' });
		const hidden = await makeProfile(t.db, { title: 'Oculto Inventado', visibility: 'hidden' });
		const pending = await makeProfile(t.db, { title: 'Sin Aprobar', approved: false });
		const mine = await makeProfile(t.db, { title: 'Mío Sin Aprobar', approved: false });
		await addManager(t.db, mine.id, a.id);

		const found = await resolveProfile(t.db, a.id, String(visible.id));
		expect(found).toMatchObject({
			target: { kind: 'perfil', key: String(visible.id) },
			title: 'Lugar Inventado',
			label: 'Lugar'
		});
		expect(found?.href).toMatch(/^\/amigues\//);
		expect(await resolveProfile(t.db, a.id, String(hidden.id))).toBeNull();
		expect(await resolveProfile(t.db, a.id, String(pending.id))).toBeNull();
		expect(await resolveProfile(t.db, a.id, String(mine.id))).not.toBeNull();
		expect(await resolveProfile(t.db, a.id, '999999')).toBeNull();
	});

	it('lo que deja de verse queda como «Ya no está disponible», sin nombre ni link', async () => {
		const a = await makeAccount(t.db, 'lista');
		const p = await makeProfile(t.db, { title: 'Se Saca Después' });
		await follow(t.db, a.id, { kind: 'perfil', key: String(p.id) }, { now: NOW });
		await follow(t.db, a.id, SHIBARI, { now: NOW + 1 });
		// Deja de estar aprobado para /amigues (como si une admin lo sacara).
		await t.db.prepare('DELETE FROM profile_approvals WHERE profile_id = ?1').bind(p.id).run();
		const list = await describeFollows(
			{ db: t.db, tags, accountId: a.id },
			await listFollows(t.db, a.id)
		);
		expect(list.map((f) => [f.title, f.href, f.available])).toEqual([
			[expect.stringContaining('shibari'), '/wiki/shibari', true],
			['Ya no está disponible', null, false]
		]);
	});
});
