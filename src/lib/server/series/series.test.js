/**
 * Series con D1 de miniflare: "Avisame si se repite" (suscribirse, confirmar, darse de baja, los
 * límites), los avisos del cron (uno por suscripción y edición, aunque el cron corra muchas
 * veces) y los links del calendario personal (crear, revocar). Datos inventados (example.com).
 * Nada depende del reloj: todo recibe `now`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { sha256Hex } from '$lib/server/hash.js';
import { deleteAccount, emailHash, upsertVerifiedAccount } from '$lib/server/cuentas/accounts.js';
import tagsFactory from '$lib/utils/tags';
import {
	CONFIRM_TTL_MS,
	SUBSCRIBE_LIMITS,
	accountSubscriptions,
	confirmSubscription,
	subscribeAccount,
	subscribeEmail,
	subscriberCounts,
	unsubscribe,
	unsubscribeAccount
} from './subscriptions.js';
import { markEditionsSeen, runSeriesNotifications } from './notify.js';
import { accountForFeed, createFeedToken, feedInfo, revokeFeeds, ticketedSlugs } from './feeds.js';
import { eventSeries, seriesPage } from './index.js';
import { DAY, fakeEvent, fakeSend, fakeSeriesPosts, insertOrder, linkIn } from './fixtures.js';

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
const ORIGIN = 'https://kinkyvibe.ar';
const EMAIL = 'persona.prueba@example.com';
const CLIENT = 'cliente-de-prueba';
const SERIES = 'Picantearla';
const tags = tagsFactory();

/** @param {Partial<Parameters<typeof subscribeEmail>[0]>} [o] */
function subscribe(o = {}) {
	const send = o.send ?? fakeSend();
	return subscribeEmail({
		db: t.db,
		seriesTag: SERIES,
		seriesName: 'Picantearla',
		email: EMAIL,
		client: CLIENT,
		origin: ORIGIN,
		now: NOW,
		...o,
		send
	});
}

/** Deja un bucket de rate_limits lleno (sin hacer N pedidos). */
async function fillBucket(
	/** @type {string} */ bucket,
	/** @type {{ limit: number, windowSeconds: number }} */ rule,
	now = NOW
) {
	const s = Math.floor(now / 1000);
	await t.db
		.prepare('INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, ?3)')
		.bind(bucket, s - (s % rule.windowSeconds), rule.limit)
		.run();
}

const rows = async () =>
	(await t.db.prepare('SELECT * FROM series_subscriptions ORDER BY created_at').all()).results;

describe('suscribirse con mail (doble confirmación)', () => {
	it('guarda el pedido sin confirmar y manda el mail con el link de confirmar y el de baja', async () => {
		const send = fakeSend();
		expect(await subscribe({ send })).toEqual({ ok: true, status: 'pending' });
		const [row] = await rows();
		expect(row).toMatchObject({
			series_tag: SERIES,
			email: EMAIL,
			account_id: null,
			confirmed_at: null,
			subscriber_key: `e:${await emailHash(EMAIL)}`,
			confirm_expires_at: NOW + CONFIRM_TTL_MS
		});
		expect(send.sent).toHaveLength(1);
		expect(send.sent[0].to).toBe(EMAIL);
		const confirm = linkIn(send.sent[0].text, '/avisos/confirmar/');
		expect(confirm).toBeTruthy();
		expect(linkIn(send.sent[0].text, '/avisos/baja/')).toBeTruthy();
		// El token no se guarda: solo su hash.
		const token = String(confirm).split('/').pop();
		expect(row.confirm_hash).toBe(await sha256Hex(String(token)));
		expect(JSON.stringify(row)).not.toContain(String(token));
	});

	it('el link confirma una sola vez y no después de vencer', async () => {
		const send = fakeSend();
		await subscribe({ send });
		const token = String(linkIn(send.sent[0].text, '/avisos/confirmar/')).split('/').pop();
		expect(await confirmSubscription(t.db, token, NOW + CONFIRM_TTL_MS)).toBeNull(); // vencido
		expect(await confirmSubscription(t.db, token, NOW + 1000)).toBe(SERIES);
		expect(await confirmSubscription(t.db, token, NOW + 2000)).toBeNull(); // ya usado
		const [row] = await rows();
		expect(row).toMatchObject({ confirmed_at: NOW + 1000, confirm_hash: null });
		expect(await confirmSubscription(t.db, 'cualquier-cosa', NOW)).toBeNull();
	});

	it('si ya estaba confirmade: misma respuesta y ningún mail (no revela quién está)', async () => {
		const send = fakeSend();
		await subscribe({ send });
		const token = String(linkIn(send.sent[0].text, '/avisos/confirmar/')).split('/').pop();
		await confirmSubscription(t.db, token, NOW);
		const again = fakeSend();
		expect(await subscribe({ send: again, now: NOW + 1000 })).toEqual({
			ok: true,
			status: 'pending'
		});
		expect(again.sent).toHaveLength(0);
		expect(await rows()).toHaveLength(1);
	});

	it('pedirlo de nuevo sin confirmar: un link nuevo (el viejo deja de servir), una sola fila', async () => {
		const first = fakeSend();
		await subscribe({ send: first });
		const second = fakeSend();
		await subscribe({ send: second, now: NOW + 1000 });
		expect(await rows()).toHaveLength(1);
		const oldToken = String(linkIn(first.sent[0].text, '/avisos/confirmar/')).split('/').pop();
		const newToken = String(linkIn(second.sent[0].text, '/avisos/confirmar/')).split('/').pop();
		expect(await confirmSubscription(t.db, oldToken, NOW + 2000)).toBeNull();
		expect(await confirmSubscription(t.db, newToken, NOW + 2000)).toBe(SERIES);
	});

	it('mail inválido: 400; mail que falla: 502', async () => {
		expect(await subscribe({ email: 'no-es-un-mail' })).toMatchObject({ ok: false, status: 400 });
		const failing = fakeSend('failed');
		expect(await subscribe({ send: failing })).toMatchObject({ ok: false, status: 502 });
	});
});

