import { describe, expect, it, vi } from 'vitest';
import {
	FONDO_TIERS,
	MAX_BODY_BYTES,
	handleMiLink,
	isValidFondoSecret,
	parseMiLinkBody,
	readBodyCapped
} from './miLink.js';

const SECRET = 'f'.repeat(32);
const URL_OK = 'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b2c3d4e';
const TO = 'persona@example.com';

/** @param {unknown} body */
const parse = (body) => parseMiLinkBody(JSON.stringify(body));
/** @param {unknown} url @param {unknown} [tier] */
const withLink = (url, tier = 'Casual') => parse({ to: TO, links: [{ tier, url }] });

describe('isValidFondoSecret', () => {
	it('acepta solo el secreto exacto', async () => {
		expect(await isValidFondoSecret(SECRET, SECRET)).toBe(true);
		expect(await isValidFondoSecret('g'.repeat(32), SECRET)).toBe(false);
		expect(await isValidFondoSecret(SECRET.slice(1), SECRET)).toBe(false);
		expect(await isValidFondoSecret(`${SECRET} `, SECRET)).toBe(false);
	});

	it('sin header: false', async () => {
		expect(await isValidFondoSecret(null, SECRET)).toBe(false);
		expect(await isValidFondoSecret(undefined, SECRET)).toBe(false);
		expect(await isValidFondoSecret('', SECRET)).toBe(false);
	});

	it('sin secreto configurado (o muy corto): siempre false', async () => {
		expect(await isValidFondoSecret('', '')).toBe(false);
		expect(await isValidFondoSecret('x', undefined)).toBe(false);
		expect(await isValidFondoSecret('corto', 'corto')).toBe(false);
	});
});

describe('parseMiLinkBody', () => {
	it('acepta un body válido y devuelve solo lo validado', () => {
		expect(withLink(URL_OK)).toEqual({ to: TO, links: [{ tier: 'Casual', url: URL_OK }] });
		expect(
			parse({ to: '  Persona@Example.COM ', links: [{ tier: 'Super', url: URL_OK }] })
		).toEqual({ to: TO, links: [{ tier: 'Super', url: URL_OK }] });
		const upper = 'https://fondo.kinkyvibe.ar/gracias?preapproval_id=ABCdef0123';
		expect(withLink(upper)?.links[0].url).toBe(upper);
	});

	it('acepta los siete niveles, y de 1 a 5 links', () => {
		for (const tier of FONDO_TIERS) expect(withLink(URL_OK, tier)).not.toBeNull();
		const five = Array.from({ length: 5 }, () => ({ tier: 'Regular', url: URL_OK }));
		expect(parse({ to: TO, links: five })?.links).toHaveLength(5);
	});

	it('rechaza lo que no es JSON o no es un objeto', () => {
		expect(parseMiLinkBody('')).toBeNull();
		expect(parseMiLinkBody('to=persona@example.com')).toBeNull();
		expect(parseMiLinkBody('{"to":')).toBeNull();
		expect(parse(null)).toBeNull();
		expect(parse([])).toBeNull();
		expect(parse('texto')).toBeNull();
	});

	it('rechaza mails inválidos o muy largos', () => {
		for (const to of [
			'',
			'persona',
			'persona@',
			'@example.com',
			'persona@example',
			'per sona@example.com',
			'a@example.com, b@example.com',
			'Persona <persona@example.com>',
			`${'a'.repeat(250)}@example.com`,
			42,
			null,
			['persona@example.com']
		]) {
			expect(parse({ to, links: [{ tier: 'Casual', url: URL_OK }] }), String(to)).toBeNull();
		}
	});

	it('rechaza 0 o 6 links, o links que no son una lista', () => {
		expect(parse({ to: TO, links: [] })).toBeNull();
		const six = Array.from({ length: 6 }, () => ({ tier: 'Regular', url: URL_OK }));
		expect(parse({ to: TO, links: six })).toBeNull();
		expect(parse({ to: TO, links: { tier: 'Casual', url: URL_OK } })).toBeNull();
		expect(parse({ to: TO })).toBeNull();
	});

	it('rechaza niveles que no existen', () => {
		for (const tier of ['casual', 'CASUAL', ' Casual', 'Oro', '', 1, null]) {
			expect(withLink(URL_OK, tier), String(tier)).toBeNull();
		}
	});

	it('rechaza links que no son la página de gracias del Fondo', () => {
		for (const url of [
			'http://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b',
			'https://kinkyvibe.ar/gracias?preapproval_id=0a1b',
			'https://evil.example/gracias?preapproval_id=0a1b',
			'https://fondo.kinkyvibe.ar.evil.com/gracias?preapproval_id=0a1b',
			'https://fondo.kinkyvibe.ar@evil.com/gracias?preapproval_id=0a1b',
			'https://fondo.kinkyvibe.ar:8443/gracias?preapproval_id=0a1b',
			'https://FONDO.kinkyvibe.ar/gracias?preapproval_id=0a1b',
			'https://fondo.kinkyvibe.ar/gracias/../admin?preapproval_id=0a1b',
			'https://fondo.kinkyvibe.ar/otra?preapproval_id=0a1b',
			'https://fondo.kinkyvibe.ar/gracias?preapproval_id=',
			'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1g',
			'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b-2c',
			'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b&next=https://evil.example',
			'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b#x',
			'https://fondo.kinkyvibe.ar/gracias?x=1&preapproval_id=0a1b',
			'https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b\n',
			' https://fondo.kinkyvibe.ar/gracias?preapproval_id=0a1b',
			'javascript:alert(1)',
			`https://fondo.kinkyvibe.ar/gracias?preapproval_id=${'a'.repeat(200)}`,
			42,
			null
		]) {
			expect(withLink(url), String(url)).toBeNull();
		}
	});

	it('rechaza claves de más, arriba y en cada link', () => {
		expect(parse({ to: TO, links: [{ tier: 'Casual', url: URL_OK }], subject: 'x' })).toBeNull();
		expect(
			parse({ to: TO, links: [{ tier: 'Casual', url: URL_OK }], from: 'x@example.com' })
		).toBeNull();
		expect(
			parse({ to: TO, links: [{ tier: 'Casual', url: URL_OK, html: '<b>x</b>' }] })
		).toBeNull();
		expect(parse({ to: TO, links: [{ tier: 'Casual' }] })).toBeNull();
		expect(parseMiLinkBody(`{"to":"${TO}","links":[],"__proto__":{"x":1}}`)).toBeNull();
	});
});

