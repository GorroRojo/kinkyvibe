import { describe, expect, it, vi } from 'vitest';
import { asR2, fakeBucket } from './fakeBucket.js';
import { SOURCE_ETAG_META, STATE_KEY, copyMedia, isCopyCurrent } from './media.js';
import { runMediaCopy } from '../scheduled.js';
import { createTestDB } from '../db/testing.js';

/** Una biblioteca de mentira: originales, copias chicas, un documento y vistas previas. */
function library({ pageSize = 1000 } = {}) {
	const source = fakeBucket({ pageSize });
	source.seed('img/aaaa.webp', 'imagen a', { contentType: 'image/webp' });
	source.seed('img/aaaa-360.webp', 'a chica', { contentType: 'image/webp' });
	source.seed('img/bbbb.jpg', 'imagen b', { contentType: 'image/jpeg' });
	source.seed('file/cccc.pdf', '%PDF-documento', { contentType: 'application/pdf' });
	source.seed('og/evento-1234.jpg', 'vista previa');
	return source;
}

const silent = () => {};

/** Lo que la copia anotó en `STATE_KEY`. @param {ReturnType<typeof fakeBucket>} bucket */
async function savedState(bucket) {
	const object = await bucket.get(STATE_KEY);
	return JSON.parse((await object?.text()) ?? 'null');
}

