/**
 * Mails de «Lo que sigo» y «Avisame si se repite» sobre este sistema: lo nuevo (sin inundar al
 * prenderlo), el recordatorio, uno por evento y tipo aunque el cron corra muchas veces, el link
 * para no recibir más, y el paso de las suscripciones con cuenta (con su link de baja viejo
 * andando). D1 de miniflare; datos inventados (example.com). Todo recibe `now`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { DAY, fakeEvent, fakeSend, insertOrder, linkIn } from '$lib/server/series/fixtures.js';
import tagsFactory from '$lib/utils/tags';
import { follow, getFollow, setFollowOptions } from './follows.js';
import { migrateAccountSubscriptions } from './avisame.js';
import { runFollowNotifications, stopMailWithToken } from './notify.js';

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
afterEach(() => {
	vi.doUnmock('$env/dynamic/private');
	vi.resetModules();
});

const NOW = Date.parse('2026-06-01T12:00:00-03:00');
const ORIGIN = 'https://kinkyvibe.ar';
const tags = tagsFactory();
const TAG = { kind: /** @type {const} */ ('etiqueta'), key: 'Picantearla' };

/** @param {Partial<Parameters<typeof runFollowNotifications>[0]>} o */
const run = (o) =>
	runFollowNotifications({
		db: t.db,
		posts: [],
		tags,
		origin: ORIGIN,
		send: fakeSend(),
		now: NOW,
		...o
	});

describe('runFollowNotifications', () => {
	it('la primera corrida no avisa lo que ya estaba; después, lo nuevo una sola vez', async () => {
		const a = await makeAccount(t.db, 'sigo-nuevo');
		await follow(t.db, a.id, TAG, { now: NOW - DAY });
		const before = [fakeEvent('ya-estaba', NOW + 10 * DAY, ['Picantearla'])];
		const send = fakeSend();
		expect(await run({ posts: before, send })).toMatchObject({ seen: 1, sent: 0 });
		const posts = [...before, fakeEvent('nuevo-inventado', NOW + 20 * DAY, ['Picantearla'])];
		expect(await run({ posts, send, now: NOW + 1000 })).toMatchObject({ seen: 1, sent: 1 });
		expect(send.sent[0].subject).toContain('Se anunció');
		expect(send.sent[0].text).toContain('/calendario/nuevo-inventado');
		expect(send.sent[0].text).toContain('Picantearla');
		expect(await run({ posts, send, now: NOW + 2000 })).toMatchObject({ sent: 0 });
		expect(send.sent).toHaveLength(1);
	});

	it('no avisa como nuevo lo que se anunció antes de seguirlo, ni con el mail apagado', async () => {
		const a = await makeAccount(t.db, 'sigo-tarde');
		const b = await makeAccount(t.db, 'sigo-sin-mail');
		await run({ posts: [fakeEvent('semilla', NOW + 5 * DAY, ['otra'])] });
		const posts = [fakeEvent('anunciado', NOW + 20 * DAY, ['Picantearla'])];
		await follow(t.db, b.id, TAG, { now: NOW - DAY });
		await setFollowOptions(t.db, b.id, TAG, {
			calendario: true,
			mail_nuevo: false,
			recordatorio: false
		});
		const send = fakeSend();
		await run({ posts, send, now: NOW + 1000 });
		await follow(t.db, a.id, TAG, { now: NOW + 2000 });
		await run({ posts, send, now: NOW + 3000 });
		expect(send.sent).toEqual([]);
	});

	it('recordatorio el día antes, una vez; si falla, se reintenta', async () => {
		const a = await makeAccount(t.db, 'sigo-recordatorio');
		await follow(t.db, a.id, TAG, {
			now: NOW - DAY,
			options: { calendario: true, mail_nuevo: false, recordatorio: true }
		});
		const posts = [fakeEvent('manana', NOW + 2 * DAY, ['Picantearla'])];
		const send = fakeSend('failed');
		expect(await run({ posts, send })).toMatchObject({ sent: 0 });
		expect(await run({ posts, send, now: NOW + DAY + 1 })).toMatchObject({ failed: 1 });
		send.state.result = 'sent';
		expect(await run({ posts, send, now: NOW + DAY + 2 })).toMatchObject({ sent: 1 });
		expect(await run({ posts, send, now: NOW + DAY + 3 })).toMatchObject({ sent: 0 });
		expect(send.sent.at(-1)?.subject).toContain('Mañana');
		expect(send.sent.at(-1)?.to).toBe(a.email);
	});

	describe('con entrada para el evento', () => {
		const REMINDER_ONLY = { calendario: true, mail_nuevo: false, recordatorio: true };

		it('no manda el recordatorio a quien ya tiene entrada (por mail o por cuenta)', async () => {
			const conMail = await makeAccount(t.db, 'sigo-con-entrada');
			const conCuenta = await makeAccount(t.db, 'sigo-entrada-cuenta');
			const sin = await makeAccount(t.db, 'sigo-sin-entrada');
			for (const a of [conMail, conCuenta, sin])
				await follow(t.db, a.id, TAG, { now: NOW - DAY, options: REMINDER_ONLY });
			// Mail con otras mayúsculas: es la misma casilla.
			await insertOrder(t.db, { email: 'Sigo-Con-Entrada@example.com', slug: 'manana', now: NOW });
			await insertOrder(t.db, {
				email: 'otra-casilla@example.com',
				slug: 'manana',
				accountId: conCuenta.id,
				now: NOW
			});
			const posts = [fakeEvent('manana', NOW + 2 * DAY, ['Picantearla'])];
			const send = fakeSend();
			expect(await run({ posts, send, now: NOW + DAY + 1 })).toMatchObject({ sent: 1 });
			expect(send.sent.map((m) => m.to)).toEqual([sin.email]);
			expect(send.sent[0].subject).toContain('Mañana');
		});

		it('las órdenes canceladas, reembolsadas o pendientes no cuentan', async () => {
			const a = await makeAccount(t.db, 'sigo-reembolso');
			await follow(t.db, a.id, TAG, { now: NOW - DAY, options: REMINDER_ONLY });
			for (const status of ['cancelled', 'refunded', 'pending'])
				await insertOrder(t.db, { email: a.email, slug: 'manana', status, now: NOW });
			await insertOrder(t.db, { email: a.email, slug: 'otro-evento', now: NOW });
			const posts = [fakeEvent('manana', NOW + 2 * DAY, ['Picantearla'])];
			const send = fakeSend();
			expect(await run({ posts, send, now: NOW + DAY + 1 })).toMatchObject({ sent: 1 });
			expect(send.sent[0].to).toBe(a.email);
		});

		it('«se anunció algo nuevo» le llega igual', async () => {
			const a = await makeAccount(t.db, 'sigo-nuevo-con-entrada');
			await follow(t.db, a.id, TAG, {
				now: NOW - DAY,
				options: { calendario: true, mail_nuevo: true, recordatorio: true }
			});
			await run({ posts: [fakeEvent('semilla', NOW + 5 * DAY, ['otra'])] });
			await insertOrder(t.db, { email: a.email, slug: 'pronto', now: NOW });
			const send = fakeSend();
			const posts = [fakeEvent('pronto', NOW + DAY / 2, ['Picantearla'])];
			expect(await run({ posts, send, now: NOW + 1000 })).toMatchObject({ sent: 1 });
			expect(send.sent[0].subject).toContain('Se anunció');
			expect(await run({ posts, send, now: NOW + 2000 })).toMatchObject({ sent: 0 });
		});
	});

	it('el link del mail apaga todos los mails, pero lo seguido queda', async () => {
		const a = await makeAccount(t.db, 'sigo-baja');
		await follow(t.db, a.id, TAG, { now: NOW - DAY });
		await run({ posts: [fakeEvent('semilla', NOW + 5 * DAY, ['otra'])] });
		const send = fakeSend();
		await run({
			posts: [fakeEvent('nuevo', NOW + 20 * DAY, ['Picantearla'])],
			send,
			now: NOW + 1000
		});
		const link = linkIn(send.sent[0].text, '/avisos/sigo/');
		expect(link).toBeTruthy();
		const token = String(link).split('/avisos/sigo/')[1];
		expect(await stopMailWithToken(t.db, token + 'x')).toBeNull();
		expect(await stopMailWithToken(t.db, token)).toBe(a.id);
		expect((await getFollow(t.db, a.id, TAG))?.options).toEqual({
			calendario: true,
			mail_nuevo: false,
			recordatorio: false
		});
	});
});

