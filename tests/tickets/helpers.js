import { mkdirSync } from 'node:fs';
import { expect } from '@playwright/test';
import path from 'node:path';

export const SHOTS = process.env.TICKETS_SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/**
 * Captura en escritorio y a 390px de ancho (si TICKETS_SHOTS_DIR está definido).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {import('@playwright/test').Locator} [locator] recorte opcional (si no, página completa)
 * @param {{ fullPage?: boolean, scrollTo?: import('@playwright/test').Locator }} [o] sin recorte:
 *   `fullPage: false` captura solo lo visible; `scrollTo` centra ese elemento antes
 */
export async function shots(page, name, locator, o = {}) {
	if (!SHOTS) return;
	const size = page.viewportSize();
	// La barra de navegación fija de abajo (celu) tapa los recortes: se oculta para las capturas.
	await page.addStyleTag({ content: '[data-shots-hide] { display: none !important; }' });
	for (const [w, h, suffix] of /** @type {const} */ ([
		[1280, 900, 'desktop'],
		[390, 844, '390']
	])) {
		await page.setViewportSize({ width: w, height: h });
		await page.evaluate(() => {
			for (const el of document.querySelectorAll('body *')) {
				const cs = getComputedStyle(el);
				if (cs.position === 'fixed' && parseFloat(cs.bottom) === 0) {
					el.setAttribute('data-shots-hide', '');
				}
			}
		});
		const file = path.join(SHOTS, `${name}-${suffix}.png`);
		if (o.scrollTo) {
			await o.scrollTo.evaluate((el) => el.scrollIntoView({ block: 'center' }));
		}
		if (locator) await locator.screenshot({ path: file });
		else await page.screenshot({ path: file, fullPage: o.fullPage ?? true });
	}
	if (size) await page.setViewportSize(size);
}

/** DNI inventado de 8 dígitos (distinto en cada corrida). */
export function fakeDni() {
	return String(10000000 + Math.floor(Math.random() * 89999999));
}

/** @param {number} n */
export function ars(n) {
	return `$ ${n.toLocaleString('es-AR')}`;
}

/** @param {string} dni */
export function dotted(dni) {
	return Number(dni).toLocaleString('es-AR');
}

/**
 * Compra en tres pasos: «Continuar» desde el paso que se ve y espera que se vea el siguiente
 * (su título, que además recibe el foco).
 *
 * @param {import('@playwright/test').Locator} block el bloque de compra (#entradas)
 * @param {'Tus datos' | 'Pagar'} next el nombre del paso al que se llega
 */
export async function nextStep(block, next) {
	await block.getByRole('button', { name: /^Continuar/ }).click();
	await expect(stepHeading(block, next)).toBeVisible();
	await expect(stepHeading(block, next)).toBeFocused();
}

/**
 * Salta a un paso con el indicador de pasos (para atrás, o adelante a uno por el que ya pasó).
 *
 * @param {import('@playwright/test').Locator} block
 * @param {'Entradas' | 'Tus datos' | 'Pagar'} name
 */
export async function goToStep(block, name) {
	await block
		.getByRole('navigation', { name: 'Pasos de la compra' })
		.getByRole('button', { name: new RegExp(`^Paso \\d: ${name}`) })
		.click();
	await expect(stepHeading(block, name)).toBeVisible();
}

/**
 * El título del paso (el que dice «Paso N de 3»).
 *
 * @param {import('@playwright/test').Locator} block
 * @param {string} name
 */
export function stepHeading(block, name) {
	return block.getByRole('heading', { name: new RegExp(`^Paso \\d de 3 ${name}$`) });
}

/** Sin esto el cartel "¿Sos mayor de 18 años?" tapa la página. */
export const AGE_OK = () => localStorage.setItem('mayorDeEdad', 'true');
