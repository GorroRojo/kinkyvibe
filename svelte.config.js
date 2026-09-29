import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import adapter from '@sveltejs/adapter-cloudflare';
import sveltePreprocess from 'svelte-preprocess';
import { mdsvex } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import autoprefixer from 'autoprefixer';
import toc from '@jsdevtools/rehype-toc';
import customRehype from './src/lib/utils/customRehype.js';
/** @type {import('@sveltejs/kit').Config}*/
const config = {
	kit: {
		alias: {
			$lib: '/src/lib/'
		},
		adapter: adapter({
			// En `vite dev`/`vite preview` simula los bindings de wrangler.toml (D1 incluido) con
			// miniflare, guardando los datos en .wrangler/state. Nunca se conecta a Cloudflare.
			platformProxy: {
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
			// remarkPlugins: [remarkGfm],
			rehypePlugins: [rehypeSlug, customRehype, toc]
		}),
		preprocessMeltUI()
	])
};
export default config;
