import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { extractFrontmatter, listPosts } from '../../tests/content-lib.js';
import tagsFactory from './tags';
import {
	SERIES_PARENT,
	editionDateLabel,
	editionNav,
	editionNumberFromTitle,
	eventImageRef,
	groupSeries,
	isSeriesTag,
	seriesParentOf,
	seriesEditions,
	seriesImage,
	seriesOfTags,
	seriesTagIds,
	splitEditions,
	seriesApiPath,
	subscribeLinks,
	tagFeedPath,
	tagPagePath
} from './series.js';
import { DAY, fakeEvent, fakeSeriesPosts } from '../server/series/fixtures.js';

const NOW = Date.parse('2026-06-01T12:00:00-03:00');

/** Árbol chico, inventado (tagsFactory modifica los objetos: uno nuevo por prueba). */
const tree = () =>
	tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['calendario'] },
			{ id: 'calendario', children: [SERIES_PARENT, 'tipo de evento'] },
			{ id: SERIES_PARENT, children: ['Serie A', 'Serie B'] },
			{ id: 'Serie A', image: 'serie-a.webp', aka: ['serie a'] },
			{ id: 'Serie B', children: ['Serie B Deluxe'] },
			{ id: 'tipo de evento', children: ['taller'] }
		])
	);

describe('seriesTagIds / isSeriesTag / seriesOfTags', () => {
	it('las series son las hijas (y nietas) de «evento recurrente»', () => {
		const t = tree();
		expect(seriesTagIds(t).sort()).toEqual(['Serie A', 'Serie B', 'Serie B Deluxe']);
		expect(isSeriesTag(t, 'Serie A')).toBe(true);
		expect(isSeriesTag(t, 'serie a')).toBe(true); // alias
		expect(isSeriesTag(t, 'taller')).toBe(false);
		expect(isSeriesTag(t, 'no existe')).toBe(false);
	});
	it('las series de un evento, en el orden del árbol', () => {
		const ids = seriesTagIds(tree());
		expect(seriesOfTags(['taller', 'Serie B', 'Serie A'], ids)).toEqual(['Serie A', 'Serie B']);
		expect(seriesOfTags(undefined, ids)).toEqual([]);
	});
	it('en el árbol del sitio, las series hijas de Picantearla tienen ícono e imagen', () => {
		const t = tagsFactory();
		for (const id of ['Picantearla: Deluxe', 'Picantearla: Protocolar', 'Picantearla: Age Play']) {
			expect(isSeriesTag(t, id)).toBe(true);
			expect(t.get(id).icon).toBeTruthy();
			const image = seriesImage(t.get(id));
			expect(existsSync(path.resolve('src/lib/assets', String(image)))).toBe(true);
		}
	});
	it('las ediciones reales de las series hijas siguen siendo ediciones de Picantearla', () => {
		const posts = listPosts()
			.filter((p) => p.category === 'calendario')
			.map((p) => {
				const doc = YAML.parseDocument(extractFrontmatter(p.source) ?? '');
				return { slug: p.slug, errors: doc.errors.length, data: doc.toJS() };
			});
		/** @param {string} id */
		const tagged = (id) =>
			posts.filter((p) => (p.data?.tags ?? []).includes(id)).map((p) => p.slug);
		const deluxe = tagged('Picantearla: Deluxe');
		const protocolar = tagged('Picantearla: Protocolar');
		const agePlay = tagged('Picantearla: Age Play');
		expect(deluxe).toHaveLength(16);
		expect(deluxe).toContain('picantearla-diciembre-2023'); // «Picantearla Deluxe (8° Edición)»
		expect(protocolar).toHaveLength(4);
		expect(agePlay).toEqual(['picantearla-age-play-2024-10', 'picantearla-age-play-2025-12']);
		const picantearla = new Set(tagged('Picantearla'));
		for (const slug of [...deluxe, ...protocolar, ...agePlay]) {
			expect(picantearla.has(slug), slug).toBe(true);
			expect(posts.find((p) => p.slug === slug)?.errors, slug).toBe(0);
		}
	});
	it('en el árbol del sitio, Picantearla y Cine para Sucixs son series con imagen', () => {
		const t = tagsFactory();
		for (const id of ['Picantearla', 'Cine para Sucixs']) {
			expect(isSeriesTag(t, id)).toBe(true);
			const image = seriesImage(t.get(id));
			expect(image).toMatch(/\.webp$/);
			expect(existsSync(path.resolve('src/lib/assets', String(image)))).toBe(true);
		}
	});
});

// Series que van sin imagen a propósito: decisión de gorrite en el PR #193.
// Es una lista cerrada; cualquier otra serie sin imagen sigue haciendo fallar el test.
const SERIES_SIN_IMAGEN = ['Merienda Kinky'];

