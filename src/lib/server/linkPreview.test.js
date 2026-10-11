/**
 * Las portadas y el hash de las tarjetas de vista previa (src/lib/server/linkPreview.js). Datos
 * inventados.
 */
import { describe, expect, it } from 'vitest';
import { cardHash, cardSpec, collageCovers } from './linkPreview.js';
import { PREVIEW_TEXT_DEFAULTS } from '$lib/utils/previewTexts.js';
import { COLLAGE_TILES } from '$lib/utils/ogCollage.js';

const NOW = Date.parse('2026-10-11T12:00:00-03:00');
const day = 24 * 3600 * 1000;
/** @param {number} n */
const img = (n) => `/media/img/${String(n).padStart(64, '0')}.webp`;
/** @param {number} n @param {number} at @param {Record<string, unknown>} [extra] */
const ev = (n, at, extra = {}) => ({
	meta: { layout: 'calendario', start: new Date(at).toISOString(), featured: img(n), ...extra }
});

describe('collageCovers', () => {
	it('primero los próximos (del más cercano), después los pasados (del más reciente), sin repetir', () => {
		const posts = [
			ev(1, NOW - 3 * day),
			ev(2, NOW + 9 * day),
			ev(3, NOW - day),
			ev(4, NOW + 2 * day),
			ev(4, NOW + 4 * day),
			{ meta: { layout: 'material', featured: img(9), start: new Date(NOW).toISOString() } },
			ev(5, NOW + day, { status: 'cancelado' }),
			ev(6, NOW + day, { featured: 'src/lib/assets/viejo.webp' }),
			ev(7, NOW + 3 * day, {
				featured: 'https://kinkyvibe.ar/media/img/' + 'b'.repeat(64) + '.webp'
			})
		];
		expect(collageCovers(posts, NOW)).toEqual([
			img(4),
			'https://kinkyvibe.ar/media/img/' + 'b'.repeat(64) + '.webp',
			img(2),
			img(3),
			img(1)
		]);
	});

	it(`como mucho ${COLLAGE_TILES}`, () => {
		const posts = Array.from({ length: 30 }, (_, i) => ev(i + 1, NOW + (i + 1) * day));
		expect(collageCovers(posts, NOW)).toHaveLength(COLLAGE_TILES);
	});
});

describe('cardSpec y cardHash', () => {
	const covers = [img(1), img(2), img(3)];
	it('el mosaico se llena repitiendo y cada tarjeta empieza por otra portada', () => {
		const a = cardSpec('default', PREVIEW_TEXT_DEFAULTS, covers);
		const b = cardSpec('calendario', PREVIEW_TEXT_DEFAULTS, covers);
		expect(a.tiles).toHaveLength(COLLAGE_TILES);
		expect(a.tiles[0]).toBe(img(1));
		expect(b.tiles[0]).toBe(img(1 + (3 % 3)));
		expect(b).toMatchObject({
			name: 'Calendario',
			subtitle: 'Próximos talleres, encuentros y eventos cuir y kinky'
		});
		expect(cardSpec('wiki', PREVIEW_TEXT_DEFAULTS, [])).toMatchObject({
			name: 'Kinkipedia',
			subtitle: 'Glosario cuir y kinky',
			tiles: []
		});
	});

	it('el hash cambia con los textos o las portadas, y no si nada cambia', async () => {
		const base = await cardHash(cardSpec('calendario', PREVIEW_TEXT_DEFAULTS, covers));
		expect(base).toMatch(/^[0-9a-f]{16}$/);
		expect(await cardHash(cardSpec('calendario', PREVIEW_TEXT_DEFAULTS, covers))).toBe(base);
		const renamed = { ...PREVIEW_TEXT_DEFAULTS, 'calendario.cardName': 'Agenda' };
		expect(await cardHash(cardSpec('calendario', renamed, covers))).not.toBe(base);
		expect(await cardHash(cardSpec('calendario', PREVIEW_TEXT_DEFAULTS, [img(9)]))).not.toBe(base);
		// un texto que no va en la imagen no cambia la imagen
		const other = { ...PREVIEW_TEXT_DEFAULTS, 'calendario.description': 'Otra.' };
		expect(await cardHash(cardSpec('calendario', other, covers))).toBe(base);
	});
});
