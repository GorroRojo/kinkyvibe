/**
 * Ajustes de venta (/admin/entradas/ajustes): datos para transferir y comisión de MP en D1, con
 * las variables de entorno como respaldo. Deja todo vacío al terminar (las otras pruebas usan
 * TICKETS_TRANSFER_INFO y TICKETS_MP_FEE_PERCENT).
 */
import { expect, test } from '@playwright/test';
import { computePrice } from '../../src/lib/utils/tickets.js';
import { TRANSFER_INFO, ticketsE2EEvent } from './event.js';
import { AGE_OK, ars, fakeDni, shots } from './helpers.js';

const EVENT = ticketsE2EEvent();
const FIELDS = ['Alias', 'CBU/CVU', 'Titular', 'Banco'];

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
});

/** @param {import('@playwright/test').Page} page */
async function clearSettings(page) {
	await page.goto('/admin/entradas/ajustes', { waitUntil: 'networkidle' });
	for (const f of FIELDS) await page.getByLabel(f, { exact: true }).fill('');
	await page.getByLabel(/Comisión/).fill('');
	await page.getByRole('button', { name: 'Guardar ajustes' }).click();
	await expect(page.getByText('Ajustes guardados.')).toBeVisible();
}

test.afterEach(async ({ page }) => {
	await clearSettings(page);
});

test('ajustes de venta: alias y comisión desde el admin, con las variables como respaldo', async ({
	page
}) => {
	await clearSettings(page);
	await page.goto('/admin/entradas');
	await expect(page.getByRole('link', { name: /Ajustes de venta/ })).toHaveAttribute(
		'href',
		'/admin/entradas/ajustes'
	);
	await page.goto('/admin/entradas/ajustes', { waitUntil: 'networkidle' });
	await expect(page.getByText('se usan los datos de la variable')).toBeVisible();

	// Datos INVENTADOS (el repo es público).
	await page.getByLabel('Alias', { exact: true }).fill('OTRO.ALIAS.PRUEBA');
	await page.getByLabel('CBU/CVU', { exact: true }).fill('0000003100000000000000');
	await page.getByLabel('Titular', { exact: true }).fill('Titular de ejemplo');
	await page.getByLabel('Banco', { exact: true }).fill('Banco de ejemplo');
	await page.getByLabel(/Comisión/).fill('80');
	await page.getByRole('button', { name: 'Guardar ajustes' }).click();
	await expect(page.getByText('Revisá los datos marcados.')).toBeVisible();
	await expect(page.locator('.field-error')).toHaveText(/porcentaje entre 0 y 49,99/);
	await page.getByLabel(/Comisión/).fill('5');
	await page.getByRole('button', { name: 'Guardar ajustes' }).click();
	await expect(page.getByText('Ajustes guardados.')).toBeVisible();
	await expect(page.getByText(/Último cambio: .* por GorroRojo/)).toBeVisible();
	await shots(page, '09-ajustes', page.locator('.settings-page'));

	// La compra usa la comisión nueva (5 %) y, por transferencia, el alias nuevo.
	await page.goto(`/calendario/${EVENT}/entradas`, { waitUntil: 'networkidle' });
	const block = page.locator('#entradas');
	await block.getByLabel(/General/).check();
	await block.getByLabel(/Mercado Pago/).check();
	const mp = computePrice({
		price: 10000,
		fondo: 2000,
		quantity: 1,
		method: 'mercadopago',
		feeBasisPoints: 500
	});
	await expect(block.getByText(`Total: ${ars(mp.total)}`)).toBeVisible();
	await expect(block.locator('.method-note.shown')).toContainText('(5 %)');
	await block.getByLabel(/Transferencia/).check();
	await block.getByLabel('Tu nombre').fill('Persona Ajustes');
	await block.getByLabel('Tus pronombres').fill('elle');
	await block.getByLabel(/^Email/).fill('ajustes@example.com');
	await block.getByLabel(/^DNI/).fill(fakeDni());
	await block.getByLabel(/18 años/).check();
	await block.locator('.pay button[type="submit"]').click();
	await expect(page.getByRole('heading', { name: /falta la transferencia/ })).toBeVisible();
	const info = page.locator('.transfer-info');
	await expect(info).toContainText('Alias: OTRO.ALIAS.PRUEBA');
	await expect(info).toContainText('Banco: Banco de ejemplo');
	await expect(info).not.toContainText(TRANSFER_INFO.split('\\n')[0]);

	// Vacío otra vez: vuelven los de la variable de entorno.
	await clearSettings(page);
	await expect(page.getByText('se usan los datos de la variable')).toBeVisible();
});
