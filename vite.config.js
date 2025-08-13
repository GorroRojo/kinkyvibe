import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	assetsInclude: ['**/*.odt'],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	optimizeDeps: {
		exclude: ['codemirror', '@codemirror/lang-markdown']
	},
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern-compiler', // or "modern",
				silenceDeprecations: ["legacy-js-api"]
			}
		}
	},
	
});
