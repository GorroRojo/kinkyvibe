/**
 * Ninguna página con `Referrer-Policy: no-referrer` puede tener un formulario POST común (sin
 * `use:enhance`). Con no-referrer, el navegador manda el POST de un formulario común (una
 * navegación) con `Origin: null` (Fetch, «append a request Origin header») y SvelteKit lo
 * rechaza: «Cross-site POST form submissions are forbidden» (gorrite, 12/10: «Confirmar» del mail
 * de la lista de espera). Un `fetch` (`use:enhance`) manda el Origin de verdad, así que esos
 * andan. Las páginas con un token en la dirección usan `same-origin`: afuera no se manda nada.
 *
 * Lee el código (no levanta el sitio): por cada página, la política que ponen su `+page.server.js`,
 * los `+layout.server.js` de arriba (y lo que importan) o un `<meta name="referrer">`, y los
 * formularios de la página, de sus layouts y de los componentes que importan. En dev SvelteKit no
 * controla el Origin, por eso las pruebas de punta a punta (que corren con `vite dev`) no lo ven.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/routes');
const LIB = path.resolve('src/lib');

/**
 * Formularios que no cuentan: solo existen en dev, donde SvelteKit no controla el Origin.
 * `MockCheckout.svelte`: el checkout simulado de Mercado Pago (`isMpMock`, solo dev).
 */
const DEV_ONLY = new Set([path.join(LIB, 'components/MockCheckout.svelte')]);

const NO_REFERRER = [
	/referrer-policy['"]?\s*:\s*['"]no-referrer['"]/i,
	/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i
];

/** @param {string} file */
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

/**
 * Los archivos que importa `file` (relativos o `$lib/…`) que existen.
 * @param {string} file
 */
function imports(file) {
	const out = [];
	for (const m of read(file).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
		const spec = m[1];
		const base = spec.startsWith('$lib/')
			? path.join(LIB, spec.slice(5))
			: spec.startsWith('.')
				? path.resolve(path.dirname(file), spec)
				: null;
		if (!base) continue;
		const found = [base, `${base}.js`, path.join(base, 'index.js')].find(
			(f) => fs.existsSync(f) && fs.statSync(f).isFile()
		);
		if (found) out.push(found);
	}
	return out;
}

/**
 * `files` y lo que importan, hasta `depth` saltos.
 * @param {string[]} files
 * @param {number} depth
 */
function withImports(files, depth) {
	const seen = new Set(files.filter((f) => fs.existsSync(f)));
	let frontier = [...seen];
	for (let i = 0; i < depth; i++) {
		const next = [];
		for (const f of frontier)
			for (const g of imports(f))
				if (!seen.has(g)) {
					seen.add(g);
					next.push(g);
				}
		frontier = next;
	}
	return [...seen];
}

/**
 * Los formularios POST sin `use:enhance` (ni `on:submit`, que los manda con fetch) de un .svelte.
 * @param {string} file
 */
function plainPostForms(file) {
	if (!file.endsWith('.svelte') || DEV_ONLY.has(file)) return [];
	return [...read(file).matchAll(/<form\b[^>]*>/gs)]
		.map((m) => m[0])
		.filter((tag) => /method\s*=\s*["']?post/i.test(tag) && !/use:enhance|on:submit/.test(tag));
}

/** Las carpetas con `+page.svelte`. @param {string} dir @returns {string[]} */
function pageDirs(dir) {
	const out = fs.existsSync(path.join(dir, '+page.svelte')) ? [dir] : [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true }))
		if (e.isDirectory()) out.push(...pageDirs(path.join(dir, e.name)));
	return out;
}

/** De `src/routes` a `dir`, inclusive. @param {string} dir */
function chain(dir) {
	const dirs = [];
	for (let d = dir; d.startsWith(ROOT); d = path.dirname(d)) dirs.unshift(d);
	return dirs;
}

/** Las páginas con no-referrer y un formulario POST común. */
function offenders() {
	const out = [];
	for (const dir of pageDirs(ROOT)) {
		const dirs = chain(dir);
		const pages = [
			path.join(dir, '+page.svelte'),
			...dirs.map((d) => path.join(d, '+layout.svelte'))
		];
		// El encabezado: los `load` y lo que importan (como `PRIVATE_HEADERS`); el `<meta>`: los
		// .svelte mismos (lo que importa un .svelte no pone encabezados de la página).
		const policy = [
			...withImports(
				[path.join(dir, '+page.server.js'), ...dirs.map((d) => path.join(d, '+layout.server.js'))],
				1
			),
			...pages
		];
		if (!policy.some((f) => NO_REFERRER.some((re) => re.test(read(f))))) continue;
		const views = withImports(pages, 2);
		const forms = views.flatMap((f) =>
			plainPostForms(f).map((tag) => `${path.relative(ROOT, f)}: ${tag.replace(/\s+/g, ' ')}`)
		);
		if (forms.length) out.push({ page: path.relative(ROOT, dir), forms });
	}
	return out;
}

describe('no-referrer y formularios POST comunes', () => {
	it('ninguna página con no-referrer tiene un formulario POST sin use:enhance', () => {
		expect(offenders()).toEqual([]);
	});

	it('las páginas de los links de los mails van con same-origin', () => {
		for (const file of [
			'(content)/avisos/confirmar/[token]/+page.server.js',
			'(content)/avisos/baja/[token]/+page.server.js',
			'(content)/avisos/sigo/[token]/+page.server.js',
			'(content)/lista-de-espera/shared.server.js'
		])
			expect(read(path.join(ROOT, file)), file).toMatch(/'referrer-policy':\s*'same-origin'/);
	});
});
