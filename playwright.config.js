/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'tests',
	// La venta de entradas tiene su propia configuración (dev + mocks): playwright.tickets.config.js
	testIgnore: ['tickets/**']
};

export default config;
