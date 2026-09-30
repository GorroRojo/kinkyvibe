/**
 * E2E de la venta de entradas, contra `vite dev` en modo simulado (sin Mercado Pago, Resend ni
 * GitHub reales):
 *   npx playwright test -c playwright.tickets.config.js
 *
 * Levanta `npm run dev:tickets` (vite dev --mode tickets, que lee .env.tickets) en el puerto 5371.
 *
 * - MP_MOCK=1: checkout simulado en /entradas/simular-pago/<orden>.
 * - ADMIN_DEV_MOCK=1: sesión de admin falsa (solo dev).
 * - TICKETS_DEV_FIXTURE=<slug>: agrega entradas de prueba a un evento real SIN tocar su archivo.
 * - TICKETS_DEV_FIXTURE_GORRA=<slug>: lo mismo, con un evento online "a la gorra".
 * - TICKETS_TRANSFER_INFO / TICKETS_MP_FEE_PERCENT: datos de transferencia inventados y comisión.
 * - PW_CHROMIUM: ruta a un Chromium ya instalado (opcional).
 * - TICKETS_SHOTS_DIR: carpeta para guardar capturas (opcional).
 */
import {
	ADMIN_MOCK_DIR,
	MP_FEE_PERCENT,
	TRANSFER_INFO,
	ticketsE2EEvent,
	ticketsE2EGorraEvent
} from './tests/tickets/event.js';

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
		// Mismo modo que `npm run dev:tickets` (lee .env.tickets); las variables de abajo lo pisan
		// para que las pruebas no dependan de lo que tenga cada compu.
		command: `npm run dev:tickets -- --port ${PORT} --strictPort`,
		port: PORT,
		timeout: 180000,
		reuseExistingServer: false,
		env: {
			MP_MOCK: '1',
			ADMIN_DEV_MOCK: '1',
			// Todas las compras salen de localhost: sin los límites por cliente (hay tests unitarios).
			TICKETS_DEV_RELAX_LIMITS: '1',
			// Los "commits" del editor de eventos (tests/tickets/editor.spec.js).
			ADMIN_DEV_MOCK_DIR: ADMIN_MOCK_DIR,
			TICKETS_DEV_FIXTURE: ticketsE2EEvent(),
			TICKETS_DEV_FIXTURE_GORRA: ticketsE2EGorraEvent(),
			TICKETS_TRANSFER_INFO: TRANSFER_INFO,
			TICKETS_MP_FEE_PERCENT: MP_FEE_PERCENT,
			// Descuento automático del Fondo sin red.
			FONDO_PERCENT_OVERRIDE: '20',
			CRON_SECRET: 'e2e-cron-secret-0123456789',
			MP_ACCESS_TOKEN: '',
			RESEND_API_KEY: ''
		}
	}
};

export default config;
