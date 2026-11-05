/**
 * Sección «Texto» (CodeMirror, BodySection) en la pestaña Editar de un evento con un texto largo,
 * con el admin simulado: la primera línea se ve (en la compu y a 390 px), después de scrollear la
 * página y de saltar desde «En esta página», y escribir no traba la página (presupuesto de tiempo
 * y tareas largas medidas con PerformanceObserver). Lo que se escribe no se guarda.
 *
 * Usa el evento publicado de la semilla con el texto más largo (tiene títulos con emojis).
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ticketsE2EEvent, ticketsE2EGorraEvent } from './event.js';

/** El evento de la semilla con más líneas de texto (sin los de las otras pruebas). */
function longestBodyEvent() {
	/** @type {{ legacySlug: string, raw: string }[]} */
	const events = JSON.parse(readFileSync('src/lib/server/semilla/calendario.json', 'utf8'));
	const skip = new Set([ticketsE2EEvent(), ticketsE2EGorraEvent()]);
	const body = (/** @type {string} */ raw) => raw.split(/^---$/m).slice(2).join('---');
	const [best] = events
		.filter(({ legacySlug, raw }) => {
			return (
				!legacySlug.startsWith('_') &&
				!skip.has(legacySlug) &&
				!/^force_unpublished:\s*true/m.test(raw) &&
				!/^redirect:/m.test(raw) &&
				/^start:/m.test(raw)
			);
		})
		.map(({ legacySlug, raw }) => ({ slug: legacySlug, lines: body(raw).split('\n').length }))
		.sort((a, b) => b.lines - a.lines || a.slug.localeCompare(b.slug));
	if (!best || best.lines < 25) throw new Error('No encontré un evento con un texto largo');
	return best.slug;
}

/** Tareas largas (>50 ms) del hilo principal desde que carga la página. */
const LONG_TASKS = () => {
	/** @type {any} */ (window).__longTasks = [];
	new PerformanceObserver((list) => {
		for (const e of list.getEntries()) /** @type {any} */ (window).__longTasks.push(e.duration);
	}).observe({ type: 'longtask', buffered: true });
};

/**
 * ¿Se ve la línea 1 del texto? Dentro del recuadro del editor y de la pantalla, y es la del
 * principio del documento.
 * @param {import('@playwright/test').Page} page
 */
function firstLineVisible(page) {
	return page.evaluate(() => {
		const scroller = document.querySelector('#sec-texto .cm-scroller');
		const line = scroller?.querySelector('.cm-content .cm-line');
		if (!scroller || !line) return 'sin editor';
		const box = scroller.getBoundingClientRect();
		const r = line.getBoundingClientRect();
		const x = Math.min(r.left + 4, r.right - 1);
		const y = r.top + Math.min(r.height / 2, 6);
		if (r.top < box.top - 1 || r.bottom > box.bottom + 1)
			return `fuera del recuadro (${r.top} / ${box.top})`;
		if (y < 0 || y > innerHeight) return `fuera de la pantalla (${y})`;
		const hit = document.elementFromPoint(x, y);
		if (!hit || !line.contains(hit)) return `tapada por ${hit?.className || hit?.tagName}`;
		const gutter = [...scroller.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].find(
			(g) => g.textContent === '1'
		);
		if (!gutter || gutter.getBoundingClientRect().height === 0) return 'sin el número 1';
		return 'ok';
	});
}

/**
 * ¿Se ve la línea del cursor (`.cm-activeLine`) dentro del recuadro del editor?
 * @param {import('@playwright/test').Page} page
 */
function cursorLineVisible(page) {
	return page.evaluate(() => {
		const scroller = document.querySelector('#sec-texto .cm-scroller');
		const line = scroller?.querySelector('.cm-activeLine');
		if (!scroller || !line) return 'sin línea activa';
		const box = scroller.getBoundingClientRect();
		const r = line.getBoundingClientRect();
		return r.top >= box.top - 1 && r.bottom <= box.bottom + 1
			? 'ok'
			: `fuera del recuadro (${Math.round(r.top)} / ${Math.round(box.top)}-${Math.round(box.bottom)})`;
	});
}

/**
 * Lleva el editor a la vista con «En esta página» y su scroll interno al principio.
 * @param {import('@playwright/test').Page} page
 */
