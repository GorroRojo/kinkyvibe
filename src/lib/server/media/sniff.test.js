import { describe, expect, it } from 'vitest';
import {
	fileKey,
	mediaKey,
	mediaPath,
	sha256Hex,
	sniffDocument,
	sniffImage,
	sniffMedia
} from './sniff.js';
import { fakeMp4, fakeOdt, fakePdf, fakeWebm, fakeZip, solidPng } from './testing.js';

/** Cabeceras mínimas inventadas (solo lo que se lee). */
const jpeg = () => {
	const b = new Uint8Array(40);
	b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
	// SOF0 en 8: largo 17, precisión 8, alto 300, ancho 400
	b.set([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0x90], 8);
	return b;
};
const webpX = () => {
	const b = new Uint8Array(30);
	b.set(new TextEncoder().encode('RIFF'), 0);
	b.set(new TextEncoder().encode('WEBPVP8X'), 8);
	// ancho-1 = 1999 (0x07cf), alto-1 = 999 (0x03e7), 24 bits little endian
	b.set([0xcf, 0x07, 0x00, 0xe7, 0x03, 0x00], 24);
	return b;
};
const gif = () => {
	const b = new Uint8Array(16);
	b.set(new TextEncoder().encode('GIF89a'));
	b.set([0x20, 0x00, 0x10, 0x00], 6);
	return b;
};

describe('sniffImage', () => {
	it('reconoce el tipo por los bytes y lee las medidas', () => {
		expect(sniffImage(solidPng(7, 3))).toEqual({
			mime: 'image/png',
			ext: 'png',
			width: 7,
			height: 3
		});
		expect(sniffImage(jpeg())).toEqual({ mime: 'image/jpeg', ext: 'jpg', width: 400, height: 300 });
		expect(sniffImage(webpX())).toEqual({
			mime: 'image/webp',
			ext: 'webp',
			width: 2000,
			height: 1000
		});
		expect(sniffImage(gif())).toEqual({ mime: 'image/gif', ext: 'gif', width: 32, height: 16 });
	});
	it('rechaza lo que no es una imagen aceptada (SVG, HTML, texto, vacío)', () => {
		const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);
		expect(sniffImage(enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
		expect(sniffImage(enc('<!doctype html><script>x</script>'))).toBeNull();
		expect(sniffImage(new Uint8Array())).toBeNull();
	});
	it('claves por contenido y su dirección', async () => {
		const h = await sha256Hex(new TextEncoder().encode('abc'));
		expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
		expect(mediaKey(h, 'webp')).toBe(`img/${h}.webp`);
		expect(mediaPath(mediaKey(h, 'webp'))).toBe(`/media/img/${h}.webp`);
	});
});

describe('sniffDocument (documentos y video de la biblioteca)', () => {
	const enc = (/** @type {string} */ s) => new TextEncoder().encode(s);
	it('reconoce PDF, MP4, WebM y OpenDocument (ODT, ODS, ODP) por los bytes', () => {
		expect(sniffDocument(fakePdf())).toEqual({
			kind: 'documento',
			mime: 'application/pdf',
			ext: 'pdf'
		});
		for (const brand of ['isom', 'mp42', 'avc1', 'M4V ']) {
			expect(sniffDocument(fakeMp4(brand))).toEqual({
				kind: 'video',
				mime: 'video/mp4',
				ext: 'mp4'
			});
		}
		expect(sniffDocument(fakeWebm())).toEqual({ kind: 'video', mime: 'video/webm', ext: 'webm' });
		expect(sniffDocument(fakeOdt())).toEqual({
			kind: 'documento',
			mime: 'application/vnd.oasis.opendocument.text',
			ext: 'odt'
		});
		expect(
			sniffDocument(fakeZip('mimetype', 'application/vnd.oasis.opendocument.spreadsheet'))
		).toMatchObject({ ext: 'ods' });
		expect(
			sniffDocument(fakeZip('mimetype', 'application/vnd.oasis.opendocument.presentation'))
		).toMatchObject({ ext: 'odp' });
	});
	it('rechaza HTML, SVG, scripts, zips que no son OpenDocument y las imágenes ISO (AVIF)', () => {
		expect(sniffDocument(enc('<!doctype html><script>alert(1)</script>'))).toBeNull();
		expect(sniffDocument(enc('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
		expect(sniffDocument(enc('#!/bin/sh\nrm -rf /tmp/x\n'))).toBeNull();
		expect(sniffDocument(enc('console.log("hola mundo")'))).toBeNull();
		// Un .docx / .zip cualquiera: la primera entrada no es `mimetype`.
		expect(sniffDocument(fakeZip('[Content_Types].xml', '<Types/>'))).toBeNull();
		// `mimetype` con otro tipo, o comprimido (la norma ODF lo pide sin comprimir).
		expect(sniffDocument(fakeZip('mimetype', 'text/html'))).toBeNull();
		expect(
			sniffDocument(fakeZip('mimetype', 'application/vnd.oasis.opendocument.graphics'))
		).toBeNull();
		expect(
			sniffDocument(
				fakeZip('mimetype', 'application/vnd.oasis.opendocument.text', { compressed: true })
			)
		).toBeNull();
		// Un `ftyp` de imagen o de una marca desconocida.
		expect(sniffDocument(fakeMp4('avif'))).toBeNull();
		expect(sniffDocument(fakeMp4('heic'))).toBeNull();
		// EBML que no es WebM (Matroska).
		const mkv = fakeWebm();
		mkv.set(enc('mkvx'), 12);
		expect(sniffDocument(mkv)).toBeNull();
		expect(sniffDocument(new Uint8Array())).toBeNull();
		// Una imagen no es un documento.
		expect(sniffDocument(solidPng(3, 3))).toBeNull();
	});
	it('sniffMedia: imagen o documento/video, con su clase', () => {
		expect(sniffMedia(solidPng(3, 3))).toMatchObject({ kind: 'imagen', mime: 'image/png' });
		expect(sniffMedia(fakePdf())).toMatchObject({ kind: 'documento', ext: 'pdf' });
		expect(sniffMedia(enc('<html></html> y un poco más'))).toBeNull();
	});
	it('la clave de un archivo es por contenido, en `file/`', async () => {
		const h = await sha256Hex(fakePdf());
		expect(fileKey(h, 'pdf')).toBe(`file/${h}.pdf`);
		expect(mediaPath(fileKey(h, 'pdf'))).toBe(`/media/file/${h}.pdf`);
	});
});