describe('readBodyCapped', () => {
	/** @param {BodyInit} body @param {Record<string, string>} [headers] */
	const req = (body, headers = {}) =>
		new Request('https://kinkyvibe.ar/api/fondo/mi-link', { method: 'POST', body, headers });

	it('devuelve el texto si entra', async () => {
		expect(await readBodyCapped(req('{"a":1}'))).toBe('{"a":1}');
		expect(await readBodyCapped(req('x'.repeat(MAX_BODY_BYTES)))).toHaveLength(MAX_BODY_BYTES);
	});

	it('null si se pasa del tope (también sin content-length)', async () => {
		expect(await readBodyCapped(req('x'.repeat(MAX_BODY_BYTES + 1)))).toBeNull();
		const stream = new ReadableStream({
			start(controller) {
				for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(1024));
				controller.close();
			}
		});
		const streamed = new Request('https://kinkyvibe.ar/api/fondo/mi-link', {
			method: 'POST',
			body: stream,
			// @ts-expect-error: Node necesita `duplex` para un body en stream
			duplex: 'half'
		});
		expect(await readBodyCapped(streamed)).toBeNull();
	});

	it('null si el content-length declarado ya se pasa', async () => {
		expect(await readBodyCapped(req('{}', { 'content-length': '999999' }))).toBeNull();
	});

	it('null si no es UTF-8 válido', async () => {
		expect(await readBodyCapped(req(new Uint8Array([0x7b, 0xff, 0x7d])))).toBeNull();
	});
});

describe('handleMiLink', () => {
	/** Base falsa para el tope: siempre el primer pedido de la hora. */
	const db = /** @type {any} */ ({
		prepare: () => ({ bind: () => ({}) }),
		batch: async () => [{}, { results: [{ hits: 1 }] }]
	});
	const request = () =>
		new Request('https://kinkyvibe.ar/api/fondo/mi-link', {
			method: 'POST',
			headers: { 'x-fondo-secret': SECRET, 'content-type': 'application/json' },
			body: JSON.stringify({ to: TO, links: [{ tier: 'Casual', url: URL_OK }] })
		});

	it('502 si deliver() da «failed» (sin RESEND_API_KEY en producción)', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const send = vi.fn(async () => /** @type {const} */ ('failed'));
		const res = await handleMiLink({ request: request(), secret: SECRET, db, send });
		expect(res.status).toBe(502);
		expect(send).toHaveBeenCalledOnce();
		vi.restoreAllMocks();
	});

	it('502 si el envío tira un error', async () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const send = async () => {
			throw new Error(`Resend → 422: ${TO}`);
		};
		const res = await handleMiLink({ request: request(), secret: SECRET, db, send });
		expect(res.status).toBe(502);
		vi.restoreAllMocks();
	});

	it('204 si deliver() lo simula o lo desvía (preview)', async () => {
		const send = async () => /** @type {const} */ ('simulated');
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const res = await handleMiLink({ request: request(), secret: SECRET, db, send });
		expect(res.status).toBe(204);
		vi.restoreAllMocks();
	});

	it('503 si no se puede leer el tope', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => ({ bind: () => ({}) }),
			batch: async () => {
				throw new Error('D1 caída');
			}
		});
		const send = vi.fn(async () => /** @type {const} */ ('sent'));
		const res = await handleMiLink({ request: request(), secret: SECRET, db: broken, send });
		expect(res.status).toBe(503);
		expect(send).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});
});