async function toTexto(page) {
	await page.locator('a[href="#sec-texto"]:visible').first().click();
	const scroller = page.locator('#sec-texto .cm-scroller');
	await expect(scroller).toBeInViewport();
	// Rueda hacia arriba sobre el editor: primero sube su scroll interno.
	const box = await scroller.boundingBox();
	if (!box) throw new Error('sin recuadro');
	await page.mouse.move(box.x + box.width / 2, box.y + Math.min(80, box.height / 2));
	for (let i = 0; i < 6 && (await scroller.evaluate((el) => el.scrollTop)) > 0; i++) {
		await page.mouse.wheel(0, -400);
		await page.waitForTimeout(100);
	}
	await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
	await page.locator('a[href="#sec-texto"]:visible').first().click();
}

for (const [width, height] of [
	[1860, 1000],
	[390, 844]
]) {
	test(`«Texto» con un texto largo: se ve la línea 1 y escribir no traba (${width} px)`, async ({
		page
	}) => {
		const slug = longestBodyEvent();
		await page.setViewportSize({ width, height });
		await page.addInitScript(LONG_TASKS);
		await page.goto(`/admin/eventos/${slug}/editar`, { waitUntil: 'load' });
		await expect(page.locator('#sec-texto .cm-editor')).toBeAttached({ timeout: 30_000 });

		// Scrollear toda la página para abajo y para arriba (lento y rápido), con la rueda.
		await page.mouse.move(width / 2, height / 2);
		for (const [delta, steps] of [
			[200, 30],
			[-200, 30],
			[1200, 8],
			[-1200, 8]
		]) {
			for (let i = 0; i < steps; i++) {
				await page.mouse.wheel(0, delta);
				await page.waitForTimeout(16);
			}
		}

		await toTexto(page);
		await expect.poll(() => firstLineVisible(page)).toBe('ok');
		const editor = page.locator('#sec-texto .cm-editor');
		// El recuadro no es más alto que el texto (salvo el mínimo) ni pasa de 40rem.
		const sizes = await editor.evaluate((el) => {
			const content = /** @type {HTMLElement} */ (el.querySelector('.cm-content'));
			return {
				box: el.getBoundingClientRect().height,
				content: content.getBoundingClientRect().height,
				rem: parseFloat(getComputedStyle(document.documentElement).fontSize)
			};
		});
		expect(sizes.box).toBeLessThanOrEqual(40 * sizes.rem + 1);
		expect(sizes.box).toBeLessThanOrEqual(Math.max(sizes.content, 12 * sizes.rem) + 2);

		// Escribir al final (un título con emoji y una cita): la página responde.
		await page.locator('#sec-texto .cm-content').click();
		await page.keyboard.press('Control+End');
		const t0 = Date.now();
		await page.keyboard.type('\n### 🕐 Parte 2 - Citas Rápidas\n> una cita inventada', {
			delay: 5
		});
		// Un ida y vuelta al hilo principal enseguida (si está trabado, no vuelve).
		await page.evaluate(() => 1);
		expect(Date.now() - t0).toBeLessThan(10_000);
		await expect(page.locator('#sec-texto .cm-content')).toContainText('una cita inventada');

		// El scroll del editor no es suave (style.scss lo pone en `*`): CodeMirror lo mueve por
		// código y lee la posición enseguida. Ir al principio y al final muestra esa línea ya, sin
		// esperar a que termine una animación (sin `expect.poll` a propósito).
		expect(
			await page
				.locator('#sec-texto .cm-scroller')
				.evaluate((el) => getComputedStyle(el).scrollBehavior)
		).toBe('auto');
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(300);
		expect(await firstLineVisible(page)).toBe('ok');
		await page.keyboard.press('Control+End');
		await page.waitForTimeout(300);
		expect(await cursorLineVisible(page)).toBe('ok');

		// Y la línea 1 se sigue viendo al volver arriba del editor.
		await toTexto(page);
		await expect.poll(() => firstLineVisible(page)).toBe('ok');

		// Sin trabas: ninguna tarea del hilo principal de más de 3 s (con `vite dev`, la primera
		// carga ya tiene tareas de cientos de ms; una página colgada las tiene de minutos).
		const longest = await page.evaluate(() =>
			Math.max(0, .../** @type {any} */ (window).__longTasks)
		);
		expect(longest).toBeLessThan(3000);
	});
}
