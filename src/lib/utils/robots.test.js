/**
 * static/robots.txt: las reglas para rutas que existen, la línea del sitemap y un grupo que deja
 * afuera a los bots que juntan textos para entrenar modelos de IA (decisión de gorrite, octubre
 * de 2026; docs/seo.md). Los bots de búsqueda y de respuesta siguen entrando.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const robots = readFileSync(new URL('../../../static/robots.txt', import.meta.url), 'utf8');
const lines = robots.split('\n').filter((l) => l.trim() && !l.startsWith('#'));

/** Los bots de entrenamiento que no entran. */
const TRAINING = [
	'GPTBot',
	'ClaudeBot',
	'Google-Extended',
	'Applebot-Extended',
	'CCBot',
	'Bytespider',
	'meta-externalagent',
	'cohere-training-data-crawler'
];

/** Los de búsqueda y respuesta: nunca con un grupo propio (los cubre `*`). */
const SEARCH = [
	'Googlebot',
	'Bingbot',
	'OAI-SearchBot',
	'ChatGPT-User',
	'PerplexityBot',
	'Perplexity-User',
	'Claude-SearchBot',
	'Claude-User'
];

/**
 * Los grupos de robots.txt (RFC 9309): varias líneas `User-agent` seguidas y después sus reglas.
 * @returns {Array<{ agents: string[], rules: string[] }>}
 */
function groups() {
	/** @type {Array<{ agents: string[], rules: string[] }>} */
	const out = [];
	for (const l of lines) {
		const [field, ...rest] = l.split(':');
		const value = rest.join(':').trim();
		if (field === 'Sitemap') continue;
		if (field === 'User-agent') {
			const last = out[out.length - 1];
			if (last && last.rules.length === 0) last.agents.push(value);
			else out.push({ agents: [value], rules: [] });
		} else out[out.length - 1].rules.push(l);
	}
	return out;
}

describe('robots.txt', () => {
	it('el grupo para todos sigue igual que siempre, primero, con el sitemap', () => {
		expect(groups()[0]).toEqual({ agents: ['*'], rules: ['Disallow: /auch'] });
		expect(lines).toContain('Sitemap: https://kinkyvibe.ar/sitemap.xml');
	});

	it('los bots de entrenamiento de IA no entran a nada', () => {
		const blocked = groups().filter((g) => g.rules.includes('Disallow: /'));
		const agents = blocked.flatMap((g) => g.agents);
		for (const bot of TRAINING) expect(agents).toContain(bot);
		for (const g of blocked) expect(g.rules).toEqual(['Disallow: /']);
	});

	it('los bots de búsqueda y de respuesta no tienen grupo propio (entran como todos)', () => {
		const agents = groups()
			.flatMap((g) => g.agents)
			.map((a) => a.toLowerCase());
		for (const bot of SEARCH) expect(agents).not.toContain(bot.toLowerCase());
		expect(groups().map((g) => g.agents)).toEqual([['*'], TRAINING]);
	});

	it('sin reglas para rutas que ya no existen', () => {
		for (const gone of ['/_template', '/_tags', '/_glossary']) {
			expect(robots).not.toContain(gone);
		}
	});

	it('cada línea es un campo conocido', () => {
		for (const l of lines) expect(l).toMatch(/^(User-agent|Disallow|Allow|Sitemap): \S/);
	});

	it('termina con salto de línea', () => {
		expect(robots.endsWith('\n')).toBe(true);
	});
});
