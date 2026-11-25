/**
 * «Editar» una compra en Ventas › Órdenes: cambiar el nombre de quien compró, el de una entrada y
 * las respuestas (con los mismos campos que la compra), ver «Editado por…» con el historial y
 * «Deshacer». En el evento «a la gorra» de prueba, con dos preguntas opcionales que se sacan al
 * terminar (las demás pruebas de ese evento no las esperan). Datos inventados.
 */
import { expect, test } from '@playwright/test';
import { ticketsE2EGorraEvent } from './event.js';
import { shots } from './helpers.js';

const SLUG = ticketsE2EGorraEvent();
const ORIGIN = 'http://localhost:5371';
const HEADERS = { origin: ORIGIN, 'x-sveltekit-action': 'true' };

test.use({ deviceScaleFactor: 2 });

/**
 * Las preguntas propias del evento (reemplaza la lista entera; `[]` las saca).
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {object[]} questions
 */
async function setQuestions(request, questions) {
	const res = await request.post(`/admin/eventos/${SLUG}/preguntas?/saveFields`, {
		form: { questions: JSON.stringify(questions) },
		headers: HEADERS
	});
	expect(res.ok()).toBe(true);
}

test('editar una compra: datos, entradas y respuestas, con historial y deshacer', async ({
	page
}) => {
	const id = Math.random().toString(36).slice(2, 8);
	const buyer = `Persona E2E ${id}`;
	await setQuestions(page.request, [
		{ label: '¿Alguna alergia?', kind: 'text', required: false, options: [], scope: 'all' },
		{
			label: '¿Qué comida?',
			kind: 'choice',
			required: false,
			options: ['Vegana', 'Carnívora'],
			perTicket: true,
			scope: 'all'
		}
	]);
	try {
		// Una compra cargada a mano (sin respuestas): dos entradas.
		const res = await page.request.post(`/admin/eventos/${SLUG}/ordenes/cargar`, {
			form: {
				type: 'fijo',
				quantity: '2',
				name: buyer,
				email: `e2e-${id}@example.com`,
				method: 'cortesia',
				holder_0: buyer,
				pronouns_0: 'elle',
				holder_1: `Acompañante ${id}`,
				pronouns_1: 'ella'
			},
			headers: HEADERS
		});
		expect(res.ok()).toBe(true);

		await page.goto(`/admin/eventos/${SLUG}/ordenes?estado=todas`, { waitUntil: 'networkidle' });
		// El aviso de los atajos tapa las capturas.
		const tip = page.getByRole('button', { name: 'Entendido' });
		if (await tip.isVisible()) await tip.click();
		const order = page.locator('.order', { hasText: `e2e-${id}@example.com` });
		await order.locator('summary', { hasText: 'Editar' }).click();
		const editor = order.locator('form.edit');
		await expect(editor).toBeVisible();
		const who = editor.locator('fieldset', { hasText: 'Quien compró' });
		await who.getByLabel('Nombre', { exact: true }).fill(`${buyer} Corregide`);
		await who.getByLabel('¿Alguna alergia?').fill('Maní');
		const second = editor.locator('fieldset', { hasText: 'Entrada 2' });
		await second.getByLabel('Nombre', { exact: true }).fill(`Otre ${id}`);
		await second.getByLabel('¿Qué comida?').selectOption('Carnívora');
		await shots(page, 'ordenes-editar-editor', order);

		await editor.getByRole('button', { name: 'Guardar' }).click();
		await expect(editor).toBeHidden();
		await expect(order.locator('.head')).toContainText(`${buyer} Corregide`);
		await expect(order.locator('.holder', { hasText: `Otre ${id}` })).toContainText('Carnívora');
		await expect(order).toContainText('Maní');

		const history = order.locator('details.history');
		await expect(history.locator('summary')).toHaveText(/^Editado por \S+ el \d{1,2}\/\d{1,2}$/);
		await history.locator('summary').click();
		await expect(history).toContainText(`Nombre: ${buyer} → ${buyer} Corregide`);
		await expect(history).toContainText('Entrada 2: ¿Qué comida? — → Carnívora');
		await shots(page, 'ordenes-editar-historial', order);

		// La vista Respuestas cuenta lo editado.
		await page.goto(`/admin/eventos/${SLUG}/ordenes?vista=respuestas`, {
			waitUntil: 'networkidle'
		});
		await expect(page.getByText('Maní')).toBeVisible();

		// Deshacer: vuelve el nombre y el cambio queda marcado.
		await page.goto(`/admin/eventos/${SLUG}/ordenes?estado=todas`, { waitUntil: 'networkidle' });
		await order.locator('details.history summary').click();
		await order.getByRole('button', { name: 'Deshacer' }).click();
		await expect(order.locator('.head strong.name')).toHaveText(buyer);
		await expect(order.locator('details.history')).toContainText('deshecho');
		await expect(order.locator('details.history')).toContainText('deshizo un cambio');
	} finally {
		await setQuestions(page.request, []);
	}
});
