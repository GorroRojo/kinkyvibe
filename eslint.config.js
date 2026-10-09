// Configuración plana de ESLint: eslint-plugin-svelte 3 ya no soporta .eslintrc.
// Traduce uno a uno el viejo .eslintrc.cjs + .eslintignore, con las mismas reglas y severidades.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
	{
		ignores: [
			// Lo que .eslintrc ignoraba por defecto: archivos y carpetas que empiezan con punto
			// (por ejemplo src/routes/.well-known y .claude/worktrees).
			'**/.*',
			// Antes en .eslintignore.
			'build/',
			'.svelte-kit/',
			'.wrangler/',
			'package/',
			'.env',
			'.env.*',
			'.VSCodeCounter/',
			'static/',
			'pnpm-lock.yaml',
			'package-lock.json',
			'yarn.lock',
			// Informe de impacto visual (npm run ui:impacto, docs/ui-impacto.md)
			'ui-impacto/'
		]
	},
	js.configs.recommended,
	...svelte.configs['flat/base'],
	prettier,
	{
		languageOptions: {
			sourceType: 'module',
			ecmaVersion: 2022,
			globals: {
				// Equivale a env: { browser, es2022, node } de .eslintrc.
				...globals.browser,
				...globals.es2021,
				...globals.node,
				// Constantes que define vite.config.js al compilar.
				__DEPLOY_BRANCH__: 'readonly'
			}
		},
		rules: {
			// Unused parameters often document a callback signature; only flag unused bindings.
			'no-unused-vars': ['error', { args: 'none' }]
		}
	}
];
