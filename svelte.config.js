import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import adapter from '@sveltejs/adapter-cloudflare';
import sveltePreprocess from 'svelte-preprocess';
import autoprefixer from 'autoprefixer';
import { createHash } from 'node:crypto';
import { THEME_SCRIPT_BODY } from './src/lib/admin/theme.js';
import { SIDEBAR_SCRIPT_BODY } from './src/lib/admin/sidebarMode.js';

/** `'sha256-…'` de un script en línea de contenido fijo, para la CSP. @param {string} body */
const scriptHash = (body) => `sha256-${createHash('sha256').update(body).digest('base64')}`;

/**
 * Content-Security-Policy en modo **solo reporte** (docs/workers-migracion.md, «Headers de
 * seguridad y CSP»): el navegador no bloquea nada, solo avisa a `/api/csp` lo que bloquearía.
 * SvelteKit pone un nonce a sus propios scripts; los dos del <head> del panel van por hash
 * (su contenido es fijo); el beacon de Web Analytics y el script de Telegram, por dominio.
 * `style-src` necesita 'unsafe-inline' (Svelte y el HTML libre usan estilos en línea); `img-src`,
 * `media-src` y `frame-src` aceptan cualquier https: por las imágenes y los embeds del HTML libre.
 * Para aplicarla de verdad: mismas directivas en `directives` en vez de `reportOnly`.
 * @type {import('@sveltejs/kit').CspDirectives}
 */
const CSP_DIRECTIVES = {
	'default-src': ['self'],
	'script-src': [
		'self',
		'https://static.cloudflareinsights.com',
		'https://telegram.org',
		/** @type {any} */ (scriptHash(THEME_SCRIPT_BODY)),
		/** @type {any} */ (scriptHash(SIDEBAR_SCRIPT_BODY))
	],
	'style-src': ['self', 'unsafe-inline'],
	'img-src': ['self', 'data:', 'blob:', 'https:'],
	'font-src': ['self', 'data:'],
	'connect-src': ['self', 'https://cloudflareinsights.com'],
	'media-src': ['self', 'blob:', 'https:'],
	'frame-src': ['self', 'https:'],
	'worker-src': ['self', 'blob:'],
	'object-src': ['none'],
	'base-uri': ['self'],
	'report-uri': ['/api/csp']
};

/**
 * adapter-cloudflare con `emulate()` a prueba de requests concurrentes.
 *
 * El adapter hace `emulated ??= await get_emulated()` en cada `platform()`
 * (https://github.com/sveltejs/kit/blob/%40sveltejs/adapter-cloudflare%407.2.9/packages/adapter-cloudflare/index.js#L209-L210):
 * si las dos primeras requests dinámicas a `vite preview` llegan juntas (Playwright usa 2
 * workers), ambas ven `emulated` vacío y arrancan dos miniflare sobre el mismo .wrangler/state.
 * Uno falla con "database is locked: SQLITE_BUSY" y tira abajo `vite preview`. Acá la primera
 * llamada se comparte entre todas las concurrentes; las siguientes usan el valor ya cacheado.
 * @param {Parameters<typeof adapter>[0]} opts
 */
const cfAdapter = (opts) => {
	const a = adapter(opts);
	const emulate = a.emulate;
	if (!emulate) return a;
	a.emulate = async () => {
		const e = await emulate();
		/** @type {Promise<unknown> | undefined} */
		let first;
		return {
			...e,
			platform: async (o) => {
				await (first ??= e.platform(o));
				return e.platform(o);
			}
		};
	};
	return a;
};

/** @type {import('@sveltejs/kit').Config}*/
const config = {
	kit: {
		alias: {
			$lib: '/src/lib/'
		},
		csp: {
			mode: 'nonce',
			reportOnly: CSP_DIRECTIVES
		},
		adapter: cfAdapter({
			// Dónde escribir el Worker de SvelteKit al compilar para Workers (no es wrangler.toml
			// porque su `main` es worker/index.js, que lo envuelve para sumar los crons).
			config: 'wrangler.adapter.toml',
			// En `vite dev`/`vite preview` simula los bindings de wrangler.toml (D1 incluido) con
			// miniflare, guardando los datos en .wrangler/state. Nunca se conecta a Cloudflare.
			platformProxy: {
				configPath: 'wrangler.toml',
				persist: true,
				remoteBindings: false
			}
		})
	},
	// Solo componentes .svelte: los .md de las publicaciones ya no existen (decisión 0032). El texto de
	// una publicación lo arma src/lib/server/contenido/freeHtml.js (con rehype-slug, rehype-toc y
	// customRehype, como lo hacía mdsvex).
	extensions: ['.svelte'],
	preprocess: sequence([
		sveltePreprocess({
			// Svelte 5 strips TypeScript natively. Letting svelte-preprocess transpile TS without
			// `verbatimModuleSyntax` drops imports that are only used in the markup (this broke
			// the @lucide/svelte icons, which are written in TS).
			typescript: false,
			postcss: {
				plugins: [autoprefixer]
			}
		}),
		preprocessMeltUI()
	])
};
export default config;
