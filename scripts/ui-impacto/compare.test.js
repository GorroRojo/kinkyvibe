import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import {
	diffPng,
	diffRgba,
	formatRatio,
	padRgba,
	pageStatus,
	statusOf,
	summarize
} from './compare.js';
import { esc, headline, renderHtml, renderMarkdown } from './report.js';
import { defaultNow, parseArgs } from './run.js';
import { PAGES, VIEWPORTS } from './pages.js';

/**
 * Imagen RGBA de un color, con un rectángulo opcional de otro.
 * @param {number} w
 * @param {number} h
 * @param {[number, number, number]} color
 * @param {{ x: number, y: number, w: number, h: number, color: [number, number, number] }} [rect]
 */
function img(w, h, color, rect) {
	const data = new Uint8Array(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const inRect =
				rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
			const [r, g, b] = inRect ? rect.color : color;
			data.set([r, g, b, 255], (y * w + x) * 4);
		}
	}
	return { data, width: w, height: h };
}

/** @param {{ data: Uint8Array, width: number, height: number }} i */
function png(i) {
	const p = new PNG({ width: i.width, height: i.height });
	p.data = Buffer.from(i.data);
	return PNG.sync.write(p);
}

/**
 * @param {Partial<import('./compare.js').Shot> & { pageId: string, viewport: string, status: import('./compare.js').Status }} s
 * @returns {import('./compare.js').Shot}
 */
const shot = (s) => ({ title: s.pageId.toUpperCase(), ...s });

describe('diffRgba', () => {
	it('dos imágenes iguales no tienen diferencias', () => {
		const r = diffRgba(img(10, 10, [255, 255, 255]), img(10, 10, [255, 255, 255]));
		expect(r).toMatchObject({ width: 10, height: 10, diffPixels: 0, ratio: 0, sizeChanged: false });
	});

	it('cuenta los píxeles de un rectángulo que cambió de color', () => {
		const a = img(20, 10, [255, 255, 255]);
		const b = img(20, 10, [255, 255, 255], { x: 2, y: 3, w: 4, h: 2, color: [200, 0, 120] });
		const r = diffRgba(a, b);
		expect(r.diffPixels).toBe(8);
		expect(r.ratio).toBeCloseTo(8 / 200);
		// La imagen de diferencias pinta ese píxel de magenta.
		const i = (3 * 20 + 2) * 4;
		expect([...r.diff.subarray(i, i + 3)]).toEqual([255, 0, 170]);
	});

	it('ignora diferencias de color imperceptibles con el umbral por defecto', () => {
		const r = diffRgba(img(4, 4, [200, 200, 200]), img(4, 4, [201, 200, 200]));
		expect(r.diffPixels).toBe(0);
	});

	it('con distinto alto compara sobre el lienzo más grande y lo que falta cuenta como cambio', () => {
		const r = diffRgba(img(4, 4, [0, 0, 0]), img(4, 6, [0, 0, 0]));
		expect(r).toMatchObject({ width: 4, height: 6, sizeChanged: true, diffPixels: 8 });
	});
});

describe('padRgba', () => {
	it('devuelve lo mismo si ya tiene el tamaño', () => {
		const a = img(2, 2, [1, 2, 3]);
		expect(padRgba(a.data, 2, 2, 2, 2)).toBe(a.data);
	});

	it('copia cada fila al principio de la fila más ancha', () => {
		const a = img(1, 2, [9, 9, 9]);
		const out = padRgba(a.data, 1, 2, 2, 3);
		expect(out.length).toBe(2 * 3 * 4);
		expect([...out.subarray(0, 8)]).toEqual([9, 9, 9, 255, 0, 0, 0, 0]);
		expect([...out.subarray(8, 16)]).toEqual([9, 9, 9, 255, 0, 0, 0, 0]);
		expect([...out.subarray(16)]).toEqual(new Array(8).fill(0));
	});
});

describe('diffPng', () => {
	it('lee y escribe PNG', () => {
		const a = png(img(6, 6, [255, 255, 255]));
		const b = png(img(6, 6, [255, 255, 255], { x: 0, y: 0, w: 1, h: 1, color: [0, 0, 0] }));
		const r = diffPng(a, b);
		expect(r.diffPixels).toBe(1);
		const out = PNG.sync.read(r.png);
		expect([out.width, out.height]).toEqual([6, 6]);
	});
});

