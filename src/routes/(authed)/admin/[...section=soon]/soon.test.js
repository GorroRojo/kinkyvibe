/**
 * Página "Próximamente" de las secciones que vienen (mapa del panel): solo admins, dice qué va a
 * hacer la sección y su fase, y solo responde en las URLs reservadas. También el menú con
 * "Ocultar lo que viene" (SideNav y el panel "Más" del celu).
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { ADMINS } from '$lib/server/auth';
import { NAV, navItem } from '$lib/admin/nav.js';
import * as route from './+page.server.js';
import Page from './+page.svelte';
import SideNav from '$lib/components/admin/panel/SideNav.svelte';
import MoreAreas from '$lib/components/admin/panel/MoreAreas.svelte';

const admin = { id: ADMINS[0].id, login: ADMINS[0].login };

/**
 * @param {string} path
 * @param {any} [user]
 * @returns {any}
 */
function fakeEvent(path, user = admin) {
	return {
		url: new URL(path, 'https://kinkyvibe.ar'),
		locals: { user, user_token: user ? 't' : '' }
	};
}

/** @param {() => unknown} fn @returns {any} */
function thrown(fn) {
	try {
		fn();
		return null;
	} catch (e) {
		return e;
	}
}

describe('/admin/<sección que viene>', () => {
	it('sin sesión redirige al login; sin permiso, 403', () => {
		expect(thrown(() => route.load(fakeEvent('/admin/mensajes', null)))?.status).toBe(303);
		const stranger = { id: 1, login: 'alguien-de-prueba' };
		expect(thrown(() => route.load(fakeEvent('/admin/mensajes', stranger)))?.status).toBe(403);
	});

	it('cada sección que viene muestra su nombre, su área, su fase y qué va a hacer', () => {
		for (const item of NAV.filter((i) => i.soon)) {
			const data = /** @type {any} */ (route.load(fakeEvent(item.href)));
			expect(data.soon).toMatchObject({
				id: item.id,
				label: item.label,
				phase: item.phase,
				text: item.soonText
			});
			expect(data.soon.area).toBeTruthy();
			const { body } = render(Page, { props: { data } });
			expect(body).toContain('Próximamente');
			expect(body).toContain(`fase ${item.phase}`);
			expect(body).toContain(String(item.soonText).slice(0, 40));
			expect(body).toContain('Ocultar lo que viene');
		}
	});

	it('una URL que no es de una sección que viene da 404', () => {
		expect(thrown(() => route.load(fakeEvent('/admin/inventada')))?.status).toBe(404);
	});
});

describe('menú: lo que viene y "Ocultar lo que viene"', () => {
	const active = navItem('ajustes-plantillas');

	it('la barra lateral muestra lo que viene con su fase y lo oculta si se pide', () => {
		const shown = render(SideNav, { props: { active, counts: {}, flags: {} } }).body;
		expect(shown).toContain('href="/admin/mensajes"');
		expect(shown).toContain('fase 5');
		// El área de la página actual está abierta; Interruptores está en Ajustes › Sistema.
		expect(shown).toMatch(/aria-expanded="true"[^>]*>.*Mensajes/s);
		expect(shown).toContain('href="/admin/ajustes/interruptores"');
		expect(shown).toContain('Sistema');

		const hidden = render(SideNav, {
			props: { active, counts: {}, flags: {}, hideSoon: true }
		}).body;
		expect(hidden).not.toContain('href="/admin/mensajes"');
		expect(hidden).not.toMatch(/fase \d/);
		expect(hidden).toContain('href="/admin/mensajes/plantillas"');
	});

	it('el panel "Más" lista las áreas con sus próximamente, y sin ellas si se ocultan', () => {
		const shown = render(MoreAreas, { props: { active, counts: { transfers: 2 } } }).body;
		for (const label of ['Eventos', 'Ventas', 'Comunidad', 'Mensajes', 'Ajustes'])
			expect(shown).toContain(label);
		expect(shown).toContain('próximamente');
		const hidden = render(MoreAreas, { props: { active, hideSoon: true } }).body;
		expect(hidden).not.toContain('próximamente');
	});

	// «Interruptor apagado → "prueba"» ya no tiene sección real (`cuentas` quedó prendido para
	// siempre); el mecanismo lo cubre navState en src/lib/admin/nav.test.js.
	it('Cuentas ya no dice "prueba" aunque llegue un `cuentas: false` viejo', () => {
		const body = render(SideNav, {
			props: { active: navItem('cuentas'), counts: {}, flags: { cuentas: false } }
		}).body;
		const link = body.match(/<a[^>]*href="\/admin\/comunidad\/cuentas"[^>]*>[\s\S]*?<\/a>/)?.[0];
		expect(link).toBeTruthy();
		expect(link).not.toContain('prueba');
	});
});
