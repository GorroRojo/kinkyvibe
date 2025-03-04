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
		adapter: adapter()
	},
	extensions: ['.svelte', '.md', '.svx'],
	preprocess: sequence([
		sveltePreprocess({
			scss: {
				api: 'modern-compiler'
			},
			sass: {
				api: 'modern-compiler'
			},
			postcss: {
				api:'modern-compiler',
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
