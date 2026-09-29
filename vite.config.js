import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	assetsInclude: ['**/*.odt'],
	build: {
		// never inline images as base64: $lib/utils maps every post image to its URL,
		// and an inlined image would bloat that shared chunk on every page
		assetsInlineLimit: 0
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	},
	optimizeDeps: {
		exclude: ["svelte-codemirror-editor", "codemirror", "@codemirror/lang-markdown"]
	}
});
