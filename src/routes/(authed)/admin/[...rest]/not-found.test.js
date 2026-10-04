/**
 * 404 del panel: una dirección de /admin que no es de ninguna página da 404 adentro del marco del
 * panel (menú y barra de arriba), no en la página de error del sitio. La ruta `[...rest]` hace
 * que SvelteKit cargue el layout del panel y `admin/+error.svelte` dibuja el error adentro.
 */
import { describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { existsSync } from 'node:fs';
import { render } from 'svelte/server';
import { ADMINS } from '$lib/server/auth';
import { panelErrorCopy } from '$lib/admin/panelError.js';
import * as route from './+page.server.js';

const pageStore = vi.hoisted(() => ({
	/** @type {any} */
	value: null
}));

vi.mock('$app/stores', () => ({
	page: {
		subscribe: (/** @type {(v: any) => void} */ fn) => readable(pageStore.value).subscribe(fn)
	}
}));

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/** @param {string} path @param {any} [user] @returns {any} */
const fakeEvent = (path, user = admin) => ({
	url: new URL(path, 'https://kinkyvibe.ar'),
	locals: { user, user_token: user ? 't' : '' }
});

/** @param {() => unknown} fn @returns {any} */
function thrown(fn) {
	try {
		fn();
		return null;
	} catch (e) {
		return e;
	}
}

describe('/admin/<dirección que no existe>', () => {
	it('para une admin: 404 (que se dibuja dentro del panel)', () => {
		const e = thrown(() => route.load(fakeEvent('/admin/no-existe/tampoco')));
		expect(e?.status).toBe(404);
	});

	it('sin sesión, al login; sin permiso, 403 (como el resto del panel)', () => {
		const anon = thrown(() => route.load(fakeEvent('/admin/no-existe', null)));
		expect(anon?.status).toBe(303);
		expect(anon?.location).toMatch(/^\/login\?redirectTo=/);
		const stranger = thrown(() =>
			route.load(fakeEvent('/admin/no-existe', { id: 1, login: 'persona-inventada' }))
		);
		expect(stranger?.status).toBe(403);
	});

	it('el error del panel vive en la carpeta del panel, adentro de su layout', () => {
		const adminDir = new URL('../', import.meta.url);
		expect(existsSync(new URL('+layout.svelte', adminDir))).toBe(true);
		expect(existsSync(new URL('+error.svelte', adminDir))).toBe(true);
	});

	it('la página de error del panel: en castellano, con el link al Inicio del panel', async () => {
		pageStore.value = {
			status: 404,
			error: { message: 'Not Found' },
			url: new URL('https://kinkyvibe.ar/admin/no-existe')
		};
		const { default: ErrorPage } = await import('../+error.svelte');
		const body = render(ErrorPage).body;
		expect(body).toContain('No encontramos esta página');
		expect(body).toContain('href="/admin"');
		expect(body).toContain('Volver al Inicio');
		expect(body).not.toContain('Not Found');
		expect(body).not.toContain('Probar de nuevo');
	});
});

describe('panelErrorCopy', () => {
	it('404, 5xx y otros 4xx; el mensaje propio solo si no es el de SvelteKit', () => {
		expect(panelErrorCopy(404, 'Not Found')).toMatchObject({
			title: 'No encontramos esta página',
			detail: ''
		});
		expect(panelErrorCopy(404, 'Ese evento no existe.').detail).toBe('Ese evento no existe.');
		expect(panelErrorCopy(500, 'D1_ERROR: algo interno')).toMatchObject({
			title: 'Algo se rompió',
			detail: ''
		});
		expect(panelErrorCopy(500, 'D1_ERROR: algo interno', { dev: true }).detail).toBe(
			'D1_ERROR: algo interno'
		);
		expect(panelErrorCopy(400, 'Bad Request')).toMatchObject({
			title: 'No se pudo abrir esta página',
			detail: ''
		});
	});
});
