/**
 * /rss: el RSS 2.0 de siempre, armado con los mismos helpers que los feeds Atom y JSON Feed
 * (src/lib/utils/feeds.js). Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { DAY, fakeEvent } from '$lib/server/series/fixtures.js';

const NOW = Date.parse('2026-06-01T12:00:00-03:00');

/** @type {ProcessedPost[]} */
let posts = [];
vi.mock('$lib/server/contenido/posts.js', () => ({ sitePosts: async () => posts }));

const { GET } = await import('./+server.js');
const { render, RSS_EVENTS, RSS_MATERIAL } = await import('./rss.js');

/**
 * @param {string} slug
 * @param {string} date
 * @param {Record<string, unknown>} [extra]
 * @returns {ProcessedPost}
 */
const material = (slug, date, extra = {}) =>
	/** @type {ProcessedPost} */ ({
		path: `/material/${slug}`,
		meta: /** @type {any} */ ({
			postID: slug,
			category: 'material',
			title: `Material de prueba ${slug}`,
			summary: 'Un resumen inventado',
			tags: ['bondage'],
			authors: ['Autore Inventade'],
			published_date: date,
			...extra
		})
	});

const items = (/** @type {string} */ xml) => xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

describe('/rss', () => {
	it('del evento: la fecha en la descripción, autor, etiquetas e idioma; nunca el lugar', () => {
		const ev = fakeEvent('evento-prueba', NOW + DAY, ['Picantearla'], {
			title: 'Edición inventada',
			published_date: '2026-05-01Z-03:00',
			location: 'Calle Falsa 123',
			location_name: 'Lugar Secreto Inventado',
			location_map: 'https://maps.example.com/inventado'
		});
		const xml = render([ev]);
		const [item] = items(xml).filter((i) => i.includes('evento-prueba'));
		expect(item).toContain('<title>Edición inventada</title>');
		expect(item).toContain('<link>https://kinkyvibe.ar/calendario/evento-prueba</link>');
		// La descripción ya no es el título: empieza con la fecha (como la vista previa y el Atom).
		expect(item).toMatch(/<description>[^<]*2 de junio[^<]*Resumen inventado<\/description>/);
		expect(item).toContain('<dc:creator>KinkyVibe</dc:creator>');
		expect(item).toContain('<category>Picantearla</category>');
		expect(item).toMatch(/<pubDate>Fri, 01 May 2026 03:00:00 GMT<\/pubDate>/);
		expect(xml).toContain('<language>es-AR</language>');
		expect(xml).toContain('<lastBuildDate>');
		for (const secret of ['Calle Falsa', 'Lugar Secreto', 'maps.example.com']) {
			expect(xml).not.toContain(secret);
		}
	});

	it('cancelado: lo dice la descripción', () => {
		const ev = fakeEvent('cancelado', NOW + DAY, [], { status: 'cancelado' });
		expect(items(render([ev])).find((i) => i.includes('/cancelado'))).toMatch(
			/<description>Cancelado/
		);
	});

	it('escapa el texto (un feed inválido hace que los lectores muestren todo como nuevo)', () => {
		const xml = render([material('troles', '2026-05-01', { title: 'Troles & <Tableros>' })]);
		expect(xml).toContain('<title>Troles &amp; &lt;Tableros&gt;</title>');
	});

	it('el mismo contenido da el mismo XML (lastBuildDate es la entrada más nueva, no «ahora»)', () => {
		const list = [material('a', '2026-05-01'), material('b', '2026-05-03')];
		const first = render(list);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
		try {
			const later = render(list);
			// Sin el aviso temporal (vence antes de 2030), el resto es igual.
			const strip = (/** @type {string} */ x) =>
				x.replace(/<item>\n<guid isPermaLink="false">[\s\S]*?<\/item>/, '');
			expect(strip(later)).toEqual(strip(first));
		} finally {
			vi.useRealTimers();
		}
		expect(first).toContain('<lastBuildDate>Sun, 03 May 2026 03:00:00 GMT</lastBuildDate>');
	});

	it(`los ${RSS_EVENTS} eventos y los ${RSS_MATERIAL} materiales más nuevos, sin redirecciones`, async () => {
		posts = [
			...Array.from({ length: 40 }, (_, i) =>
				fakeEvent(`ev-${i}`, NOW + i * DAY, [], {
					published_date: new Date(NOW + i * DAY).toISOString()
				})
			),
			...Array.from({ length: 25 }, (_, i) =>
				material(`mat-${i}`, new Date(NOW - i * DAY).toISOString())
			),
			material('a-la-tienda', new Date(NOW + 99 * DAY).toISOString(), {
				redirect: 'https://tienda.example.com'
			})
		];
		const res = await GET();
		expect(res.headers.get('content-type')).toBe('application/xml');
		const xml = await res.text();
		const links = items(xml).map((i) => i.match(/<link>([^<]*)<\/link>/)?.[1] ?? '');
		expect(links.filter((l) => l.includes('/calendario/'))).toHaveLength(RSS_EVENTS);
		expect(links.filter((l) => l.includes('/material/'))).toHaveLength(RSS_MATERIAL);
		expect(xml).not.toContain('a-la-tienda');
		// Los eventos más nuevos (por fecha de publicación) primero; los viejos quedan afuera.
		expect(xml).toContain('/calendario/ev-39<');
		expect(xml).not.toContain('/calendario/ev-0<');
		expect(xml).toContain('/material/mat-0<');
		expect(xml).not.toContain('/material/mat-24<');
	});
});
