import { describe, expect, it } from 'vitest';
import { chooseImage, clearImage, emptyUpload } from './imageState.js';

const MB = 1024 * 1024;

/** URLs falsas que anotan lo que se crea y se suelta. */
function fakeUrls() {
	let n = 0;
	/** @type {string[]} */
	const revoked = [];
	return {
		revoked,
		createObjectURL: () => `blob:${++n}`,
		/** @param {string} url */
		revokeObjectURL: (url) => void revoked.push(url)
	};
}
const png = { name: 'flyer.png', type: 'image/png', size: MB };

describe('chooseImage', () => {
	it('una imagen válida: URL local, nombre y extensión', () => {
		const urls = fakeUrls();
		const r = chooseImage(emptyUpload(), png, 5 * MB, urls);
		expect(r).toEqual({
			upload: { url: 'blob:1', name: 'flyer.png', ext: 'png', error: '' },
			clearInput: false,
			chosen: true
		});
		expect(urls.revoked).toEqual([]);
	});
	it('elegir otra suelta la URL de la anterior', () => {
		const urls = fakeUrls();
		const first = chooseImage(emptyUpload(), png, 5 * MB, urls).upload;
		const second = chooseImage(first, { ...png, name: 'b.webp', type: 'image/webp' }, 5 * MB, urls);
		expect(second.upload).toEqual({ url: 'blob:2', name: 'b.webp', ext: 'webp', error: '' });
		expect(urls.revoked).toEqual(['blob:1']);
	});
	it('una que no sirve: error, vaciar el input y la anterior sigue elegida', () => {
		const urls = fakeUrls();
		const first = chooseImage(emptyUpload(), png, 5 * MB, urls).upload;
		const big = chooseImage(first, { ...png, size: 6 * MB }, 5 * MB, urls);
		expect(big.clearInput).toBe(true);
		expect(big.chosen).toBe(false);
		expect(big.upload).toEqual({ ...first, error: 'La imagen pesa 6.0 MB. El máximo es 5 MB.' });
		const gif = chooseImage(first, { ...png, type: 'image/gif' }, 5 * MB, urls);
		expect(gif.upload.error).toBe('La imagen tiene que ser JPG, PNG o WEBP.');
		expect(urls.revoked).toEqual([]);
	});
	it('cancelar el diálogo borra el error y no cambia nada más', () => {
		const prev = { url: 'blob:9', name: 'a.jpg', ext: /** @type {'jpg'} */ ('jpg'), error: 'x' };
		expect(chooseImage(prev, undefined, 5 * MB, fakeUrls())).toEqual({
			upload: { ...prev, error: '' },
			clearInput: false,
			chosen: false
		});
	});
});

describe('clearImage', () => {
	it('suelta la URL y queda vacío', () => {
		const urls = fakeUrls();
		const prev = chooseImage(emptyUpload(), png, 5 * MB, urls).upload;
		expect(clearImage(prev, urls)).toEqual(emptyUpload());
		expect(urls.revoked).toEqual(['blob:1']);
		expect(clearImage(emptyUpload(), urls)).toEqual(emptyUpload());
		expect(urls.revoked).toEqual(['blob:1']);
	});
});
