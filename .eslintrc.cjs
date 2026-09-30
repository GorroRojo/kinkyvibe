module.exports = {
	root: true,
	extends: ['eslint:recommended', 'plugin:svelte/base', 'prettier'],
	rules: {
		// Unused parameters often document a callback signature; only flag unused bindings.
		'no-unused-vars': ['error', { args: 'none' }]
	},
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2022,
		extraFileExtensions: ['.svelte']
	},
	// Constantes que define vite.config.js al compilar.
	globals: {
		__DEPLOY_BRANCH__: 'readonly'
	},
	env: {
		browser: true,
		es2022: true,
		node: true
	}
};