describe('límites (db/rateLimit.js)', () => {
	it('por conexión: con el cupo lleno, 429 y ningún mail ni fila', async () => {
		await fillBucket(
			`series:sub:c:${await sha256Hex(`series:client:${CLIENT}`)}`,
			SUBSCRIBE_LIMITS.client
		);
		const send = fakeSend();
		expect(await subscribe({ send })).toMatchObject({ ok: false, status: 429 });
		expect(send.sent).toHaveLength(0);
		expect(await rows()).toHaveLength(0);
	});
	it('por mail: con el cupo diario del mail lleno, 429 (desde cualquier conexión)', async () => {
		await fillBucket(`series:sub:e:${await emailHash(EMAIL)}`, SUBSCRIBE_LIMITS.email);
		const send = fakeSend();
		expect(await subscribe({ send, client: 'otra-conexion' })).toMatchObject({
			ok: false,
			status: 429
		});
		expect(send.sent).toHaveLength(0);
	});
	it('tope global de mails (el de cuentas): 429', async () => {
		await fillBucket('cuentas:mail:global', { limit: 300, windowSeconds: 3600 });
		expect(await subscribe()).toMatchObject({ ok: false, status: 429 });
	});
	it('con cuenta: tope por cuenta', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		await fillBucket(`series:sub:a:${account.id}`, SUBSCRIBE_LIMITS.account);
		expect(
			await subscribeAccount({ db: t.db, seriesTag: SERIES, accountId: account.id, now: NOW })
		).toMatchObject({ ok: false, status: 429 });
	});
});

describe('baja', () => {
	it('el link de baja borra la fila (y el mail); repetirlo no rompe; uno trucho no sirve', async () => {
		const send = fakeSend();
		await subscribe({ send });
		const link = String(linkIn(send.sent[0].text, '/avisos/baja/'));
		const token = link.split('/').pop();
		const tampered = String(token).slice(0, -1) + (String(token).endsWith('A') ? 'B' : 'A');
		expect(await unsubscribe(t.db, tampered)).toEqual({ ok: false });
		expect(await unsubscribe(t.db, 'nada')).toEqual({ ok: false });
		expect(await unsubscribe(t.db, token)).toEqual({ ok: true, seriesTag: SERIES });
		expect(await rows()).toHaveLength(0);
		expect(await unsubscribe(t.db, token)).toEqual({ ok: true, seriesTag: null });
	});
});

describe('con cuenta', () => {
	it('confirmada en el acto, sin guardar el mail; se lista y se da de baja', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const r = await subscribeAccount({
			db: t.db,
			seriesTag: SERIES,
			accountId: account.id,
			now: NOW
		});
		expect(r).toEqual({ ok: true, status: 'confirmed' });
		await subscribeAccount({ db: t.db, seriesTag: SERIES, accountId: account.id, now: NOW });
		const [row] = await rows();
		expect(row).toMatchObject({ account_id: account.id, email: null, confirmed_at: NOW });
		expect(await rows()).toHaveLength(1);
		expect(await accountSubscriptions(t.db, account.id)).toEqual([SERIES]);
		await unsubscribeAccount(t.db, account.id, SERIES);
		expect(await accountSubscriptions(t.db, account.id)).toEqual([]);
	});
});

