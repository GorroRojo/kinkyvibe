/**
 * «Enlaces que faltan» renderizada con datos inventados: lista de nombres (links con `?nombre=`)
 * y el detalle del elegido. Sin `?nombre=` se ve el primero (escondido en el celular, por CSS);
 * con uno, ese, marcado con `aria-current`; con uno que ya no falta, un aviso.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { textOf } from '$lib/testing/html.js';

let search = '';
vi.mock('$app/stores', () => ({
	page: {
		subscribe: (/** @type {(v: unknown) => void} */ run) =>
			readable({ url: new URL(`http://localhost/admin/etiquetas/falta${search}`) }).subscribe(run)
	}
}));
vi.mock('$app/navigation', () => ({ afterNavigate: () => {} }));

const { default: Page } = await import('./+page.svelte');

const DATA = {
	scanned: 12,
	truncated: false,
	references: 30,
	ms: 5,
	items: [
		{
			name: '[[cuerdas rojas]]',
			target: 'cuerdas rojas',
			form: 'wiki',
			count: 3,
			create: { href: '/admin/etiquetas?nueva=cuerdas%20rojas', label: 'Crear etiqueta' },
			sources: [
				{
					id: 1,
					type: 'evento',
					title: 'Taller inventado',
					visibility: 'public',
					path: '/eventos/taller-inventado',
					editHref: '/admin/eventos/taller-inventado'
				},
				{
					id: 2,
					type: 'material',
					title: 'Guía de prueba',
					visibility: 'hidden',
					path: null,
					editHref: null
				}
			]
		},
		{
			name: '@persona-inventada',
			target: 'persona-inventada',
			form: 'mencion',
			count: 1,
			create: {
				href: '/admin/comunidad/perfiles/nuevo?nombre=persona-inventada&oculto=1',
				label: 'Crear perfil'
			},
			sources: [
				{
					id: 3,
					type: 'perfil',
					title: 'Perfil de prueba',
					visibility: 'members',
					path: '/amigues/perfil-de-prueba',
					editHref: '/admin/comunidad/perfiles/perfil-de-prueba'
				}
			]
		}
	]
};

/** @param {string} html */
const text = (html) => textOf(html).replace(/\s+/g, ' ').trim();

/**
 * La página con `?query` en la URL. Solo los datos que usa (el resto viene del layout).
 * @param {string} query @param {typeof DATA} [data]
 */
function page(query, data = DATA) {
	search = query;
	const props = /** @type {any} */ ({ data });
	return render(Page, { props }).body;
}

/** Los links de la lista de nombres: href (sin escapar) y si está marcado. @param {string} html */
function nameLinks(html) {
	const start = html.indexOf('aria-label="Nombres que faltan"');
	const nav = html.slice(start, html.indexOf('</nav>', start));
	return nav
		.split('<a')
		.slice(1)
		.map((tag) => {
			const open = tag.slice(0, tag.indexOf('>'));
			return {
				href: open.split('href="')[1].split('"')[0].split('&amp;').join('&'),
				current: open.includes('aria-current="true"'),
				on: (open.split('class="')[1] ?? '').split('"')[0].split(' ').includes('on')
			};
		});
}

/**
 * Las clases del primer elemento con la clase `name` (sin las de Svelte). @param {string} html
 * @param {string} name
 */
function classesOf(html, name) {
	const tag = html.split('<').find((t) => t.split('>')[0].includes(`class="${name} `));
	return tag
		? tag
				.split('class="')[1]
				.split('"')[0]
				.split(' ')
				.filter((c) => !c.startsWith('svelte-'))
		: [];
}

/** El HTML del detalle. @param {string} html */
function detail(html) {
	const start = html.indexOf('detail-wrap');
	return start === -1 ? '' : html.slice(start);
}

describe('Enlaces que faltan (lista y detalle)', () => {
	it('lista cada nombre como link con ?nombre= y sus veces', () => {
		const html = page('');
		expect(nameLinks(html).map((l) => l.href)).toEqual([
			'?nombre=%5B%5Bcuerdas%20rojas%5D%5D',
			'?nombre=%40persona-inventada'
		]);
		expect(text(html)).toContain('Elegí un nombre para ver dónde se escribe y crear su página.');
		expect(text(html)).toContain('[[cuerdas rojas]] 3 veces');
		expect(text(html)).toContain('@persona-inventada 1 vez');
	});

	it('sin ?nombre= muestra el primero, sin aria-current y marcado como «por defecto»', () => {
		const html = page('');
		const links = nameLinks(html);
		expect(links.map((l) => l.current)).toEqual([false, false]);
		expect(links[0].on).toBe(true);
		expect(classesOf(html, 'split')).not.toContain('chosen');
		expect(classesOf(html, 'detail-wrap')).toContain('default');
		const d = text(detail(html));
		expect(d).toContain('Página de la Kinkipedia que no existe');
		expect(d).toContain('Escrito 3 veces en 2 textos.');
		expect(d).toContain('Dónde se escribe');
		expect(d).toContain('Taller inventado');
		expect(d).toContain('Material · oculto');
		expect(detail(html)).toContain('href="/admin/etiquetas?nueva=cuerdas%20rojas"');
	});

	it('con ?nombre= muestra ese, marcado, con el botón de crear oculto', () => {
		const html = page('?nombre=%40persona-inventada');
		expect(nameLinks(html).map((l) => l.current)).toEqual([false, true]);
		expect(classesOf(html, 'detail-wrap')).not.toContain('default');
		expect(classesOf(html, 'split')).toContain('chosen');
		const d = detail(html);
		expect(text(d)).toContain('Mención a un perfil que no existe');
		expect(text(d)).toContain('Escrito 1 vez en 1 texto.');
		expect(text(d)).toContain('Perfil · solo con cuenta');
		expect(d.split('&amp;').join('&')).toContain(
			'href="/admin/comunidad/perfiles/nuevo?nombre=persona-inventada&oculto=1"'
		);
		expect(text(d)).toContain('Crear perfil');
		expect(d).toContain('aria-label="Editar Perfil de prueba"');
		expect(d).toContain('aria-label="Ver la página de Perfil de prueba (se abre en otra pestaña)"');
		expect(text(d)).not.toContain('Taller inventado');
	});

	it('un texto sin editor ni página no lleva esos botones', () => {
		const d = detail(page(''));
		expect(d).toContain('aria-label="Editar Taller inventado"');
		expect(d).not.toContain('aria-label="Editar Guía de prueba"');
		expect(d).not.toContain('aria-label="Ver la página de Guía de prueba');
	});

	it('un ?nombre= que ya no falta avisa y vuelve al primero', () => {
		const html = page('?nombre=%40ya-existe');
		expect(text(html)).toContain('@ya-existe ya no falta (o no se escribe así).');
		expect(classesOf(html, 'detail-wrap')).toContain('default');
		expect(text(detail(html))).toContain('[[cuerdas rojas]]');
	});

	it('sin nada que falte, el estado vacío y el resumen', () => {
		const html = page('', { ...DATA, items: [], truncated: true });
		expect(text(html)).toContain('No falta nada');
		expect(html).not.toContain('Nombres que faltan');
		expect(text(html)).toContain(
			'Se revisaron 12 textos (los editados más recientemente; hay más) con 30 enlaces.'
		);
	});
});
