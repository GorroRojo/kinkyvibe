// @ts-nocheck -- test code
// Cuentas del público (docs/cuentas.md): con CUENTAS_ENABLED=1 (lo pone playwright.config.js),
// /ingresar se muestra, el encabezado tiene "Ingresar" y /mi-rincon sin sesión lleva a /ingresar.
// El login completo (código por mail) lo cubren los tests unitarios: acá no hay mails.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('mayorDeEdad', 'true');
		} catch {
			/* ignore */
		}
	});
});

test('/ingresar se muestra con el interruptor prendido', async ({ page }) => {
	const res = await page.goto('/ingresar');
	expect(res?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 1, name: 'Ingresar' })).toBeVisible();
	await expect(page.getByLabel('Tu mail').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mandame un código' })).toBeVisible();
	await page.getByText('Ingresar con contraseña').click();
	await expect(page.getByLabel('Contraseña')).toBeVisible();
	// No se puede mostrar dentro de un iframe de otro sitio.
	expect(res?.headers()['x-frame-options']).toBe('DENY');
});

test('el encabezado lleva a Ingresar y /mi-rincon pide ingresar', async ({ page }) => {
	await page.goto('/calendario');
	await page.locator('#user a.cuenta', { hasText: 'Ingresar' }).click();
	await expect(page).toHaveURL(/\/ingresar$/);
	await page.goto('/mi-rincon');
	await expect(page).toHaveURL(/\/ingresar\?next=%2Fmi-rincon$/);
});
