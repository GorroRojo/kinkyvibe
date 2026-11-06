/**
 * PayPal en la compra de entradas, con el PayPal simulado (PAYPAL_MOCK=1, cotización inventada
 * PAYPAL_MOCK_RATE=1250; docs/paypal.md): elegir PayPal muestra los dólares, la pantalla simulada
 * de PayPal cobra eso, la vuelta aprueba la compra y el panel muestra el cobro. Cancelar en PayPal
 * cancela la compra.
 *
 * PAYPAL_SHOTS_DIR=<carpeta>: guarda capturas del recorrido (a 2×).
 */
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ticketsE2EEvent } from './event.js';
import { AGE_OK, dotted, fakeDni, goToStep, nextStep, stepHeading } from './helpers.js';

const EVENT = ticketsE2EEvent();
const SHOTS = process.env.PAYPAL_SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

test.use({ deviceScaleFactor: 2, viewport: { width: 430, height: 932 } });
test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
});

/** @param {import('@playwright/test').Page} page @param {string} name @param {import('@playwright/test').Locator} [el] */
async function shot(page, name, el) {
	if (!SHOTS) return;
	const file = path.join(SHOTS, `${name}.png`);
	if (el) await el.screenshot({ path: file });
	else await page.screenshot({ path: file, fullPage: true });
}

/** Llena la compra hasta «Pagar» y elige PayPal. @param {import('@playwright/test').Page} page */
async function toPaypal(page) {
	const id = Math.random().toString(36).slice(2, 8);
	await page.goto(`/calendario/${EVENT}/entradas`, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await expect(block.getByRole('heading', { name: 'Comprar entradas' })).toBeVisible();
	if (await stepHeading(block, 'Entradas').isHidden()) await goToStep(block, 'Entradas');
	await block.getByLabel(/General/).check();
	await block.getByLabel('Cantidad').fill('1');
	await nextStep(block, 'Tus datos');
	await block.getByLabel('Tu nombre').fill(`Persona PayPal ${id}`);
	await block.getByLabel('Tus pronombres').fill('elle');
	await block.getByLabel(/^Email/).fill(`e2e-paypal-${id}@example.com`);
	await block.getByLabel(/^DNI/).fill(dotted(fakeDni()));
	await nextStep(block, 'Pagar');
	await block.getByLabel(/PayPal/).check();
	await block.getByLabel(/18 años/).check();
	return { block, id };
}

test('PayPal: ver los dólares → aprobar en PayPal → compra aprobada → el panel muestra el cobro', async ({
	page
}) => {
	const { block, id } = await toPaypal(page);
	const note = block.locator('.method-note.shown');
	await expect(note).toContainText(/Pagás US\$\s[\d.,]+ en PayPal/);
	const usd = /** @type {string} */ (/US\$\s[\d.,]+/.exec(await note.innerText())?.[0]);
	const submit = block.locator('.pay button[type="submit"]');
	await expect(submit).toHaveText('Ir a pagar con PayPal');
	await block.locator('fieldset.methods').scrollIntoViewIfNeeded();
	await shot(page, '1-elegir-paypal', block.locator('fieldset.methods'));

	await submit.click();
	await expect(page).toHaveURL(/\/paypal\/simular\/MOCK[A-Z0-9]+$/);
	// Lo mismo que se mostró, en el formato de PayPal (US$ 8,34 → 8.34).
	const value = usd
		.replace(/US\$\s/, '')
		.replace(/\./g, '')
		.replace(',', '.');
	await expect(page.getByRole('heading', { name: `Pagar US$ ${value}` })).toBeVisible();
	await shot(page, '2-paypal-simulado');
	await page.getByRole('button', { name: 'Aprobar pago' }).click();

	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.getByRole('heading', { name: /ya tenés tus entradas/ })).toBeVisible();
	await expect(page.getByText(`(${usd} con PayPal)`)).toBeVisible();
	await shot(page, '3-compra-aprobada');

	await page.goto(`/admin/eventos/${EVENT}/ordenes`);
	const row = page.locator('li.order', { hasText: `Persona PayPal ${id}` }).first();
	await expect(row).toContainText('cobro PayPal');
	await expect(row).toContainText(usd);
	await shot(page, '4-panel-orden', row);
});

test('PayPal: cancelar en PayPal cancela la compra (no se cobra nada)', async ({ page }) => {
	const { block } = await toPaypal(page);
	await block.locator('.pay button[type="submit"]').click();
	await expect(page).toHaveURL(/\/paypal\/simular\/MOCK[A-Z0-9]+$/);
	await page.getByRole('button', { name: 'Cancelar y volver' }).click();
	await expect(page).toHaveURL(/\/entradas\/[0-9a-f-]{36}\/estado$/);
	await expect(page.getByRole('heading', { name: 'Esta compra se canceló' })).toBeVisible();
});
