import { readdirSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { deployBranchFromEnv } from './src/lib/server/deployBranch.js';
import { commitShaFromEnv, latestMigrationName } from './src/lib/server/buildInfo.js';
import { lucideDeepImports } from './scripts/vite/lucide-deep-imports.js';
import DurationSequencer from './scripts/vitest/sequencer.js';

export default defineConfig({
	// En vitest, los íconos se importan de a uno (ver scripts/vite/lucide-deep-imports.js).
	plugins: [sveltekit(), process.env.VITEST ? lucideDeepImports() : null],
	// Rama del deploy (Workers Builds; '' en local): ver
	// src/lib/server/deployBranch.js y src/lib/server/deploy.js.
	// La última migración de migrations/ y el commit del build (Workers Builds; '' en local), para
	// /api/health: ver src/lib/server/buildInfo.js.
	define: {
		__DEPLOY_BRANCH__: JSON.stringify(deployBranchFromEnv(process.env)),
		__LATEST_MIGRATION__: JSON.stringify(
			latestMigrationName(readdirSync(new URL('./migrations', import.meta.url)))
		),
		__BUILD_SHA__: JSON.stringify(commitShaFromEnv(process.env))
	},
	assetsInclude: ['**/*.odt'],
	build: {
		// never inline images as base64: $lib/utils maps every post image to its URL,
		// and an inlined image would bloat that shared chunk on every page
		assetsInlineLimit: 0
	},
	test: {
		// El árbol de etiquetas de respaldo, para las pruebas (src/tests/setup.js). Con `SHIFT_DAYS`,
		// también el reloj adelantado (scripts/vitest/shift-clock.js; corrida semanal).
		setupFiles: [
			'src/tests/setup.js',
			...(process.env.SHIFT_DAYS ? ['scripts/vitest/shift-clock.js'] : [])
		],
		// Reparte las partes de la CI (`--shard`) por lo que tarda cada archivo
		// (scripts/vitest/durations.json), no por cantidad de archivos.
		sequence: { sequencer: DurationSequencer },
		// La plantilla de la base de prueba, migrada una vez por corrida (src/tests/globalSetup.js).
		globalSetup: ['src/tests/globalSetup.js'],
		// `include` va en cada proyecto: con `extends: true` las listas se suman.
		projects: [
			// Casi todas: en Node, y los componentes con el render del servidor (`svelte/server`).
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.test.js'],
					exclude: [...configDefaults.exclude, 'src/**/*.dom.test.js']
				}
			},
			// Componentes montados en un DOM (jsdom + @testing-library/svelte) para probar clics:
			// `*.dom.test.js`, con el Svelte del navegador (la condición `browser`).
			{
				extends: true,
				resolve: { conditions: ['browser'] },
				test: { name: 'dom', include: ['src/**/*.dom.test.js'], environment: 'jsdom' }
			}
		]
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
