/**
 * Mensajes › Plantillas: el link de arriba vuelve a Mensajes (su área en el mapa del panel), no a
 * Ajustes › Mails.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';

describe('/admin/mensajes/plantillas', () => {
	it('«← Mensajes» lleva a /admin/mensajes', () => {
		const body = render(Page, {
			props: { data: /** @type {any} */ ({ dbAvailable: true, templates: [] }) }
		}).body;
		const back = body.match(/<a class="back[^"]*" href="([^"]*)">← ([^<]*)<\/a>/);
		expect(back?.[1]).toBe('/admin/mensajes');
		expect(back?.[2]).toBe('Mensajes');
		expect(body).not.toContain('href="/admin/ajustes/mails"');
	});
});
