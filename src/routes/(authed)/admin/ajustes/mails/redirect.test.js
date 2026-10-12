/**
 * `/admin/ajustes/mails` se mudó a Mensajes › Configuración (gorrite, 11/10): redirige (308) para
 * que los favoritos y los formularios abiertos sigan andando.
 */
import { describe, expect, it } from 'vitest';
import { ADMINS } from '$lib/server/auth';
import { GET, POST } from './+server.js';

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };
const locals = /** @type {App.Locals} */ (
	/** @type {unknown} */ ({ user: admin, user_token: 'token-de-prueba' })
);

/**
 * @param {typeof GET} handler
 * @param {string} path
 * @param {App.Locals} who
 */
function thrown(handler, path, who) {
	try {
		handler(/** @type {any} */ ({ url: new URL(path, 'https://kinkyvibe.test'), locals: who }));
	} catch (e) {
		return /** @type {{ status: number, location: string }} */ (e);
	}
	throw new Error('no redirigió');
}

describe('/admin/ajustes/mails redirige a Mensajes › Configuración (308)', () => {
	it('a /admin/mensajes/configuracion, con lo que viniera después del ?', () => {
		const plain = thrown(GET, '/admin/ajustes/mails', locals);
		expect(plain.status).toBe(308);
		expect(plain.location).toBe('/admin/mensajes/configuracion');
		const form = thrown(POST, '/admin/ajustes/mails?/save', locals);
		expect(form.status).toBe(308);
		expect(form.location).toBe('/admin/mensajes/configuracion?/save');
	});

	it('sin sesión, primero al login', () => {
		const anon = /** @type {App.Locals} */ (/** @type {unknown} */ ({}));
		const r = thrown(GET, '/admin/ajustes/mails', anon);
		expect(r.status).toBe(303);
		const to = new URL(r.location, 'https://kinkyvibe.test');
		expect(to.pathname).toBe('/login');
		expect(to.searchParams.get('redirectTo')).toBe('/admin/ajustes/mails');
	});
});
