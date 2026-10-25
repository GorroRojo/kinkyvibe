// @ts-nocheck -- test code: loose fixtures, no need for strict JSDoc types
// El buscador de etiquetas de las listas (TagSearch) y el glosario de la Kinkipedia, sin @melt-ui:
// teclado, mouse, atributos para lectores de pantalla y dónde flota el menú. Con la semilla
// pública (src/lib/server/semilla/).
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		try {
			window.localStorage.setItem('mayorDeEdad', 'true');
		} catch (e) {
			/* ignore */
		}
	});
});

/** Collects uncaught exceptions of the page. */
function collectErrors(page) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	return errors;
}

/** The parts of the search, by role. */
function parts(page) {
	const input = page.getByRole('combobox', { name: 'Buscar por etiquetas o texto' });
	const listbox = page.getByRole('listbox');
	return {
		input,
		listbox,
		options: listbox.getByRole('option'),
		chips: page.locator('.tag-search .chip'),
		highlighted: page.locator('[role=option][data-highlighted]')
	};
}

/** aria-activedescendant points to the highlighted option (or is absent with none). */
async function expectActiveDescendant(page) {
	const { input, highlighted } = parts(page);
	if ((await highlighted.count()) == 0) {
		await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
		return;
	}
	const id = await highlighted.getAttribute('id');
	expect(id).toBeTruthy();
	await expect(input).toHaveAttribute('aria-activedescendant', id);
}

test('el combobox tiene sus atributos y su lista', async ({ page }) => {
	await page.goto('/material', { waitUntil: 'networkidle' });
	const { input, listbox, options } = parts(page);
	await expect(input).toHaveAttribute('aria-expanded', 'false');
	await expect(input).toHaveAttribute('aria-autocomplete', 'list');
	const controls = await input.getAttribute('aria-controls');
	await input.click();
	await expect(input).toHaveAttribute('aria-expanded', 'true');
	await expect(listbox).toBeVisible();
	expect(await listbox.getAttribute('id')).toBe(controls);
	await expect(options.first()).toHaveAttribute('aria-selected', 'false');
	// el label que lo nombra
	const labelledby = await input.getAttribute('aria-labelledby');
	await expect(page.locator(`[id="${labelledby}"]`)).toHaveText('Buscar por etiquetas o texto');
	// cerrada, la lista sigue en la página (oculta), así aria-controls nunca apunta a la nada
	await page.keyboard.press('Escape');
	await expect(input).toHaveAttribute('aria-expanded', 'false');
	await expect(listbox).toBeHidden();
	expect(await page.locator(`[id="${controls}"]`).count()).toBe(1);
});

test('con el teclado: flechas, Inicio/Fin, Enter, Escape, Tab, Backspace', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/material', { waitUntil: 'networkidle' });
	const { input, listbox, options, chips, highlighted } = parts(page);
	await input.click();
	await expect(listbox).toBeVisible();
	// sin texto, nada resaltado: Enter no suma nada
	await expect(highlighted).toHaveCount(0);
	await expectActiveDescendant(page);
	const n = await options.count();
	expect(n).toBeGreaterThan(2);

	await page.keyboard.press('ArrowDown');
	await expect(highlighted).toHaveCount(1);
	await expect(options.nth(0)).toHaveAttribute('data-highlighted', '');
	await expectActiveDescendant(page);
	await page.keyboard.press('ArrowDown');
	await expect(options.nth(1)).toHaveAttribute('data-highlighted', '');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	// da la vuelta
	await expect(options.nth(n - 1)).toHaveAttribute('data-highlighted', '');
	await expectActiveDescendant(page);
	// la resaltada se ve dentro de la lista
	await expect(options.nth(n - 1)).toBeInViewport();
	await page.keyboard.press('Home');
	await expect(options.nth(0)).toHaveAttribute('data-highlighted', '');
	await page.keyboard.press('End');
	await expect(options.nth(n - 1)).toHaveAttribute('data-highlighted', '');

	// Enter suma la resaltada y la lista sigue abierta
	const picked = (
		await options
			.nth(n - 1)
			.locator('.name')
			.innerText()
	).trim();
	await page.keyboard.press('Enter');
	await expect(chips).toHaveCount(1);
	await expect(chips.first()).toContainText(picked.replace(/^\S+\s+/, '').split(' (')[0]);
	await expect(input).toHaveAttribute('aria-expanded', 'true');
	await expect(input).toBeFocused();

	// con texto, la primera queda resaltada y Enter la suma
	await page.keyboard.type('es');
	await expect(options.first()).toHaveAttribute('data-highlighted', '');
	await expectActiveDescendant(page);
	await page.keyboard.press('Enter');
	await expect(chips).toHaveCount(2);
	await expect(input).toHaveValue('');

	// Escape cierra y deja el foco en el campo
	await page.keyboard.press('Escape');
	await expect(input).toHaveAttribute('aria-expanded', 'false');
	await expect(listbox).toBeHidden();
	await expect(input).toBeFocused();
	// cerrada: Enter no hace nada y ↓ la abre
	await page.keyboard.press('Enter');
	await expect(chips).toHaveCount(2);
	await page.keyboard.press('ArrowDown');
	await expect(input).toHaveAttribute('aria-expanded', 'true');
	// Alt+↑ la cierra
	await page.keyboard.press('Alt+ArrowUp');
	await expect(input).toHaveAttribute('aria-expanded', 'false');
	// escribir la abre
	await page.keyboard.type('g');
	await expect(input).toHaveAttribute('aria-expanded', 'true');
	// Tab la cierra y sigue al próximo elemento
	await page.keyboard.press('Tab');
	await expect(input).toHaveAttribute('aria-expanded', 'false');
	await expect(input).not.toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(input).toBeFocused();
	// borrar texto la abre (como cualquier tecla que escribe)
	await page.keyboard.press('Backspace');
	await expect(input).toHaveValue('');
	await expect(chips).toHaveCount(2);
	await expect(input).toHaveAttribute('aria-expanded', 'true');
	// Backspace con el campo vacío saca la última elegida, y cerrada no la abre
	await page.keyboard.press('Escape');
	await page.keyboard.press('Backspace');
	await expect(chips).toHaveCount(1);
	await expect(input).toHaveAttribute('aria-expanded', 'false');
	await expect(page).toHaveURL(/[?&]tags=/);
	expect(errors).toEqual([]);
});

