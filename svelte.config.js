import adapter from '@sveltejs/adapter-cloudflare';
import sveltePreprocess from 'svelte-preprocess';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		alias: { $lib: '/src/lib/' },
		adapter: adapter()
	},
	extensions: ['.svelte', '.md'],
	preprocess: [sveltePreprocess(), mdsvex({ extensions: ['.md'] })]
};

export default config;
