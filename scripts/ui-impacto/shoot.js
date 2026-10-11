// Saca las capturas de un lado del informe de impacto visual (docs/ui-impacto.md) contra un
// servidor ya levantado. Cada captura usa un contexto de navegador nuevo (nada queda de una
// página a otra) con el cartel de edad aceptado, tema claro, sin animaciones, el reloj del
// navegador en el «hoy» simulado y sin pedidos a otros sitios (avatares, analíticas...).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { VIEWPORTS } from './pages.js';

/** Alto máximo de una captura de página completa (las listas muy largas se cortan acá). */
export const MAX_HEIGHT = 8000;

/**
 * Lo que cambia solo (no por el diseño) y se tapa con un recuadro: horas relativas, contadores
 * en vivo... Un componente puede marcarse a mano con `data-ui-impacto-mascara`.
 */
export const MASK_SELECTORS = ['[data-ui-impacto-mascara]'];

const FREEZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}
::-webkit-scrollbar{display:none}`;

/** @param {string} baseURL */
function isLocal(baseURL) {
	const host = new URL(baseURL).host;
	return (/** @type {string} */ url) => {
		try {
			const u = new URL(url);
			return u.host === host || u.protocol === 'data:' || u.protocol === 'blob:';
		} catch {
			return true;
		}
	};
}

/** Navegador para las capturas (PW_CHROMIUM_PATH / PW_CHROMIUM como en las pruebas E2E). */
export function launch() {
	const executablePath = process.env.PW_CHROMIUM_PATH || process.env.PW_CHROMIUM || undefined;
	return chromium.launch(executablePath ? { executablePath } : {});
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {{ baseURL: string, viewport: { width: number, height: number }, now: number, memberToken?: string | null }} o
 */
async function newContext(browser, { baseURL, viewport, now, memberToken }) {
	const context = await browser.newContext({
		baseURL,
		viewport,
		deviceScaleFactor: 1,
		colorScheme: 'light',
		reducedMotion: 'reduce',
		locale: 'es-AR',
		timezoneId: 'America/Argentina/Buenos_Aires'
	});
	await context.addInitScript(() => {
		try {
			localStorage.setItem('mayorDeEdad', 'true');
			localStorage.setItem('kv-panel-theme', 'light');
		} catch {
			// sin storage: el cartel de edad aparecería en las dos capturas por igual
		}
	});
	const local = isLocal(baseURL);
	await context.route('**/*', (route) =>
		local(route.request().url()) ? route.continue() : route.abort('blockedbyclient')
	);
	if (memberToken) {
		await context.addCookies([{ name: 'kvRincon', value: memberToken, url: baseURL }]);
	}
	const page = await context.newPage();
	await page.clock.install({ time: now });
	return { context, page };
}

/**
 * Espera a que la página quede quieta: red, fuentes e imágenes (las diferidas se cargan antes).
 * @param {import('@playwright/test').Page} page
 */
async function settle(page) {
	await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
	await page.addStyleTag({ content: FREEZE_CSS });
	// Recorre la página hasta abajo (lo que se carga al aparecer en pantalla) y vuelve arriba.
	await page.evaluate(async () => {
		for (const img of document.querySelectorAll('img[loading="lazy"]')) {
			/** @type {HTMLImageElement} */ (img).loading = 'eager';
		}
		const step = Math.max(window.innerHeight, 400);
		for (let y = 0; y < Math.min(document.documentElement.scrollHeight, 8000); y += step) {
			window.scrollTo(0, y);
			await new Promise((r) => requestAnimationFrame(() => r(null)));
		}
		window.scrollTo(0, 0);
	});
	await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
	// Espera a que quede quieta: fuentes, imágenes cargadas y decodificadas, y el mismo alto y la
	// misma cantidad de imágenes en dos miradas seguidas (hasta ~10 s).
	await page.evaluate(async () => {
		await document.fonts.ready;
		const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
		let last = '';
		for (let i = 0; i < 20; i++) {
			const imgs = [...document.images];
			await Promise.all(
				imgs.map((img) =>
					img.complete
						? img.decode().catch(() => null)
						: new Promise((r) => {
								img.addEventListener('load', r, { once: true });
								img.addEventListener('error', r, { once: true });
								setTimeout(r, 5000);
							})
				)
			);
			await frame();
			await frame();
			const state = `${document.documentElement.scrollHeight}|${imgs.length}|${imgs.filter((i) => !i.complete).length}`;
			if (state === last && state.endsWith('|0')) return;
			last = state;
			await new Promise((r) => setTimeout(r, 250));
		}
	});
}

/**
 * Visita cada dirección una vez sin capturar: `vite dev` compila cada página la primera vez y a
 * veces recarga al optimizar dependencias, y eso no tiene que caer en una captura.
 * @param {import('@playwright/test').Browser} browser
 * @param {{ baseURL: string, paths: string[], now: number, log?: (s: string) => void }} o
 */
export async function warmUp(browser, { baseURL, paths, now, log = () => {} }) {
	const { context, page } = await newContext(browser, {
		baseURL,
		viewport: VIEWPORTS[0],
		now
	});
	try {
		for (const p of paths) {
			const t = Date.now();
			await page
				.goto(p, { waitUntil: 'networkidle', timeout: 180_000 })
				.catch((e) => log(`  ${p}: ${e.message}`));
			log(`  calentando ${p} (${Date.now() - t} ms)`);
		}
	} finally {
		await context.close();
	}
}

/**
 * @typedef {{ pageId: string, viewport: string, path: string | null, file: string | null, error: string | null, size: [number, number] | null }} RawShot
 */

/**
 * Saca todas las capturas de un lado.
 * @param {import('@playwright/test').Browser} browser
 * @param {{
 *   baseURL: string,
 *   outDir: string,
 *   ctx: Record<string, any>,
 *   pages: import('./pages.js').UiPage[],
 *   now: () => number,
 *   ensureServer?: () => Promise<boolean>,
 *   log?: (s: string) => void
 * }} o `ensureServer` levanta el servidor si se cayó (devuelve true si tuvo que hacerlo): entonces
 *   la captura que falló se repite una vez
 * @returns {Promise<RawShot[]>}
 */
export async function shootAll(
	browser,
	{ baseURL, outDir, ctx, pages, now, ensureServer = async () => false, log = () => {} }
) {
	mkdirSync(outDir, { recursive: true });
	/** @type {RawShot[]} */
	const shots = [];
	for (const def of pages) {
		const url = def.path(ctx);
		for (const vp of VIEWPORTS) {
			/** @type {RawShot} */
			const shot = {
				pageId: def.id,
				viewport: vp.id,
				path: url,
				file: null,
				error: null,
				size: null
			};
			shots.push(shot);
			if (!url) {
				shot.error = 'esta versión no tiene los datos para esta página';
				continue;
			}
			for (let attempt = 0; attempt < 2; attempt++) {
				await ensureServer();
				shot.error = null;
				await shootOne(browser, { baseURL, outDir, ctx, def, vp, url, shot, now });
				if (!shot.error || !(await ensureServer())) break;
			}
			log(shot.file ? `  ✓ ${def.id} · ${vp.id}` : `  ✗ ${def.id} · ${vp.id}: ${shot.error}`);
		}
	}
	return shots;
}

/**
 * Una captura; deja el archivo o el error en `shot`.
 * @param {import('@playwright/test').Browser} browser
 * @param {{
 *   baseURL: string,
 *   outDir: string,
 *   ctx: Record<string, any>,
 *   def: import('./pages.js').UiPage,
 *   vp: { id: string, width: number, height: number },
 *   url: string,
 *   shot: RawShot,
 *   now: () => number
 * }} o
 */
async function shootOne(browser, { baseURL, outDir, ctx, def, vp, url, shot, now }) {
	const { context, page } = await newContext(browser, {
		baseURL,
		viewport: { width: vp.width, height: vp.height },
		now: now(),
		memberToken: def.member ? ctx.memberToken : null
	});
	try {
		const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
		if (res && res.status() >= 400) throw new Error(`HTTP ${res.status()} en ${url}`);
		await settle(page);
		if (def.prepare) {
			await def.prepare(page, ctx);
			await settle(page);
		}
		const height = await page.evaluate(() =>
			Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)
		);
		const file = path.join(outDir, `${def.id}-${vp.id}.png`);
		const clipHeight = Math.min(Math.max(height, vp.height), MAX_HEIGHT);
		await page.screenshot({
			path: file,
			fullPage: true,
			clip: { x: 0, y: 0, width: vp.width, height: clipHeight },
			animations: 'disabled',
			caret: 'hide',
			scale: 'css',
			mask: MASK_SELECTORS.map((s) => page.locator(s)),
			maskColor: '#c8c8c8'
		});
		shot.path = new URL(page.url()).pathname;
		shot.file = file;
		shot.size = [vp.width, clipHeight];
	} catch (e) {
		shot.error = String(/** @type {Error} */ (e)?.message ?? e)
			.split('\n')[0]
			.slice(0, 300);
	} finally {
		await context.close();
	}
}
