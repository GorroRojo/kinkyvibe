/**
 * PostList con `limit` (el feed del inicio): sin búsqueda muestra los primeros y «Ver más (N)»;
 * sin `limit`, todos. Y Card muestra la fecha corta de los eventos. Render del servidor, datos
 * inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/'), data: {} })
}));

const { default: PostList } = await import('./PostList.svelte');
const { default: Card } = await import('./Card.svelte');

/** @param {number} i */
const post = (i) => ({
	path: `/material/nota-${i}`,
	meta: {
		title: `Nota inventada ${i}`,
		summary: '',
		tags: [],
		category: 'material',
		layout: 'material',
		postID: `nota-${i}`
	}
});
const posts = Array.from({ length: 30 }, (_, i) => post(i));
/** @param {string} html */
const items = (html) => (html.match(/data-key="/g) ?? []).length;

describe('PostList limit', () => {
	it('muestra los primeros 20 y «Ver más» con los que faltan', () => {
		const html = render(PostList, { props: /** @type {any} */ ({ posts, limit: 20 }) }).body;
		expect(items(html)).toBe(20);
		expect(html).toContain('Ver más (10)');
		// el total sigue diciendo todos
		expect(html).toContain('30');
	});

	it('sin limit, todos y sin «Ver más»', () => {
		const html = render(PostList, { props: /** @type {any} */ ({ posts }) }).body;
		expect(items(html)).toBe(30);
		expect(html).not.toContain('Ver más');
	});

	it('amountLabel cambia lo que dice arriba de los resultados', () => {
		const html = render(PostList, {
			props: /** @type {any} */ ({
				posts,
				amountLabel: (/** @type {number} */ n) => `Octubre · ${n} eventos`
			})
		}).body;
		expect(html).toContain('Octubre · 30 eventos');
	});
});

describe('Card', () => {
	it('un evento muestra su fecha corta («vie 2 oct · 22:00»)', () => {
		const html = render(Card, {
			props: /** @type {any} */ ({
				post: {
					path: '/calendario/evento-inventado',
					meta: {
						title: 'Evento inventado',
						tags: [],
						category: 'calendario',
						start: '2099-10-02T22:00-03:00'
					}
				}
			})
		}).body;
		expect(html).toMatch(/<time class="card-date[^"]*"[^>]*>vie 2 oct 2099 · 22:00<\/time>/);
	});
});

const { filteredTags, userConfig } = await import('$lib/utils/stores');

describe('barra de filtros de las listas (TagBar)', () => {
	/** @param {number} i @param {string[]} tags */
	const tagged = (i, tags) => ({ ...post(i), meta: { ...post(i).meta, tags } });
	const many = [
		tagged(1, ['taller', 'Online', 'español']),
		tagged(2, ['taller', 'Presencial', 'español']),
		tagged(3, ['fiesta', 'Presencial', 'español']),
		tagged(4, ['taller', 'Presencial', 'a la gorra', 'español'])
	];
	const html = () => render(PostList, { props: /** @type {any} */ ({ posts: many }) }).body;
	/** @param {string} body */
	const chipValues = (body) =>
		[
			...body.matchAll(
				/name="tagbar-chip"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="tagbar-chip"/g
			)
		].map((m) => m[1] ?? m[2]);

	it('reemplaza «Filtrar por etiquetas»: chips de las más usadas, «Filtros» y «Más filtros»', () => {
		filteredTags.set([]);
		const body = html();
		expect(body).not.toContain('Filtrar por etiquetas</button');
		expect(body).toContain('aria-label="Filtrar por etiquetas"');
		expect(chipValues(body)).toEqual(['Presencial', 'taller', 'a la gorra', 'fiesta', 'Online']);
		expect(body).toMatch(/class="[^"]*filters-toggle[^"]*"[^>]*>[\s\S]*?Filtros<\/button>/);
		expect(body).toContain('Más filtros');
		expect(body).not.toContain('Limpiar (');
	});

	it('las elegidas van primero, con su cuenta en «Filtros (N)» y «Limpiar (N)»', () => {
		filteredTags.set(['fiesta']);
		const body = html();
		expect(chipValues(body)[0]).toBe('fiesta');
		expect(body).toContain('Filtros (1)');
		expect(body).toContain('Limpiar (1)');
		filteredTags.set([]);
	});

	it('sin abrir la hoja ni ser pantalla ancha, el árbol de etiquetas no se arma', () => {
		filteredTags.set([]);
		const body = html();
		expect(body).not.toContain('id="tagfilters"');
		expect(body).not.toContain('<dialog open');
	});

	it('«Ver como» con íconos: cada botón con su nombre y su estado elegido', () => {
		userConfig.set({ display_type: 'grid', show_past_events: false });
		const body = html();
		expect(body).toMatch(/aria-label="Ver como lista"[^>]*aria-pressed="false"/);
		expect(body).toMatch(/aria-label="Ver como grilla"[^>]*aria-pressed="true"/);
		expect(body).toContain('class="kv-segmented small"');
		userConfig.set({ display_type: 'list', show_past_events: false });
	});

	it('«Mostrar | Ocultar eventos pasados» a la misma escala, con el elegido marcado', () => {
		const body = render(PostList, {
			props: /** @type {any} */ ({ posts: many, pastEventsToggle: true })
		}).body;
		expect(body).toMatch(/id="show-past-events" class="kv-segmented small"/);
		expect(body).toMatch(/aria-pressed="false"[^>]*>Mostrar<\/button>/);
		expect(body).toMatch(/aria-pressed="true"[^>]*>Ocultar<\/button>/);
	});

	it('lo que dice arriba de los resultados va en la barra (amountLabel)', () => {
		const body = html();
		expect(body).toMatch(/class="post-amount[^"]*"[^>]*>4 resultados<\/p>/);
	});
});

/*
 * Hasta 5 etiquetas por tarjeta y un «+N» que despliega el resto (decisión de gorrite, opción 1b
 * de docs/seo.md). Las que no se ven no van en el HTML, pero la búsqueda y los filtros siguen
 * leyendo las etiquetas de los datos: una publicación con la etiqueta buscada entre las ocultas
 * aparece igual.
 */
const { default: PostListItem } = await import('./PostListItem.svelte');
const { default: CardTags } = await import('./CardTags.svelte');
const { searchText } = await import('$lib/utils/stores');
const { withoutComments } = await import('$lib/testing/html.js');

describe('etiquetas de las tarjetas: hasta 5 y «+N»', () => {
	const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => `inventada ${n}`);
	const many = { ...post(1), meta: { ...post(1).meta, tags: seven } };
	/** @param {string} html */
	const chips = (html) =>
		[...withoutComments(html).matchAll(/<span class="kv-tag[^"]*"[^>]*>([^<]*)<\/span>/g)].map(
			(m) => m[1]
		);
	/** @param {string} html */
	const more = (html) =>
		withoutComments(html).match(/<button[^>]*class="kv-tag more[^"]*"[^>]*>[\s\S]*?<\/button>/);

	it('lista: 5 chips y «+2», que no navega y dice que está plegado', () => {
		const html = render(PostListItem, { props: /** @type {any} */ ({ post: many }) }).body;
		expect(chips(html)).toEqual(seven.slice(0, 5));
		expect(html).not.toContain('inventada 6');
		const button = more(html)?.[0] ?? '';
		expect(button).toMatch(/type="button"/);
		expect(button).toMatch(/aria-expanded="false"/);
		expect(button).toMatch(/\+2<span class="visually-hidden[^"]*"> etiquetas más<\/span>/);
	});

	it('grilla (Card): lo mismo', () => {
		const html = render(Card, { props: /** @type {any} */ ({ post: many }) }).body;
		expect(chips(html)).toEqual(seven.slice(0, 5));
		expect(more(html)?.[0]).toMatch(/aria-expanded="false"/);
	});

	it('desplegada: las 7 y el botón para plegarlas', () => {
		const html = render(CardTags, { props: { tags: seven, expanded: true } }).body;
		expect(chips(html)).toEqual(seven);
		const button = more(html)?.[0] ?? '';
		expect(button).toMatch(/aria-expanded="true"/);
		expect(button).toContain('Ver menos etiquetas');
	});

	it('con 5 o menos, sin «+N»', () => {
		const html = render(CardTags, { props: { tags: seven.slice(0, 5) } }).body;
		expect(chips(html)).toEqual(seven.slice(0, 5));
		expect(more(html)).toBeNull();
	});

	it('filtrar por una etiqueta que no se ve en la tarjeta la encuentra igual', () => {
		const others = Array.from({ length: 3 }, (_, i) => post(10 + i));
		filteredTags.set(['inventada 7']);
		const html = render(PostList, {
			props: /** @type {any} */ ({ posts: [...others, many] })
		}).body;
		filteredTags.set([]);
		expect(items(html)).toBe(1);
		expect(html).toContain('data-key="/material/nota-1"');
	});

	it('buscar por texto el nombre de una etiqueta oculta, también', () => {
		const others = Array.from({ length: 3 }, (_, i) => post(10 + i));
		searchText.set('inventada 6');
		const html = render(PostList, {
			props: /** @type {any} */ ({ posts: [...others, many] })
		}).body;
		searchText.set('');
		expect(items(html)).toBe(1);
		expect(html).toContain('data-key="/material/nota-1"');
	});
});
