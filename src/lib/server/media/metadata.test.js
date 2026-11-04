/**
 * Los datos ocultos de WEBP y AVIF (./metadata.js), con archivos de verdad: `fixtures/` tiene una
 * foto de 8×8 de cada tipo con Exif (marca y modelo del celu, fecha, GPS y orientación inventados)
 * y XMP (un autor inventado), hechas con Pillow, y un WEBP sin metadatos.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripImageMetadata } from './metadata.js';
import { sniffImage } from './sniff.js';

/** @param {string} name */
const fixture = (name) =>
	new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

/** @param {Uint8Array} b @param {string} s */
const has = (b, s) => Buffer.from(b).includes(Buffer.from(s, 'latin1'));

/** Lo que dicen los metadatos de las fotos de prueba. */
const SECRETS = ['MarcaInventada', 'CelularInventado', '2001:02:03', 'AutorInventado', 'xmpmeta'];

/** @param {Uint8Array} b */
const webpChunks = (b) => {
	const out = [];
	for (let i = 12; i + 8 <= b.length;) {
		const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
		out.push({ type: String.fromCharCode(...b.subarray(i, i + 4)), len, at: i });
		i += 8 + len + (len & 1);
	}
	return out;
};

describe('stripImageMetadata: WEBP', () => {
	it('saca Exif y XMP y deja solo la orientación', () => {
		const original = fixture('con-metadatos.webp');
		for (const s of SECRETS) expect(has(original, s)).toBe(true);
		const clean = stripImageMetadata(original);
		for (const s of SECRETS) expect(has(clean, s)).toBe(false);

		const chunks = webpChunks(clean);
		expect(chunks.map((c) => c.type)).not.toContain('XMP ');
		// Un Exif mínimo: solo la orientación (6, de costado), como en un JPEG.
		const exif = chunks.find((c) => c.type === 'EXIF');
		expect(exif?.len).toBe(26);
		const tiff = clean.subarray(
			/** @type {any} */ (exif).at + 8,
			/** @type {any} */ (exif).at + 34
		);
		expect([...tiff.subarray(0, 4)]).toEqual([0x4d, 0x4d, 0x00, 0x2a]);
		expect(tiff[19]).toBe(6);
		// VP8X: dice que hay Exif y ya no que hay XMP.
		const vp8x = /** @type {any} */ (chunks.find((c) => c.type === 'VP8X'));
		expect(clean[vp8x.at + 8] & 0x08).toBe(0x08);
		expect(clean[vp8x.at + 8] & 0x04).toBe(0);
		// El largo del RIFF es el del archivo, y sigue siendo un WEBP con el mismo tamaño.
		const riff = clean[4] | (clean[5] << 8) | (clean[6] << 16) | (clean[7] << 24);
		expect(riff + 8).toBe(clean.length);
		expect(sniffImage(clean)).toMatchObject({ mime: 'image/webp', width: 8, height: 8 });
		// Los datos de la imagen, iguales.
		const data = (/** @type {Uint8Array} */ b) => {
			const c = /** @type {any} */ (webpChunks(b).find((x) => x.type.startsWith('VP8 ')));
			return Buffer.from(b.subarray(c.at, c.at + 8 + c.len)).toString('hex');
		};
		expect(data(clean)).toBe(data(original));
		// El original no se tocó.
		expect(has(original, 'MarcaInventada')).toBe(true);
	});

	it('un WEBP sin metadatos vuelve igual (los mismos bytes)', () => {
		const plain = fixture('sin-metadatos.webp');
		expect(stripImageMetadata(plain)).toBe(plain);
	});

	it('sin orientación, el Exif sale entero y VP8X ya no lo anuncia', () => {
		const original = fixture('con-metadatos.webp');
		const chunks = webpChunks(original);
		const exif = /** @type {any} */ (chunks.find((c) => c.type === 'EXIF'));
		// Una copia con la orientación en 1 (normal): no hace falta guardarla.
		const copy = original.slice();
		const tiff = copy.subarray(exif.at + 8, exif.at + 8 + exif.len);
		const le = tiff[0] === 0x49;
		const u16 = (/** @type {number} */ k) =>
			le ? tiff[k] | (tiff[k + 1] << 8) : (tiff[k] << 8) | tiff[k + 1];
		const ifd = le
			? tiff[4] | (tiff[5] << 8) | (tiff[6] << 16) | (tiff[7] << 24)
			: (tiff[4] << 24) | (tiff[5] << 16) | (tiff[6] << 8) | tiff[7];
		for (let n = 0; n < u16(ifd); n++) {
			const e = ifd + 2 + n * 12;
			if (u16(e) === 0x0112) tiff[le ? e + 8 : e + 9] = 1;
		}
		const clean = stripImageMetadata(copy);
		expect(webpChunks(clean).map((c) => c.type)).not.toContain('EXIF');
		const vp8x = /** @type {any} */ (webpChunks(clean).find((c) => c.type === 'VP8X'));
		expect(clean[vp8x.at + 8] & 0x0c).toBe(0);
		for (const s of SECRETS) expect(has(clean, s)).toBe(false);
	});
});