describe('copyMedia', () => {
	it('copia img/ y file/ (no og/) con su tipo, y la segunda vez no hay nada que copiar', async () => {
		const source = library();
		const target = fakeBucket();
		const first = await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		expect(first).toMatchObject({ copied: 4, checked: 4, failed: [], done: true });
		expect(target.keys()).toEqual([
			'file/cccc.pdf',
			'img/aaaa-360.webp',
			'img/aaaa.webp',
			'img/bbbb.jpg'
		]);
		const pdf = await target.get('file/cccc.pdf');
		expect(await pdf?.text()).toBe('%PDF-documento');
		expect(pdf?.httpMetadata).toEqual({ contentType: 'application/pdf' });
		expect(pdf?.customMetadata?.[SOURCE_ETAG_META]).toBe(source.store.get('file/cccc.pdf')?.etag);

		const puts = target.ops.put;
		const second = await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		expect(second).toMatchObject({ copied: 0, checked: 4, done: true });
		expect(target.ops.put).toBe(puts);
		// Lo nuevo entra la noche siguiente.
		source.seed('img/dddd.png', 'imagen nueva');
		expect(
			await copyMedia({ source: asR2(source), target: asR2(target), log: silent })
		).toMatchObject({ copied: 1 });
		expect(target.keys()).toContain('img/dddd.png');
	});

	it('nunca borra nada de la copia, aunque se borre del original', async () => {
		const source = library();
		const target = fakeBucket();
		await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		await source.delete(['img/aaaa.webp', 'file/cccc.pdf']);
		const result = await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		expect(result).toMatchObject({ copied: 0, done: true });
		expect(target.keys()).toEqual(
			expect.arrayContaining(['img/aaaa.webp', 'file/cccc.pdf', 'img/bbbb.jpg'])
		);
		expect(target.ops.delete).toBe(0);
	});

	it('vuelve a copiar lo que cambió (otro tamaño u otro etag), no lo subido por partes que es igual', async () => {
		const source = library();
		const target = fakeBucket();
		await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		source.seed('img/bbbb.jpg', 'imagen b, otra'); // otro tamaño
		source.seed('img/aaaa.webp', 'imagen A'); // mismo tamaño, otros bytes
		const result = await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		expect(result.copied).toBe(2);
		expect(await (await target.get('img/aaaa.webp'))?.text()).toBe('imagen A');

		// Un original subido por partes tiene un etag que la copia nunca va a tener: se compara con el
		// etag del original guardado en la copia.
		source.seed('file/eeee.mp4', 'video grande', { etag: 'abc123-3' });
		await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		const again = await copyMedia({ source: asR2(source), target: asR2(target), log: silent });
		expect(again.copied).toBe(0);
	});

	it('con un tope de objetos por noche, sigue la noche siguiente desde donde quedó', async () => {
		const source = library();
		const target = fakeBucket();
		const limits = { maxObjects: 3 };
		const night1 = await copyMedia({
			source: asR2(source),
			target: asR2(target),
			limits,
			log: silent
		});
		expect(night1).toMatchObject({ copied: 3, done: false, resumeAfter: 'img/aaaa.webp' });
		expect(await savedState(target)).toMatchObject({
			resumeAfter: 'img/aaaa.webp'
		});
		const night2 = await copyMedia({
			source: asR2(source),
			target: asR2(target),
			limits,
			log: silent
		});
		// Sigue después de la última revisada: no vuelve a mirar las primeras.
		expect(night2).toMatchObject({ copied: 1, checked: 1, done: true, resumeAfter: '' });
		expect((await savedState(target)).resumeAfter).toBe('');
		expect(target.keys().filter((k) => !k.startsWith('_estado/'))).toHaveLength(4);
		// La vuelta siguiente empieza de nuevo desde el principio.
		const night3 = await copyMedia({
			source: asR2(source),
			target: asR2(target),
			limits,
			log: silent
		});
		expect(night3).toMatchObject({ copied: 0, checked: 4, done: true });
	});

	it('con un tope de bytes por noche; un objeto más grande que el tope igual se copia si es el primero', async () => {
		const source = fakeBucket();
		source.seed('file/a.pdf', 'x'.repeat(50));
		source.seed('file/b.pdf', 'x'.repeat(10));
		source.seed('file/c.pdf', 'x'.repeat(10));
		const target = fakeBucket();
		const limits = { maxBytes: 15 };
		const night1 = await copyMedia({
			source: asR2(source),
			target: asR2(target),
			limits,
			log: silent
		});
		expect(night1).toMatchObject({ copied: 1, copiedBytes: 50, done: false });
		const night2 = await copyMedia({
			source: asR2(source),
			target: asR2(target),
			limits,
			log: silent
		});
		expect(night2).toMatchObject({ copied: 1, copiedBytes: 10, done: false });
		const night3 = await copyMedia({
			source: asR2(source),
			target: asR2(target),
			limits,
			log: silent
		});
		expect(night3).toMatchObject({ copied: 1, done: true });
		expect(target.keys()).toEqual(
			expect.arrayContaining(['file/a.pdf', 'file/b.pdf', 'file/c.pdf'])
		);
	});

	it('pagina las dos listas a la par y respeta el tope de páginas por noche', async () => {
		const source = fakeBucket({ pageSize: 2 });
		const keys = Array.from({ length: 9 }, (_, i) => `img/${String(i).padStart(4, '0')}.webp`);
		for (const k of keys) source.seed(k, `bytes ${k}`);
		const target = fakeBucket({ pageSize: 2 });
		// La copia ya tiene algunas (intercaladas): esas no se copian de nuevo.
		for (const k of [keys[1], keys[4], keys[5]]) target.seed(k, `bytes ${k}`);
		let nights = 0;
		let total = 0;
		for (;;) {
			nights++;
			const r = await copyMedia({
				source: asR2(source),
				target: asR2(target),
				limits: { maxListPages: 4 },
				log: silent
			});
			expect(r.listPages).toBeLessThanOrEqual(4);
			total += r.copied;
			if (r.done) break;
			expect(nights).toBeLessThan(10);
		}
		expect(nights).toBeGreaterThan(1);
		expect(total).toBe(6);
		expect(target.keys().filter((k) => k.startsWith('img/'))).toEqual(keys);
	});

	it('si un objeto no se puede copiar, sigue con los demás y lo reintenta en la próxima vuelta', async () => {
		const source = library();
		source.broken.add('img/aaaa.webp');
		const target = fakeBucket();
		const log = vi.fn();
		const result = await copyMedia({ source: asR2(source), target: asR2(target), log });
		expect(result).toMatchObject({ copied: 3, failed: ['img/aaaa.webp'], done: true });
		expect(log).toHaveBeenCalledWith(expect.stringContaining('img/aaaa.webp'));
		source.broken.clear();
		expect(await copyMedia({ source: asR2(source), target: asR2(target), log })).toMatchObject({
			copied: 1,
			failed: []
		});
	});

	it('isCopyCurrent: mismo tamaño y mismo etag (o el etag del original guardado)', () => {
		const src = /** @type {any} */ ({ key: 'k', size: 3, etag: 'e1' });
		expect(isCopyCurrent(src, undefined)).toBe(false);
		expect(isCopyCurrent(src, /** @type {any} */ ({ size: 3, etag: 'e1' }))).toBe(true);
		expect(isCopyCurrent(src, /** @type {any} */ ({ size: 4, etag: 'e1' }))).toBe(false);
		expect(isCopyCurrent(src, /** @type {any} */ ({ size: 3, etag: 'e2' }))).toBe(false);
		expect(
			isCopyCurrent(
				src,
				/** @type {any} */ ({ size: 3, etag: 'e2', customMetadata: { [SOURCE_ETAG_META]: 'e1' } })
			)
		).toBe(true);
	});
});

