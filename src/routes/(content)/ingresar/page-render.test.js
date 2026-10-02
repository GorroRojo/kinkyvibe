/**
 * /ingresar, paso del código: dice cuánto dura y, si sabemos cuándo vence, a qué hora. Desde el
 * servidor va la hora de Argentina con la aclaración (en el navegador, ExpiryTime la cambia por
 * la hora local). Mail inventado.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { expiryMoment } from '$lib/utils/expiry.js';
import Page from './+page.svelte';

const data = { next: '/mi-rincon', codeTtlMs: 10 * 60 * 1000, deleted: false };
const EMAIL = 'persona.inventada@example.com';

/** @param {Record<string, unknown>} form */
const html = (form) =>
	render(Page, { props: { data: /** @type {any} */ (data), form: /** @type {any} */ (form) } })
		.body;
/**
 * El texto visible: saca cada etiqueta (y los comentarios de hidratación de Svelte) desde un `<`
 * hasta el `>` siguiente, de una pasada; el resultado nunca tiene un `<`.
 * @param {string} html
 */
const text = (html) =>
	html
		.split('<')
		.map((part, i) => (i === 0 ? part : part.slice(part.indexOf('>') + 1 || part.length)))
		.join('')
		.replace(/\s+/g, ' ');

describe('/ingresar: cuándo vence el código', () => {
	it('recién mandado: cuánto dura y a qué hora (hora de Argentina desde el servidor)', () => {
		const expiresAt = Date.now() + 10 * 60 * 1000;
		const body = html({ step: 'code', email: EMAIL, next: '/mi-rincon', sent: true, expiresAt });
		const when = expiryMoment(expiresAt, Date.now(), {
			timeZone: 'America/Argentina/Buenos_Aires'
		});
		expect(text(body)).toContain(`Vence en 10 minutos (${when}, hora de Argentina y Uruguay).`);
		expect(body).toContain(`datetime="${new Date(expiresAt).toISOString()}"`);
		// Vuelve con el formulario por si el código se escribe mal.
		expect(body).toMatch(new RegExp(`<input[^>]*name="vence"[^>]*value="${expiresAt}"`));
	});

	it('sin saber cuándo vence: solo cuánto dura', () => {
		const body = html({ step: 'code', email: EMAIL, next: '/mi-rincon', expiresAt: null });
		expect(text(body)).toContain('Vence en 10 minutos.');
		expect(body).not.toContain('name="vence"');
		expect(body).not.toContain('hora de Argentina');
	});
});