describe('statusOf', () => {
	it('distingue cada caso', () => {
		expect(statusOf({ hasBase: false, hasNew: false })).toBe('error');
		expect(statusOf({ hasBase: false, hasNew: true })).toBe('nueva');
		expect(statusOf({ hasBase: true, hasNew: false })).toBe('quitada');
		expect(statusOf({ hasBase: true, hasNew: true, diffPixels: 0 })).toBe('igual');
		expect(statusOf({ hasBase: true, hasNew: true, diffPixels: 1 })).toBe('cambio');
		expect(statusOf({ hasBase: true, hasNew: true, diffPixels: 0, sizeChanged: true })).toBe(
			'cambio'
		);
	});

	it('tolera hasta minPixels píxeles distintos', () => {
		expect(statusOf({ hasBase: true, hasNew: true, diffPixels: 5, minPixels: 5 })).toBe('igual');
		expect(statusOf({ hasBase: true, hasNew: true, diffPixels: 6, minPixels: 5 })).toBe('cambio');
	});
});

describe('pageStatus', () => {
	it('se queda con el estado más «para mirar»', () => {
		expect(pageStatus(['igual', 'cambio'])).toBe('cambio');
		expect(pageStatus(['igual', 'error'])).toBe('error');
		expect(pageStatus(['quitada', 'nueva'])).toBe('nueva');
		expect(pageStatus(['igual', 'igual'])).toBe('igual');
		expect(pageStatus([])).toBe('error');
	});
});

describe('summarize', () => {
	const shots = [
		shot({ pageId: 'inicio', viewport: 'celu', status: 'igual', ratio: 0 }),
		shot({ pageId: 'inicio', viewport: 'compu', status: 'igual', ratio: 0 }),
		shot({ pageId: 'wiki', viewport: 'celu', status: 'cambio', ratio: 0.01 }),
		shot({ pageId: 'wiki', viewport: 'compu', status: 'igual', ratio: 0 }),
		shot({ pageId: 'panel', viewport: 'celu', status: 'cambio', ratio: 0.2 }),
		shot({ pageId: 'panel', viewport: 'compu', status: 'cambio', ratio: 0.05 }),
		shot({ pageId: 'puerta', viewport: 'celu', status: 'error' }),
		shot({ pageId: 'puerta', viewport: 'compu', status: 'error' }),
		shot({ pageId: 'nueva', viewport: 'celu', status: 'nueva' }),
		shot({ pageId: 'nueva', viewport: 'compu', status: 'nueva' })
	];
	const s = summarize(shots);

	it('cuenta capturas por estado; «cambiaron» no incluye las que fallaron en los dos lados', () => {
		expect(s.total).toBe(10);
		expect(s.counts).toEqual({ cambio: 3, igual: 3, nueva: 2, quitada: 0, error: 2 });
		expect(s.changed).toBe(5);
	});

	it('ordena: cambios (de más a menos), nuevas, errores y al final las iguales', () => {
		expect(s.pages.map((p) => p.pageId)).toEqual(['panel', 'wiki', 'nueva', 'puerta', 'inicio']);
		expect(s.pages[0]).toMatchObject({ status: 'cambio', maxRatio: 0.2 });
		expect(s.changedPages.map((p) => p.pageId)).toEqual(['panel', 'wiki', 'nueva', 'puerta']);
	});

	it('las páginas iguales mantienen el orden de la lista', () => {
		const t = summarize([
			shot({ pageId: 'b', viewport: 'celu', status: 'igual' }),
			shot({ pageId: 'a', viewport: 'celu', status: 'igual' })
		]);
		expect(t.pages.map((p) => p.pageId)).toEqual(['b', 'a']);
		expect(t.changed).toBe(0);
	});
});

describe('formatRatio', () => {
	it('escribe porcentajes legibles', () => {
		expect(formatRatio(0.0042)).toBe('0,42 %');
		expect(formatRatio(0.00001)).toBe('< 0,01 %');
		expect(formatRatio(0)).toBe('0 %');
		expect(formatRatio(null)).toBe('');
	});
});

