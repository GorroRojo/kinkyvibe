/**
 * Comunidad › Avisos de puerta (decisión 0053): solo admins (sin sesión, al login; sin permiso,
 * 403) en la página y en cada acción, y la respuesta de las acciones no devuelve el mail ni el
 * motivo. D1 de miniflare; datos inventados (example.com).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { ADMINS } from '$lib/server/auth';
import { render } from 'svelte/server';
import * as page from './+page.server.js';
import Page from './+page.svelte';

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

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const REASON = 'Motivo inventado que nunca tiene que salir del panel';

/**
 * @param {{ form?: Record<string, string>, user?: any, token?: string | null }} [o]
 */
function fakeEvent({ form, user, token } = {}) {
	const url = new URL('/admin/comunidad/avisos-de-puerta', 'https://kinkyvibe.ar');
	/** @type {any} */
	const event = {
		url,
		params: {},
		platform: t.platform,
		locals: {
			user: user === undefined ? admin : user,
			user_token: token === undefined ? 'token-de-prueba' : token
		},
		setHeaders: () => {},
		request: new Request(url, {
			method: form ? 'POST' : 'GET',
			body: form ? new URLSearchParams(form) : undefined
		})
	};
	return event;
}

/** @param {() => unknown} fn */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return /** @type {any} */ (e);
	}
}

const actions = /** @type {Record<string, (e: any) => Promise<any>>} */ (
	/** @type {unknown} */ (page.actions)
);

describe('solo admins', () => {
	const forms = {
		agregar: { mail: 'persona@example.com', vence: '6m', motivo: REASON },
		renovar: { id: 'x', vence: '6m' },
		quitar: { id: 'x' },
		buscar: { mail: 'persona@example.com' }
	};

	it('sin sesión: al login; con una cuenta que no es admin: 403 (página y acciones)', async () => {
		const load = /** @type {(e: any) => Promise<any>} */ (page.load);
		const noSession = await thrown(() => load(fakeEvent({ user: null, token: null })));
		expect(noSession?.status).toBe(303);
		const notAdmin = { id: 999999999, login: 'no-admin-inventade' };
		expect((await thrown(() => load(fakeEvent({ user: notAdmin }))))?.status).toBe(403);
		for (const [name, form] of Object.entries(forms)) {
			const e1 = await thrown(() => actions[name](fakeEvent({ form, user: null, token: null })));
			expect(e1?.status, name).toBe(303);
			const e2 = await thrown(() => actions[name](fakeEvent({ form, user: notAdmin })));
			expect(e2?.status, name).toBe(403);
		}
		// Nada quedó cargado.
		const { results } = await t.db.prepare('SELECT * FROM door_notices').all();
		expect(results).toHaveLength(0);
	});
});

describe('como admin', () => {
	it('carga, lista con el motivo, busca, renueva y quita; las respuestas no repiten el mail', async () => {
		const added = await actions.agregar(
			fakeEvent({ form: { mail: 'persona@example.com', vence: '1y', motivo: REASON } })
		);
		expect(added.add.message).toContain('quedó para ese mail');
		expect(JSON.stringify(added)).not.toContain('persona@example.com');
		expect(JSON.stringify(added)).not.toContain('Motivo inventado');

		const data = await /** @type {(e: any) => Promise<any>} */ (page.load)(fakeEvent());
		expect(data.dbAvailable).toBe(true);
		expect(data.notices).toHaveLength(1);
		expect(data.notices[0].reason).toBe(REASON);
		const id = data.notices[0].id;

		const found = await actions.buscar(fakeEvent({ form: { mail: 'PERSONA@example.com' } }));
		expect(found.search).toEqual({ ids: [id], none: false });

		const again = await actions.agregar(
			fakeEvent({ form: { mail: 'persona@example.com', vence: '6m' } })
		);
		expect(again.status).toBe(400);

		const tooLong = await actions.agregar(
			fakeEvent({ form: { mail: 'otra@example.com', vence: 'fecha', fecha: '2099-01-01' } })
		);
		expect(tooLong.status).toBe(400);

		expect((await actions.renovar(fakeEvent({ form: { id, vence: '6m' } }))).row.message).toBe(
			'Renovado.'
		);
		expect((await actions.quitar(fakeEvent({ form: { id } }))).removed).toBeTruthy();
		expect((await actions.quitar(fakeEvent({ form: { id } }))).status).toBe(404);
	});
});

describe('la lista del panel', () => {
	it('cada motivo queda escondido en un <details>, no a la vista', async () => {
		await actions.agregar(
			fakeEvent({ form: { mail: 'persona@example.com', vence: '1y', motivo: REASON } })
		);
		await actions.agregar(fakeEvent({ form: { mail: 'otra@example.com', vence: '6m' } }));
		const data = await /** @type {(e: any) => Promise<any>} */ (page.load)(fakeEvent());
		const html = render(Page, { props: { data, form: null } }).body;
		const at = html.indexOf(REASON);
		expect(at).toBeGreaterThan(-1);
		// El motivo está adentro de un <details> cerrado (sin `open`), después de su <summary>.
		const opened = html.lastIndexOf('<details', at);
		expect(opened).toBeGreaterThan(-1);
		expect(html.slice(opened, at)).toMatch(/<summary[^>]*>Ver el motivo<\/summary>/);
		expect(html.slice(opened, html.indexOf('>', opened))).not.toContain('open');
		expect(html.indexOf('</details>', opened)).toBeGreaterThan(at);
		// Uno por aviso con motivo: el que no tiene, no muestra nada.
		expect(html.split('Ver el motivo').length - 1).toBe(1);
	});
});
