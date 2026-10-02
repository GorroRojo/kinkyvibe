import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { deployBranchFromEnv } from './src/lib/server/deployBranch.js';
import { lucideDeepImports } from './scripts/vite/lucide-deep-imports.js';

export default defineConfig({
	// En vitest, los íconos se importan de a uno (ver scripts/vite/lucide-deep-imports.js).
	plugins: [sveltekit(), process.env.VITEST ? lucideDeepImports() : null],
	// Rama del deploy (Workers Builds o Cloudflare Pages; '' en local): ver
	// src/lib/server/deployBranch.js y src/lib/server/deploy.js.
	define: {
		__DEPLOY_BRANCH__: JSON.stringify(deployBranchFromEnv(process.env))
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
