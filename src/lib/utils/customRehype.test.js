// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
import { describe, it, expect } from 'vitest';
import { rehype } from 'rehype';
import { compile } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import customRehype from './customRehype';

/** HTML -> rehype, same plugin order as svelte.config.js (rehypeSlug before customRehype). */
const run = async (/** @type {string} */ html) =>
	String(
		await rehype().data('settings', { fragment: true }).use(rehypeSlug).use(customRehype).process(html)
	);

/**
 * Markdown -> mdsvex, like the real posts. Wikilinks depend on how the markdown parser splits
 * `[[x]]` into text nodes, so they must be tested through the markdown pipeline.
 */
const md = async (/** @type {string} */ source) =>
	(await compile(source, { rehypePlugins: [rehypeSlug, customRehype] }))?.code.trim();

describe('customRehype', () => {
	it('agrega el link "linktothis" y "backtotop" a los títulos con id', async () => {
		const out = await run('<h2>Siglas y más</h2>');
		expect(out).toMatch(/^<h2 id="siglas-y-más"><a href="#siglas-y-más" class="linktothis"[^>]*><svg/);
		expect(out).toContain('class="lucide lucide-link"');
		expect(out).toMatch(/<a href="#title" class="backtotop"[^>]*><svg[^>]*lucide-corner-right-up/);
		expect(out).toContain('Siglas y más');
	});

	it('no toca elementos que no son títulos', async () => {
		expect(await run('<p id="x">hola</p>')).toBe('<p id="x">hola</p>');
	});

	it('convierte [[término]] en un wikilink', async () => {
		const out = await md('ver [[bondage]] acá');
		expect(out).toBe('<p>ver <a class="wikilink" href="/wiki/bondage">bondage</a> acá</p>');
	});

	it('normaliza el href del wikilink (espacios → guiones, minúsculas)', async () => {
		const out = await md('[[Cuidados Posteriores]]');
		expect(out).toBe(
			'<p><a class="wikilink" href="/wiki/cuidados-posteriores">Cuidados Posteriores</a></p>'
		);
	});

	it('soporta [[término : texto visible]]', async () => {
		const out = await md('el [[caída : drop]] existe');
		expect(out).toBe('<p>el <a class="wikilink" href="/wiki/caída">drop</a> existe</p>');
	});

	it('varios wikilinks en el mismo párrafo', async () => {
		const out = await md('[[a]] y [[b]]');
		expect(out).toBe(
			'<p><a class="wikilink" href="/wiki/a">a</a> y <a class="wikilink" href="/wiki/b">b</a></p>'
		);
	});

	it('deja intactos los corchetes simples', async () => {
		expect(await md('una [nota] suelta')).toBe('<p>una [nota] suelta</p>');
	});

	it('convierte @usuarie en una mención a su perfil', async () => {
		expect(await md('por @DemonWeb hoy')).toBe(
			'<p>por <a class="mention" href="/amigues/DemonWeb">@DemonWeb</a> hoy</p>'
		);
	});

	it('no convierte direcciones de email en menciones', async () => {
		expect(await run('<p>escribinos a kinkyvibe@gmail.com</p>')).toBe(
			'<p>escribinos a kinkyvibe@gmail.com</p>'
		);
		expect(await md('kinkyvibe@gmail.com')).not.toContain('mention');
	});

	it('múltiples wikilinks mezclados con texto visible', async () => {
		expect(await md('x [[a]] y [[b]] z [[c : C]]')).toBe(
			'<p>x <a class="wikilink" href="/wiki/a">a</a> y <a class="wikilink" href="/wiki/b">b</a> z <a class="wikilink" href="/wiki/c">C</a></p>'
		);
	});

	it('\\@usuarie escapa la mención', async () => {
		expect(await md('\\@nadie')).toBe('<p>@nadie</p>');
	});
});
