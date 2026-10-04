// @ts-nocheck -- test code
// Cuentas del público (docs/cuentas.md; ya sin interruptor): /ingresar se muestra, el
// encabezado (también a 320 px) y el footer tienen "Entrar" y
// /mi-rincon sin sesión lleva a /ingresar.
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
	await expect(page.getByRole('heading', { level: 1, name: 'Entrar', exact: true })).toBeVisible();
	await expect(page.getByLabel('Tu mail').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Mandame un código' })).toBeVisible();
	await page.getByText('Entrar con contraseña').click();
	await expect(page.getByLabel('Contraseña')).toBeVisible();
	// No se puede mostrar dentro de un iframe de otro sitio.
	expect(res?.headers()['x-frame-options']).toBe('DENY');
});

test('el encabezado lleva a Entrar y /mi-rincon pide entrar', async ({ page }) => {
	await page.goto('/calendario');
	await page.locator('#user a.cuenta', { hasText: /^\s*Entrar\s*$/ }).click();
	await expect(page).toHaveURL(/\/ingresar$/);
	await page.goto('/mi-rincon');
	await expect(page).toHaveURL(/\/ingresar\?next=%2Fmi-rincon$/);
});

test('a 320 px el encabezado sigue mostrando Entrar', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await page.goto('/calendario');
	const cuenta = page.locator('#user a.cuenta', { hasText: /^\s*Entrar\s*$/ });
	await expect(cuenta).toBeVisible();
	// Entra en la pantalla, sin scroll horizontal.
	const box = await cuenta.boundingBox();
	expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
	await cuenta.click();
	await expect(page).toHaveURL(/\/ingresar$/);
});

test('el footer lleva a Entrar (Tu cuenta) y el equipo entra al panel abajo de todo', async ({
	page
}) => {
	await page.goto('/calendario');
	const footer = page.locator('footer');
	await expect(footer.getByRole('heading', { name: 'Tu cuenta' })).toBeVisible();
	await expect(footer.getByRole('link', { name: 'Entrar', exact: true })).toHaveAttribute(
		'href',
		'/ingresar'
	);
	await expect(footer.getByRole('link', { name: 'Entrar al panel' })).toHaveAttribute(
		'href',
		'/login'
	);
	await expect(footer.getByRole('link', { name: 'Iniciar sesión' })).toHaveCount(0);
	await expect(footer.getByRole('link', { name: 'Panel de admin' })).toHaveCount(0);
	// Propinas ya sin interruptor: "Dejá una propina" al Fondo en lugar de Cafecito.
	await expect(footer.getByRole('link', { name: 'Dejá una propina' })).toHaveAttribute(
		'href',
		'https://fondo.kinkyvibe.ar'
	);
	await expect(footer.getByRole('link', { name: 'CafecitoApp' })).toHaveCount(0);
	await expect(footer).toContainText('Este sitio está en constante construcción.');
});
