module.exports = {
	root: true,
	extends: ['eslint:recommended', 'prettier'],
	plugins: ['svelte3'],
	overrides: [{ files: ['*.svelte'], processor: 'svelte3/svelte3' }],
	settings: {
		// Components use <style lang="scss">; the Svelte compiler inside the plugin can't parse SCSS.
		'svelte3/ignore-styles': (attrs) => attrs.lang === 'scss' || attrs.lang === 'sass'
	},
	rules: {
		// Unused parameters often document a callback signature; only flag unused bindings.
		'no-unused-vars': ['error', { args: 'none' }]
	},
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2022
	},
	env: {
		browser: true,
		es2022: true,
		node: true
	}
};
