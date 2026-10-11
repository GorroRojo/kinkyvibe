import { describe, expect, it, vi } from 'vitest';

/** @type {any} */
let pageData = null;
vi.mock('$lib/server/db', () => ({ getDB: () => ({}) }));
vi.mock('$lib/server/amigues/pages.js', () => ({ profilePageData: async () => pageData }));

const { GET } = await import('./+server.js');

/** @param {string} profile */
const get = (profile) =>
	GET(/** @type {any} */ ({ params: { profile }, platform: {}, locals: {} }));

describe('GET /amigues/<perfil>/contacto.vcf', () => {
	it('404 si el perfil no se puede ver', async () => {
		pageData = null;
		await expect(get('nadie')).rejects.toMatchObject({ status: 404 });
	});

	it('404 si el perfil no muestra contacto', async () => {
		pageData = {
			profile: { slug: 'Sin-Contacto', title: 'Sin Contacto', links: [], email: null, tel: null },
			canonical: '/amigues/Sin-Contacto',
			private: false
		};
		await expect(get('Sin-Contacto')).rejects.toMatchObject({ status: 404 });
	});

	it('la tarjeta, como descarga; privada si quien mira tiene sesión', async () => {
		pageData = {
			profile: { slug: 'Persona-Inventada', title: 'Persona Inventada', email: 'p@example.com' },
			canonical: '/amigues/Persona-Inventada',
			private: true
		};
		const res = await get('Persona-Inventada');
		expect(res.headers.get('content-type')).toBe('text/vcard; charset=utf-8');
		expect(res.headers.get('content-disposition')).toBe(
			'attachment; filename="Persona-Inventada.vcf"'
		);
		expect(res.headers.get('cache-control')).toBe('private, no-store');
		expect(await res.text()).toContain('EMAIL;TYPE=INTERNET:p@example.com');
	});
});