test('con el mouse: abrir, resaltar, elegir, sacar, tocar afuera', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/material', { waitUntil: 'networkidle' });
	const { input, listbox, options, chips, highlighted } = parts(page);
	// un clic abre; otro cierra
	await input.click();
	await expect(listbox).toBeVisible();
	await input.click();
	await expect(listbox).toBeHidden();
	await input.click();
	await expect(listbox).toBeVisible();
	// pasar por encima resalta; salir, no
	await options.nth(2).hover();
	await expect(options.nth(2)).toHaveAttribute('data-highlighted', '');
	await expectActiveDescendant(page);
	await page.mouse.move(2, 2);
	await expect(highlighted).toHaveCount(0);
	// un clic suma la etiqueta, la lista sigue abierta y el foco en el campo
	await options.nth(0).click();
	await expect(chips).toHaveCount(1);
	await expect(listbox).toBeVisible();
	await expect(input).toBeFocused();
	// la ruedita dentro de la lista no la cierra
	await options.nth(0).hover();
	await page.mouse.wheel(0, 120);
	await page.waitForTimeout(200);
	await expect(listbox).toBeVisible();
	// sacar una elegida con su ✕: se va, la lista sigue abierta y el foco vuelve al campo
	await chips.first().getByRole('button').click();
	await expect(chips).toHaveCount(0);
	await expect(listbox).toBeVisible();
	await expect(input).toBeFocused();
	// tocar fuera cierra
	await page.locator('h1, h2').first().click({ force: true });
	await expect(listbox).toBeHidden();
	await expect(input).toHaveAttribute('aria-expanded', 'false');
	// «Despejar búsqueda»
	await input.click();
	await page.keyboard.type('zzzz');
	await expect(listbox).toContainText('Ninguna etiqueta coincide');
	await page.locator('.tag-search').getByRole('button', { name: 'Despejar búsqueda' }).click();
	await expect(input).toHaveValue('');
	await expect(input).toBeFocused();
	expect(errors).toEqual([]);
});

test('el menú flota debajo del campo y, si no entra, arriba', async ({ browser }) => {
	for (const [width, height, side] of [
		[1280, 900, 'bottom'],
		[1280, 560, 'top'],
		[390, 844, 'bottom']
	]) {
		const page = await browser.newPage({ viewport: { width, height } });
		await page.addInitScript(() => window.localStorage.setItem('mayorDeEdad', 'true'));
		await page.goto('/material', { waitUntil: 'networkidle' });
		const { input, listbox } = parts(page);
		await input.click();
		await expect(listbox).toBeVisible();
		const i = await input.boundingBox();
		const m = await listbox.boundingBox();
		if (side == 'bottom') expect(Math.round(m.y - (i.y + i.height))).toBe(6);
		else expect(Math.round(i.y - (m.y + m.height))).toBe(6);
		// nunca se sale de costado
		expect(m.x).toBeGreaterThanOrEqual(8);
		expect(m.x + m.width).toBeLessThanOrEqual(width - 8 + 0.5);
		await page.close();
	}
});

test('el glosario: «N más...» despliega y repliega', async ({ page }) => {
	const errors = collectErrors(page);
	await page.goto('/wiki', { waitUntil: 'networkidle' });
	const more = page.locator('button.expand').first();
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	await expect(more).toContainText('más...');
	const item = more.locator('xpath=ancestor::div[contains(@class, "all")][1]');
	await expect(item.locator(':scope > dd > dl')).toHaveCount(0);
	await more.click();
	await expect(more).toHaveAttribute('aria-expanded', 'true');
	await expect(more).toHaveAccessibleName('Mostrar menos');
	await expect(item.locator(':scope > dd > dl')).toHaveCount(1);
	await more.click();
	await expect(more).toHaveAttribute('aria-expanded', 'false');
	await expect(item.locator(':scope > dd > dl')).toHaveCount(0);
	expect(errors).toEqual([]);
});
