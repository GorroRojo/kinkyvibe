/**
 * Mi rincón → Telegram (fase 2 del bot): con cualquiera de `telegram_bot`, `lo_que_sigo` o
 * `cuentas` apagado, 404 y Lo que sigo sin nada de Telegram; sin sesión, a /ingresar; con sesión,
 * pedir un código, vincular (como lo haría el bot), ver las casillas de Telegram en Lo que sigo,
 * guardarlas y desconectar. D1 de miniflare; cuentas y chats inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeAccount } from '$lib/server/amigues/testing.js';
import { fakeRequestEvent, thrown } from '$lib/server/series/fixtures.js';
import { consumeLinkCode, getTelegramLink } from '$lib/server/telegram/link.js';

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
	vi.doUnmock('$lib/utils');
	vi.resetModules();
});

const CHAT = 555555555;

/** @param {{ bot?: string, sigo?: string, cuentas?: string }} [flags] */
async function modules({ bot = '1', sigo = '1', cuentas = '1' } = {}) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({
		env: {
			TELEGRAM_BOT_ENABLED: bot,
			LO_QUE_SIGO_ENABLED: sigo,
			CUENTAS_ENABLED: cuentas,
			PERFILES_PUBLICOS_ENABLED: '0',
			TELEGRAM_BOT_USERNAME: 'BotInventadoBot'
		}
	}));
	vi.doMock('$lib/utils', async (importOriginal) => ({
		.../** @type {object} */ (await importOriginal()),
		fetchMarkdownPosts: async () => []
	}));
	return {
		telegram: await import('./+page.server.js'),
		sigo: await import('../sigo/+page.server.js')
	};
}

/** @param {Parameters<typeof fakeRequestEvent>[0] extends infer O ? Omit<O, 'platform'> : never} o */
const ev = (o) => fakeRequestEvent({ platform: t.platform, path: '/mi-rincon/telegram', ...o });

describe('interruptores', () => {
	for (const flags of [{ bot: '0' }, { sigo: '0' }, { cuentas: '0' }]) {
		it(`apagado (${JSON.stringify(flags)}): 404, y Lo que sigo sin Telegram`, async () => {
			const m = await modules(flags);
			const member = await makeAccount(t.db, 'tg-apagado');
			const notFound = { status: 404 };
			expect(await thrown(() => m.telegram.load(ev({ member })))).toMatchObject(notFound);
			expect(await thrown(() => m.telegram.actions.codigo(ev({ member, form: {} })))).toMatchObject(
				notFound
			);
			expect(
				await thrown(() => m.telegram.actions.desconectar(ev({ member, form: {} })))
			).toMatchObject(notFound);
			const { results } = await t.db.prepare('SELECT * FROM telegram_link_codes').all();
			expect(results).toEqual([]);
			if (flags.bot === '0') {
				const data = /** @type {any} */ (
					await m.sigo.load(ev({ path: '/mi-rincon/sigo', member }))
				);
				expect(data.telegram).toBeNull();
			}
		});
	}
});

describe('sin sesión', () => {
	it('la página y las acciones llevan a /ingresar (y de vuelta a Lo que sigo)', async () => {
		const m = await modules();
		const login = { status: 303, location: '/ingresar?next=%2Fmi-rincon%2Fsigo' };
		expect(await thrown(() => m.telegram.load(ev({})))).toMatchObject(login);
		expect(await thrown(() => m.telegram.actions.codigo(ev({ form: {} })))).toMatchObject(login);
	});
});

describe('con sesión', () => {
	it('código, vincular, casillas de Telegram en Lo que sigo y desconectar', async () => {
		const m = await modules();
		const member = await makeAccount(t.db, 'tg-con-sesion');

		let data = /** @type {any} */ (await m.telegram.load(ev({ member })));
		expect(data.telegram).toEqual({
			linked: false,
			muted: false,
			linkedAt: null,
			botUsername: 'BotInventadoBot'
		});

		const r = /** @type {any} */ (await m.telegram.actions.codigo(ev({ member, form: {} })));
		expect(r).toMatchObject({ action: 'codigo', ok: true });
		expect(r.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

		// Lo que haría el bot con /vincular desde un chat privado.
		expect(await consumeLinkCode(t.db, r.code, CHAT)).toMatchObject({ ok: true });
		data = await m.telegram.load(ev({ member }));
		expect(data.telegram).toMatchObject({ linked: true, muted: false });

		// En Lo que sigo: la tarjeta conectada y las casillas de Telegram dentro de las opciones.
		await m.sigo.actions.seguir(
			ev({ path: '/mi-rincon/sigo', member, form: { tipo: 'etiqueta', clave: 'shibari' } })
		);
		data = await m.sigo.load(ev({ path: '/mi-rincon/sigo', member }));
		expect(data.telegram).toMatchObject({ linked: true });
		expect(data.follows[0].options).toEqual({
			calendario: true,
			mail_nuevo: true,
			recordatorio: false,
			telegram_nuevo: false,
			telegram_recordatorio: false
		});

		// Guardar con la columna Telegram (canal=telegram) prende sus casillas.
		const form = new URLSearchParams([
			['tipo', 'etiqueta'],
			['clave', 'shibari'],
			['canal', 'mail'],
			['canal', 'telegram'],
			['mail_nuevo', 'on'],
			['telegram_recordatorio', 'on']
		]);
		const saveEvent = ev({ path: '/mi-rincon/sigo', member });
		saveEvent.request = new Request('https://kinkyvibe.ar/mi-rincon/sigo?/opciones', {
			method: 'POST',
			body: form
		});
		expect(await m.sigo.actions.opciones(saveEvent)).toMatchObject({ ok: true });
		data = await m.sigo.load(ev({ path: '/mi-rincon/sigo', member }));
		expect(data.follows[0].options).toMatchObject({
			mail_nuevo: true,
			telegram_nuevo: false,
			telegram_recordatorio: true
		});

		expect(await m.telegram.actions.desconectar(ev({ member, form: {} }))).toMatchObject({
			action: 'desconectar',
			ok: true
		});
		expect(await getTelegramLink(t.db, member.id)).toBeNull();
		// Desconectada: Lo que sigo vuelve a las opciones de siempre (lo elegido queda guardado).
		data = await m.sigo.load(ev({ path: '/mi-rincon/sigo', member }));
		expect(data.telegram).toMatchObject({ linked: false });
		expect(data.follows[0].options).toEqual({
			calendario: false,
			mail_nuevo: true,
			recordatorio: false
		});
		const row = await t.db.prepare('SELECT tg_reminder FROM follows').first();
		expect(row?.tg_reminder).toBe(1);
	});

	it('el código de una cuenta no vincula a otra: cada una ve solo lo suyo', async () => {
		const m = await modules();
		const a = await makeAccount(t.db, 'tg-a');
		const b = await makeAccount(t.db, 'tg-b');
		const r = /** @type {any} */ (await m.telegram.actions.codigo(ev({ member: a, form: {} })));
		await consumeLinkCode(t.db, r.code, CHAT);
		const dataB = /** @type {any} */ (await m.telegram.load(ev({ member: b })));
		expect(dataB.telegram.linked).toBe(false);
		const dataA = /** @type {any} */ (await m.telegram.load(ev({ member: a })));
		expect(dataA.telegram.linked).toBe(true);
	});
});
