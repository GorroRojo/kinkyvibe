/**
 * Mi rincón y Mi rincón → Calendario, render del servidor, con «Lo que sigo» apagado (como
 * siempre: la tarjeta «Tu calendario»; el interruptor `series` quedó fijo) y prendido (una sola tarjeta,
 * «Lo que seguís y tu calendario», que lleva a /mi-rincon/sigo; /mi-rincon/calendario sigue
 * andando y lleva ahí). Y que ningún link de estas páginas a Mi rincón apunte a una ruta que no
 * existe. Datos inventados.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/mi-rincon/calendario') })
}));

const { default: Rincon } = await import('./+page.svelte');
const { default: Calendario } = await import('./calendario/+page.svelte');
const { default: Sigo } = await import('./sigo/+page.svelte');

/** @param {{ sigoOn: boolean }} flags */
const rincon = (flags) =>
	render(Rincon, {
		props: /** @type {any} */ ({
			data: {
				email: 'persona.prueba@example.com',
				hasPassword: false,
				createdAt: 0,
				canHaveProfiles: false,
				ordersError: false,
				saved: { name: '', pronouns: '', hasDni: false, dniMasked: '' },
				savedError: false,
				orders: [],
				...flags
			},
			form: null
		})
	}).body;

/** @param {any} data @param {any} [form] */
const calendario = (data, form = null) =>
	render(Calendario, { props: /** @type {any} */ ({ data, form }) }).body;

const sigo = () =>
	render(Sigo, {
		props: /** @type {any} */ ({
			data: {
				follows: [],
				calendar: { entradas: true, participo: true },
				feed: { createdAt: 0, lastUsedAt: null },
				add: { tags: [], profiles: [] }
			},
			form: null
		})
	}).body;

/** Los href de una página. @param {string} html */
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/** Cuántas veces aparece un link. @param {string} html @param {string} href */
const count = (html, href) => hrefs(html).filter((h) => h === href).length;

/** Las tarjetas de Mi rincón (sus títulos). @param {string} html */
const cards = (html) => [...html.matchAll(/<h2 id="[^"]+"[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);

describe('Mi rincón con «Lo que sigo» apagado: como siempre', () => {
	it('la tarjeta «Tu calendario» lleva a Mi rincón → Calendario; nada de Lo que sigo', () => {
		const html = rincon({ sigoOn: false });
		expect(cards(html)).toEqual([
			'Tu cuenta',
			'Tu calendario',
			'Tus compras',
			'Mis datos',
			'Contraseña',
			'Borrar tu cuenta'
		]);
		expect(html).toContain('Tus eventos en tu calendario y los avisos de series que pediste.');
		expect(count(html, '/mi-rincon/calendario')).toBe(1);
		expect(html).toContain('Ver tu calendario');
		expect(count(html, '/mi-rincon/sigo')).toBe(0);
		expect(html).not.toContain('Lo que seguís');
	});
});

describe('Mi rincón con «Lo que sigo» prendido: una sola tarjeta', () => {
	it('«Lo que seguís y tu calendario» lleva a /mi-rincon/sigo', () => {
		const html = rincon({ sigoOn: true });
		expect(cards(html)).toEqual([
			'Tu cuenta',
			'Lo que seguís y tu calendario',
			'Tus compras',
			'Mis datos',
			'Contraseña',
			'Borrar tu cuenta'
		]);
		expect(count(html, '/mi-rincon/sigo')).toBe(1);
		expect(html).toContain('Ver lo que seguís');
		expect(html).toContain('tus entradas y donde participás');
		// La tarjeta vieja no está: el calendario es parte de Lo que sigo.
		expect(count(html, '/mi-rincon/calendario')).toBe(0);
		expect(html).not.toContain('Ver tu calendario');
	});
});

describe('Mi rincón → Calendario', () => {
	const old = {
		sigoOn: false,
		feed: { createdAt: 0, lastUsedAt: null },
		series: [{ id: 'Picantearla', name: 'Picantearla', href: '/wiki/Picantearla' }]
	};

	it('apagado: como siempre (el link y los avisos de series)', () => {
		const html = calendario(old);
		expect(html).toContain('Lo tuyo en tu calendario');
		expect(html).toContain('Avisos de series');
		expect(html).toMatch(/<form[^>]*action="\?\/crear"/);
		expect(html).toMatch(/<form[^>]*action="\?\/baja"/);
		expect(count(html, '/mi-rincon/sigo#calendario')).toBe(0);
	});

	it('prendido: sin redirect, lleva a Tu calendario en Lo que sigo', () => {
		const html = calendario({ sigoOn: true, feed: null, series: [] });
		expect(html).toContain('Ahora está junto con lo que seguís');
		expect(count(html, '/mi-rincon/sigo#calendario')).toBe(1);
		expect(html).not.toContain('Avisos de series');
		expect(html).not.toMatch(/<form[^>]*action="\?\/(crear|revocar|baja)"/);
	});

	it('prendido: una pestaña vieja que crea el link todavía lo ve una vez', () => {
		const html = calendario(
			{ sigoOn: true, feed: null, series: [] },
			{ action: 'crear', path: '/ics/mio/token-inventado.ics' }
		);
		expect(html).toContain('http://localhost/ics/mio/token-inventado.ics');
		expect(html).toContain('no lo vamos a mostrar de nuevo');
	});
});

describe('los links a Mi rincón apuntan a rutas que existen', () => {
	const routes = fileURLToPath(new URL('../', import.meta.url));
	/** @param {string} href */
	const exists = (href) => {
		const path = href.split(/[?#]/)[0].replace(/\/$/, '');
		return ['+page.svelte', '+server.js'].some((f) => existsSync(`${routes}${path}/${f}`));
	};
	const pages = {
		'Mi rincón (apagado)': rincon({ sigoOn: false }),
		'Mi rincón (prendido)': rincon({ sigoOn: true }),
		'Calendario (apagado)': calendario({ sigoOn: false, feed: null, series: [] }),
		'Calendario (prendido)': calendario({ sigoOn: true, feed: null, series: [] }),
		'Lo que sigo': sigo()
	};
	for (const [name, html] of Object.entries(pages)) {
		it(name, () => {
			const internal = hrefs(html).filter((h) => h.startsWith('/mi-rincon'));
			expect(internal.length).toBeGreaterThan(0);
			for (const h of internal) expect(exists(h), h).toBe(true);
		});
	}
	it('Lo que sigo ya no manda a Mi rincón → Calendario (está en la misma página)', () => {
		expect(count(pages['Lo que sigo'], '/mi-rincon/calendario')).toBe(0);
		expect(pages['Lo que sigo']).toContain('id="calendario"');
	});
});