describe('subscriberCounts (solo números, para el panel)', () => {
	it('cuenta confirmadas y sin confirmar por serie', async () => {
		const send = fakeSend();
		await subscribe({ send });
		await subscribe({ send, email: 'otra.persona@example.com', now: NOW + 1 });
		const token = String(linkIn(send.sent[0].text, '/avisos/confirmar/')).split('/').pop();
		await confirmSubscription(t.db, token, NOW + 2);
		expect(Object.fromEntries(await subscriberCounts(t.db))).toEqual({
			[SERIES]: { confirmed: 1, pending: 1 }
		});
	});
});

describe('avisos del cron (runSeriesNotifications)', () => {
	/** Una suscripción confirmada en `at` (fila precargada, sin pasar por el mail). */
	async function confirmedSubscription(email = EMAIL, at = NOW - 40 * DAY) {
		const id = crypto.randomUUID();
		await t.db
			.prepare(
				`INSERT INTO series_subscriptions (id, series_tag, email, subscriber_key, created_at, confirmed_at)
				VALUES (?1, ?2, ?3, ?4, ?5, ?5)`
			)
			.bind(id, SERIES, email, `e:${await emailHash(email)}`, at)
			.run();
		return id;
	}

	/** @param {{ posts?: ProcessedPost[], now?: number, send?: ReturnType<typeof fakeSend> }} [o] */
	async function run(o = {}) {
		const send = o.send ?? fakeSend();
		const r = await runSeriesNotifications({
			db: t.db,
			posts: o.posts ?? fakeSeriesPosts(NOW),
			tags,
			origin: ORIGIN,
			send,
			now: o.now ?? NOW
		});
		return { ...r, send };
	}

	it('un mail por edición nueva, una sola vez aunque el cron corra muchas veces', async () => {
		await confirmedSubscription();
		const first = await run();
		expect(first).toMatchObject({ seen: 1, sent: 1, failed: 0 });
		expect(first.send.sent[0]).toMatchObject({
			to: EMAIL,
			subject: 'Hay nueva edición de Picantearla'
		});
		expect(first.send.sent[0].text).toContain(`${ORIGIN}/calendario/serie-prueba-3`);
		expect(linkIn(first.send.sent[0].text, '/avisos/baja/')).toBeTruthy();
		expect(first.send.sent[0].key).toMatch(/^series-.+-serie-prueba-3$/);
		for (const later of [NOW + 15 * 60_000, NOW + 30 * 60_000]) {
			const again = await run({ now: later });
			expect(again).toMatchObject({ seen: 0, sent: 0 });
			expect(again.send.sent).toHaveLength(0);
		}
	});

	it('otra edición nueva más adelante: otro mail', async () => {
		await confirmedSubscription();
		await run();
		const posts = [
			...fakeSeriesPosts(NOW),
			fakeEvent('serie-prueba-4', NOW + 40 * DAY, ['Picantearla'])
		];
		const r = await run({ posts, now: NOW + DAY });
		expect(r).toMatchObject({ seen: 1, sent: 1 });
		expect(r.send.sent[0].text).toContain('serie-prueba-4');
	});

	it('quien se suscribe con la próxima ya anunciada no recibe aviso de esa', async () => {
		// La página de suscripción marca como vistas las próximas (como hace /avisos).
		await markEditionsSeen(t.db, [{ series: SERIES, slug: 'serie-prueba-3' }], NOW);
		await confirmedSubscription(EMAIL, NOW);
		const r = await run({ now: NOW + 60_000 });
		expect(r.sent).toBe(0);
	});

	it('sin confirmar no recibe nada; los pedidos vencidos se borran', async () => {
		await subscribe();
		const r = await run({ now: NOW + 60_000 });
		expect(r.send.sent).toHaveLength(0);
		const later = await run({ now: NOW + CONFIRM_TTL_MS + 1 });
		expect(later.expired).toBe(1);
		expect(await rows()).toHaveLength(0);
	});

	it('si el mail falla, se reintenta en la próxima corrida (y entonces sí, una vez)', async () => {
		await confirmedSubscription();
		const failing = fakeSend('failed');
		expect(await run({ send: failing })).toMatchObject({ sent: 0, failed: 1 });
		const ok = await run({ now: NOW + 15 * 60_000 });
		expect(ok).toMatchObject({ sent: 1 });
		expect((await run({ now: NOW + 30 * 60_000 })).sent).toBe(0);
	});

	it('una edición cancelada o que dejó de estar en el deploy no avisa', async () => {
		await confirmedSubscription();
		const posts = fakeSeriesPosts(NOW).map((p) =>
			p.meta.postID === 'serie-prueba-3'
				? fakeEvent('serie-prueba-3', NOW + 10 * DAY, ['Picantearla'], { status: 'cancelado' })
				: p
		);
		expect((await run({ posts })).sent).toBe(0);
	});

	it('con cuenta: al mail de la cuenta; con la cuenta borrada, nada', async () => {
		const account = await upsertVerifiedAccount(t.db, 'cuenta.prueba@example.com', {
			now: NOW - 50 * DAY
		});
		await subscribeAccount({
			db: t.db,
			seriesTag: SERIES,
			accountId: account.id,
			now: NOW - 40 * DAY
		});
		const other = await upsertVerifiedAccount(t.db, 'borrada.prueba@example.com', {
			now: NOW - 50 * DAY
		});
		await subscribeAccount({
			db: t.db,
			seriesTag: SERIES,
			accountId: other.id,
			now: NOW - 40 * DAY
		});
		await deleteAccount(t.db, other.id, { now: NOW - DAY });
		const r = await run();
		expect(r.send.sent.map((m) => m.to)).toEqual(['cuenta.prueba@example.com']);
	});
});

