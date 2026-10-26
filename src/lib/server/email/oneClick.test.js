/**
 * Baja en un clic (oneClick.js): qué POST deja pasar el Worker sin `Origin` (solo las páginas de
 * baja, con un solo segmento de token, sin query, y solo si no vino `Origin`) y las cabeceras
 * `List-Unsubscribe` (solo https y solo esas páginas).
 */
import { describe, expect, it } from 'vitest';
import {
	ONE_CLICK_BODY,
	ONE_CLICK_PATH_RE,
	allowOneClickPost,
	oneClickHeaders
} from './oneClick.js';

const SITE = 'https://kinkyvibe.example';

/**
 * @param {string} path
 * @param {Record<string, string>} [headers]
 * @param {string} [method]
 */
function post(path, headers = {}, method = 'POST') {
	return new Request(`${SITE}${path}`, {
		method,
		headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
		...(method === 'GET' ? {} : { body: ONE_CLICK_BODY })
	});
}

describe('ONE_CLICK_PATH_RE', () => {
	it('solo las tres páginas de baja con un token de un segmento', () => {
		for (const ok of [
			'/avisos/sigo/abc.DEF-_1',
			'/avisos/baja/sub_1.firma',
			'/lista-de-espera/salir/123.firma'
		])
			expect(ONE_CLICK_PATH_RE.test(ok), ok).toBe(true);
		for (const bad of [
			'/avisos/baja/x/otra',
			'/avisos/baja/',
			'/avisos/baja',
			'/avisos/confirmar/x',
			'/lista-de-espera/confirmar/x',
			'/mails/no-fui-yo/x',
			'/admin/avisos/baja/x',
			'/avisos/baja/x%2Fy',
			'/avisos/baja/x?y',
			`/avisos/baja/${'a'.repeat(201)}`
		])
			expect(ONE_CLICK_PATH_RE.test(bad), bad).toBe(false);
	});
});

describe('allowOneClickPost', () => {
	it('un POST sin Origin a una página de baja sale con el Origin del sitio, mismo cuerpo', async () => {
		const out = allowOneClickPost(post('/avisos/sigo/abc.firma'));
		expect(out.headers.get('origin')).toBe(SITE);
		expect(out.method).toBe('POST');
		expect(out.url).toBe(`${SITE}/avisos/sigo/abc.firma`);
		expect(await out.text()).toBe(ONE_CLICK_BODY);
	});

	it('con Origin (un navegador, de este u otro sitio, o «null») no se toca', () => {
		for (const origin of ['https://otro.example', 'null', SITE]) {
			const req = post('/avisos/baja/x.firma', { origin });
			expect(allowOneClickPost(req)).toBe(req);
		}
	});

	it('otras rutas, otros métodos o con query: no se tocan', () => {
		for (const req of [
			post('/admin/eventos/x/ordenes'),
			post('/avisos/baja/x/otra'),
			post('/avisos/baja/x.firma?/default'),
			post('/mails/no-fui-yo/x.firma'),
			post('/avisos/baja/x.firma', {}, 'GET'),
			post('/avisos/baja/x.firma', {}, 'PUT')
		])
			expect(allowOneClickPost(req)).toBe(req);
	});
});

describe('oneClickHeaders', () => {
	it('las dos cabeceras de RFC 8058 para un link de baja https', () => {
		expect(oneClickHeaders(`${SITE}/avisos/sigo/abc.firma`)).toEqual({
			'List-Unsubscribe': `<${SITE}/avisos/sigo/abc.firma>`,
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
		});
	});

	it('nada para http, mailto, otras rutas, query o algo que no es un link', () => {
		for (const url of [
			'http://localhost:5173/avisos/sigo/abc.firma',
			'mailto:baja@kinkyvibe.ar',
			`${SITE}/calendario/x`,
			`${SITE}/avisos/sigo/abc.firma?x=1`,
			`${SITE}/avisos/sigo/a>b`,
			'no es un link',
			'',
			null,
			undefined
		])
			expect(oneClickHeaders(url), String(url)).toEqual({});
	});
});
