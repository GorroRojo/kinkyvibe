import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import adapter from '@sveltejs/adapter-cloudflare';
import sveltePreprocess from 'svelte-preprocess';
import { mdsvex } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import autoprefixer from 'autoprefixer';
import toc from '@jsdevtools/rehype-toc';
import customRehype from './src/lib/utils/customRehype.js';

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
		adapter: cfAdapter({
			// Dónde escribir el Worker de SvelteKit al compilar para Workers (no es wrangler.toml
			// porque su `main` es worker/index.js, que lo envuelve para sumar los crons). En
			// Cloudflare Pages (CF_PAGES) el adapter compila para Pages como siempre.
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
	extensions: ['.svelte', '.md', '.svx'],
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
		mdsvex({
			extensions: ['.md', '.svx'],
			smartypants: {
				quotes: true,
				ellipses: true,
				dashes: 'oldschool'
			},
			rehypePlugins: [rehypeSlug, customRehype, toc]
		}),
		preprocessMeltUI()
	])
};
export default config;
