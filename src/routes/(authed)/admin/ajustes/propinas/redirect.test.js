/**
 * `/admin/ajustes/propinas` se mudó a Estadísticas › Propinas: redirige (308) y conserva el `?`.
 */
import { describe, expect, it } from 'vitest';
import { ADMINS } from '$lib/server/auth';
import { GET } from './+server.js';

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {string} path
 * @param {object} locals
 */
function thrown(path, locals) {
	try {
		GET(/** @type {any} */ ({ url: new URL(path, 'https://kinkyvibe.test'), locals }));
	} catch (e) {
		return /** @type {{ status: number, location: string }} */ (e);
	}
	throw new Error('no redirigió');
}

describe('/admin/ajustes/propinas redirige a Estadísticas › Propinas (308)', () => {
	it('a /admin/estadisticas/propinas, con lo que viniera después del ?', () => {
		const signed = { user: admin, user_token: 'token-de-prueba' };
		expect(thrown('/admin/ajustes/propinas', signed)).toMatchObject({
			status: 308,
			location: '/admin/estadisticas/propinas'
		});
		expect(thrown('/admin/ajustes/propinas?destino=fondo', signed).location).toBe(
			'/admin/estadisticas/propinas?destino=fondo'
		);
	});

	it('sin sesión, primero al login', () => {
		expect(thrown('/admin/ajustes/propinas', {}).status).toBe(303);
	});
});
