/**
 * Pie de página: "Tu cuenta" (Ingresar / Mi rincón) solo con el interruptor `cuentas`, "Dejá una
 * propina" o Cafecito según `propinas`, y "Entrar al panel" para el equipo.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Footer from './Footer.svelte';

/** @param {Record<string, unknown>} [data] */
const html = (data) => render(Footer, { props: { data } }).body;

describe('Footer', () => {
	it('con todo apagado: sin "Tu cuenta", con Cafecito y el link al panel', () => {
		const body = html({ cuentas: false, member: false, propinas: false });
		expect(body).not.toContain('Tu cuenta');
		expect(body).not.toContain('href="/ingresar"');
		expect(body).not.toContain('href="/mi-rincon"');
		expect(body).toContain('https://cafecito.app/kinkyvibe');
		expect(body).toContain('CafecitoApp');
		expect(body).not.toContain('href="/propinas"');
		expect(body).toMatch(/<a href="\/login"[^>]*>Entrar al panel<\/a>/);
		// Lo que había antes ya no está.
		expect(body).not.toContain('Iniciar sesión');
		expect(body).not.toContain('Panel de admin');
		expect(body).not.toContain('href="/admin"');
	});

	it('sin datos (por las dudas) se ve como con todo apagado', () => {
		const body = render(Footer).body;
		expect(body).not.toContain('Tu cuenta');
		expect(body).toContain('CafecitoApp');
		expect(body).toContain('Entrar al panel');
	});

	it('cuentas prendido sin sesión: "Tu cuenta" con Entrar', () => {
		const body = html({ cuentas: true, member: false });
		expect(body).toContain('Tu cuenta');
		expect(body).toMatch(/href="\/ingresar"[^>]*>(?:(?!<\/a>)[\s\S])*Entrar\s*<\/a>/);
		expect(body).not.toContain('href="/mi-rincon"');
	});

	it('cuentas prendido con sesión: "Tu cuenta" con Mi rincón', () => {
		const body = html({ cuentas: true, member: true });
		expect(body).toContain('Tu cuenta');
		expect(body).toMatch(/href="\/mi-rincon"[^>]*>[\s\S]*?Mi rincón/);
		expect(body).not.toContain('href="/ingresar"');
	});

	it('propinas prendido: "Dejá una propina" en lugar de Cafecito', () => {
		const body = html({ propinas: true });
		expect(body).toMatch(/href="https:\/\/fondo\.kinkyvibe\.ar"[^>]*>[\s\S]*?Dejá una propina/);
		expect(body).not.toContain('href="/propinas"');
		expect(body).not.toContain('cafecito.app');
		expect(body).not.toContain('CafecitoApp');
	});

	it('el aviso de construcción, bien escrito', () => {
		expect(html()).toContain('Este sitio está en constante construcción.');
	});
});