describe('stripImageMetadata: AVIF', () => {
	it('pisa el Exif (queda solo la orientación) y el XMP, sin cambiar el tamaño ni las cajas', () => {
		const original = fixture('con-metadatos.avif');
		for (const s of SECRETS) expect(has(original, s)).toBe(true);
		const clean = stripImageMetadata(original);
		expect(clean).not.toBe(original);
		for (const s of SECRETS) expect(has(clean, s)).toBe(false);
		expect(clean.length).toBe(original.length);
		expect(sniffImage(clean)).toMatchObject({ mime: 'image/avif' });
		// Las cajas (ftyp, meta con iinf/iloc) no cambian: solo el contenido de los ítems, en mdat.
		const changed = [...clean.keys()].filter((i) => clean[i] !== original[i]);
		const mdat = Buffer.from(original).indexOf('mdat');
		expect(changed.length).toBeGreaterThan(0);
		expect(Math.min(...changed)).toBeGreaterThan(mdat);
		// El XMP, en espacios.
		const xmpFrom = Buffer.from(original).indexOf('<x:xmpmeta');
		const xmpTo = Buffer.from(original).indexOf('</x:xmpmeta>') + '</x:xmpmeta>'.length;
		expect(clean.subarray(xmpFrom, xmpTo).every((c) => c === 0x20)).toBe(true);
		// El Exif sigue siendo un Exif válido (si no, libavif no abre la imagen): solo la orientación.
		const tiff = Buffer.from(clean).indexOf(
			Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1])
		);
		expect(tiff).toBeGreaterThan(mdat);
		expect([...clean.subarray(tiff + 10, tiff + 12)]).toEqual([0x01, 0x12]);
		// Pillow guarda la orientación de esta foto en `irot` (que no se toca), no en el Exif: queda 1.
		expect(clean[tiff + 19]).toBe(1);
		// El bloque TIFF empieza justo después de los 4 bytes de la posición (0).
		expect([...clean.subarray(tiff - 4, tiff)]).toEqual([0, 0, 0, 0]);
		expect(has(original, 'AutorInventado')).toBe(true);
	});

	it('un HEIC (otro ISO BMFF) o un archivo cortado van tal cual', () => {
		const original = fixture('con-metadatos.avif');
		const heic = original.slice();
		// La marca principal y las compatibles: ya no dicen AVIF.
		const ftypLen = (heic[0] << 24) | (heic[1] << 16) | (heic[2] << 8) | heic[3];
		for (let k = 8; k + 4 <= ftypLen; k += 4) {
			if (String.fromCharCode(...heic.subarray(k, k + 4)).startsWith('avi'))
				heic.set([0x68, 0x65, 0x69, 0x63], k);
		}
		expect(stripImageMetadata(heic)).toBe(heic);
		const cut = original.subarray(0, 40);
		expect(stripImageMetadata(cut)).toBe(cut);
	});
});
