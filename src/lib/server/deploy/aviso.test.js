/**
 * El aviso «Cada deploy» (./aviso.js) y su endpoint (POST /api/interno/deploy). D1 de miniflare;
 * PRs y SHAs INVENTADOS (el repo es público).
 *
 * - el pedido: se arma un ítem por PR (sin repetir) y uno por commit sin PR; links propios;
 * - el texto: uno o varios, éxito, falla y tiempo agotado, escapado;
 * - a quién: les admins vinculades que prendieron «Cada deploy»; una sola vez por commit;
 * - el endpoint: 503 sin secreto, 401 con otro, 400 con un pedido roto, 200 y el aviso.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => /** @type {Record<string, string | undefined>} */ ({}));
vi.mock('$env/dynamic/private', () => ({ env }));

import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { clearFlagCache, setFlag } from '$lib/server/flags.js';
import { setAdminNotice } from '$lib/server/telegram/adminData.js';

const {
	DEPLOY_ITEMS_MAX,
	MIN_DEPLOY_SECRET_LENGTH,
	deployNoticeText,
	isValidDeploySecret,
	notifyDeploy,
	parseDeploy,
	runDeployNotice
} = await import('./aviso.js');
const { POST } = await import('../../../routes/api/interno/deploy/+server.js');

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const SECRET = 'd'.repeat(MIN_DEPLOY_SECRET_LENGTH);
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const SHA2 = 'ffffeeee0000111122223333444455556666aaaa';
/** 8/1/2031 a las 15:00 de Argentina (fuera del horario de silencio). */
const T0 = Date.parse('2031-01-08T15:00:00-03:00');
const NIGHT = Date.parse('2031-01-09T03:00:00-03:00');
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };
const OTHER_ADMIN = { id: ADMINS[1].id, login: ADMINS[1].login };

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

/** @param {number} telegramUserId @param {{ id: number, login: string }} who */
async function link(telegramUserId, who) {
	await t.db
		.prepare(
			'INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at) VALUES (?1, ?2, ?3, ?4)'
		)
		.bind(String(telegramUserId), who.id, who.login, T0 - 86_400_000)
		.run();
}

/** Un Telegram de mentira. @param {'sent' | 'failed' | 'blocked'} [result] */
function telegram(result = 'sent') {
	/** @type {{ chatId: string, text: string, panelUrl: string | null, silent?: boolean }[]} */
	const sent = [];
	return {
		sent,
		/** @type {import('$lib/server/telegram/adminNotify.js').AdminSend} */
		send: async (chatId, message) => {
			sent.push({ chatId, ...message });
			return result;
		}
	};
}

/** Un pedido como el del workflow, con un PR. */
const payload = (conclusion = 'success') => ({
	sha: SHA,
	conclusion,
	commits: [
		{
			sha: SHA,
			message: 'Evento: el afiche vuelve a ser cuadrado (#629)\n\nCuerpo del commit.',
			prs: [
				{
					number: 629,
					title: 'Evento: el afiche vuelve a ser cuadrado',
					body: 'Plan: ninguno\n\nThe poster was stretched on event pages.\n\n## Fix\n`height: auto`.'
				}
			]
		}
	]
});

beforeEach(async () => {
	await resetDB(t.db);
	clearFlagCache();
	for (const k of Object.keys(env)) delete env[k];
	await setFlag(t.db, 'telegram_bot', true, { by: 'prueba' });
	await setFlag(t.db, 'telegram_admin', true, { by: 'prueba' });
	clearFlagCache();
	await link(5001, ADMIN);
	await link(5002, OTHER_ADMIN);
	// Solo ADMIN prendió «Cada deploy»; OTHER_ADMIN, otro aviso.
	await setAdminNotice(t.db, ADMIN.id, 'cada_deploy', true);
	await setAdminNotice(t.db, OTHER_ADMIN.id, 'cada_venta', true);
});