describe('runMediaCopy (el paso del cron nocturno)', () => {
	it('sin el binding de la copia (Previews, local) no hace nada', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			const source = library();
			expect(await runMediaCopy({ MEDIA: asR2(source) })).toBeNull();
			expect(source.ops.list).toBe(0);
			expect(log).toHaveBeenCalledWith(expect.stringContaining('MEDIA_COPIA'));
		} finally {
			log.mockRestore();
		}
	});

	it('copia y escribe un resumen en el log', async () => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			const source = library();
			const target = fakeBucket();
			const result = await runMediaCopy({ MEDIA: asR2(source), MEDIA_COPIA: asR2(target) });
			expect(result).toMatchObject({ copied: 4, done: true });
			expect(log).toHaveBeenCalledWith(expect.stringMatching(/copia de medios: 4 copiado\(s\)/));
		} finally {
			log.mockRestore();
		}
	});

	it('si falla (no puede listar), lo escribe en el log y no tira error', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const source = library();
			source.list = async () => {
				throw new Error('R2 caído');
			};
			expect(
				await runMediaCopy({ MEDIA: asR2(source), MEDIA_COPIA: asR2(fakeBucket()) })
			).toBeNull();
			expect(error).toHaveBeenCalledWith(
				expect.stringContaining('copia de medios: falló'),
				expect.any(Error)
			);
		} finally {
			error.mockRestore();
		}
	});
});

describe('copyMedia contra el R2 de miniflare', () => {
	it('lista con startAfter y metadatos, copia el tipo y no vuelve a copiar', async () => {
		const t = await createTestDB({ migrate: false });
		try {
			const env = /** @type {any} */ (t.env);
			/** @type {import('@cloudflare/workers-types').R2Bucket} */
			const source = env.MEDIA;
			/** @type {import('@cloudflare/workers-types').R2Bucket} */
			const target = env.MEDIA_COPIA;
			expect(source && target).toBeTruthy();
			for (const k of ['img/0001.webp', 'img/0002.webp', 'img/0003.webp', 'file/0004.pdf']) {
				await source.put(k, `bytes ${k}`, { httpMetadata: { contentType: 'image/webp' } });
			}
			await source.put('og/x.jpg', 'vista previa');
			const night1 = await copyMedia({ source, target, limits: { maxObjects: 2 }, log: silent });
			expect(night1).toMatchObject({ copied: 2, done: false });
			const night2 = await copyMedia({ source, target, limits: { maxObjects: 2 }, log: silent });
			expect(night2).toMatchObject({ copied: 2, done: true });
			const copy = await target.get('img/0002.webp');
			expect(await copy?.text()).toBe('bytes img/0002.webp');
			expect(copy?.httpMetadata?.contentType).toBe('image/webp');
			expect(await target.head('og/x.jpg')).toBeNull();
			expect(await copyMedia({ source, target, log: silent })).toMatchObject({
				copied: 0,
				checked: 4,
				done: true
			});
		} finally {
			await t.dispose();
		}
	}, 30_000);
});
