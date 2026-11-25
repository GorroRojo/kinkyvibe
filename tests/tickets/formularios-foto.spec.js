/**
 * Formularios › pregunta «Foto» de punta a punta: se arma en el editor del panel, la página
 * pública la muestra como campo de archivo (el formulario va multipart), se sube una imagen y
 * «Cada respuesta» muestra la miniatura (servida solo a admins). Datos inventados.
 *
 * Con FOTO_SHOTS_DIR guarda capturas del campo a 400 px y de las respuestas del panel.
 */
import { expect, test } from '@playwright/test';
import { AGE_OK } from './helpers.js';

// Las capturas, nítidas (como se ven en un celu).
test.use({ deviceScaleFactor: process.env.FOTO_SHOTS_DIR ? 2 : 1 });

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
	await setFormularios(page, true);
});

test.afterEach(async ({ page }) => {
	await setFormularios(page, false);
});

/**
 * El interruptor de los formularios (apagado en la base de prueba). Como en
 * formularios-varias-opciones.spec.js.
 * @param {import('@playwright/test').Page} page
 * @param {boolean} on
 */
async function setFormularios(page, on) {
	await page.goto('/admin/ajustes/interruptores', { waitUntil: 'networkidle' });
	const flag = page.getByRole('switch', { name: 'Formularios', exact: true });
	if ((await flag.isChecked()) === on) return;
	await flag.click();
	await expect(page.getByText('Guardado ✓')).toBeVisible();
	await expect(flag).toBeChecked({ checked: on });
}

test('foto: del editor a la página pública y a la miniatura del panel', async ({ page }) => {
	const title = `Gancho de prueba ${Date.now().toString(36)}`;
	await page.goto('/admin/comunidad/formularios', { waitUntil: 'networkidle' });
	await page.locator('#formulario-nuevo').fill(title);
	await page.getByRole('main').getByRole('button', { name: 'Crear', exact: true }).click();
	await page.waitForURL(/\/admin\/comunidad\/formularios\/\d+$/);
	await page.waitForLoadState('networkidle');
	const adminPath = new URL(page.url()).pathname;

	await page
		.locator('label.kv-choice', { has: page.locator('input[name="privacy"][value="named"]') })
		.click();
	await page.getByRole('button', { name: 'Agregar una pregunta' }).click();
	await page.getByLabel('Pregunta', { exact: true }).fill('Tu foto');
	await page.getByRole('combobox', { name: /^Tipo/ }).selectOption('photo');
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.getByText('Guardado.', { exact: true })).toBeVisible();

	await page.getByRole('switch', { name: 'Recibe respuestas' }).click();
	await expect(page.getByRole('switch', { name: 'Recibe respuestas' })).toBeChecked();
	const path = await page.locator('.link code').innerText();
	const publicPath = path.replace(/^kinkyvibe\.ar/, '');

	await page.goto(publicPath, { waitUntil: 'networkidle' });
	await expect(page.locator('form[enctype="multipart/form-data"]')).toHaveCount(1);
	const photo = page.getByLabel('Tu foto');
	await expect(photo).toHaveAttribute('type', 'file');
	await expect(photo).toHaveAttribute('accept', 'image/*');
	await page.getByLabel('Tu nombre').fill('Persona Demo');
	await page.getByLabel('Tu mail').fill('demo@example.com');
	await photo.setInputFiles('static/og-default.jpg');

	const dir = process.env.FOTO_SHOTS_DIR;
	if (dir) {
		await page.setViewportSize({ width: 400, height: 900 });
		await photo.scrollIntoViewIfNeeded();
		await page.screenshot({ path: `${dir}/foto-publica-400.png` });
	}

	await page.getByRole('button', { name: 'Mandar', exact: true }).click();
	await expect(page.getByRole('heading', { name: '¡Gracias!' })).toBeVisible();

	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(`${adminPath}/respuestas`, { waitUntil: 'networkidle' });
	const thumb = page.getByRole('img', { name: 'Foto de la respuesta' });
	await expect(thumb).toBeVisible();
	await expect
		.poll(() => thumb.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth))
		.toBeGreaterThan(0);
	const src = String(await thumb.getAttribute('src'));
	expect(src).toMatch(/\/respuestas\/fotos\/[0-9a-f]{64}\.jpg$/);
	const res = await page.request.get(src);
	expect(res.headers()['cache-control']).toBe('private, no-store');
	if (dir) {
		await thumb.scrollIntoViewIfNeeded();
		await page.screenshot({ path: `${dir}/foto-respuestas-admin.png` });
	}
});