describe('Avisame con cuenta sobre «Lo que sigo»', () => {
	/** @param {string} flag */
	async function subs(flag) {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({
			env: { LO_QUE_SIGO_ENABLED: flag, CUENTAS_ENABLED: '1' }
		}));
		return import('$lib/server/series/subscriptions.js');
	}

	it('prendido: suscribirse es seguir con mail; la baja lo apaga y queda seguido', async () => {
		const s = await subs('1');
		const a = await makeAccount(t.db, 'avisame-sigo');
		expect(
			await s.subscribeAccount({ db: t.db, seriesTag: 'Picantearla', accountId: a.id, now: NOW })
		).toMatchObject({ ok: true, status: 'confirmed' });
		expect((await getFollow(t.db, a.id, TAG))?.options.mail_nuevo).toBe(true);
		expect(await s.accountSubscriptions(t.db, a.id)).toEqual(['Picantearla']);
		await s.unsubscribeAccount(t.db, a.id, 'Picantearla');
		expect(await s.accountSubscriptions(t.db, a.id)).toEqual([]);
		expect((await getFollow(t.db, a.id, TAG))?.options.mail_nuevo).toBe(false);
	});

	it('las suscripciones viejas pasan a follows y su link de baja sigue andando', async () => {
		const off = await subs('0');
		const a = await makeAccount(t.db, 'avisame-viejo');
		await off.subscribeAccount({
			db: t.db,
			seriesTag: 'Picantearla',
			accountId: a.id,
			now: NOW - DAY
		});
		const { results } = await t.db.prepare('SELECT id FROM series_subscriptions').all();
		const id = String(results[0].id);
		const oldLink = await off.unsubscribeUrl(t.db, ORIGIN, id);
		expect(await migrateAccountSubscriptions(t.db, { now: NOW })).toBe(1);
		expect(await migrateAccountSubscriptions(t.db, { now: NOW })).toBe(0);
		const f = await getFollow(t.db, a.id, TAG);
		expect(f).toMatchObject({ seriesSubscriptionId: id, createdAt: NOW - DAY });
		expect(f?.options.mail_nuevo).toBe(true);
		const s = await subs('1');
		const token = oldLink.split('/avisos/baja/')[1];
		expect(await s.subscriptionSeries(t.db, id)).toBe('Picantearla');
		expect(await s.unsubscribe(t.db, token)).toEqual({ ok: true, seriesTag: 'Picantearla' });
		expect((await getFollow(t.db, a.id, TAG))?.options.mail_nuevo).toBe(false);
	});
});