describe('parseDeploy', () => {
	it('un ítem por PR, con link propio y la descripción del cuerpo', () => {
		expect(parseDeploy(payload())).toEqual({
			outcome: 'success',
			sha: SHA,
			items: [
				{
					number: 629,
					title: 'Evento: el afiche vuelve a ser cuadrado',
					url: 'https://github.com/GorroRojo/kinkyvibe/pull/629',
					summary: 'The poster was stretched on event pages.'
				}
			]
		});
	});

	it('no repite un PR con varios commits; un commit sin PR va con su primera línea', () => {
		const pr = { number: 7, title: 'Un PR', body: '' };
		const d = parseDeploy({
			sha: SHA2,
			conclusion: 'failure',
			commits: [
				{ sha: SHA, message: 'uno', prs: [pr] },
				{ sha: SHA2, message: 'dos\n\nDetalle del merge.', prs: [pr] },
				{ sha: SHA2, message: 'Arreglo directo\n\nSin PR.', prs: [] }
			]
		});
		expect(d?.outcome).toBe('failure');
		expect(d?.items).toEqual([
			{
				number: 7,
				title: 'Un PR',
				url: 'https://github.com/GorroRojo/kinkyvibe/pull/7',
				summary: ''
			},
			{
				number: null,
				title: 'Arreglo directo',
				url: `https://github.com/GorroRojo/kinkyvibe/commit/${SHA2}`,
				summary: 'Sin PR.'
			}
		]);
	});

	it('el resultado: success, timed_out y cualquier otro es falla', () => {
		expect(parseDeploy(payload('timed_out'))?.outcome).toBe('timed_out');
		expect(parseDeploy(payload('cancelled'))?.outcome).toBe('failure');
		expect(parseDeploy({ ...payload(), conclusion: undefined })?.outcome).toBe('failure');
	});

	it('un pedido roto: null', () => {
		expect(parseDeploy(null)).toBeNull();
		expect(parseDeploy({ ...payload(), sha: 'abc' })).toBeNull();
		expect(parseDeploy({ ...payload(), commits: [] })).toBeNull();
		expect(parseDeploy({ sha: SHA, commits: [{ sha: 'x', prs: [{ number: -1 }] }] })).toBeNull();
	});
});

