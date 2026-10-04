// E2E smoke tests: builds the site and serves it with `vite preview`.
//
// Environment variables (all optional):
//   PORT              preview port (default 4173)
//   PW_NO_BUILD=1     skip `npm run build` (reuse an existing build, e.g. in CI)
//   PW_CHROMIUM_PATH  use a specific Chromium binary instead of the one Playwright downloaded
//                     (useful when the preinstalled browser revision doesn't match @playwright/test)
const port = Number(process.env.PORT ?? 4173);
// Los eventos y el material salen solo de la base: antes de servir, se importan los .md del repo a
// la base local (idempotente; scripts/import-content.js, que también aplica las migraciones).
const preview = `node scripts/import-content.js --quiet && npm run preview -- --port ${port} --strictPort`;

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
	webServer: {
		command: process.env.PW_NO_BUILD ? preview : `npm run build && ${preview}`,
		port,
		timeout: 300_000,
		reuseExistingServer: !process.env.CI,
		// Cuentas del público prendidas (tests/cuentas.spec.js). Apagadas, /ingresar da 404.
		env: { CUENTAS_ENABLED: '1' }
	},
	testDir: 'tests',
	// La venta de entradas tiene su propia configuración (dev + mocks): playwright.tickets.config.js
	testIgnore: ['tickets/**'],
	timeout: 30_000,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	use: {
		baseURL: `http://localhost:${port}`,
		launchOptions: process.env.PW_CHROMIUM_PATH
			? { executablePath: process.env.PW_CHROMIUM_PATH }
			: {}
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
};

export default config;
