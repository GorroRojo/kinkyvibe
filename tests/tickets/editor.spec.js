/**
 * Sección "Entradas" del editor de eventos, con el GitHub simulado (ADMIN_DEV_MOCK, el mismo
 * mock que `npm run dev:admin`): crear un evento con 2 tipos de entrada en /admin/eventos/nuevo y
 * después cambiarle un precio en /edit/calendario/<slug>. Los "commits" van a
 * ADMIN_DEV_MOCK_DIR (ver playwright.tickets.config.js).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseDocument } from 'yaml';
import { ADMIN_MOCK_DIR } from './event.js';
import { shots } from './helpers.js';

/** @param {string} slug */
function committed(slug) {
	// /edit guarda con el form nativo: el navegador manda el textarea con CRLF (ya pasaba antes).
	const raw = readFileSync(
		join(ADMIN_MOCK_DIR, 'files', 'src/lib/posts/calendario', `${slug}.md`),
		'utf8'
	).replace(/\r\n/g, '\n');
	const fm = raw.split(/^---$/m)[1];
	return { raw, meta: parseDocument(fm).toJS() };
}

test('crear un evento con 2 tipos de entrada y después cambiar un precio', async ({ page }) => {
	const id = Math.random().toString(36).slice(2, 7);
	const title = `Prueba editor entradas ${id}`;
	await page.goto('/admin/eventos/nuevo', { waitUntil: 'networkidle' });

	// Datos mínimos del evento.
	await page.locator('#ev-start-date').fill('2026-12-19');
	await page.locator('#ev-start-time').fill('21:00');
	await page.locator('#ev-title').fill(title);
	await page.getByRole('radio', { name: /AMBA/ }).check({ force: true });

	const card = page.locator('#ev-tickets');
	// La plantilla tiene la etiqueta KinkyVibe: el aviso del Fondo lo dice y cambia en vivo.
	const fondo = card.locator('#ev-tickets-fondo');
	await expect(fondo).toContainText('Tiene la etiqueta KinkyVibe');
	await page.locator('#ev-kv').uncheck({ force: true });
	await expect(fondo).toContainText('no usa el Fondo KinkyVibe');
	await page.locator('#ev-kv').check({ force: true });
	await expect(fondo).toContainText('Tiene la etiqueta KinkyVibe');

	// Prender la venta: aparece un tipo vacío.
	await card.locator('#ev-tickets-on').check({ force: true });
	await card.locator('#ev-ticket-name-0').fill('General');
	await card.locator('#ev-ticket-price-0').fill('10.000');
	await card.locator('#ev-ticket-capacity-0').fill('40');
	await card.locator('#ev-ticket-add').click();
	await card.locator('#ev-ticket-name-1').fill('A la gorra');
	await card
		.locator('li.type')
		.nth(1)
		.getByRole('radio', { name: 'A la gorra' })
		.check({ force: true });
	await card.locator('#ev-ticket-capacity-1').fill('100');
	await card.locator('#ev-ticket-min-1').fill('1000');
	await card.locator('#ev-ticket-suggested-1').fill('500');
	await card.locator('#ev-pay-transferencia').check();
	// Horario: abre y cierra en momentos exactos (hora de Argentina); la anticipada no.
	await card.locator('#ev-open-custom').check();
	await card.locator('#ev-open-at').fill('2026-12-01T12:00');
	await expect(card).toContainText('Abre el martes 1/12 a las 12:00.');
	await card.locator('#ev-close-custom').check();
	await card.locator('#ev-close-at').fill('2026-12-18T20:00');
	await expect(card).toContainText('La venta cierra el viernes 18/12 a las 20:00.');

	// Validación en el navegador: sugerido < mínimo.
	await page.locator('#to-preview').click();
	await expect(card.locator('#ev-tickets-errors')).toContainText(
		'el sugerido no puede ser menor que el mínimo'
	);
	await expect(page.locator('.problems')).toContainText('Entradas:');
	await card.locator('#ev-ticket-suggested-1').fill('5000');
	await expect(card).toContainText('Botones: $ 1.000 · $ 5.000 · $ 7.500 · $ 10.000');
	await shots(page, 'tickets-editor-nuevo', card);

	await page.locator('#to-preview').click();
	await expect(page.locator('#review-tickets')).toContainText('General: $ 10.000, cupo 40');
	await expect(page.locator('#review-tickets')).toContainText(
		'A la gorra: a la gorra (sugerido $ 5.000'
	);
	const slug = await page.locator('input[name="slug"]').inputValue();
	await page.locator('#save-draft').click();
	await expect(page.getByRole('heading', { name: '¡Listo! 🎉' })).toBeVisible();

	const created = committed(slug);
	expect(created.meta.tickets).toEqual([
		{ id: 'general', name: 'General', price: 10000, capacity: 40 },
		{
			id: 'a-la-gorra',
			name: 'A la gorra',
			a_la_gorra: { minimo: 1000, sugerido: 5000 },
			capacity: 100
		}
	]);
	expect(created.meta.payment_methods).toEqual(['mercadopago', 'transferencia']);
	expect(created.meta.tickets_open).toBe('2026-12-01T12:00-03:00');
	expect(created.meta.tickets_close).toBe('2026-12-18T20:00-03:00');
	expect(created.raw).toContain('a_la_gorra: { minimo: 1000, sugerido: 5000 }');

	// Editar: cambiar el precio de General.
	await page.goto(`/edit/calendario/${slug}`, { waitUntil: 'networkidle' });
	const edit = page.locator('#edit-tickets');
	await expect(edit.locator('#edit-ticket-price-0')).toHaveValue('10000');
	await expect(edit).toContainText('id: general');
	await expect(page.locator('#save')).toBeDisabled();
	await edit.locator('#edit-ticket-price-0').fill('12000');
	// Validación: un cupo inválido bloquea guardar.
	await edit.locator('#edit-ticket-capacity-1').fill('mucho');
	await expect(page.locator('.problems')).toContainText('el cupo tiene que ser un número entero');
	await expect(page.locator('#save')).toBeDisabled();
	await edit.locator('#edit-ticket-capacity-1').fill('100');
	await shots(page, 'tickets-editor-edit', edit);
	await page.locator('#save').click();
	await expect(page.locator('p.note[role="status"]')).toContainText('Guardado');

	const edited = committed(slug);
	expect(edited.meta.tickets[0]).toEqual({
		id: 'general',
		name: 'General',
		price: 12000,
		capacity: 40
	});
	expect(edited.meta.tickets[1]).toEqual(created.meta.tickets[1]);
	// Solo cambió el precio (y la fecha de actualización).
	const diff = edited.raw.split('\n').filter((l) => !created.raw.split('\n').includes(l));
	expect(diff.filter((l) => !l.startsWith('updated_date:'))).toEqual(['    price: 12000']);
});

test('el servidor también valida las entradas (POST armado)', async ({ page }) => {
	await page.goto('/admin/eventos/nuevo');
	const content = `---
title: Armado
category: calendario
layout: calendario
start: 2026-12-19T21:00-03:00
tags:
  - español
  - AMBA
tickets:
  - id: general
    name: General
    price: 10000.5
    capacity: 40
---
`;
	const res = await page.request.post('/admin/eventos/nuevo?/publicar', {
		multipart: { slug: `armado-${Date.now()}`, mode: 'borrador', featuredMode: 'none', content },
		headers: { origin: 'http://localhost:5371', 'x-sveltekit-action': 'true' }
	});
	const body = await res.text();
	expect(body).toContain('pesos enteros');
});