describe('informe', () => {
	const s = summarize([
		shot({
			pageId: 'inicio',
			viewport: 'celu',
			status: 'igual',
			nuevo: 'capturas/inicio-celu.png'
		}),
		shot({
			pageId: 'wiki',
			title: 'Kinkipedia <b>',
			path: '/wiki',
			viewport: 'celu',
			status: 'cambio',
			ratio: 0.5,
			base: 'capturas/wiki-celu-base.png',
			nuevo: 'capturas/wiki-celu-nuevo.png',
			diff: 'capturas/wiki-celu-diff.png'
		})
	]);
	const meta = { base: 'origin/main (abc1234)', nuevo: 'def5678' };

	it('headline dice cuántas cambiaron', () => {
		expect(headline(s)).toBe('Cambió 1 de 2 capturas (1 de 2 páginas).');
		expect(headline(summarize([shot({ pageId: 'a', viewport: 'celu', status: 'igual' })]))).toBe(
			'No cambió ninguna de las 1 capturas (1 páginas).'
		);
		expect(headline(summarize([]))).toBe('No se sacó ninguna captura.');
	});

	it('el HTML pone primero lo que cambió, con base, nuevo y diferencias, y escapa el texto', () => {
		const html = renderHtml(s, meta);
		expect(html).toContain('Cambió 1 de 2 capturas');
		expect(html).toContain('Kinkipedia &lt;b&gt;');
		expect(html).not.toContain('Kinkipedia <b>');
		for (const f of ['wiki-celu-base.png', 'wiki-celu-nuevo.png', 'wiki-celu-diff.png']) {
			expect(html).toContain(`capturas/${f}`);
		}
		expect(html.indexOf('id="p-wiki"')).toBeLessThan(html.indexOf('id="p-inicio"'));
		// Las iguales van plegadas.
		expect(html).toMatch(/<details><summary>1 página sin cambios<\/summary>/);
	});

	it('sin cambios, la lista de iguales viene abierta', () => {
		const html = renderHtml(
			summarize([shot({ pageId: 'a', viewport: 'celu', status: 'igual' })]),
			meta
		);
		expect(html).toContain('<details open>');
	});

	it('el Markdown resume la cantidad y qué páginas cambiaron', () => {
		const md = renderMarkdown(s, { ...meta, artifact: 'Informe: artifact `ui-impacto`.' });
		expect(md).toContain('**Cambió 1 de 2 capturas (1 de 2 páginas).**');
		expect(md).toContain('| Kinkipedia <b> (`/wiki`) | cambió | 50 % | — |');
		expect(md).not.toContain('inicio');
		expect(md).toContain('Informe: artifact `ui-impacto`.');
	});

	it('esc escapa los caracteres de HTML', () => {
		expect(esc(`<a href="x">'&'</a>`)).toBe(
			'&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
		);
	});
});

describe('run', () => {
	it('parseArgs entiende --clave valor, --clave=valor y banderas', () => {
		expect(parseArgs(['--base', 'origin/main', '--out=x', '--conservar', '--solo', 'a,b'])).toEqual(
			{
				base: 'origin/main',
				out: 'x',
				conservar: true,
				solo: 'a,b'
			}
		);
	});

	it('defaultNow es hoy en Argentina a las 12:00 (15:00 UTC)', () => {
		expect(new Date(defaultNow(Date.parse('2026-10-04T20:00:00Z'))).toISOString()).toBe(
			'2026-10-04T15:00:00.000Z'
		);
		// A las 23:30 de Argentina todavía es el mismo día allá (02:30 UTC del día siguiente).
		expect(new Date(defaultNow(Date.parse('2026-10-05T02:30:00Z'))).toISOString()).toBe(
			'2026-10-04T15:00:00.000Z'
		);
	});
});

describe('pages', () => {
	it('ids únicos y con forma de nombre de archivo', () => {
		const ids = PAGES.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
	});

	it('celu 390×844 y compu 1280×800', () => {
		expect(VIEWPORTS.map((v) => [v.id, v.width, v.height])).toEqual([
			['celu', 390, 844],
			['compu', 1280, 800]
		]);
	});

	it('sin datos del seed, las páginas de eventos de prueba no tienen dirección', () => {
		const evento = PAGES.find((p) => p.id === 'evento');
		expect(evento?.path({})).toBeNull();
		expect(evento?.path({ tonight: 'demo-x' })).toBe('/calendario/demo-x');
	});
});
