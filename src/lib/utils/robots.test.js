/**
 * static/robots.txt: solo reglas para rutas que existen y la línea del sitemap. Las reglas para
 * bots de IA no van acá: gorrite las maneja en Cloudflare.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const robots = readFileSync(new URL('../../../static/robots.txt', import.meta.url), 'utf8');
const lines = robots.split('\n').filter((l) => l.trim() && !l.startsWith('#'));

describe('robots.txt', () => {
	it('un solo grupo para todos, con el sitemap', () => {
		expect(lines[0]).toBe('User-agent: *');
		expect(lines.filter((l) => l.startsWith('User-agent:'))).toHaveLength(1);
		expect(lines).toContain('Sitemap: https://kinkyvibe.ar/sitemap.xml');
	});

	it('sin reglas para rutas que ya no existen', () => {
		for (const gone of ['/_template', '/_tags', '/_glossary']) {
			expect(robots).not.toContain(gone);
		}
		expect(lines).toContain('Disallow: /auch');
	});

	it('cada línea es un campo conocido', () => {
		for (const l of lines) expect(l).toMatch(/^(User-agent|Disallow|Allow|Sitemap): \S/);
	});

	it('termina con salto de línea', () => {
		expect(robots.endsWith('\n')).toBe(true);
	});
});
