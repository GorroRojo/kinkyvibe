/**
 * Comunidad › Formularios › Cómo salen por defecto: «Ver cómo queda» de cada mail muestra la vista
 * previa (asunto + el mail en un iframe) sin guardar. Antes no mostraba nada: la página leía la
 * vista previa con una función que Svelte (modo legacy) no vuelve a dibujar.
 */
import { expect, test } from '@playwright/test';
import { AGE_OK } from './helpers.js';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
	// Los formularios van con interruptor (apagado en la base de prueba): se prende para la prueba.
	await setFormularios(page, true);
});

// Y se vuelve a apagar, para que las otras pruebas vean el panel como siempre.
test.afterEach(async ({ page }) => {
	await setFormularios(page, false);
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {boolean} on
 */
async function setFormularios(page, on) {
	await page.goto('/admin/ajustes/interruptores', { waitUntil: 'networkidle' });
	const flag = page.getByRole('switch', { name: 'Formularios', exact: true });
	if ((await flag.isChecked()) === on) return;
	// Un clic (no setChecked): el cambio se guarda solo y la página vuelve a dibujar el interruptor.
	await flag.click();
	await expect(page.getByText('Guardado ✓')).toBeVisible();
	await expect(flag).toBeChecked({ checked: on });
}

for (const { id, n, frame } of [
	{ id: 'defecto-encuesta', n: 0, frame: 'Vista previa del mail de la encuesta' },
	{ id: 'defecto-formulario', n: 1, frame: 'Vista previa del mail' }
]) {
	test(`«Ver cómo queda» muestra la vista previa: ${id}`, async ({ page }) => {
		await page.goto('/admin/comunidad/formularios/por-defecto', { waitUntil: 'networkidle' });
		await page.locator(`#${id}-asunto`).fill(`Asunto de prueba ${n}`);
		await page.getByRole('button', { name: 'Ver cómo queda' }).nth(n).click();
		await expect(page.getByText(`Asunto de prueba ${n}`, { exact: true })).toBeVisible();
		await expect(page.getByTitle(frame, { exact: true })).toBeVisible();
	});
}
