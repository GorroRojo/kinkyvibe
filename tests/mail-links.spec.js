// @ts-nocheck -- test code
/**
 * Las páginas de los links de los mails contra el build (`vite preview`, donde SvelteKit sí controla
 * el Origin de los POST; en `vite dev` no). Con `Referrer-Policy: no-referrer`, «Confirmar» salía
 * con `Origin: null` y SvelteKit respondía 403 «Cross-site POST form submissions are forbidden»
 * (gorrite, 12/10). Ahora van con `same-origin` y el POST llega a la action.
 *
 * Con un link inventado (no hay suscripciones en la base de prueba): la action responde «El link
 * venció o ya se usó», que solo se ve si el POST pasó el control de SvelteKit.
 */
import { expect, test } from '@playwright/test';

// Forma de token válida (43 caracteres base64url), pero no existe.
const FAKE_TOKEN = 'a'.repeat(43);

test('confirmar un aviso: same-origin y el POST llega a la action (solo, al abrir)', async ({
	page
}) => {
	const response = await page.goto(`/avisos/confirmar/${FAKE_TOKEN}`);
	expect(response?.headers()['referrer-policy']).toBe('same-origin');
	// La página manda el formulario sola una vez; la respuesta de la action se ve en la página.
	await expect(page.getByRole('alert')).toContainText('El link venció o ya se usó');
	await expect(page.getByText('Cross-site')).toHaveCount(0);
});

test('el botón también llega a la action (sin el envío automático)', async ({ page }) => {
	// Ya se mandó una vez en esta pestaña: la página no lo vuelve a mandar sola. Y sin el cartel de
	// mayoría de edad tapando el botón.
	await page.addInitScript((path) => {
		sessionStorage.setItem(`mail-link:${path}`, '1');
		localStorage.setItem('mayorDeEdad', 'true');
	}, `/avisos/confirmar/${FAKE_TOKEN}`);
	await page.goto(`/avisos/confirmar/${FAKE_TOKEN}`);
	await expect(page.getByRole('alert')).toHaveCount(0);
	const [post] = await Promise.all([
		page.waitForResponse((r) => r.request().method() === 'POST'),
		page.getByRole('button', { name: 'Confirmar' }).click()
	]);
	expect(post.status()).not.toBe(403);
	await expect(page.getByRole('alert')).toContainText('El link venció o ya se usó');
});

test('salir de los avisos y de «Lo que sigo»: same-origin', async ({ request }) => {
	for (const path of [`/avisos/baja/${FAKE_TOKEN}`, `/avisos/sigo/${FAKE_TOKEN}`]) {
		const r = await request.get(path);
		expect(r.headers()['referrer-policy'], path).toBe('same-origin');
	}
});
