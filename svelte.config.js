import adapter from '@sveltejs/adapter-cloudflare';
import sveltePreprocess from 'svelte-preprocess';
import { mdsvex } from 'mdsvex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import autoprefixer from 'autoprefixer'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		alias: { $lib: '/src/lib/' },
		adapter: adapter()
	},
	extensions: ['.svelte', '.md'],
	preprocess: [
		sveltePreprocess({
			postcss: {
				plugins: [autoprefixer]
			}
		}),
		mdsvex({ extensions: ['.md'], 
		smartypants: {
			quotes: true, ellipses: true, dashes: 'oldschool'
		},
		rehypePlugins: [rehypeSlug, rehypeAutolinkHeadings] })
	]
};

export default config;
