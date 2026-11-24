/**
 * Formularios › pregunta «Varias opciones» de punta a punta: se arma en el editor del panel (38
 * opciones), la página pública la muestra como casillas, se mandan varias y el resumen de
 * respuestas cuenta cada una («1 de 1»). Datos inventados.
 *
 * Con MULTI_SHOTS_DIR guarda capturas de la página pública a 390 y 1280 px.
 */
import { expect, test } from '@playwright/test';
import { AGE_OK } from './helpers.js';

const OPTIONS = Array.from({ length: 38 }, (_, i) => `Interés de prueba ${i + 1}`);

test.beforeEach(async ({ page }) => {
	await page.addInitScript(AGE_OK);
	await setFormularios(page, true);
});

test.afterEach(async ({ page }) => {
	await setFormularios(page, false);
});

/**
 * El interruptor de los formularios (apagado en la base de prueba). Como en
 * formularios-defecto.spec.js.
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

test('varias opciones: del editor a la página pública y al resumen', async ({ page }) => {
	const title = `Intereses de prueba ${Date.now().toString(36)}`;
	await page.goto('/admin/comunidad/formularios', { waitUntil: 'networkidle' });
	await page.locator('#formulario-nuevo').fill(title);
	await page.getByRole('main').getByRole('button', { name: 'Crear', exact: true }).click();
	await page.waitForURL(/\/admin\/comunidad\/formularios\/\d+$/);
	await page.waitForLoadState('networkidle');

	// Anónimo: así no pide nombre ni mail.
	await page
		.locator('label.kv-choice', { has: page.locator('input[name="privacy"][value="anonymous"]') })
		.click();
	await page.getByRole('button', { name: 'Agregar una pregunta' }).click();
	await page.getByLabel('Pregunta', { exact: true }).fill('¿Qué te gustaría que haya?');
	await page.getByRole('button', { name: 'Varias opciones (elegir las que quieras)' }).click();
	await page.getByLabel('Opciones (una por renglón, hasta 40)').fill(OPTIONS.join('\n'));
	await page.getByRole('button', { name: 'Guardar', exact: true }).click();
	await expect(page.getByText('Guardado.', { exact: true })).toBeVisible();

	await page.getByRole('switch', { name: 'Recibe respuestas' }).click();
	await expect(page.getByRole('switch', { name: 'Recibe respuestas' })).toBeChecked();
	const path = await page.locator('.link code').innerText();
	const publicPath = path.replace(/^kinkyvibe\.ar/, '');

	await page.goto(publicPath, { waitUntil: 'networkidle' });
	const group = page.getByRole('group', { name: /¿Qué te gustaría que haya\?/ });
	await expect(group.getByRole('checkbox')).toHaveCount(OPTIONS.length);

	const dir = process.env.MULTI_SHOTS_DIR;
	if (dir) {
		for (const width of [390, 1280]) {
			await page.setViewportSize({ width, height: 900 });
			await group.scrollIntoViewIfNeeded();
			await page.screenshot({ path: `${dir}/varias-opciones-${width}.png`, fullPage: true });
		}
	}

	await group.getByRole('checkbox', { name: OPTIONS[4], exact: true }).check();
	await group.getByRole('checkbox', { name: OPTIONS[1], exact: true }).check();
	await page.getByRole('button', { name: 'Mandar', exact: true }).click();
	await expect(page.getByRole('heading', { name: '¡Gracias!' })).toBeVisible();

	// El resumen: cada opción elegida, «1 de 1».
	await page.goto('/admin/comunidad/formularios', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: title }).first().click();
	await page.waitForURL(/\/admin\/comunidad\/formularios\/\d+$/);
	await page.goto(`${new URL(page.url()).pathname}/respuestas`, { waitUntil: 'networkidle' });
	const bars = page.getByRole('list', { name: 'Opciones de «¿Qué te gustaría que haya?»' });
	await expect(bars.getByRole('listitem').filter({ hasText: OPTIONS[1] }).first()).toContainText(
		'1 de 1'
	);
	await expect(page.getByText('Se podían elegir varias.')).toBeVisible();
	// «Cada respuesta»: las elegidas juntas, en el orden de la lista.
	await expect(page.getByText(`${OPTIONS[1]} | ${OPTIONS[4]}`).first()).toBeVisible();
});
