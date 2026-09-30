import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// Rama del deploy de Cloudflare Pages ('' fuera de Pages); ver src/lib/server/deploy.js.
	define: {
		__DEPLOY_BRANCH__: JSON.stringify(process.env.CF_PAGES_BRANCH ?? '')
	},
	assetsInclude: ['**/*.odt'],
	build: {
		// never inline images as base64: $lib/utils maps every post image to its URL,
		// and an inlined image would bloat that shared chunk on every page
		assetsInlineLimit: 0
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.test.js']
	},
	optimizeDeps: {
		exclude: ['svelte-codemirror-editor', 'codemirror', '@codemirror/lang-markdown']
	},
	ssr: {
		optimizeDeps: {
			// Dev only. Svelte libraries are not externalized for SSR, so without this every icon
			// module of the @lucide/svelte barrel (~4000 files) is compiled one by one on the first
			// request after `vite dev` starts. Pre-bundling it once makes that request much faster.
			include: ['@lucide/svelte']
		}
	}
});