describe('las series del sitio: imagen e ícono', () => {
	it('cada serie tiene ícono e imagen, y la imagen existe (de src/lib/assets o de un evento)', () => {
		const t = tagsFactory();
		const ids = seriesTagIds(t);
		expect(ids.length).toBeGreaterThan(40);
		for (const id of ids) {
			const tag = t.get(id);
			expect(String(tag.icon ?? '').trim(), `${id}: ícono`).not.toBe('');
			if (SERIES_SIN_IMAGEN.includes(id)) continue;
			const image = String(seriesImage(tag) ?? '');
			const ref = eventImageRef(image);
			const file = ref
				? path.resolve('src/lib/posts/calendario/media', ref.slug, ref.file)
				: path.resolve('src/lib/assets', image);
			expect(image, `${id}: imagen`).not.toBe('');
			expect(existsSync(file), `${id}: ${image}`).toBe(true);
		}
	});

	it('las series de SERIES_SIN_IMAGEN existen y de verdad no tienen imagen', () => {
		const t = tagsFactory();
		const ids = seriesTagIds(t);
		for (const id of SERIES_SIN_IMAGEN) {
			expect(ids, id).toContain(id);
			expect(seriesImage(t.get(id)), id).toBeUndefined();
		}
	});
});

describe('eventImageRef (la imagen de un evento como imagen de la serie)', () => {
	it('calendario:<evento>/<archivo>', () => {
		expect(eventImageRef('calendario:colectiver-2026-08/1.webp')).toEqual({
			slug: 'colectiver-2026-08',
			file: '1.webp'
		});
	});
	it('nada más: ni archivos de assets, ni carpetas, ni links, ni otras categorías', () => {
		for (const bad of [
			'picantearla-miniatura.webp',
			'calendario:../x.webp',
			'calendario:a/b/c.webp',
			'calendario:evento/',
			'calendario:evento/x.svg',
			'amigues:perfil/1.webp',
			'https://otro.sitio/x.webp',
			undefined,
			3
		]) {
			expect(eventImageRef(bad), String(bad)).toBeNull();
		}
	});
});

describe('seriesImage (imagen de la serie en el modelo de etiquetas)', () => {
	it('tagsFactory conserva `image` de la etiqueta', () => {
		expect(tree().get('Serie A').image).toBe('serie-a.webp');
		expect(seriesImage(tree().get('Serie A'))).toBe('serie-a.webp');
	});
	it('sin imagen o vacía: undefined', () => {
		expect(seriesImage(tree().get('Serie B'))).toBeUndefined();
		expect(seriesImage({ image: '  ' })).toBeUndefined();
		expect(seriesImage(undefined)).toBeUndefined();
	});
});

describe('editionNumberFromTitle', () => {
	it.each([
		['Picantearla (9° Edición)', 9],
		['Picantearla (10ª Edición)', 10],
		['Picantearla Deluxe 🔥 (11° edición)', 11],
		['Algo: Edición 3', 3],
		['Jam #12', 12],
		['Picantearla', null],
		['', null],
		[undefined, null]
	])('%s → %s', (title, n) => {
		expect(editionNumberFromTitle(title)).toBe(n);
	});
});

describe('seriesEditions: numeración', () => {
	it('ordena por fecha y numera: título o frontmatter manda, si no la anterior + 1', () => {
		const posts = [
			fakeEvent('c', NOW + 2 * DAY, ['Serie A'], { title: 'Sin número' }),
			fakeEvent('a', NOW - 10 * DAY, ['Serie A'], { title: 'Serie A (9° Edición)' }),
			fakeEvent('b', NOW - 5 * DAY, ['Serie A'], { title: 'Serie A', edition: 12 }),
			fakeEvent('x', NOW, ['taller']),
			fakeEvent('roto', NOW, ['Serie A'], { start: 'sin fecha' })
		];
		const eds = seriesEditions(posts, 'Serie A');
		expect(eds.map((e) => [e.slug, e.number])).toEqual([
			['a', 9],
			['b', 12],
			['c', 13]
		]);
		expect(eds[0]).toMatchObject({ path: '/calendario/a', title: 'Serie A (9° Edición)' });
	});
	it('sin números: la posición (1, 2, 3)', () => {
		const posts = [0, 1, 2].map((i) => fakeEvent(`e${i}`, NOW + i * DAY, ['Serie B']));
		expect(seriesEditions(posts, 'Serie B').map((e) => e.number)).toEqual([1, 2, 3]);
	});
	it('ignora lo que no es de calendario', () => {
		const post = fakeEvent('m', NOW, ['Serie A']);
		post.meta.category = 'material';
		expect(seriesEditions([post], 'Serie A')).toEqual([]);
	});
});

