/**
 * La lista corta de HTML (./sanitize.js): las imágenes de los textos solo de la biblioteca propia
 * (`/media/…`), como las imágenes de perfil, y sin los atributos globales que cambian el teclado.
 */
import { describe, expect, it } from 'vitest';
import { rehype } from 'rehype';
import { isOwnImageSrc, rehypeProfileHtml, rehypeProfilePageHtml } from './sanitize.js';

const processor = rehype().data('settings', { fragment: true }).use(rehypeProfileHtml).freeze();

/** @param {string} html */
const clean = async (html) => String(await processor.process(html));

const SHA = 'a'.repeat(64);

describe('lista corta: imágenes', () => {
	it('una imagen de otro sitio pierde su src', async () => {
		const html = await clean('<img src="https://other.example/x.png" alt="foto">');
		expect(html).toContain('<img');
		expect(html).toContain('alt="foto"');
		expect(html).not.toContain('other.example');
		expect(html).not.toContain('src=');
	});

	it('tampoco pasan http ni las direcciones sin esquema de otro sitio', async () => {
		for (const src of [
			'http://other.example/x.png',
			'//other.example/media/x.png',
			'/\\other.example/x.png',
			'/media/../admin/x.png',
			'otra/x.png',
			'https://kinkyvibe.ar.other.example/media/img/x.webp'
		]) {
			expect(await clean(`<img src="${src}">`), src).not.toContain('src=');
		}
	});

	it('una imagen de la biblioteca (/media/…) queda', async () => {
		const html = await clean(`<img src="/media/img/${SHA}.webp" alt="">`);
		expect(html).toContain(`src="/media/img/${SHA}.webp"`);
		expect(html).toContain('loading="lazy"');
	});

	it('en el texto de un perfil, la primera imagen se pide primero y las demás cargan de a poco', async () => {
		const profilePage = rehype()
			.data('settings', { fragment: true })
			.use(rehypeProfilePageHtml)
			.freeze();
		const html = String(
			await profilePage.process(
				`<p><img src="https://other.example/x.png" alt="ajena"></p>` +
					`<p><img src="/media/img/${SHA}.webp" alt="una"></p>` +
					`<p><img src="/media/img/${'b'.repeat(64)}.webp" alt="dos"></p>`
			)
		);
		const imgs = html.match(/<img[^>]*>/g) ?? [];
		expect(imgs).toHaveLength(3);
		// la de otro sitio pierde su src y no cuenta como «la primera»
		expect(imgs[0]).not.toContain('src=');
		expect(imgs[0]).toContain('loading="lazy"');
		expect(imgs[1]).toContain('alt="una"');
		expect(imgs[1]).toContain('fetchpriority="high"');
		expect(imgs[1]).not.toContain('loading=');
		expect(imgs[2]).toContain('alt="dos"');
		expect(imgs[2]).toContain('loading="lazy"');
		expect(imgs[2]).not.toContain('fetchpriority');
	});

	it('fuera de un perfil (eventos, material, wiki) todas cargan de a poco', async () => {
		const html = await clean(
			`<img src="/media/img/${SHA}.webp" alt="una"><img src="/media/img/${SHA}.webp" alt="dos">`
		);
		expect(html.match(/loading="lazy"/g)).toHaveLength(2);
		expect(html).not.toContain('fetchpriority');
	});

	it('la misma imagen en el sitio público (fuera de producción) queda', async () => {
		const src = `https://kinkyvibe.ar/media/img/${SHA}.webp`;
		expect(await clean(`<img src="${src}">`)).toContain(`src="${src}"`);
	});

	it('isOwnImageSrc', () => {
		expect(isOwnImageSrc(`/media/img/${SHA}.webp`)).toBe(true);
		expect(isOwnImageSrc('https://other.example/x.png')).toBe(false);
		expect(isOwnImageSrc(undefined)).toBe(false);
	});

	it('los links a otros sitios siguen pasando', async () => {
		expect(await clean('<a href="https://other.example/x">x</a>')).toContain(
			'href="https://other.example/x"'
		);
	});
});

describe('lista corta: atributos globales', () => {
	it('saca accesskey y tabindex', async () => {
		const html = await clean('<p accesskey="x" tabindex="1" title="hola">texto</p>');
		expect(html).toBe('<p title="hola">texto</p>');
	});
});
