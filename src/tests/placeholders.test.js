// Guard for the shared placeholder look (style.scss + the panel's light/dark tokens): a placeholder
// has to read as "empty field", never as a value, and never in the brand pink/violet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (/** @type {string} */ rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const STYLE = 'lib/styles/style.scss';
const PANEL = 'lib/admin/panel.scss';

/** @param {string} css @param {string} name the body of the first `@mixin name { … }` (one level) */
function mixinBody(css, name) {
	const start = css.indexOf(`@mixin ${name} {`);
	expect(start, `@mixin ${name} en panel.scss`).toBeGreaterThan(-1);
	let depth = 0;
	for (let i = css.indexOf('{', start); i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}' && --depth === 0) return css.slice(start, i);
	}
	throw new Error(`@mixin ${name} sin cerrar`);
}

/** @param {string} block */
const placeholderToken = (block) => block.match(/--placeholder:\s*(#[0-9a-f]{3,6})\s*;/i)?.[1];

/** @param {string} hex */
function luminance(hex) {
	let h = hex.slice(1);
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** @param {string} a @param {string} b */
function contrast(a, b) {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
}
/** @param {string} hex a neutral grey: same red, green and blue */
function isGrey(hex) {
	let h = hex.slice(1);
	if (h.length === 3) h = [...h].map((c) => c + c).join('');
	return h.slice(0, 2) === h.slice(2, 4) && h.slice(2, 4) === h.slice(4, 6);
}

/** @param {string} dir @returns {string[]} */
function styleSources(dir) {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return e.name === 'posts' ? [] : styleSources(p);
		return /\.(svelte|scss|css)$/.test(e.name) ? [p] : [];
	});
}

describe('placeholders legibles', () => {
	const style = read(STYLE);
	const panel = read(PANEL);

	it('el sitio define --placeholder: gris neutro, legible y más claro que el texto', () => {
		const root = style.slice(
			style.indexOf(':root {'),
			style.indexOf('}', style.indexOf(':root {'))
		);
		const ph = placeholderToken(root);
		expect(ph, '--placeholder en el :root de style.scss').toBeDefined();
		if (!ph) return;
		expect(isGrey(ph)).toBe(true);
		const ink = root.match(/--ink:\s*(#[0-9a-f]{3,6})/i)?.[1] ?? '#333';
		const surface = '#ffffff';
		expect(contrast(ph, surface)).toBeGreaterThanOrEqual(3);
		expect(contrast(ph, surface)).toBeLessThan(contrast(ink, surface) - 3);
	});

	it('el panel define --placeholder en los temas claro y oscuro', () => {
		const light = placeholderToken(mixinBody(panel, 'light'));
		const dark = placeholderToken(mixinBody(panel, 'dark'));
		expect(light, '--placeholder en @mixin light').toBeDefined();
		expect(dark, '--placeholder en @mixin dark').toBeDefined();
		if (!light || !dark) return;
		expect(isGrey(light) && isGrey(dark)).toBe(true);
		expect(contrast(light, '#ffffff')).toBeGreaterThanOrEqual(3);
		expect(contrast(light, '#ffffff')).toBeLessThan(contrast('#333333', '#ffffff') - 3);
		// base of the dark surfaces in panel.scss; --text is #eee there
		expect(contrast(dark, '#1a181d')).toBeGreaterThanOrEqual(3);
		expect(contrast(dark, '#1a181d')).toBeLessThan(contrast('#eeeeee', '#1a181d') - 3);
	});

	it('hay una sola regla global, de especificidad baja, que usa el token', () => {
		const rule = style.match(/:where\(input, textarea\)::placeholder\s*\{([^}]*)\}/);
		expect(rule, 'regla :where(input, textarea)::placeholder en style.scss').not.toBeNull();
		const body = rule?.[1] ?? '';
		expect(body).toMatch(/color:\s*var\(--placeholder\)/);
		expect(body).toMatch(/opacity:\s*1\b/);
	});

	it('ningún componente pisa el color del placeholder (y menos con rosa o violeta)', () => {
		const offenders = [];
		for (const file of styleSources(SRC)) {
			const rel = path.relative(SRC, file);
			const css = fs.readFileSync(file, 'utf8');
			for (const m of css.matchAll(/::placeholder\s*\{([^}]*)\}/g)) {
				if (rel === STYLE && /:where\(input, textarea\)$/.test(css.slice(0, m.index))) continue;
				const color = m[1].match(/(?:^|[;\s])color:\s*([^;]+)/)?.[1]?.trim();
				if (color && color !== 'var(--placeholder)') offenders.push(`${rel}: color: ${color}`);
			}
			// pink/violet tokens or hues on any placeholder declaration, even outside a block
			for (const m of css.matchAll(/placeholder[^{]*\{[^}]*?color:\s*([^;]+)/g))
				if (/var\(--(?:1|2|accent|link|info|bad)\b|hsl\(\s*(?:319|262)\b/.test(m[1]))
					offenders.push(`${rel}: color: ${m[1].trim()}`);
		}
		expect([...new Set(offenders)]).toEqual([]);
	});
});
