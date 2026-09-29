/**
 * E2E de la venta de entradas, contra `vite dev` en modo simulado (sin Mercado Pago, Resend ni
 * GitHub reales):
 *   npx playwright test -c playwright.tickets.config.js
 *
 * - MP_MOCK=1: checkout simulado en /entradas/simular-pago/<orden>.
 * - ADMIN_DEV_MOCK=1: sesión de admin falsa (solo dev).
 * - TICKETS_DEV_FIXTURE=<slug>: agrega entradas de prueba a un evento real SIN tocar su archivo.
 * - PW_CHROMIUM: ruta a un Chromium ya instalado (opcional).
 * - TICKETS_SHOTS_DIR: carpeta para guardar capturas (opcional).
 */
import { ticketsE2EEvent } from './tests/tickets/event.js';

const PORT = 5371;

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
	testDir: 'tests/tickets',
	timeout: 90000,
	workers: 1,
	expect: { timeout: 15000 },
	use: {
		baseURL: `http://localhost:${PORT}`,
		actionTimeout: 15000,
		launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
	},
	webServer: {
		command: `npm run dev -- --port ${PORT} --strictPort`,
		port: PORT,
		timeout: 180000,
		reuseExistingServer: false,
		env: {
			MP_MOCK: '1',
			ADMIN_DEV_MOCK: '1',
			TICKETS_DEV_FIXTURE: ticketsE2EEvent(),
			MP_ACCESS_TOKEN: '',
			RESEND_API_KEY: ''
		}
	}
};

export default config;