describe('deployNoticeText', () => {
	const item = {
		number: 629,
		title: 'Evento: <afiche> & tapa',
		url: 'https://github.com/GorroRojo/kinkyvibe/pull/629',
		summary: 'La tapa <b>vuelve</b>.'
	};
	const commit = `Commit <a href="https://github.com/GorroRojo/kinkyvibe/commit/${SHA}"><code>a1b2c3d</code></a>`;

	it('uno, en producción: título, número, descripción y commit, escapados', () => {
		expect(deployNoticeText({ outcome: 'success', sha: SHA, items: [item] })).toBe(
			[
				'🚀 En producción: <a href="https://github.com/GorroRojo/kinkyvibe/pull/629">Evento: &lt;afiche&gt; &amp; tapa</a> (#629)',
				'<i>La tapa &lt;b&gt;vuelve&lt;/b&gt;.</i>',
				'',
				commit
			].join('\n')
		);
	});

	it('uno que falló: lo dice y que sigue la versión anterior', () => {
		const text = deployNoticeText({
			outcome: 'failure',
			sha: SHA,
			items: [{ ...item, summary: '' }]
		});
		expect(text).toBe(
			[
				'⚠️ Falló el deploy de <a href="https://github.com/GorroRojo/kinkyvibe/pull/629">Evento: &lt;afiche&gt; &amp; tapa</a> (#629)',
				'',
				'Producción sigue con la versión anterior.',
				commit
			].join('\n')
		);
	});

	it('uno sin terminar a tiempo', () => {
		const text = deployNoticeText({ outcome: 'timed_out', sha: SHA, items: [item] });
		expect(text.split('\n')[0]).toMatch(
			/^⏳ El deploy de <a .*\(#629\) no terminó en 20 minutos\.$/
		);
		expect(text).toContain('Mirá el build en Cloudflare.');
	});

	it('varios: en lista, con «y N más» pasado el tope', () => {
		const items = Array.from({ length: DEPLOY_ITEMS_MAX + 2 }, (_, i) => ({
			...item,
			number: i + 1,
			title: `PR ${i + 1}`,
			summary: i === 0 ? 'Primero.' : ''
		}));
		const lines = deployNoticeText({ outcome: 'success', sha: SHA, items }).split('\n');
		expect(lines[0]).toBe(`🚀 En producción, ${DEPLOY_ITEMS_MAX + 2} cambios:`);
		expect(lines[2]).toBe(
			'• <a href="https://github.com/GorroRojo/kinkyvibe/pull/629">PR 1</a> (#1)'
		);
		expect(lines[3]).toBe('<i>Primero.</i>');
		expect(lines).toContain('• y 2 más');
		expect(lines.at(-1)).toBe(commit);
		expect(
			deployNoticeText({ outcome: 'failure', sha: SHA, items: items.slice(0, 2) }).split('\n')[0]
		).toBe('⚠️ Falló el deploy de 2 cambios:');
	});
});

describe('notifyDeploy', () => {
	it('solo a quien prendió «Cada deploy», una vez por commit y resultado', async () => {
		const deploy = /** @type {NonNullable<ReturnType<typeof parseDeploy>>} */ (
			parseDeploy(payload())
		);
		const tg = telegram();
		expect(await notifyDeploy({ db: t.db, send: tg.send, deploy, now: T0 })).toEqual({
			sent: 1,
			failed: 0,
			skipped: 0
		});
		expect(tg.sent).toHaveLength(1);
		expect(tg.sent[0].chatId).toBe('5001');
		expect(tg.sent[0].silent).toBe(false);
		expect(tg.sent[0].text).toContain('🚀 En producción:');
		// El workflow vuelve a correr: no se repite.
		expect(await notifyDeploy({ db: t.db, send: tg.send, deploy, now: T0 })).toEqual({
			sent: 0,
			failed: 0,
			skipped: 1
		});
		// Otro resultado del mismo commit sí sale.
		await notifyDeploy({
			db: t.db,
			send: tg.send,
			deploy: { ...deploy, outcome: 'failure' },
			now: T0
		});
		expect(tg.sent).toHaveLength(2);
	});

	it('de noche, sin sonido; si Telegram falla, se puede reintentar', async () => {
		const deploy = /** @type {NonNullable<ReturnType<typeof parseDeploy>>} */ (
			parseDeploy(payload())
		);
		const bad = telegram('failed');
		expect((await notifyDeploy({ db: t.db, send: bad.send, deploy, now: NIGHT }))?.failed).toBe(1);
		expect(bad.sent[0].silent).toBe(true);
		const ok = telegram();
		expect((await notifyDeploy({ db: t.db, send: ok.send, deploy, now: NIGHT }))?.sent).toBe(1);
	});

	it('si nadie lo prendió: null', async () => {
		await setAdminNotice(t.db, ADMIN.id, 'cada_deploy', false);
		const deploy = /** @type {NonNullable<ReturnType<typeof parseDeploy>>} */ (
			parseDeploy(payload())
		);
		expect(await notifyDeploy({ db: t.db, send: telegram().send, deploy, now: T0 })).toBeNull();
	});

	it('con el bot de admins apagado o sin token, no manda nada', async () => {
		const deploy = /** @type {NonNullable<ReturnType<typeof parseDeploy>>} */ (
			parseDeploy(payload())
		);
		expect(await runDeployNotice({ db: t.db, deploy })).toMatchObject({
			sent: 0,
			reason: 'sin TELEGRAM_BOT_TOKEN'
		});
		await setFlag(t.db, 'telegram_admin', false, { by: 'prueba' });
		clearFlagCache();
		const tg = telegram();
		expect(await runDeployNotice({ db: t.db, deploy, send: tg.send })).toMatchObject({
			sent: 0,
			reason: 'bot de admins apagado'
		});
		expect(tg.sent).toHaveLength(0);
	});
});

describe('isValidDeploySecret', () => {
	it('solo el mismo secreto, y nunca sin uno configurado o muy corto', async () => {
		expect(await isValidDeploySecret(SECRET, SECRET)).toBe(true);
		expect(await isValidDeploySecret('x'.repeat(SECRET.length), SECRET)).toBe(false);
		expect(await isValidDeploySecret(`${SECRET}x`, SECRET)).toBe(false);
		expect(await isValidDeploySecret(null, SECRET)).toBe(false);
		expect(await isValidDeploySecret('corto', 'corto')).toBe(false);
		expect(await isValidDeploySecret('', '')).toBe(false);
	});
});

describe('POST /api/interno/deploy', () => {
	/**
	 * @param {{ header?: string, body?: string, platform?: any, fetchFn?: typeof fetch }} [o]
	 */
	function call({ header, body = JSON.stringify(payload()), platform = t.platform, fetchFn } = {}) {
		/** @type {Record<string, string>} */
		const headers = { 'content-type': 'application/json' };
		if (header !== undefined) headers['x-deploy-secret'] = header;
		const request = new Request('https://kinkyvibe.ar/api/interno/deploy', {
			method: 'POST',
			headers,
			body
		});
		return POST(/** @type {any} */ ({ request, platform, fetch: fetchFn ?? fetch }));
	}

	it('sin DEPLOY_NOTIFY_SECRET (o muy corto): 503', async () => {
		expect((await call({ header: SECRET })).status).toBe(503);
		env.DEPLOY_NOTIFY_SECRET = 'corto';
		expect((await call({ header: 'corto' })).status).toBe(503);
	});

	it('con otro secreto o sin header: 401', async () => {
		env.DEPLOY_NOTIFY_SECRET = SECRET;
		expect((await call({ header: 'x'.repeat(SECRET.length) })).status).toBe(401);
		expect((await call()).status).toBe(401);
	});

	it('un pedido roto: 400', async () => {
		env.DEPLOY_NOTIFY_SECRET = SECRET;
		expect((await call({ header: SECRET, body: '{' })).status).toBe(400);
		expect((await call({ header: SECRET, body: '{"sha":"x","commits":[]}' })).status).toBe(400);
	});

	it('con el secreto: manda el aviso por Telegram a quien lo prendió', async () => {
		env.DEPLOY_NOTIFY_SECRET = SECRET;
		env.TELEGRAM_BOT_TOKEN = '123:prueba';
		/** @type {{ url: string, body: any }[]} */
		const calls = [];
		const fetchFn = /** @type {typeof fetch} */ (
			async (url, init) => {
				calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
				return new Response(JSON.stringify({ ok: true, result: {} }), {
					headers: { 'content-type': 'application/json' }
				});
			}
		);
		const res = await call({ header: SECRET, platform: { env: { DB: t.db } }, fetchFn });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			outcome: 'success',
			items: 1,
			sent: 1,
			failed: 0,
			skipped: 0
		});
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toContain('/sendMessage');
		expect(calls[0].body.chat_id).toBe('5001');
		expect(calls[0].body.text).toContain('(#629)');
		expect(calls[0].body.text).toContain('<i>The poster was stretched on event pages.</i>');
	});

	it('un deploy que falló: el aviso lo dice', async () => {
		env.DEPLOY_NOTIFY_SECRET = SECRET;
		env.TELEGRAM_BOT_TOKEN = '123:prueba';
		/** @type {string[]} */
		const texts = [];
		const fetchFn = /** @type {typeof fetch} */ (
			async (_url, init) => {
				texts.push(JSON.parse(String(init?.body)).text);
				return new Response(JSON.stringify({ ok: true, result: {} }));
			}
		);
		const res = await call({
			header: SECRET,
			body: JSON.stringify(payload('failure')),
			platform: { env: { DB: t.db } },
			fetchFn
		});
		expect(res.status).toBe(200);
		expect(texts[0]).toMatch(/^⚠️ Falló el deploy de /);
	});
});