describe('calendario personal (feeds.js)', () => {
	it('el link anda; uno nuevo revoca el anterior; revocar lo apaga', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const first = await createFeedToken(t.db, account.id, NOW);
		expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(await accountForFeed(t.db, first, NOW)).toBe(account.id);
		// solo se guarda el hash
		const stored = await t.db.prepare('SELECT * FROM calendar_feeds').all();
		expect(JSON.stringify(stored.results)).not.toContain(first);
		expect(await feedInfo(t.db, account.id)).toEqual({ createdAt: NOW, lastUsedAt: NOW });

		const second = await createFeedToken(t.db, account.id, NOW + 1);
		expect(await accountForFeed(t.db, first, NOW + 2)).toBeNull();
		expect(await accountForFeed(t.db, second, NOW + 2)).toBe(account.id);

		await revokeFeeds(t.db, account.id);
		expect(await accountForFeed(t.db, second, NOW + 3)).toBeNull();
		expect(await feedInfo(t.db, account.id)).toBeNull();
		expect(await accountForFeed(t.db, 'corto', NOW)).toBeNull();
	});

	it('con la cuenta borrada, el link deja de andar', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		const token = await createFeedToken(t.db, account.id, NOW);
		await deleteAccount(t.db, account.id, { now: NOW + 1 });
		expect(await accountForFeed(t.db, token, NOW + 2)).toBeNull();
	});

	it('ticketedSlugs: compras aprobadas o esperando transferencia, no reembolsadas ni de otres', async () => {
		const account = await upsertVerifiedAccount(t.db, EMAIL, { now: NOW });
		await insertOrder(t.db, { email: EMAIL, slug: 'serie-prueba-1' });
		await insertOrder(t.db, { email: EMAIL, slug: 'serie-prueba-3', status: 'awaiting_transfer' });
		await insertOrder(t.db, { email: EMAIL, slug: 'reembolsado', status: 'refunded' });
		await insertOrder(t.db, { email: 'otra@example.com', slug: 'ajeno' });
		expect([...(await ticketedSlugs(t.db, account.id))].sort()).toEqual([
			'serie-prueba-1',
			'serie-prueba-3'
		]);
	});
});

describe('vistas (index.js)', () => {
	const posts = fakeSeriesPosts(NOW);
	it('eventSeries: edición, anterior/siguiente, si pasó y la próxima', async () => {
		const [s] = await eventSeries(
			{ slug: 'serie-prueba-2', tags: ['Picantearla'] },
			{ posts, tags, now: NOW }
		);
		expect(s).toMatchObject({ id: SERIES, number: 8, total: 3, past: true });
		expect(s.prev?.slug).toBe('serie-prueba-1');
		expect(s.next?.slug).toBe('serie-prueba-3');
		expect(s.nextUpcoming?.slug).toBe('serie-prueba-3');
		expect(
			await eventSeries({ slug: 'otra-cosa', tags: ['taller'] }, { posts, tags, now: NOW })
		).toEqual([]);
	});
	it('seriesPage: próximas primero, pasadas de la más reciente; null si no es serie', async () => {
		const p = await seriesPage(SERIES, { posts, tags, now: NOW });
		expect(p?.upcoming.map((e) => e.slug)).toEqual(['serie-prueba-3']);
		expect(p?.past.map((e) => e.slug)).toEqual(['serie-prueba-2', 'serie-prueba-1']);
		expect(await seriesPage('taller', { posts, tags, now: NOW })).toBeNull();
	});
});
