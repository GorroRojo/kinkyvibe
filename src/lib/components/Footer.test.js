/**
 * Pie de página: "Tu cuenta" (Ingresar / Mi rincón), "Dejá una propina" y "Entrar al panel" para
 * el equipo. Los interruptores `cuentas` y `propinas` quedaron prendidos para siempre: los casos
 * «apagado» (sin "Tu cuenta", con Cafecito) se fueron con ellos.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Footer from './Footer.svelte';

/** @param {Record<string, unknown>} [data] */
const html = (data) => render(Footer, { props: { data } }).body;

describe('Footer', () => {
	it('el link al panel, y nada de lo que había antes', () => {
		const body = html({ member: false });
		expect(body).not.toContain('cafecito.app');
		expect(body).not.toContain('CafecitoApp');
		expect(body).not.toContain('href="/propinas"');
		expect(body).toMatch(/<a href="\/login"[^>]*>Entrar al panel<\/a>/);
		// Lo que había antes ya no está.
		expect(body).not.toContain('Iniciar sesión');
		expect(body).not.toContain('Panel de admin');
		expect(body).not.toContain('href="/admin"');
	});

	it('sin datos (por las dudas) se ve como sin sesión', () => {
		const body = render(Footer).body;
		expect(body).toContain('Tu cuenta');
		expect(body).toMatch(/href="\/ingresar"[^>]*>(?:(?!<\/a>)[\s\S])*Entrar\s*<\/a>/);
		expect(body).toContain('Dejá una propina');
		expect(body).toContain('Entrar al panel');
	});

	it('sin sesión: "Tu cuenta" con Entrar', () => {
		const body = html({ member: false });
		expect(body).toContain('Tu cuenta');
		expect(body).toMatch(/href="\/ingresar"[^>]*>(?:(?!<\/a>)[\s\S])*Entrar\s*<\/a>/);
		expect(body).not.toContain('href="/mi-rincon"');
	});

	it('con sesión: "Tu cuenta" con Mi rincón', () => {
		const body = html({ member: true });
		expect(body).toContain('Tu cuenta');
		expect(body).toMatch(/href="\/mi-rincon"[^>]*>[\s\S]*?Mi rincón/);
		expect(body).not.toContain('href="/ingresar"');
	});

	it('"Dejá una propina" al Fondo, sin Cafecito', () => {
		const body = html({});
		expect(body).toMatch(/href="https:\/\/fondo\.kinkyvibe\.ar"[^>]*>[\s\S]*?Dejá una propina/);
		expect(body).not.toContain('href="/propinas"');
		expect(body).not.toContain('cafecito.app');
		expect(body).not.toContain('CafecitoApp');
	});

	it('el aviso de construcción, bien escrito', () => {
		expect(html()).toContain('Este sitio está en constante construcción.');
	});
});
