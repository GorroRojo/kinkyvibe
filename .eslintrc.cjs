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
	env: {
		browser: true,
		es2022: true,
		node: true
	}
};