describe('editionNav: anterior y siguiente', () => {
	const eds = seriesEditions(fakeSeriesPosts(NOW), 'Picantearla');
	it('en el medio: las dos', () => {
		const nav = editionNav(eds, 'serie-prueba-2');
		expect(nav).toMatchObject({ index: 1, number: 8, total: 3 });
		expect(nav?.prev?.slug).toBe('serie-prueba-1');
		expect(nav?.next?.slug).toBe('serie-prueba-3');
	});
	it('en las puntas: null', () => {
		expect(editionNav(eds, 'serie-prueba-1')?.prev).toBeNull();
		expect(editionNav(eds, 'serie-prueba-3')?.next).toBeNull();
	});
	it('un evento que no es de la serie: null', () => {
		expect(editionNav(eds, 'otra-cosa')).toBeNull();
	});
});

describe('splitEditions', () => {
	it('próximas (la más cercana primero, sin canceladas) y pasadas (la más reciente primero)', () => {
		const posts = [
			fakeEvent('p1', NOW - 20 * DAY, ['Serie A']),
			fakeEvent('p2', NOW - 2 * DAY, ['Serie A']),
			fakeEvent('f2', NOW + 20 * DAY, ['Serie A']),
			fakeEvent('f1', NOW + 2 * DAY, ['Serie A']),
			fakeEvent('fc', NOW + 5 * DAY, ['Serie A'], { status: 'cancelado' })
		];
		const { upcoming, past } = splitEditions(seriesEditions(posts, 'Serie A'), NOW);
		expect(upcoming.map((e) => e.slug)).toEqual(['f1', 'f2']);
		expect(past.map((e) => e.slug)).toEqual(['p2', 'p1']);
	});
});

describe('links', () => {
	it('página y calendario de una etiqueta', () => {
		expect(tagPagePath('Cine para Sucixs')).toBe('/wiki/Cine-para-Sucixs');
		// Misma forma slug que la página (antes iba con %20; la ruta acepta las dos).
		expect(tagFeedPath('Cine para Sucixs')).toBe('/ics/etiqueta/Cine-para-Sucixs.ics');
		expect(seriesApiPath('Cine para Sucixs')).toBe('/api/series/Cine-para-Sucixs');
		expect(tagPagePath('Deseo & Disidencia')).toBe('/wiki/Deseo-%26-Disidencia');
		expect(tagFeedPath('Deseo & Disidencia')).toBe('/ics/etiqueta/Deseo-%26-Disidencia.ics');
	});
	it('subscribeLinks: webcal y Google', () => {
		const l = subscribeLinks('https://kinkyvibe.ar/ics/etiqueta/x.ics');
		expect(l.webcal).toBe('webcal://kinkyvibe.ar/ics/etiqueta/x.ics');
		expect(l.google).toBe(
			'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fkinkyvibe.ar%2Fics%2Fetiqueta%2Fx.ics'
		);
	});
	it('editionDateLabel en hora de Argentina', () => {
		// 23:30 en Argentina es el día siguiente en UTC: tiene que decir el 12
		expect(editionDateLabel('2026-09-12T23:30-03:00')).toMatch(/^12 /);
		expect(editionDateLabel('no')).toBe('');
	});
});

describe('series hijas', () => {
	const tm = () =>
		tagsFactory(
			/** @type {any} */ ([
				{ id: 'root', children: ['calendario'] },
				{ id: 'calendario', children: [SERIES_PARENT] },
				{ id: SERIES_PARENT, children: ['Serie Madre', 'Serie Suelta'] },
				{ id: 'Serie Madre', children: ['Serie Madre 2025', 'Serie Madre 2026'] }
			])
		);

	it('seriesParentOf: la madre si es serie; las de arriba no tienen', () => {
		const t = tm();
		expect(seriesTagIds(t)).toEqual(
			expect.arrayContaining(['Serie Madre', 'Serie Madre 2025', 'Serie Madre 2026'])
		);
		expect(seriesParentOf(t, 'Serie Madre 2026')).toBe('Serie Madre');
		expect(seriesParentOf(t, 'Serie Madre')).toBeNull();
		expect(seriesParentOf(t, 'Serie Suelta')).toBeNull();
	});

	it('groupSeries: hijas dentro de la madre, en orden; sin madre en la lista, sueltas', () => {
		const groups = groupSeries([
			{ id: 'Serie Madre', parent: null },
			{ id: 'Serie Madre 2025', parent: 'Serie Madre' },
			{ id: 'Serie Suelta', parent: null },
			{ id: 'Serie Madre 2026', parent: 'Serie Madre' },
			{ id: 'Huérfana', parent: 'No Está' },
			{ id: 'Nieta', parent: 'Serie Madre 2026' }
		]);
		expect(groups.map((g) => [g.id, g.children.map((c) => c.id)])).toEqual([
			['Serie Madre', ['Serie Madre 2025', 'Serie Madre 2026', 'Nieta']],
			['Serie Suelta', []],
			['Huérfana', []]
		]);
	});
});
