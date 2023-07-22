import adapter from '@sveltejs/adapter-cloudflare';
import sveltePreprocess from 'svelte-preprocess';
import { mdsvex } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import autoprefixer from 'autoprefixer';
import remarkGfm from 'remark-gfm';
import toc from '@jsdevtools/rehype-toc';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		alias: { $lib: '/src/lib/' },
		adapter: adapter()
	},
	extensions: ['.svelte', '.md', '.svx'],
	preprocess: [
		sveltePreprocess({
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
			remarkPlugins: [remarkGfm],
			rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings, toc],
			layout: './src/lib/mdsvex/layout.svelte'
		})
	]
};

export default config;
